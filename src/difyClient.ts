import * as http from 'http';
import * as https from 'https';

export interface DifyConfig {
    apiUrl: string;
    apiKey: string;
    maxTokens?: number;
    model?: string;
}

export interface ChatResponse {
    answer: string;
    conversationId: string;
    messageId: string;
    toolCalls: ToolCall[];
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: string;
    error?: string;
}

export interface ToolResult {
    tool_call_id: string;
    result: string;
    error?: string;
}

export interface AgentThought {
    id: string;
    thought: string;
    tool?: string;
    tool_input?: Record<string, any>;
    tool_call_id?: string;
    observation?: string;
    created_at: number;
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
 * 支持 Chat 和 Agent 模式（含工具调用）
 */
export class DifyClient {
    private config: DifyConfig;
    private conversationId: string | null = null;
    private messageHistory: Array<{ role: string; content: string }> = [];
    private toolServerPort: number = 0;
    private currentToolCalls: Map<string, ToolCall> = new Map();
    private registeredProviderId: string | null = null;

    constructor(config: DifyConfig) {
        this.config = config;
    }

    /**
     * 设置工具服务器端口（由 LocalToolServer 启动后调用）
     */
    setToolServerPort(port: number): void {
        this.toolServerPort = port;
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

    getCurrentToolCalls(): ToolCall[] {
        return Array.from(this.currentToolCalls.values());
    }

    /**
     * 注册工具到 Dify
     */
    async registerTools(): Promise<boolean> {
        if (!this.toolServerPort) {
            console.error('Tool server not started');
            return false;
        }

        const toolServerUrl = `http://127.0.0.1:${this.toolServerPort}`;

        // OpenAPI schema for the tools
        const schema = {
            openapi: '3.0.0',
            info: {
                title: 'VS Code Local Tools',
                description: 'Tools for interacting with VS Code workspace',
                version: '1.0.0'
            },
            servers: [
                {
                    url: toolServerUrl
                }
            ],
            paths: {
                '/execute': {
                    post: {
                        operationId: 'execute_tool',
                        summary: 'Execute a tool',
                        description: 'Execute a tool on the local VS Code workspace',
                        requestBody: {
                            required: true,
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            tool: {
                                                type: 'string',
                                                description: 'Tool name',
                                                enum: [
                                                    'read_file',
                                                    'edit_file',
                                                    'run_process',
                                                    'run_terminal',
                                                    'list_files',
                                                    'search_code'
                                                ]
                                            },
                                            parameters: {
                                                type: 'object',
                                                description: 'Tool parameters',
                                                oneOf: [
                                                    {
                                                        properties: {
                                                            path: { type: 'string', description: 'File path' },
                                                            start_line: { type: 'integer', description: 'Start line (1-indexed)' },
                                                            end_line: { type: 'integer', description: 'End line (1-indexed)' }
                                                        },
                                                        required: ['path']
                                                    },
                                                    {
                                                        properties: {
                                                            path: { type: 'string', description: 'File path' },
                                                            content: { type: 'string', description: 'File content' }
                                                        },
                                                        required: ['path', 'content']
                                                    },
                                                    {
                                                        properties: {
                                                            command: { type: 'string', description: 'Command to execute' },
                                                            cwd: { type: 'string', description: 'Working directory' },
                                                            timeout: { type: 'integer', description: 'Timeout in ms' }
                                                        },
                                                        required: ['command']
                                                    },
                                                    {
                                                        properties: {
                                                            path: { type: 'string', description: 'Directory path' }
                                                        }
                                                    },
                                                    {
                                                        properties: {
                                                            query: { type: 'string', description: 'Search query' },
                                                            include: { type: 'string', description: 'File pattern' },
                                                            max_results: { type: 'integer', description: 'Max results' }
                                                        },
                                                        required: ['query']
                                                    }
                                                ]
                                            }
                                        },
                                        required: ['tool', 'parameters']
                                    }
                                }
                            }
                        },
                        responses: {
                            '200': {
                                description: 'Tool execution result',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                result: {
                                                    type: 'string'
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        try {
            const url = new URL(`${this.config.apiUrl}/v1/tools/providers`);

            const response = await new Promise<any>((resolve, reject) => {
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
                req.write(JSON.stringify({
                    provider: 'vscode_local_tools',
                    name: 'VS Code Local Tools',
                    description: 'Tools for interacting with VS Code workspace',
                    schema: JSON.stringify(schema)
                }));
                req.end();
            });

            if (response.id) {
                this.registeredProviderId = response.id;
                console.log('Tools registered successfully:', response.id);
                return true;
            } else {
                console.error('Failed to register tools:', response);
                return false;
            }
        } catch (error: any) {
            console.error('Error registering tools:', error.message);
            return false;
        }
    }

    /**
     * 查询知识库
     */
    async queryKnowledge(
        query: string,
        context?: {
            language?: string;
            queryType?: string;
            projectContext?: string;
        }
    ): Promise<ChatResponse> {
        const url = new URL(`${this.config.apiUrl}/v1/workflows/run`);

        const body: any = {
            inputs: {
                query: query,
                language: context?.language || 'unknown',
                query_type: context?.queryType || '问题解答',
                project_context: context?.projectContext || ''
            },
            response_mode: 'blocking',
            user: 'vscode-user'
        };

        const response = await this.request(url, body);

        return {
            answer: response.data?.outputs?.answer || '',
            conversationId: '',
            messageId: '',
            toolCalls: []
        };
    }

    /**
     * 查询代码补全（带 RAG）
     */
    async queryCodeCompletion(
        codeContext: string,
        language: string,
        completionType: string
    ): Promise<string> {
        const response = await this.queryKnowledge(
            `请补全以下 ${language} 代码`,
            {
                language,
                queryType: '代码补全',
                projectContext: `代码上下文：\n${codeContext}\n补全类型：${completionType}`
            }
        );

        return response.answer;
    }

    /**
     * 查询代码审查（带 RAG）
     */
    async queryCodeReview(
        codeContent: string,
        language: string,
        reviewType: string
    ): Promise<string> {
        const response = await this.queryKnowledge(
            `请审查以下 ${language} 代码`,
            {
                language,
                queryType: '代码审查',
                projectContext: `代码内容：\n${codeContent}\n审查类型：${reviewType}`
            }
        );

        return response.answer;
    }

    /**
     * 查询 API 文档
     */
    async queryApiDoc(apiName: string, language: string): Promise<string> {
        const response = await this.queryKnowledge(
            `请提供 ${apiName} 的 API 文档和使用示例`,
            {
                language,
                queryType: 'API 查询'
            }
        );

        return response.answer;
    }

    /**
     * 查询项目架构
     */
    async queryArchitecture(): Promise<string> {
        const response = await this.queryKnowledge(
            '请描述这个项目的整体架构和模块划分',
            {
                queryType: '架构查询'
            }
        );

        return response.answer;
    }

    /**
     * 查询最佳实践
     */
    async queryBestPractices(topic: string, language: string): Promise<string> {
        const response = await this.queryKnowledge(
            `请提供关于 ${topic} 的最佳实践`,
            {
                language,
                queryType: '最佳实践'
            }
        );

        return response.answer;
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

        this.messageHistory.push({ role: 'user', content: query });
        this.messageHistory.push({ role: 'assistant', content: response.answer });

        return {
            answer: response.answer,
            conversationId: response.conversation_id || '',
            messageId: response.message_id || '',
            toolCalls: []
        };
    }

    /**
     * 发送聊天消息（streaming 模式，支持 Agent 工具调用）
     */
    async chatStream(
        query: string,
        systemPrompt?: string,
        callbacks?: AgentCallbacks
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
        const toolCalls: ToolCall[] = [];
        this.currentToolCalls.clear();

        let streamStarted = false;

        await this.streamRequest(url, body, {
            onMessage: (chunk, metadata) => {
                if (!streamStarted && callbacks?.onStreamStart) {
                    callbacks.onStreamStart();
                    streamStarted = true;
                }
                fullAnswer += chunk;
                if (callbacks?.onStreamChunk) {
                    callbacks.onStreamChunk(chunk);
                }
            },
            onAgentThought: (thought) => {
                if (callbacks?.onAgentThought) {
                    callbacks.onAgentThought(thought.thought || '');
                }
                // 如果有工具调用，记录它
                if (thought.tool && thought.tool_input) {
                    const toolCall: ToolCall = {
                        id: thought.tool_call_id || `tool_${Date.now()}`,
                        name: thought.tool,
                        arguments: thought.tool_input,
                        status: 'pending'
                    };
                    toolCalls.push(toolCall);
                    this.currentToolCalls.set(toolCall.id, toolCall);
                    if (callbacks?.onToolStart) {
                        callbacks.onToolStart(thought.tool);
                    }
                }
            },
            onToolCallResult: (toolCallId, result) => {
                const toolCall = this.currentToolCalls.get(toolCallId);
                if (toolCall) {
                    toolCall.status = 'completed';
                    toolCall.result = result;
                    if (callbacks?.onToolEnd) {
                        callbacks.onToolEnd(toolCall.name, result);
                    }
                }
            }
        });

        if (streamStarted && callbacks?.onStreamEnd) {
            callbacks.onStreamEnd();
        }

        this.messageHistory.push({ role: 'user', content: query });
        this.messageHistory.push({ role: 'assistant', content: fullAnswer });

        return {
            answer: fullAnswer,
            conversationId: this.conversationId || '',
            messageId: '',
            toolCalls: toolCalls
        };
    }

    /**
     * 执行工具调用（通过本地工具服务器）
     */
    async executeTool(toolName: string, parameters: Record<string, any>): Promise<string> {
        if (!this.toolServerPort) {
            throw new Error('Tool server not started');
        }

        const url = new URL(`http://127.0.0.1:${this.toolServerPort}/execute`);

        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: this.toolServerPort,
                path: '/execute',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.error) {
                            reject(new Error(result.error));
                        } else {
                            resolve(result.result);
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse tool result: ${data}`));
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
     * 自动处理 Dify Agent 的工具调用请求
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
        const allToolCalls: ToolCall[] = [];
        const allToolResults: any[] = [];

        while (iteration < maxIterations) {
            iteration++;

            if (callbacks?.onThinking) {
                callbacks.onThinking();
            }

            const response = await this.chatStream(
                currentQuery,
                systemPrompt,
                callbacks
            );

            fullAnswer += response.answer;
            allToolCalls.push(...response.toolCalls);

            // 如果没有工具调用，返回最终结果
            if (response.toolCalls.length === 0) {
                return {
                    answer: fullAnswer,
                    conversationId: response.conversationId,
                    messageId: response.messageId,
                    toolCalls: allToolCalls,
                    toolResults: allToolResults
                };
            }

            // 执行所有工具调用
            const toolResults: ToolResult[] = [];
            for (const toolCall of response.toolCalls) {
                try {
                    toolCall.status = 'running';
                    const result = await this.executeTool(toolCall.name, toolCall.arguments);
                    toolCall.status = 'completed';
                    toolCall.result = result;
                    toolResults.push({
                        tool_call_id: toolCall.id,
                        result: result
                    });
                    allToolResults.push({
                        type: toolCall.name,
                        data: result,
                        success: true
                    });
                } catch (error: any) {
                    toolCall.status = 'failed';
                    toolCall.error = error.message;
                    toolResults.push({
                        tool_call_id: toolCall.id,
                        result: '',
                        error: error.message
                    });
                    allToolResults.push({
                        type: toolCall.name,
                        error: error.message,
                        success: false
                    });
                }
            }

            // 将工具结果发送回 Dify
            const resultText = toolResults.map(r => {
                const status = r.error ? 'Failed' : 'Success';
                const content = r.error || r.result;
                return `[Tool Result: ${r.tool_call_id}] ${status}\n${content}`;
            }).join('\n\n');

            currentQuery = resultText;
        }

        return {
            answer: fullAnswer,
            conversationId: this.conversationId || '',
            messageId: '',
            toolCalls: allToolCalls,
            toolResults: allToolResults
        };
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
        handlers: {
            onMessage: (chunk: string, metadata?: any) => void;
            onAgentThought?: (thought: AgentThought) => void;
            onToolCallResult?: (toolCallId: string, result: string) => void;
        }
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

                                // 处理消息事件
                                if (data.event === 'message' && data.answer) {
                                    handlers.onMessage(data.answer, data.metadata);
                                }

                                // 处理 Agent 思考/工具调用事件
                                if (data.event === 'agent_thought') {
                                    const thought: AgentThought = {
                                        id: data.id || '',
                                        thought: data.thought || '',
                                        tool: data.tool || undefined,
                                        tool_input: data.tool_input || undefined,
                                        tool_call_id: data.tool_call_id || undefined,
                                        observation: data.observation || undefined,
                                        created_at: data.created_at || Date.now()
                                    };
                                    if (handlers.onAgentThought) {
                                        handlers.onAgentThought(thought);
                                    }
                                }

                                // 处理工具调用结果事件
                                if (data.event === 'tool_call_result') {
                                    if (handlers.onToolCallResult) {
                                        handlers.onToolCallResult(
                                            data.tool_call_id || '',
                                            data.result || ''
                                        );
                                    }
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
