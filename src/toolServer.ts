/**
 * Local Tool Server - 接收 Dify Agent 的工具调用请求，在本地 VS Code 环境执行
 * 
 * Dify Agent → HTTP POST → 本服务器 → 执行工具 → 返回结果
 */
import * as http from 'http';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

export interface ToolCallRequest {
    tool: string;
    parameters: Record<string, any>;
    message_id?: string;
    conversation_id?: string;
}

export interface ToolCallResponse {
    result: string;
    error?: string;
}

export type ToolHandler = (params: Record<string, any>) => Promise<string>;

export class LocalToolServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private handlers: Map<string, ToolHandler> = new Map();
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.registerDefaultHandlers();
    }

    private registerDefaultHandlers(): void {
        // read_file - 读取文件内容
        this.registerHandler('read_file', async (params) => {
            const filePath = params.path as string;
            if (!filePath) {
                throw new Error('Missing required parameter: path');
            }

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder open');
            }

            const absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.join(workspaceFolders[0].uri.fsPath, filePath);

            const uri = vscode.Uri.file(absolutePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();

            const startLine = params.start_line ? parseInt(params.start_line as string) : undefined;
            const endLine = params.end_line ? parseInt(params.end_line as string) : undefined;

            if (startLine !== undefined || endLine !== undefined) {
                const lines = content.split('\n');
                const start = (startLine || 1) - 1;
                const end = endLine || lines.length;
                return lines.slice(start, end).join('\n');
            }

            return content;
        });

        // edit_file - 编辑文件
        this.registerHandler('edit_file', async (params) => {
            const filePath = params.path as string;
            const content = params.content as string;

            if (!filePath) {
                throw new Error('Missing required parameter: path');
            }
            if (content === undefined) {
                throw new Error('Missing required parameter: content');
            }

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder open');
            }

            const absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.join(workspaceFolders[0].uri.fsPath, filePath);

            const uri = vscode.Uri.file(absolutePath);

            // 如果文件不存在，创建它
            if (!fs.existsSync(absolutePath)) {
                const dir = path.dirname(absolutePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            }

            // 写入文件
            fs.writeFileSync(absolutePath, content, 'utf-8');

            // 如果文件在编辑器中打开，刷新它
            const document = vscode.workspace.textDocuments.find(
                d => d.uri.fsPath === absolutePath
            );
            if (document) {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                );
                edit.replace(uri, fullRange, content);
                await vscode.workspace.applyEdit(edit);
            }

            return `File written successfully: ${absolutePath}`;
        });

        // run_terminal - 执行终端命令并捕获输出
        this.registerHandler('run_terminal', async (params) => {
            const command = params.command as string;
            if (!command) {
                throw new Error('Missing required parameter: command');
            }

            const timeout = params.timeout ? parseInt(params.timeout as string) : 30000;
            const cwd = params.cwd as string || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            return new Promise((resolve, reject) => {
                cp.exec(command, {
                    cwd,
                    timeout,
                    maxBuffer: 1024 * 1024 * 10, // 10MB
                    env: { ...process.env }
                }, (error, stdout, stderr) => {
                    if (error && error.killed) {
                        reject(new Error(`Command timed out after ${timeout}ms`));
                        return;
                    }

                    let result = '';
                    if (stdout) result += stdout;
                    if (stderr) result += (result ? '\n--- STDERR ---\n' : '') + stderr;
                    if (error && error.code) result += `\nExit code: ${error.code}`;

                    resolve(result || '(no output)');
                });
            });
        });

        // run_process - 执行进程并捕获输出（推荐）
        this.registerHandler('run_process', async (params) => {
            const command = params.command as string;
            if (!command) {
                throw new Error('Missing required parameter: command');
            }

            const timeout = params.timeout ? parseInt(params.timeout as string) : 30000;
            const cwd = params.cwd as string || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            return new Promise((resolve, reject) => {
                cp.exec(command, {
                    cwd,
                    timeout,
                    maxBuffer: 1024 * 1024 * 10, // 10MB
                    env: { ...process.env }
                }, (error, stdout, stderr) => {
                    if (error && error.killed) {
                        reject(new Error(`Command timed out after ${timeout}ms`));
                        return;
                    }

                    let result = '';
                    if (stdout) result += stdout;
                    if (stderr) result += (result ? '\n--- STDERR ---\n' : '') + stderr;
                    if (error && error.code) result += `\nExit code: ${error.code}`;

                    resolve(result || '(no output)');
                });
            });
        });

        // list_files - 列出目录文件
        this.registerHandler('list_files', async (params) => {
            const dirPath = params.path as string || '.';
            const pattern = params.pattern as string || '*';

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder open');
            }

            const absolutePath = path.isAbsolute(dirPath)
                ? dirPath
                : path.join(workspaceFolders[0].uri.fsPath, dirPath);

            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Directory not found: ${absolutePath}`);
            }

            const files = fs.readdirSync(absolutePath);
            return files.join('\n');
        });

        // search_code - 搜索代码
        this.registerHandler('search_code', async (params) => {
            const query = params.query as string;
            if (!query) {
                throw new Error('Missing required parameter: query');
            }

            const include = params.include as string || '**/*';
            const maxResults = params.max_results ? parseInt(params.max_results as string) : 20;

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder open');
            }

            // 使用 VS Code 的搜索 API
            const files = await vscode.workspace.findFiles(include, '**/node_modules/**', maxResults);
            const results: string[] = [];

            for (const file of files) {
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const content = document.getText();
                    const lines = content.split('\n');

                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                            const relativePath = path.relative(workspaceFolders[0].uri.fsPath, file.fsPath);
                            results.push(`${relativePath}:${i + 1}: ${lines[i].trim()}`);
                        }
                    }
                } catch (e) {
                    // Skip files that can't be read
                }
            }

            return results.length > 0 ? results.join('\n') : 'No matches found';
        });
    }

    registerHandler(toolName: string, handler: ToolHandler): void {
        this.handlers.set(toolName, handler);
    }

    async start(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer(async (req, res) => {
                // 设置 CORS 头
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                if (req.method === 'POST' && req.url === '/execute') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                        try {
                            const request: ToolCallRequest = JSON.parse(body);
                            const handler = this.handlers.get(request.tool);

                            if (!handler) {
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: `Unknown tool: ${request.tool}` }));
                                return;
                            }

                            this.outputChannel.appendLine(`[Tool] Executing: ${request.tool}(${JSON.stringify(request.parameters)})`);

                            const result = await handler(request.parameters);

                            this.outputChannel.appendLine(`[Tool] Result: ${result.substring(0, 200)}...`);

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ result }));
                        } catch (error: any) {
                            this.outputChannel.appendLine(`[Tool] Error: ${error.message}`);

                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: error.message }));
                        }
                    });
                } else if (req.method === 'GET' && req.url === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok', tools: Array.from(this.handlers.keys()) }));
                } else if (req.method === 'GET' && req.url === '/tools') {
                    // 返回工具定义列表（供 Dify 注册使用）
                    const tools = this.getToolDefinitions();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(tools));
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            });

            this.server.listen(0, '127.0.0.1', () => {
                const address = this.server!.address() as any;
                this.port = address.port;
                this.outputChannel.appendLine(`[ToolServer] Started on port ${this.port}`);
                resolve(this.port);
            });

            this.server.on('error', (err) => {
                this.outputChannel.appendLine(`[ToolServer] Error: ${err.message}`);
                reject(err);
            });
        });
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.outputChannel.appendLine('[ToolServer] Stopped');
        }
    }

    getPort(): number {
        return this.port;
    }

    getToolDefinitions(): any[] {
        return [
            {
                name: 'read_file',
                description: 'Read the content of a file. Returns the full file content or a specific line range.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'File path (relative to workspace or absolute)'
                        },
                        start_line: {
                            type: 'integer',
                            description: 'Start line number (1-indexed, optional)'
                        },
                        end_line: {
                            type: 'integer',
                            description: 'End line number (1-indexed, optional)'
                        }
                    },
                    required: ['path']
                }
            },
            {
                name: 'edit_file',
                description: 'Create or overwrite a file with the given content. Use for writing new files or completely replacing file content.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'File path (relative to workspace or absolute)'
                        },
                        content: {
                            type: 'string',
                            description: 'The full content to write to the file'
                        }
                    },
                    required: ['path', 'content']
                }
            },
            {
                name: 'run_process',
                description: 'Execute a shell command and capture its output. Returns stdout and stderr.',
                parameters: {
                    type: 'object',
                    properties: {
                        command: {
                            type: 'string',
                            description: 'The shell command to execute'
                        },
                        cwd: {
                            type: 'string',
                            description: 'Working directory (optional, defaults to workspace root)'
                        },
                        timeout: {
                            type: 'integer',
                            description: 'Timeout in milliseconds (default: 30000)'
                        }
                    },
                    required: ['command']
                }
            },
            {
                name: 'run_terminal',
                description: 'Execute a command in the VS Code terminal and capture output.',
                parameters: {
                    type: 'object',
                    properties: {
                        command: {
                            type: 'string',
                            description: 'The command to execute'
                        },
                        cwd: {
                            type: 'string',
                            description: 'Working directory (optional, defaults to workspace root)'
                        },
                        timeout: {
                            type: 'integer',
                            description: 'Timeout in milliseconds (default: 30000)'
                        }
                    },
                    required: ['command']
                }
            },
            {
                name: 'list_files',
                description: 'List files in a directory.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'Directory path (relative to workspace or absolute, defaults to workspace root)'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'search_code',
                description: 'Search for text in workspace files.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query'
                        },
                        include: {
                            type: 'string',
                            description: 'Glob pattern for files to search (e.g., "*.py")'
                        },
                        max_results: {
                            type: 'integer',
                            description: 'Maximum number of results (default: 20)'
                        }
                    },
                    required: ['query']
                }
            }
        ];
    }
}
