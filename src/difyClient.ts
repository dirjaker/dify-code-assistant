import * as http from 'http';
import * as https from 'https';
import { DifyConfig } from './config';

export interface ChatResponse {
    answer: string;
    conversationId: string;
    messageId: string;
    toolCalls: ToolCallInfo[];
}

export interface ToolCallInfo {
    id: string;
    name: string;
    arguments: Record<string, any>;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: string;
    error?: string;
}

export interface AgentCallbacks {
    onThinking?: () => void;
    onStreamStart?: () => void;
    onStreamChunk?: (chunk: string) => void;
    onStreamEnd?: () => void;
    onToolStart?: (toolName: string) => void;
    onToolEnd?: (toolName: string, result: string) => void;
    onAgentThought?: (thought: string) => void;
}

/**
 * Dify API 客户端
 * 支持 Chat 模式 + Agent 工具循环
 */
export class DifyClient {
    private config: DifyConfig;
    private conversationId: string | null = null;
    private messageHistory: Array<{ role: string; content: string }> = [];
    private toolServerPort: number = 0;
    private toolAuthToken: string = '';

    constructor(config: DifyConfig) {
        this.config = config;
    }

    setToolServerPort(port: number): void {
        this.toolServerPort = port;
    }

    setToolAuthToken(token: string): void {
        this.toolAuthToken = token;
    }

    updateConfig(config: DifyConfig): void {
        this.config = config;
    }

    resetConversation(): void {
        this.conversationId = null;
        this.messageHistory = [];
    }

    clearHistory(): void {
        this.messageHistory = [];
        this.conversationId = null;
    }

    getHistory(): Array<{ role: string; content: string }> {
        return [...this.messageHistory];
    }

    getMessageHistory(): Array<{ role: string; content: string }> {
        return [...this.messageHistory];
    }

    getConversationId(): string | null {
        return this.conversationId;
    }

    /**
     * 注册工具到 Dify（尝试，失败不阻塞）
     */
    async registerTools(): Promise<boolean> {
        if (!this.toolServerPort) return false;
        // Dify 工具注册需要平台侧配置，插件侧只做健康检查
        try {
            const result = await this.httpGet(`http://127.0.0.1:${this.toolServerPort}/health`);
            return result.status === 'ok';
        } catch {
            return false;
        }
    }

    /**
     * 查询知识库（workflow 模式）
     */
    async queryKnowledge(
        query: string,
        context?: { language?: string; queryType?: string; projectContext?: string }
    ): Promise<ChatResponse> {
        const url = `${this.config.apiUrl}/v1/workflows/run`;
        const body = {
            inputs: {
                query,
                language: context?.language || 'unknown',
                query_type: context?.queryType || '问题解答',
                project_context: context?.projectContext || ''
            },
            response_mode: 'blocking',
            user: 'vscode-user'
        };

        const response = await this.request(url, body);
        return {
            answer: response.data?.outputs?.answer || response.answer || '',
            conversationId: '',
            messageId: '',
            toolCalls: []
        };
    }

    async queryCodeCompletion(codeContext: string, language: string, completionType: string): Promise<string> {
        const response = await this.queryKnowledge(`请补全以下 ${language} 代码`, {
            language, queryType: '代码补全',
            projectContext: `代码上下文：\n${codeContext}\n补全类型：${completionType}`
        });
        return response.answer;
    }

    async queryCodeReview(codeContent: string, language: string, reviewType: string): Promise<string> {
        const response = await this.queryKnowledge(`请审查以下 ${language} 代码`, {
            language, queryType: '代码审查',
            projectContext: `代码内容：\n${codeContent}\n审查类型：${reviewType}`
        });
        return response.answer;
    }

    async queryApiDoc(apiName: string, language: string): Promise<string> {
        const response = await this.queryKnowledge(`请提供 ${apiName} 的 API 文档和使用示例`, {
            language, queryType: 'API 查询'
        });
        return response.answer;
    }

    async queryArchitecture(): Promise<string> {
        const response = await this.queryKnowledge('请描述这个项目的整体架构和模块划分', {
            queryType: '架构查询'
        });
        return response.answer;
    }

    async queryBestPractices(topic: string, language: string): Promise<string> {
        const response = await this.queryKnowledge(`请提供关于 ${topic} 的最佳实践`, {
            language, queryType: '最佳实践'
        });
        return response.answer;
    }

    /**
     * 发送聊天消息（blocking 模式）
     */
    async chat(query: string, systemPrompt?: string): Promise<ChatResponse> {
        const url = `${this.config.apiUrl}/v1/chat-messages`;
        const body: any = {
            inputs: {},
            query,
            response_mode: 'blocking',
            user: 'vscode-user'
        };
        if (this.conversationId) body.conversation_id = this.conversationId;
        if (systemPrompt) body.inputs = { system_prompt: systemPrompt };

        const response = await this.request(url, body);
        if (response.conversation_id) this.conversationId = response.conversation_id;

        this.messageHistory.push({ role: 'user', content: query });
        this.messageHistory.push({ role: 'assistant', content: response.answer || '' });

        return {
            answer: response.answer || '',
            conversationId: response.conversation_id || '',
            messageId: response.message_id || '',
            toolCalls: []
        };
    }

    /**
     * 发送聊天消息（streaming 模式）
     */
    async chatStream(
        query: string,
        systemPrompt?: string,
        callbacks?: AgentCallbacks
    ): Promise<ChatResponse> {
        const url = `${this.config.apiUrl}/v1/chat-messages`;
        const body: any = {
            inputs: {},
            query,
            response_mode: 'streaming',
            user: 'vscode-user'
        };
        if (this.conversationId) body.conversation_id = this.conversationId;
        if (systemPrompt) body.inputs = { system_prompt: systemPrompt };

        let fullAnswer = '';
        const toolCalls: ToolCallInfo[] = [];
        let streamStarted = false;

        await this.streamRequest(url, body, {
            onMessage: (chunk) => {
                if (!streamStarted && callbacks?.onStreamStart) {
                    callbacks.onStreamStart();
                    streamStarted = true;
                }
                fullAnswer += chunk;
                callbacks?.onStreamChunk?.(chunk);
            },
            onAgentThought: (thought) => {
                callbacks?.onAgentThought?.(thought.thought || '');
                if (thought.tool && thought.tool_input) {
                    toolCalls.push({
                        id: thought.tool_call_id || `tool_${Date.now()}`,
                        name: thought.tool,
                        arguments: thought.tool_input,
                        status: 'pending'
                    });
                    callbacks?.onToolStart?.(thought.tool);
                }
            }
        });

        if (streamStarted) callbacks?.onStreamEnd?.();

        this.messageHistory.push({ role: 'user', content: query });
        this.messageHistory.push({ role: 'assistant', content: fullAnswer });

        return {
            answer: fullAnswer,
            conversationId: this.conversationId || '',
            messageId: '',
            toolCalls
        };
    }

    /**
     * 通过本地工具服务器执行工具
     */
    async executeTool(toolName: string, parameters: Record<string, any>): Promise<string> {
        if (!this.toolServerPort) throw new Error('Tool server not started');

        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: this.toolServerPort,
                path: '/execute',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.toolAuthToken ? { 'Authorization': `Bearer ${this.toolAuthToken}` } : {})
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.error) reject(new Error(result.error));
                        else resolve(result.result);
                    } catch (e) {
                        reject(new Error(`Failed to parse tool result: ${data.substring(0, 200)}`));
                    }
                });
            });
            req.on('error', reject);
            req.write(JSON.stringify({ tool: toolName, parameters }));
            req.end();
        });
    }

    /**
     * Agent 工具调用循环
     * 
     * 策略：AI 返回的响应中如果包含 ```tool 代码块，解析并执行工具，
     * 然后将结果格式化发回 Dify，直到 AI 不再请求工具调用。
     */
    async chatWithAgent(
        query: string,
        systemPrompt?: string,
        callbacks?: AgentCallbacks,
        maxIterations: number = 10
    ): Promise<ChatResponse & { toolResults: any[] }> {
        let currentQuery = query;
        let iteration = 0;
        let fullAnswer = '';
        const allToolResults: any[] = [];
        const allToolCalls: ToolCallInfo[] = [];

        // 保存全局历史，Agent 循环中不累积到全局
        const savedHistory = [...this.messageHistory];

        while (iteration < maxIterations) {
            iteration++;
            callbacks?.onThinking?.();

            // 临时恢复全局历史用于 API 调用
            this.messageHistory = [...savedHistory];
            const response = await this.chatStream(currentQuery, systemPrompt, callbacks);
            // 立即恢复，不让中间工具消息污染全局
            this.messageHistory = [...savedHistory];

            // 检查 Dify Agent 原生工具调用
            if (response.toolCalls.length > 0) {
                for (const tc of response.toolCalls) {
                    try {
                        tc.status = 'running';
                        callbacks?.onToolStart?.(tc.name);
                        const result = await this.executeTool(tc.name, tc.arguments);
                        tc.status = 'completed';
                        tc.result = result;
                        allToolResults.push({ type: tc.name, data: result, success: true });
                        callbacks?.onToolEnd?.(tc.name, result);
                    } catch (error: any) {
                        tc.status = 'failed';
                        tc.error = error.message;
                        allToolResults.push({ type: tc.name, error: error.message, success: false });
                        callbacks?.onToolEnd?.(tc.name, `Error: ${error.message}`);
                    }
                    allToolCalls.push(tc);
                }

                // 把工具结果格式化发回 Dify
                const resultText = response.toolCalls.map(tc => {
                    const status = tc.status === 'completed' ? 'Success' : 'Failed';
                    const content = tc.result || tc.error || '';
                    return `[Tool Result: ${tc.name}] ${status}\n${content}`;
                }).join('\n\n');

                currentQuery = resultText;
                fullAnswer += response.answer;
                continue;
            }

            // 检查 AI 返回的 ```tool 代码块
            const toolBlocks = this.parseToolBlocks(response.answer);
            if (toolBlocks.length > 0) {
                fullAnswer += response.answer;

                for (const block of toolBlocks) {
                    const toolCall: ToolCallInfo = {
                        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        name: block.tool,
                        arguments: block.params,
                        status: 'pending'
                    };
                    allToolCalls.push(toolCall);

                    try {
                        toolCall.status = 'running';
                        callbacks?.onToolStart?.(block.tool);
                        const result = await this.executeTool(block.tool, block.params);
                        toolCall.status = 'completed';
                        toolCall.result = result;
                        allToolResults.push({ type: block.tool, data: result, success: true });
                        callbacks?.onToolEnd?.(block.tool, result);
                    } catch (error: any) {
                        toolCall.status = 'failed';
                        toolCall.error = error.message;
                        allToolResults.push({ type: block.tool, error: error.message, success: false });
                        callbacks?.onToolEnd?.(block.tool, `Error: ${error.message}`);
                    }
                }

                // 把工具结果格式化发回
                const resultText = toolBlocks.map((block, i) => {
                    const tc = allToolCalls[allToolCalls.length - toolBlocks.length + i];
                    const status = tc.status === 'completed' ? 'Success' : 'Failed';
                    const content = tc.result || tc.error || '';
                    return `[Tool Result: ${block.tool}] ${status}\n${content}`;
                }).join('\n\n');

                currentQuery = resultText;
                continue;
            }

            // 没有工具调用 — 最终回答
            fullAnswer += response.answer;
            break;
        }

        // 恢复全局历史 + 记录最终对话
        this.messageHistory = [...savedHistory, { role: 'user', content: query }, { role: 'assistant', content: fullAnswer }];

        return {
            answer: fullAnswer,
            conversationId: this.conversationId || '',
            messageId: '',
            toolCalls: allToolCalls,
            toolResults: allToolResults
        };
    }

    /**
     * 解析 AI 返回中的 ```tool 代码块
     * 支持多行值：key: 后面的所有行（直到下一个 key: 或代码块结束）都属于该值
     */
    private parseToolBlocks(answer: string): { tool: string; params: Record<string, any> }[] {
        const blocks: { tool: string; params: Record<string, any> }[] = [];
        const regex = /```tool\s*\n([\s\S]*?)```/g;
        let match;

        while ((match = regex.exec(answer)) !== null) {
            const block = match[1].trim();
            const params: Record<string, any> = {};
            let toolName = '';
            let currentKey = '';
            let currentValues: string[] = [];

            const flush = () => {
                if (currentKey && currentKey !== 'tool_name' && currentKey !== 'tool') {
                    const val = currentValues.join('\n').trim();
                    try { params[currentKey] = JSON.parse(val); }
                    catch { params[currentKey] = val; }
                }
                currentKey = '';
                currentValues = [];
            };

            for (const line of block.split('\n')) {
                const colonIdx = line.indexOf(':');
                // 判断是否是新 key 行：key 部分只含小写字母和下划线
                if (colonIdx > 0 && /^[a-z_]+$/.test(line.substring(0, colonIdx).trim())) {
                    flush();
                    currentKey = line.substring(0, colonIdx).trim();
                    const value = line.substring(colonIdx + 1).trim();
                    if (currentKey === 'tool_name' || currentKey === 'tool') {
                        toolName = value;
                    } else {
                        currentValues.push(value);
                    }
                } else if (currentKey) {
                    // 续行
                    currentValues.push(line);
                }
            }
            flush();

            if (toolName) {
                blocks.push({ tool: toolName, params });
            }
        }

        return blocks;
    }

    // ═══════════════════════════════════════════════
    //  HTTP Helpers
    // ═══════════════════════════════════════════════

    private async httpGet(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const transport = parsedUrl.protocol === 'https:' ? https : http;
            const req = transport.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { reject(new Error(`Invalid JSON: ${data.substring(0, 200)}`)); }
                });
            });
            req.on('error', reject);
        });
    }

    private request(url: string, body: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const isHttps = parsedUrl.protocol === 'https:';
            const transport = isHttps ? https : http;

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = transport.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        try {
                            const errBody = JSON.parse(data);
                            reject(new Error(errBody.message || errBody.error || `HTTP ${res.statusCode}`));
                        } catch {
                            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                        }
                        return;
                    }
                    try { resolve(JSON.parse(data)); }
                    catch { reject(new Error(`Invalid JSON response: ${data.substring(0, 300)}`)); }
                });
            });

            req.on('error', reject);
            req.write(JSON.stringify(body));
            req.end();
        });
    }

    private streamRequest(
        url: string,
        body: any,
        handlers: {
            onMessage: (chunk: string, metadata?: any) => void;
            onAgentThought?: (thought: { thought: string; tool?: string; tool_input?: Record<string, any>; tool_call_id?: string }) => void;
        }
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const isHttps = parsedUrl.protocol === 'https:';
            const transport = isHttps ? https : http;

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
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
                    const events = buffer.split('\n\n');
                    buffer = events.pop() || '';

                    for (const event of events) {
                        for (const line of event.split('\n')) {
                            if (!line.startsWith('data: ')) continue;

                            try {
                                const data = JSON.parse(line.slice(6));

                                if (data.event === 'message' && data.answer) {
                                    handlers.onMessage(data.answer, data.metadata);
                                }

                                if (data.event === 'agent_thought' && handlers.onAgentThought) {
                                    handlers.onAgentThought({
                                        thought: data.thought || '',
                                        tool: data.tool || undefined,
                                        tool_input: data.tool_input || undefined,
                                        tool_call_id: data.tool_call_id || undefined
                                    });
                                }

                                if (data.conversation_id) {
                                    this.conversationId = data.conversation_id;
                                }
                            } catch { /* skip invalid JSON */ }
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
