import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

/**
 * 工具执行结果
 */
export interface ToolResult {
    success: boolean;
    output: string;
    error?: string;
    metadata?: Record<string, any>;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
    required: string[];
}

/**
 * 完善的工具执行器
 * 参考 Cline、Cursor 等开源项目实现
 */
export class ToolExecutor {
    private workspaceRoot: string;
    private outputChannel: vscode.OutputChannel;
    private terminal: vscode.Terminal | null = null;

    constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
        this.workspaceRoot = workspaceRoot;
        this.outputChannel = outputChannel;
    }

    /**
     * 获取所有工具定义
     */
    getToolDefinitions(): ToolDefinition[] {
        return [
            {
                name: 'read_file',
                description: 'Read the contents of a file. Returns the file content with line numbers.',
                parameters: {
                    path: {
                        type: 'string',
                        description: 'The path to the file to read (relative to workspace or absolute)'
                    },
                    start_line: {
                        type: 'number',
                        description: 'Optional: Start line number (1-indexed)'
                    },
                    end_line: {
                        type: 'number',
                        description: 'Optional: End line number (1-indexed)'
                    }
                },
                required: ['path']
            },
            {
                name: 'write_file',
                description: 'Create or overwrite a file with the given content. Use this for creating new files or completely replacing file content.',
                parameters: {
                    path: {
                        type: 'string',
                        description: 'The path to the file to write (relative to workspace or absolute)'
                    },
                    content: {
                        type: 'string',
                        description: 'The content to write to the file'
                    }
                },
                required: ['path', 'content']
            },
            {
                name: 'edit_file',
                description: 'Make targeted edits to a file by replacing specific text. Use this for partial modifications.',
                parameters: {
                    path: {
                        type: 'string',
                        description: 'The path to the file to edit'
                    },
                    old_text: {
                        type: 'string',
                        description: 'The exact text to find and replace (must be unique in the file)'
                    },
                    new_text: {
                        type: 'string',
                        description: 'The new text to replace with'
                    }
                },
                required: ['path', 'old_text', 'new_text']
            },
            {
                name: 'search_files',
                description: 'Search for text patterns across files in the workspace using ripgrep.',
                parameters: {
                    query: {
                        type: 'string',
                        description: 'The search query (supports regex)'
                    },
                    include: {
                        type: 'string',
                        description: 'Optional: File pattern to include (e.g., "*.py", "*.ts")'
                    },
                    exclude: {
                        type: 'string',
                        description: 'Optional: File pattern to exclude (e.g., "node_modules/**")'
                    },
                    max_results: {
                        type: 'number',
                        description: 'Optional: Maximum number of results (default: 50)'
                    }
                },
                required: ['query']
            },
            {
                name: 'list_files',
                description: 'List files and directories in the specified path.',
                parameters: {
                    path: {
                        type: 'string',
                        description: 'The directory path to list (relative to workspace or absolute)'
                    },
                    recursive: {
                        type: 'boolean',
                        description: 'Optional: Whether to list recursively (default: false)'
                    },
                    max_depth: {
                        type: 'number',
                        description: 'Optional: Maximum recursion depth (default: 3)'
                    }
                },
                required: []
            },
            {
                name: 'execute_command',
                description: 'Execute a shell command and return the output. Use for running tests, building, installing packages, etc.',
                parameters: {
                    command: {
                        type: 'string',
                        description: 'The command to execute'
                    },
                    cwd: {
                        type: 'string',
                        description: 'Optional: Working directory (defaults to workspace root)'
                    },
                    timeout: {
                        type: 'number',
                        description: 'Optional: Timeout in milliseconds (default: 30000)'
                    }
                },
                required: ['command']
            },
            {
                name: 'create_directory',
                description: 'Create a directory and any necessary parent directories.',
                parameters: {
                    path: {
                        type: 'string',
                        description: 'The directory path to create'
                    }
                },
                required: ['path']
            },
            {
                name: 'delete_file',
                description: 'Delete a file or directory.',
                parameters: {
                    path: {
                        type: 'string',
                        description: 'The path to delete'
                    },
                    recursive: {
                        type: 'boolean',
                        description: 'Optional: Whether to delete directories recursively (default: false)'
                    }
                },
                required: ['path']
            },
            {
                name: 'move_file',
                description: 'Move or rename a file or directory.',
                parameters: {
                    source: {
                        type: 'string',
                        description: 'The source path'
                    },
                    destination: {
                        type: 'string',
                        description: 'The destination path'
                    }
                },
                required: ['source', 'destination']
            },
            {
                name: 'get_diagnostics',
                description: 'Get language diagnostics (errors, warnings) for a file or the entire workspace.',
                parameters: {
                    path: {
                        type: 'string',
                        description: 'Optional: File path to get diagnostics for (empty for workspace)'
                    }
                },
                required: []
            },
            {
                name: 'insert_code',
                description: 'Insert code at a specific location in a file.',
                parameters: {
                    path: {
                        type: 'string',
                        description: 'The file path'
                    },
                    line: {
                        type: 'number',
                        description: 'The line number to insert at (1-indexed)'
                    },
                    content: {
                        type: 'string',
                        description: 'The code to insert'
                    },
                    position: {
                        type: 'string',
                        description: 'Optional: "before" or "after" the line (default: "after")'
                    }
                },
                required: ['path', 'line', 'content']
            },
            {
                name: 'get_symbols',
                description: 'Get all symbols (functions, classes, variables) in a file.',
                parameters: {
                    path: {
                        type: 'string',
                        description: 'The file path'
                    }
                },
                required: ['path']
            }
        ];
    }

    /**
     * 执行工具
     */
    async executeTool(toolName: string, parameters: Record<string, any>): Promise<ToolResult> {
        this.outputChannel.appendLine(`[Tool] Executing: ${toolName}`);
        this.outputChannel.appendLine(`[Tool] Parameters: ${JSON.stringify(parameters, null, 2)}`);

        try {
            let result: ToolResult;

            switch (toolName) {
                case 'read_file':
                    result = await this.readFile(parameters);
                    break;
                case 'write_file':
                    result = await this.writeFile(parameters);
                    break;
                case 'edit_file':
                    result = await this.editFile(parameters);
                    break;
                case 'search_files':
                    result = await this.searchFiles(parameters);
                    break;
                case 'list_files':
                    result = await this.listFiles(parameters);
                    break;
                case 'execute_command':
                    result = await this.executeCommand(parameters);
                    break;
                case 'create_directory':
                    result = await this.createDirectory(parameters);
                    break;
                case 'delete_file':
                    result = await this.deleteFile(parameters);
                    break;
                case 'move_file':
                    result = await this.moveFile(parameters);
                    break;
                case 'get_diagnostics':
                    result = await this.getDiagnostics(parameters);
                    break;
                case 'insert_code':
                    result = await this.insertCode(parameters);
                    break;
                case 'get_symbols':
                    result = await this.getSymbols(parameters);
                    break;
                default:
                    result = {
                        success: false,
                        output: '',
                        error: `Unknown tool: ${toolName}`
                    };
            }

            this.outputChannel.appendLine(`[Tool] Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
            if (result.error) {
                this.outputChannel.appendLine(`[Tool] Error: ${result.error}`);
            }

            return result;
        } catch (error: any) {
            this.outputChannel.appendLine(`[Tool] Exception: ${error.message}`);
            return {
                success: false,
                output: '',
                error: error.message
            };
        }
    }

    /**
     * 读取文件
     */
    private async readFile(params: Record<string, any>): Promise<ToolResult> {
        const filePath = this.resolvePath(params.path);
        
        if (!fs.existsSync(filePath)) {
            return {
                success: false,
                output: '',
                error: `File not found: ${params.path}`
            };
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            
            let startLine = params.start_line ? parseInt(params.start_line) - 1 : 0;
            let endLine = params.end_line ? parseInt(params.end_line) : lines.length;
            
            // 验证行号范围
            startLine = Math.max(0, Math.min(startLine, lines.length - 1));
            endLine = Math.max(startLine + 1, Math.min(endLine, lines.length));
            
            const selectedLines = lines.slice(startLine, endLine);
            const numberedLines = selectedLines.map((line, i) => 
                `${startLine + i + 1}: ${line}`
            ).join('\n');

            return {
                success: true,
                output: numberedLines,
                metadata: {
                    path: params.path,
                    total_lines: lines.length,
                    returned_lines: selectedLines.length,
                    language: this.detectLanguage(filePath)
                }
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Failed to read file: ${error.message}`
            };
        }
    }

    /**
     * 写入文件
     */
    private async writeFile(params: Record<string, any>): Promise<ToolResult> {
        const filePath = this.resolvePath(params.path);
        const content = params.content;

        if (!content && content !== '') {
            return {
                success: false,
                output: '',
                error: 'Content parameter is required'
            };
        }

        try {
            // 确保目录存在
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }

            await fs.promises.writeFile(filePath, content, 'utf-8');

            // 如果文件在编辑器中打开，刷新它
            const document = vscode.workspace.textDocuments.find(
                d => d.uri.fsPath === filePath
            );
            if (document) {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                );
                edit.replace(document.uri, fullRange, content);
                await vscode.workspace.applyEdit(edit);
            }

            return {
                success: true,
                output: `File written successfully: ${params.path}`,
                metadata: {
                    path: params.path,
                    size: content.length,
                    lines: content.split('\n').length
                }
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Failed to write file: ${error.message}`
            };
        }
    }

    /**
     * 编辑文件（精确替换）
     */
    private async editFile(params: Record<string, any>): Promise<ToolResult> {
        const filePath = this.resolvePath(params.path);
        const oldText = params.old_text;
        const newText = params.new_text;

        if (!oldText) {
            return {
                success: false,
                output: '',
                error: 'old_text parameter is required'
            };
        }

        if (!fs.existsSync(filePath)) {
            return {
                success: false,
                output: '',
                error: `File not found: ${params.path}`
            };
        }

        try {
            let content = await fs.promises.readFile(filePath, 'utf-8');
            
            // 检查 old_text 是否存在
            const count = content.split(oldText).length - 1;
            if (count === 0) {
                return {
                    success: false,
                    output: '',
                    error: `Text not found in file: "${oldText.substring(0, 50)}..."`
                };
            }
            if (count > 1) {
                return {
                    success: false,
                    output: '',
                    error: `Text found ${count} times in file. Please provide more context to make it unique.`
                };
            }

            // 执行替换
            content = content.replace(oldText, newText);
            await fs.promises.writeFile(filePath, content, 'utf-8');

            // 如果文件在编辑器中打开，刷新它
            const document = vscode.workspace.textDocuments.find(
                d => d.uri.fsPath === filePath
            );
            if (document) {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                );
                edit.replace(document.uri, fullRange, content);
                await vscode.workspace.applyEdit(edit);
            }

            return {
                success: true,
                output: `File edited successfully: ${params.path}`,
                metadata: {
                    path: params.path,
                    old_text_length: oldText.length,
                    new_text_length: newText.length
                }
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Failed to edit file: ${error.message}`
            };
        }
    }

    /**
     * 搜索文件
     */
    private async searchFiles(params: Record<string, any>): Promise<ToolResult> {
        const query = params.query;
        const include = params.include || '*';
        const exclude = params.exclude || 'node_modules/**';
        const maxResults = params.max_results || 50;

        try {
            // 使用 VS Code 的搜索 API
            const files = await vscode.workspace.findFiles(
                include,
                exclude,
                maxResults
            );

            const results: string[] = [];
            const regex = new RegExp(query, 'gi');

            for (const file of files) {
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const content = document.getText();
                    const lines = content.split('\n');

                    for (let i = 0; i < lines.length; i++) {
                        if (regex.test(lines[i])) {
                            const relativePath = path.relative(this.workspaceRoot, file.fsPath);
                            results.push(`${relativePath}:${i + 1}: ${lines[i].trim()}`);
                            regex.lastIndex = 0;
                        }
                    }
                } catch (error) {
                    // 跳过无法读取的文件
                }
            }

            return {
                success: true,
                output: results.length > 0 
                    ? results.slice(0, maxResults).join('\n')
                    : 'No matches found',
                metadata: {
                    query,
                    total_matches: results.length,
                    files_searched: files.length
                }
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Search failed: ${error.message}`
            };
        }
    }

    /**
     * 列出文件
     */
    private async listFiles(params: Record<string, any>): Promise<ToolResult> {
        const dirPath = params.path ? this.resolvePath(params.path) : this.workspaceRoot;
        const recursive = params.recursive || false;
        const maxDepth = params.max_depth || 3;

        if (!fs.existsSync(dirPath)) {
            return {
                success: false,
                output: '',
                error: `Directory not found: ${params.path || '.'}`
            };
        }

        try {
            const entries = await this.scanDirectory(dirPath, 0, recursive ? maxDepth : 0);
            return {
                success: true,
                output: entries.join('\n'),
                metadata: {
                    path: params.path || '.',
                    count: entries.length
                }
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Failed to list files: ${error.message}`
            };
        }
    }

    /**
     * 扫描目录
     */
    private async scanDirectory(dirPath: string, depth: number, maxDepth: number): Promise<string[]> {
        const entries: string[] = [];
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

        for (const item of items) {
            // 跳过隐藏文件和依赖目录
            if (item.name.startsWith('.') || 
                ['node_modules', '__pycache__', 'dist', 'build', '.git'].includes(item.name)) {
                continue;
            }

            const fullPath = path.join(dirPath, item.name);
            const relativePath = path.relative(this.workspaceRoot, fullPath);
            const indent = '  '.repeat(depth);

            if (item.isDirectory()) {
                entries.push(`${indent}${relativePath}/`);
                if (depth < maxDepth) {
                    const subEntries = await this.scanDirectory(fullPath, depth + 1, maxDepth);
                    entries.push(...subEntries);
                }
            } else {
                const stat = await fs.promises.stat(fullPath);
                entries.push(`${indent}${relativePath} (${this.formatSize(stat.size)})`);
            }
        }

        return entries;
    }

    /**
     * 执行命令
     */
    private async executeCommand(params: Record<string, any>): Promise<ToolResult> {
        const command = params.command;
        const cwd = params.cwd ? this.resolvePath(params.cwd) : this.workspaceRoot;
        const timeout = params.timeout || 30000;

        return new Promise((resolve) => {
            const childProcess = cp.exec(command, {
                cwd,
                timeout,
                maxBuffer: 1024 * 1024 * 10, // 10MB
                env: { ...process.env }
            }, (error, stdout, stderr) => {
                if (error && error.killed) {
                    resolve({
                        success: false,
                        output: '',
                        error: `Command timed out after ${timeout}ms`
                    });
                    return;
                }

                let output = '';
                if (stdout) output += stdout;
                if (stderr) output += (output ? '\n--- STDERR ---\n' : '') + stderr;

                resolve({
                    success: !error || error.code === 0,
                    output: output || '(no output)',
                    error: error ? `Exit code: ${error.code}` : undefined,
                    metadata: {
                        command,
                        exit_code: error?.code || 0,
                        stdout_lines: stdout?.split('\n').length || 0,
                        stderr_lines: stderr?.split('\n').length || 0
                    }
                });
            });
        });
    }

    /**
     * 创建目录
     */
    private async createDirectory(params: Record<string, any>): Promise<ToolResult> {
        const dirPath = this.resolvePath(params.path);

        try {
            await fs.promises.mkdir(dirPath, { recursive: true });
            return {
                success: true,
                output: `Directory created: ${params.path}`
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Failed to create directory: ${error.message}`
            };
        }
    }

    /**
     * 删除文件
     */
    private async deleteFile(params: Record<string, any>): Promise<ToolResult> {
        const filePath = this.resolvePath(params.path);
        const recursive = params.recursive || false;

        if (!fs.existsSync(filePath)) {
            return {
                success: false,
                output: '',
                error: `Path not found: ${params.path}`
            };
        }

        try {
            const stat = await fs.promises.stat(filePath);
            if (stat.isDirectory()) {
                if (recursive) {
                    await fs.promises.rm(filePath, { recursive: true });
                } else {
                    await fs.promises.rmdir(filePath);
                }
            } else {
                await fs.promises.unlink(filePath);
            }

            return {
                success: true,
                output: `Deleted: ${params.path}`
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Failed to delete: ${error.message}`
            };
        }
    }

    /**
     * 移动文件
     */
    private async moveFile(params: Record<string, any>): Promise<ToolResult> {
        const source = this.resolvePath(params.source);
        const destination = this.resolvePath(params.destination);

        if (!fs.existsSync(source)) {
            return {
                success: false,
                output: '',
                error: `Source not found: ${params.source}`
            };
        }

        try {
            // 确保目标目录存在
            const dir = path.dirname(destination);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }

            await fs.promises.rename(source, destination);
            return {
                success: true,
                output: `Moved: ${params.source} -> ${params.destination}`
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Failed to move: ${error.message}`
            };
        }
    }

    /**
     * 获取诊断信息
     */
    private async getDiagnostics(params: Record<string, any>): Promise<ToolResult> {
        let diagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [];

        if (params.path) {
            const filePath = this.resolvePath(params.path);
            const uri = vscode.Uri.file(filePath);
            const fileDiagnostics = vscode.languages.getDiagnostics(uri);
            diagnostics = [[uri, fileDiagnostics]];
        } else {
            diagnostics = vscode.languages.getDiagnostics();
        }

        const results: string[] = [];
        for (const [uri, diags] of diagnostics) {
            if (diags.length === 0) continue;
            
            const relativePath = path.relative(this.workspaceRoot, uri.fsPath);
            for (const diag of diags) {
                const severity = diag.severity === vscode.DiagnosticSeverity.Error ? 'ERROR' :
                    diag.severity === vscode.DiagnosticSeverity.Warning ? 'WARNING' :
                    diag.severity === vscode.DiagnosticSeverity.Information ? 'INFO' : 'HINT';
                
                results.push(
                    `${relativePath}:${diag.range.start.line + 1}: ${severity}: ${diag.message}`
                );
            }
        }

        return {
            success: true,
            output: results.length > 0 
                ? results.join('\n')
                : 'No diagnostics found',
            metadata: {
                count: results.length
            }
        };
    }

    /**
     * 插入代码
     */
    private async insertCode(params: Record<string, any>): Promise<ToolResult> {
        const filePath = this.resolvePath(params.path);
        const line = parseInt(params.line);
        const content = params.content;
        const position = params.position || 'after';

        if (!fs.existsSync(filePath)) {
            return {
                success: false,
                output: '',
                error: `File not found: ${params.path}`
            };
        }

        try {
            const fileContent = await fs.promises.readFile(filePath, 'utf-8');
            const lines = fileContent.split('\n');
            
            // 验证行号
            if (line < 1 || line > lines.length) {
                return {
                    success: false,
                    output: '',
                    error: `Invalid line number: ${line}. File has ${lines.length} lines.`
                };
            }

            // 插入代码
            const insertIndex = position === 'before' ? line - 1 : line;
            lines.splice(insertIndex, 0, content);
            
            const newContent = lines.join('\n');
            await fs.promises.writeFile(filePath, newContent, 'utf-8');

            // 如果文件在编辑器中打开，刷新它
            const document = vscode.workspace.textDocuments.find(
                d => d.uri.fsPath === filePath
            );
            if (document) {
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length)
                );
                edit.replace(document.uri, fullRange, newContent);
                await vscode.workspace.applyEdit(edit);
            }

            return {
                success: true,
                output: `Code inserted at line ${line} (${position})`,
                metadata: {
                    path: params.path,
                    line,
                    position,
                    lines_added: content.split('\n').length
                }
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Failed to insert code: ${error.message}`
            };
        }
    }

    /**
     * 获取符号
     */
    private async getSymbols(params: Record<string, any>): Promise<ToolResult> {
        const filePath = this.resolvePath(params.path);
        const uri = vscode.Uri.file(filePath);

        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );

            if (!symbols || symbols.length === 0) {
                return {
                    success: true,
                    output: 'No symbols found',
                    metadata: { count: 0 }
                };
            }

            const results: string[] = [];
            const flattenSymbols = (syms: vscode.DocumentSymbol[], prefix = '') => {
                for (const sym of syms) {
                    const kind = this.symbolKindToString(sym.kind);
                    results.push(`${prefix}${kind} ${sym.name} (line ${sym.range.start.line + 1})`);
                    
                    if (sym.children && sym.children.length > 0) {
                        flattenSymbols(sym.children, prefix + '  ');
                    }
                }
            };

            flattenSymbols(symbols);

            return {
                success: true,
                output: results.join('\n'),
                metadata: {
                    path: params.path,
                    count: results.length
                }
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: `Failed to get symbols: ${error.message}`
            };
        }
    }

    /**
     * 解析路径
     */
    private resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.join(this.workspaceRoot, filePath);
    }

    /**
     * 检测语言
     */
    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescriptreact',
            '.js': 'javascript',
            '.jsx': 'javascriptreact',
            '.py': 'python',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.hpp': 'cpp',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.scala': 'scala',
            '.r': 'r',
            '.m': 'matlab',
            '.sql': 'sql',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.less': 'less',
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.xml': 'xml',
            '.md': 'markdown',
            '.sh': 'shell',
            '.bash': 'shell',
            '.zsh': 'shell',
            '.ps1': 'powershell'
        };

        return languageMap[ext] || 'unknown';
    }

    /**
     * 格式化文件大小
     */
    private formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
        return `${Math.round(bytes / (1024 * 1024))}MB`;
    }

    /**
     * 符号类型转字符串
     */
    private symbolKindToString(kind: vscode.SymbolKind): string {
        const kindMap: Record<number, string> = {
            [vscode.SymbolKind.File]: 'File',
            [vscode.SymbolKind.Module]: 'Module',
            [vscode.SymbolKind.Namespace]: 'Namespace',
            [vscode.SymbolKind.Package]: 'Package',
            [vscode.SymbolKind.Class]: 'Class',
            [vscode.SymbolKind.Method]: 'Method',
            [vscode.SymbolKind.Property]: 'Property',
            [vscode.SymbolKind.Field]: 'Field',
            [vscode.SymbolKind.Constructor]: 'Constructor',
            [vscode.SymbolKind.Enum]: 'Enum',
            [vscode.SymbolKind.Interface]: 'Interface',
            [vscode.SymbolKind.Function]: 'Function',
            [vscode.SymbolKind.Variable]: 'Variable',
            [vscode.SymbolKind.Constant]: 'Constant',
            [vscode.SymbolKind.String]: 'String',
            [vscode.SymbolKind.Number]: 'Number',
            [vscode.SymbolKind.Boolean]: 'Boolean',
            [vscode.SymbolKind.Array]: 'Array',
            [vscode.SymbolKind.Object]: 'Object',
            [vscode.SymbolKind.Key]: 'Key',
            [vscode.SymbolKind.Null]: 'Null',
            [vscode.SymbolKind.EnumMember]: 'EnumMember',
            [vscode.SymbolKind.Struct]: 'Struct',
            [vscode.SymbolKind.Event]: 'Event',
            [vscode.SymbolKind.Operator]: 'Operator',
            [vscode.SymbolKind.TypeParameter]: 'TypeParameter'
        };

        return kindMap[kind] || 'Symbol';
    }

    /**
     * 获取工具模式
     */
    getToolMode(): vscode.LanguageModelChatToolMode {
        return vscode.LanguageModelChatToolMode.Auto;
    }
}
