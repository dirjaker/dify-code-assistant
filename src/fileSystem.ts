import * as vscode from 'vscode';
import * as path from 'path';

export interface FileInfo {
    path: string;
    relativePath: string;
    language: string;
    size: number;
}

export interface FileContent {
    path: string;
    relativePath: string;
    content: string;
    language: string;
    lineCount: number;
}

export interface WorkspaceContext {
    rootPath: string;
    openFile: FileContent | null;
    selectedText: string;
    language: string;
    fileList: FileInfo[];
}

/**
 * 工作区文件系统访问
 * 提供文件读取、目录扫描、上下文收集能力
 */
export class FileSystemProvider {
    private fileCache: Map<string, { content: string; mtime: number }> = new Map();

    /**
     * 获取当前工作区根路径
     */
    getWorkspaceRoot(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        return workspaceFolders?.[0]?.uri.fsPath;
    }

    /**
     * 读取文件内容
     */
    async readFile(filePath: string): Promise<FileContent | null> {
        try {
            let uri: vscode.Uri;
            if (path.isAbsolute(filePath)) {
                uri = vscode.Uri.file(filePath);
            } else {
                const root = this.getWorkspaceRoot();
                if (!root) { return null; }
                uri = vscode.Uri.file(path.join(root, filePath));
            }

            const doc = await vscode.workspace.openTextDocument(uri);
            const stat = await vscode.workspace.fs.stat(uri);

            return {
                path: uri.fsPath,
                relativePath: this.getRelativePath(uri.fsPath),
                content: doc.getText(),
                language: doc.languageId,
                lineCount: doc.lineCount
            };
        } catch {
            return null;
        }
    }

    /**
     * 写入文件内容
     */
    async writeFile(filePath: string, content: string): Promise<boolean> {
        try {
            let uri: vscode.Uri;
            if (path.isAbsolute(filePath)) {
                uri = vscode.Uri.file(filePath);
            } else {
                const root = this.getWorkspaceRoot();
                if (!root) { return false; }
                uri = vscode.Uri.file(path.join(root, filePath));
            }

            // 确保目录存在
            const dir = path.dirname(uri.fsPath);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));

            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取当前打开的编辑器文件
     */
    getActiveEditor(): FileContent | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return null; }

        return {
            path: editor.document.uri.fsPath,
            relativePath: this.getRelativePath(editor.document.uri.fsPath),
            content: editor.document.getText(),
            language: editor.document.languageId,
            lineCount: editor.document.lineCount
        };
    }

    /**
     * 获取选中的文本
     */
    getSelectedText(): string {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return ''; }
        return editor.document.getText(editor.selection);
    }

    /**
     * 扫描工作区文件列表
     */
    async scanWorkspace(maxFiles: number = 200): Promise<FileInfo[]> {
        const root = this.getWorkspaceRoot();
        if (!root) { return []; }

        const files: FileInfo[] = [];
        const excludePatterns = [
            'node_modules', '.git', 'out', 'dist', 'build',
            '__pycache__', '.venv', 'venv', '.env',
            '.vscode', '.idea', '.next', '.nuxt',
            'coverage', '.cache', 'tmp', 'temp'
        ];

        const includeExtensions = new Set([
            '.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte',
            '.py', '.rs', '.go', '.java', '.kt', '.swift',
            '.c', '.cpp', '.h', '.hpp', '.cs',
            '.html', '.css', '.scss', '.less',
            '.json', '.yaml', '.yml', '.toml', '.xml',
            '.md', '.txt', '.rst',
            '.sql', '.graphql', '.proto',
            '.sh', '.bash', '.zsh', '.fish',
            '.dockerfile', '.env.example'
        ]);

        try {
            const entries = await vscode.workspace.fs.readDirectory(
                vscode.Uri.file(root)
            );

            await this.scanDir(root, entries, files, excludePatterns, includeExtensions, maxFiles, 0, 3);
        } catch {
            // ignore
        }

        return files.slice(0, maxFiles);
    }

    private async scanDir(
        dirPath: string,
        entries: [string, vscode.FileType][],
        files: FileInfo[],
        excludes: Set<string> | string[],
        includes: Set<string>,
        maxFiles: number,
        depth: number,
        maxDepth: number
    ): Promise<void> {
        if (depth > maxDepth || files.length >= maxFiles) { return; }

        const excludeSet = new Set(excludes);

        for (const [name, type] of entries) {
            if (files.length >= maxFiles) { break; }
            if (name.startsWith('.') && type === vscode.FileType.File) { continue; }
            if (excludeSet.has(name)) { continue; }

            const fullPath = path.join(dirPath, name);

            if (type === vscode.FileType.Directory) {
                try {
                    const subEntries = await vscode.workspace.fs.readDirectory(
                        vscode.Uri.file(fullPath)
                    );
                    await this.scanDir(fullPath, subEntries, files, excludes, includes, maxFiles, depth + 1, maxDepth);
                } catch {
                    // skip inaccessible directories
                }
            } else if (type === vscode.FileType.File) {
                const ext = path.extname(name).toLowerCase();
                if (includes.has(ext) || name === 'Dockerfile' || name === 'Makefile') {
                    try {
                        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
                        files.push({
                            path: fullPath,
                            relativePath: this.getRelativePath(fullPath),
                            language: this.extToLanguage(ext),
                            size: stat.size
                        });
                    } catch {
                        // skip
                    }
                }
            }
        }
    }

    /**
     * 获取完整工作区上下文
     */
    async getWorkspaceContext(): Promise<WorkspaceContext> {
        const root = this.getWorkspaceRoot() || '';
        const openFile = this.getActiveEditor();
        const selectedText = this.getSelectedText();
        const fileList = await this.scanWorkspace();

        return {
            rootPath: root,
            openFile,
            selectedText,
            language: openFile?.language || '',
            fileList
        };
    }

    /**
     * 获取文件树字符串
     */
    async getFileTree(): Promise<string> {
        const files = await this.scanWorkspace();
        const root = this.getWorkspaceRoot() || '';

        const lines: string[] = [];
        for (const f of files) {
            const rel = f.relativePath;
            lines.push(rel);
        }

        return lines.join('\n');
    }

    private getRelativePath(absolutePath: string): string {
        const root = this.getWorkspaceRoot();
        if (!root) { return absolutePath; }
        const rel = path.relative(root, absolutePath);
        return rel.split(path.sep).join('/');
    }

    private extToLanguage(ext: string): string {
        const map: Record<string, string> = {
            '.ts': 'typescript', '.tsx': 'typescriptreact',
            '.js': 'javascript', '.jsx': 'javascriptreact',
            '.py': 'python', '.rs': 'rust', '.go': 'go',
            '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
            '.vue': 'vue', '.svelte': 'svelte',
            '.html': 'html', '.css': 'css', '.scss': 'scss',
            '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
            '.md': 'markdown', '.sql': 'sql',
            '.sh': 'shell', '.bash': 'shell',
            '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.cs': 'csharp'
        };
        return map[ext] || 'plaintext';
    }
}
