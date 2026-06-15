import * as https from 'https';
import * as http from 'http';
import { DifyConfig } from './config';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatResponse {
    answer: string;
    conversationId: string;
    messageId: string;
    metadata?: {
        usage?: {
            totalTokens: number;
            latency: number;
        };
    };
}

export class DifyClient {
    private config: DifyConfig;
    private conversationId: string | null = null;

    constructor(config: DifyConfig) {
        this.config = config;
    }

    updateConfig(config: DifyConfig): void {
        this.config = config;
        this.conversationId = null;
    }

    resetConversation(): void {
        this.conversationId = null;
    }

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

        return {
            answer: response.answer || '',
            conversationId: response.conversation_id || '',
            messageId: response.message_id || '',
            metadata: response.metadata
        };
    }

    async chatStream(query: string, onChunk: (chunk: string) => void, systemPrompt?: string): Promise<void> {
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

        await this.streamRequest(url, body, onChunk);
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

    private streamRequest(url: URL, body: any, onChunk: (chunk: string) => void): Promise<void> {
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
                                    onChunk(data.answer);
                                }
                                if (data.conversation_id) {
                                    this.conversationId = data.conversation_id;
                                }
                            } catch (e) {
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
