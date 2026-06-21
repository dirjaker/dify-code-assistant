/**
 * Local Tool Server — Dify Agent → HTTP → 本地执行 → 返回结果
 * 
 * 12 个工具：read_file, write_file, edit_file, search_files, list_files,
 *            execute_command, create_directory, delete_file, move_file,
 *            get_diagnostics, insert_code, get_symbols
 */
import * as http from 'http';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

export interface ToolCallRequest {
    tool: string;
    parameters: Record<string, any>;
}

export interface ToolCallResponse {
    result?: string;
    error?: string;
    metadata?: Record<string, any>;
}

export type ToolHandler = (params: Record<string, any>) => Promise<ToolResult>;

export interface ToolResult {
    output: string;
    metadata?: Record<string, any>;
}

export class LocalToolServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private handlers: Map<string, ToolHandler> = new Map();
    private outputChannel: vscode.OutputChannel;
    private workspaceRoot: string;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.registerAllHandlers();
    }

    // ═══════════════════════════════════════════════
    //  Tool Definitions (12 tools)
    // ═══════════════════════════════════════════════

    getToolDefinitions(): any[] {
        return [
            {
                name: 'read_file',
                description: 'Read the contents of a file. Returns the file content with line numbers.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path (relative to workspace or absolute)' },
                        start_line: { type: 'integer', description: 'Start line number (1-indexed, optional)' },
                        end_line: { type: 'integer', description: 'End line number (1-indexed, optional)' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'write_file',
                description: 'Create or overwrite a file with the given content.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path' },
                        content: { type: 'string', description: 'The content to write' }
                    },
                    required: ['path', 'content']
                }
            },
            {
                name: 'edit_file',
                description: 'Make targeted edits by replacing specific text. The old_text must appear exactly once in the file.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path' },
                        old_text: { type: 'string', description: 'Exact text to find (must be unique in file)' },
                        new_text: { type: 'string', description: 'Replacement text' }
                    },
                    required: ['path', 'old_text', 'new_text']
                }
            },
            {
                name: 'search_files',
                description: 'Search for text patterns across files using regex.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search query (supports regex)' },
                        include: { type: 'string', description: 'File glob pattern (e.g. "*.py")' },
                        exclude: { type: 'string', description: 'Exclude glob pattern' },
                        max_results: { type: 'integer', description: 'Max results (default 50)' }
                    },
                    required: ['query']
                }
            },
            {
                name: 'list_files',
                description: 'List files and directories in a path.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Directory path (default: workspace root)' },
                        recursive: { type: 'boolean', description: 'Recursive listing (default false)' },
                        max_depth: { type: 'integer', description: 'Max recursion depth (default 3)' }
                    },
                    required: []
                }
            },
            {
                name: 'execute_command',
                description: 'Execute a shell command and return output.',
                parameters: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'Shell command to execute' },
                        cwd: { type: 'string', description: 'Working directory (default: workspace root)' },
                        timeout: { type: 'integer', description: 'Timeout ms (default 30000)' }
                    },
                    required: ['command']
                }
            },
            {
                name: 'create_directory',
                description: 'Create a directory and parent directories.',
                parameters: {
                    type: 'object',
                    properties: { path: { type: 'string', description: 'Directory path to create' } },
                    required: ['path']
                }
            },
            {
                name: 'delete_file',
                description: 'Delete a file or directory.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Path to delete' },
                        recursive: { type: 'boolean', description: 'Delete directories recursively (default false)' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'move_file',
                description: 'Move or rename a file or directory.',
                parameters: {
                    type: 'object',
                    properties: {
                        source: { type: 'string', description: 'Source path' },
                        destination: { type: 'string', description: 'Destination path' }
                    },
                    required: ['source', 'destination']
                }
            },
            {
                name: 'get_diagnostics',
                description: 'Get language diagnostics (errors, warnings) for a file or workspace.',
                parameters: {
                    type: 'object',
                    properties: { path: { type: 'string', description: 'File path (empty = workspace)' } },
                    required: []
                }
            },
            {
                name: 'insert_code',
                description: 'Insert code at a specific line in a file.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path' },
                        line: { type: 'integer', description: 'Line number (1-indexed)' },
                        content: { type: 'string', description: 'Code to insert' },
                        position: { type: 'string', description: '"before" or "after" the line (default "after")' }
                    },
                    required: ['path', 'line', 'content']
                }
            },
            {
                name: 'get_symbols',
                description: 'Get all symbols (functions, classes, variables) in a file.',
                parameters: {
                    type: 'object',
                    properties: { path: { type: 'string', description: 'File path' } },
                    required: ['path']
                }
            }
        ];
    }

    // ═══════════════════════════════════════════════
    //  Handler Registration
    // ═══════════════════════════════════════════════

    private registerAllHandlers(): void {
        // ── read_file ──
        this.handlers.set('read_file', async (params) => {
            const filePath = this.resolvePath(params.path);
            if (!fs.existsSync(filePath)) throw new Error(`File not found: ${params.path}`);

            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            const start = Math.max(0, (parseInt(params.start_line) || 1) - 1);
            const end = parseInt(params.end_line) || lines.length;
            const selected = lines.slice(start, Math.min(end, lines.length));
            const numbered = selected.map((l, i) => `${start + i + 1}: ${l}`).join('\n');

            return {
                output: numbered,
                metadata: { path: params.path, total_lines: lines.length, returned_lines: selected.length, language: this.detectLanguage(filePath) }
            };
        });

        // ── write_file ──
        this.handlers.set('write_file', async (params) => {
            const filePath = this.resolvePath(params.path);
            const content = params.content;
            if (content === undefined || content === null) throw new Error('content is required');

            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(filePath, content, 'utf-8');

            // 如果文件在编辑器中打开，刷新
            await this.refreshEditor(filePath, content);

            return {
                output: `File written: ${params.path} (${content.split('\n').length} lines)`,
                metadata: { path: params.path, size: content.length }
            };
        });

        // ── edit_file (精确替换) ──
        this.handlers.set('edit_file', async (params) => {
            const filePath = this.resolvePath(params.path);
            const oldText = params.old_text;
            const newText = params.new_text;

            if (!oldText && oldText !== '') throw new Error('old_text is required');
            if (!fs.existsSync(filePath)) throw new Error(`File not found: ${params.path}`);

            let content = await fs.promises.readFile(filePath, 'utf-8');
            const count = content.split(oldText).length - 1;

            if (count === 0) throw new Error(`Text not found in file: "${oldText.substring(0, 80)}..."`);
            if (count > 1) throw new Error(`Text found ${count} times — must be unique. Provide more context.`);

            content = content.replace(oldText, newText);
            await fs.promises.writeFile(filePath, content, 'utf-8');
            await this.refreshEditor(filePath, content);

            return {
                output: `File edited: ${params.path} (replaced ${oldText.length} chars with ${newText.length} chars)`,
                metadata: { path: params.path, old_length: oldText.length, new_length: newText.length }
            };
        });

        // ── search_files ──
        this.handlers.set('search_files', async (params) => {
            const query = params.query;
            if (!query) throw new Error('query is required');

            const include = params.include || '**/*';
            const maxResults = parseInt(params.max_results) || 50;
            const exclude = params.exclude || '**/node_modules/**';

            // 使用 VS Code 的搜索 API
            const files = await vscode.workspace.findFiles(include, exclude, maxResults * 3);
            const results: string[] = [];

            let regex: RegExp;
            try {
                regex = new RegExp(query, 'gi');
            } catch {
                regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            }

            for (const file of files) {
                if (results.length >= maxResults) break;
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const text = document.getText();
                    const lines = text.split('\n');

                    for (let i = 0; i < lines.length; i++) {
                        if (regex.test(lines[i])) {
                            const relPath = path.relative(this.workspaceRoot, file.fsPath);
                            results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
                            if (results.length >= maxResults) break;
                        }
                    }
                    regex.lastIndex = 0; // reset regex
                } catch { /* skip unreadable files */ }
            }

            return { output: results.length > 0 ? results.join('\n') : 'No matches found' };
        });

        // ── list_files ──
        this.handlers.set('list_files', async (params) => {
            const dirPath = params.path ? this.resolvePath(params.path) : this.workspaceRoot;
            const recursive = params.recursive === true;
            const maxDepth = parseInt(params.max_depth) || 3;

            if (!fs.existsSync(dirPath)) throw new Error(`Directory not found: ${dirPath}`);

            const entries = await this.listDirectory(dirPath, recursive ? maxDepth : 0, 0);
            return { output: entries.join('\n') || '(empty directory)' };
        });

        // ── execute_command ──
        this.handlers.set('execute_command', async (params) => {
            const command = params.command;
            if (!command) throw new Error('command is required');

            const timeout = parseInt(params.timeout) || 30000;
            const cwd = params.cwd ? this.resolvePath(params.cwd) : this.workspaceRoot;

            return new Promise((resolve, reject) => {
                cp.exec(command, {
                    cwd,
                    timeout,
                    maxBuffer: 10 * 1024 * 1024,
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

                    resolve({ output: result || '(no output)' });
                });
            });
        });

        // ── create_directory ──
        this.handlers.set('create_directory', async (params) => {
            const dirPath = this.resolvePath(params.path);
            await fs.promises.mkdir(dirPath, { recursive: true });
            return { output: `Directory created: ${params.path}` };
        });

        // ── delete_file ──
        this.handlers.set('delete_file', async (params) => {
            const filePath = this.resolvePath(params.path);
            if (!fs.existsSync(filePath)) throw new Error(`Path not found: ${params.path}`);

            const stat = await fs.promises.stat(filePath);
            if (stat.isDirectory()) {
                if (params.recursive) {
                    await fs.promises.rm(filePath, { recursive: true, force: true });
                } else {
                    await fs.promises.rmdir(filePath);
                }
            } else {
                await fs.promises.unlink(filePath);
            }
            return { output: `Deleted: ${params.path}` };
        });

        // ── move_file ──
        this.handlers.set('move_file', async (params) => {
            const source = this.resolvePath(params.source);
            const destination = this.resolvePath(params.destination);
            if (!fs.existsSync(source)) throw new Error(`Source not found: ${params.source}`);

            const destDir = path.dirname(destination);
            if (!fs.existsSync(destDir)) await fs.promises.mkdir(destDir, { recursive: true });

            await fs.promises.rename(source, destination);
            return { output: `Moved: ${params.source} → ${params.destination}` };
        });

        // ── get_diagnostics ──
        this.handlers.set('get_diagnostics', async (params) => {
            const filePath = params.path ? this.resolvePath(params.path) : null;

            if (filePath) {
                const uri = vscode.Uri.file(filePath);
                const diagnostics = vscode.languages.getDiagnostics(uri);
                if (diagnostics.length === 0) return { output: 'No diagnostics' };

                const lines = diagnostics.map(d => {
                    const severity = ['Error', 'Warning', 'Info', 'Hint'][d.severity] || 'Unknown';
                    return `${severity} [${d.range.start.line + 1}:${d.range.start.character}] ${d.message}`;
                });
                return { output: lines.join('\n') };
            }

            // Workspace diagnostics
            const allDiagnostics = vscode.languages.getDiagnostics();
            const lines: string[] = [];
            for (const [uri, diags] of allDiagnostics) {
                if (diags.length === 0) continue;
                const relPath = path.relative(this.workspaceRoot, uri.fsPath);
                for (const d of diags.slice(0, 5)) {
                    const severity = ['Error', 'Warning', 'Info', 'Hint'][d.severity] || 'Unknown';
                    lines.push(`${severity} ${relPath}:${d.range.start.line + 1} — ${d.message}`);
                }
            }
            return { output: lines.length > 0 ? lines.join('\n') : 'No diagnostics' };
        });

        // ── insert_code ──
        this.handlers.set('insert_code', async (params) => {
            const filePath = this.resolvePath(params.path);
            const lineNum = parseInt(params.line);
            const content = params.content;
            const position = params.position || 'after';

            if (!lineNum || !content) throw new Error('line and content are required');
            if (!fs.existsSync(filePath)) throw new Error(`File not found: ${params.path}`);

            const fileContent = await fs.promises.readFile(filePath, 'utf-8');
            const lines = fileContent.split('\n');
            const idx = Math.max(0, Math.min(lineNum - 1, lines.length));

            if (position === 'before') {
                lines.splice(idx, 0, content);
            } else {
                lines.splice(idx + 1, 0, content);
            }

            const newContent = lines.join('\n');
            await fs.promises.writeFile(filePath, newContent, 'utf-8');
            await this.refreshEditor(filePath, newContent);

            return { output: `Code inserted at line ${lineNum} (${position}) in ${params.path}` };
        });

        // ── get_symbols ──
        this.handlers.set('get_symbols', async (params) => {
            const filePath = this.resolvePath(params.path);
            if (!fs.existsSync(filePath)) throw new Error(`File not found: ${params.path}`);

            const content = await fs.promises.readFile(filePath, 'utf-8');
            const language = this.detectLanguage(filePath);
            const symbols = this.extractSymbols(content, language);

            if (symbols.length === 0) return { output: 'No symbols found' };

            const lines = symbols.map(s => `${s.type} ${s.name} (line ${s.line})`);
            return { output: lines.join('\n') };
        });
    }

    // ═══════════════════════════════════════════════
    //  HTTP Server
    // ═══════════════════════════════════════════════

    registerHandler(toolName: string, handler: ToolHandler): void {
        this.handlers.set(toolName, handler);
    }

    async start(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer(async (req, res) => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
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

                            this.outputChannel.appendLine(`[Tool] ${request.tool}(${JSON.stringify(request.parameters).substring(0, 200)})`);

                            const result = await handler(request.parameters);

                            this.outputChannel.appendLine(`[Tool] ✓ ${request.tool} (${result.output.length} chars)`);

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                result: result.output,
                                metadata: result.metadata
                            }));
                        } catch (error: any) {
                            this.outputChannel.appendLine(`[Tool] ✗ Error: ${error.message}`);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: error.message }));
                        }
                    });
                } else if (req.method === 'GET' && req.url === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok', tools: Array.from(this.handlers.keys()) }));
                } else if (req.method === 'GET' && req.url === '/tools') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(this.getToolDefinitions()));
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            });

            this.server.listen(0, '127.0.0.1', () => {
                const address = this.server!.address() as any;
                this.port = address.port;
                this.outputChannel.appendLine(`[ToolServer] Started on port ${this.port} (${this.handlers.size} tools)`);
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

    getPort(): number { return this.port; }

    // ═══════════════════════════════════════════════
    //  Helpers
    // ═══════════════════════════════════════════════

    private resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) return filePath;
        return path.join(this.workspaceRoot, filePath);
    }

    private async refreshEditor(filePath: string, content: string): Promise<void> {
        const document = vscode.workspace.textDocuments.find(d => d.uri.fsPath === filePath);
        if (document) {
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            edit.replace(document.uri, fullRange, content);
            await vscode.workspace.applyEdit(edit);
        }
    }

    private async listDirectory(dirPath: string, maxDepth: number, currentDepth: number): Promise<string[]> {
        const entries: string[] = [];
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const indent = '  '.repeat(currentDepth);

        for (const item of items) {
            if (item.name.startsWith('.') || ['node_modules', '__pycache__', 'dist', 'build', '.git', '.vscode', 'out'].includes(item.name)) {
                continue;
            }

            if (item.isDirectory()) {
                entries.push(`${indent}${item.name}/`);
                if (currentDepth < maxDepth) {
                    const subEntries = await this.listDirectory(path.join(dirPath, item.name), maxDepth, currentDepth + 1);
                    entries.push(...subEntries);
                }
            } else {
                const stat = await fs.promises.stat(path.join(dirPath, item.name));
                const sizeStr = stat.size > 1024 ? `${Math.round(stat.size / 1024)}KB` : `${stat.size}B`;
                entries.push(`${indent}${item.name} (${sizeStr})`);
            }
        }
        return entries;
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const map: Record<string, string> = {
            '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact',
            '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
            '.html': 'html', '.css': 'css', '.scss': 'scss', '.json': 'json',
            '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown', '.sh': 'shell',
            '.sql': 'sql', '.vue': 'vue', '.xml': 'xml', '.toml': 'toml',
            '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
            '.rb': 'ruby', '.php': 'php', '.swift': 'swift', '.kt': 'kotlin'
        };
        return map[ext] || 'plaintext';
    }

    private extractSymbols(content: string, language: string): { type: string; name: string; line: number }[] {
        const symbols: { type: string; name: string; line: number }[] = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // JS/TS
            if (['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(language)) {
                let m: RegExpExecArray | null;
                // function declarations
                if ((m = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'function', name: m[1], line: i + 1 });
                }
                // arrow functions
                else if ((m = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/.exec(line))) {
                    symbols.push({ type: 'function', name: m[1], line: i + 1 });
                }
                // class
                else if ((m = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'class', name: m[1], line: i + 1 });
                }
                // interface
                else if ((m = /(?:export\s+)?interface\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'interface', name: m[1], line: i + 1 });
                }
                // type alias
                else if ((m = /(?:export\s+)?type\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'type', name: m[1], line: i + 1 });
                }
                // enum
                else if ((m = /(?:export\s+)?enum\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'enum', name: m[1], line: i + 1 });
                }
            }

            // Python
            if (language === 'python') {
                let m: RegExpExecArray | null;
                if ((m = /^def\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'function', name: m[1], line: i + 1 });
                } else if ((m = /^class\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'class', name: m[1], line: i + 1 });
                }
            }

            // Go
            if (language === 'go') {
                let m: RegExpExecArray | null;
                if ((m = /^func\s+(?:\([^)]+\)\s+)?(\w+)/.exec(line))) {
                    symbols.push({ type: 'function', name: m[1], line: i + 1 });
                } else if ((m = /^type\s+(\w+)\s+struct/.exec(line))) {
                    symbols.push({ type: 'struct', name: m[1], line: i + 1 });
                } else if ((m = /^type\s+(\w+)\s+interface/.exec(line))) {
                    symbols.push({ type: 'interface', name: m[1], line: i + 1 });
                }
            }

            // Rust
            if (language === 'rust') {
                let m: RegExpExecArray | null;
                if ((m = /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'function', name: m[1], line: i + 1 });
                } else if ((m = /^(?:pub\s+)?struct\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'struct', name: m[1], line: i + 1 });
                } else if ((m = /^(?:pub\s+)?enum\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'enum', name: m[1], line: i + 1 });
                } else if ((m = /^(?:pub\s+)?trait\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'trait', name: m[1], line: i + 1 });
                } else if ((m = /^impl(?:<[^>]+>)?\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'impl', name: m[1], line: i + 1 });
                }
            }

            // Java
            if (language === 'java') {
                let m: RegExpExecArray | null;
                if ((m = /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/.exec(line)) && !line.includes('class ')) {
                    symbols.push({ type: 'method', name: m[1], line: i + 1 });
                } else if ((m = /(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)/.exec(line))) {
                    symbols.push({ type: 'class', name: m[1], line: i + 1 });
                }
            }
        }

        return symbols;
    }
}
