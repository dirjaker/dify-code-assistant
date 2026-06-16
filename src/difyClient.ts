import * as https from 'https';
import * as http from 'http';
import { DifyConfig } from './config';
import { ToolCall, ToolResult } from './toolExecutor';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
}

export interface ChatResponse {
    answer: string;
    conversationId: string;
    messageId: string;
    toolCalls: ToolCall[];
    metadata?: {
        usage?: {
            totalTokens: number;
            latency: number;
        };
    };
}

/**
 * Dify API 客户端
 * 支持 blocking/streaming 响应，结构化工具调用解析
 */
export class DifyClient {
    private config: DifyConfig;
    private conversationId: string | null = null;
    private messageHistory: ChatMessage[] = [];

    constructor(config: DifyConfig) {
        this.config = config;
    }

    updateConfig(config: DifyConfig): void {
        this.config = config;
        this.conversationId = null;
    }

    resetConversation(): void {
        this.conversationId = null;
        this.messageHistory = [];
    }

    getMessageHistory(): ChatMessage[] {
        return this.messageHistory;
    }

    /**
     * 发送聊天消息（blocking 模式）
     */
    async chat(query: string, systemPrompt?: string): Promise<ChatResponse> {
        const url = new URL(`${this.config.apiUrl}/v1/chat-messages`);

        const body: any = {
            inputs: {},
            query: query,
            response_mode: 'blocking',
            user: 'vscode-user'
        };

        if (this.conversationId) {
            body.conversation_id = this.conversationId;
        }

        if (systemPrompt) {
            body.inputs = { system_prompt: systemPrompt };
        }

        const response = await this.request(url, body);

        if (response.conversation_id) {
            this.conversationId = response.conversation_id;
        }

        const answer = response.answer || '';

        // 记录消息历史
        this.messageHistory.push({ role: 'user', content: query });
        this.messageHistory.push({ role: 'assistant', content: answer });

        return {
            answer,
            conversationId: response.conversation_id || '',
            messageId: response.message_id || '',
            toolCalls: [],
            metadata: response.metadata
        };
    }

    /**
     * 发送聊天消息（streaming 模式）
     */
    async chatStream(
        query: string,
        onChunk: (chunk: string) => void,
        systemPrompt?: string
    ): Promise<ChatResponse> {
        const url = new URL(`${this.config.apiUrl}/v1/chat-messages`);

        const body: any = {
            inputs: {},
            query: query,
            response_mode: 'streaming',
            user: 'vscode-user'
        };

        if (this.conversationId) {
            body.conversation_id = this.conversationId;
        }

        if (systemPrompt) {
            body.inputs = { system_prompt: systemPrompt };
        }

        let fullAnswer = '';

        await this.streamRequest(url, body, (chunk, metadata) => {
            fullAnswer += chunk;
            onChunk(chunk);
        });

        this.messageHistory.push({ role: 'user', content: query });
        this.messageHistory.push({ role: 'assistant', content: fullAnswer });

        return {
            answer: fullAnswer,
            conversationId: this.conversationId || '',
            messageId: '',
            toolCalls: []
        };
    }

    /**
     * 发送带工具结果的后续消息
     */
    async sendToolResults(
        toolResults: ToolResult[],
        onChunk?: (chunk: string) => void
    ): Promise<ChatResponse> {
        // 将工具结果格式化为用户消息
        const resultText = toolResults.map(r => {
            return `[Tool: ${r.type}] ${r.success ? 'Success' : 'Failed'}\n${r.data}`;
        }).join('\n\n');

        return this.chat(resultText);
    }

    private request(url: URL, body: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const isHttps = url.protocol === 'https:';
            const transport = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = transport.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(JSON.stringify(body));
            req.end();
        });
    }

    private streamRequest(
        url: URL,
        body: any,
        onChunk: (chunk: string, metadata?: any) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const isHttps = url.protocol === 'https:';
            const transport = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = transport.request(options, (res) => {
                let buffer = '';

                res.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.event === 'message' && data.answer) {
                                    onChunk(data.answer, data.metadata);
                                }
                                if (data.conversation_id) {
                                    this.conversationId = data.conversation_id;
                                }
                            } catch {
                                // Skip invalid JSON
                            }
                        }
                    }
                });

                res.on('end', resolve);
            });

            req.on('error', reject);
            req.write(JSON.stringify(body));
            req.end();
        });
    }
}
