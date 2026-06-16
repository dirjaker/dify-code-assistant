import * as vscode from 'vscode';
import * as path from 'path';

/**
 * @workspace 索引器
 * 扫描项目结构，构建上下文摘要
 */

export interface WorkspaceIndex {
    rootPath: string;
    projectType: string;
    fileTree: FileTreeNode[];
    keyFiles: KeyFile[];
    dependencies: string[];
    structure: string; // 文本形式的项目结构
    indexedAt: number;
}

export interface FileTreeNode {
    path: string;
    type: 'file' | 'dir';
    children?: FileTreeNode[];
}

export interface KeyFile {
    path: string;
    type: string;
    summary: string;
}

export class WorkspaceIndexer {
    private index: WorkspaceIndex | null = null;
    private indexing: boolean = false;

    /**
     * 构建或获取工作区索引
     */
    async getIndex(): Promise<WorkspaceIndex | null> {
        // 缓存 5 分钟
        if (this.index && Date.now() - this.index.indexedAt < 5 * 60 * 1000) {
            return this.index;
        }
        return this.buildIndex();
    }

    /**
     * 构建索引
     */
    async buildIndex(): Promise<WorkspaceIndex | null> {
        if (this.indexing) return this.index;
        this.indexing = true;

        try {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!root) return null;

            const fileTree = await this.scanTree(root, 0, 4);
            const keyFiles = await this.detectKeyFiles(root);
            const projectType = this.detectProjectType(keyFiles);
            const dependencies = await this.extractDependencies(root, keyFiles);
            const structure = this.treeToText(fileTree, '');

            this.index = {
                rootPath: root,
                projectType,
                fileTree,
                keyFiles,
                dependencies,
                structure,
                indexedAt: Date.now()
            };

            return this.index;
        } finally {
            this.indexing = false;
        }
    }

    /**
     * 生成系统提示词上下文
     */
    async getContextSummary(): Promise<string> {
        const index = await this.getIndex();
        if (!index) return '';

        const parts: string[] = [];
        parts.push(`## Workspace Context`);
        parts.push(`Project type: ${index.projectType}`);
        parts.push(`Root: ${path.basename(index.rootPath)}`);

        if (index.dependencies.length > 0) {
            parts.push(`Key dependencies: ${index.dependencies.slice(0, 15).join(', ')}`);
        }

        parts.push(`\n### Project Structure`);
        parts.push('```');
        parts.push(index.structure);
        parts.push('```');

        if (index.keyFiles.length > 0) {
            parts.push(`\n### Key Files`);
            for (const kf of index.keyFiles) {
                parts.push(`- ${kf.path}: ${kf.summary}`);
            }
        }

        return parts.join('\n');
    }

    /**
     * 递归扫描目录树
     */
    private async scanTree(dirPath: string, depth: number, maxDepth: number): Promise<FileTreeNode[]> {
        if (depth > maxDepth) return [];

        const excludeNames = new Set([
            'node_modules', '.git', 'out', 'dist', 'build', '__pycache__',
            '.venv', 'venv', '.vscode', '.idea', '.next', '.nuxt',
            'coverage', '.cache', 'tmp', 'temp', '.DS_Store', 'Thumbs.db'
        ]);

        const nodes: FileTreeNode[] = [];

        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));

            for (const [name, type] of entries) {
                if (excludeNames.has(name)) continue;
                if (name.startsWith('.') && name !== '.env.example') continue;

                const fullPath = path.join(dirPath, name);
                const relPath = path.relative(vscode.workspace.workspaceFolders![0].uri.fsPath, fullPath);

                if (type === vscode.FileType.Directory) {
                    const children = await this.scanTree(fullPath, depth + 1, maxDepth);
                    if (children.length > 0) {
                        nodes.push({ path: relPath, type: 'dir', children });
                    }
                } else {
                    nodes.push({ path: relPath, type: 'file' });
                }
            }
        } catch {
            // skip inaccessible dirs
        }

        return nodes;
    }

    /**
     * 检测关键文件
     */
    private async detectKeyFiles(root: string): Promise<KeyFile[]> {
        const keyPatterns: { pattern: string; type: string }[] = [
            { pattern: 'package.json', type: 'npm' },
            { pattern: 'requirements.txt', type: 'python' },
            { pattern: 'pyproject.toml', type: 'python' },
            { pattern: 'Cargo.toml', type: 'rust' },
            { pattern: 'go.mod', type: 'go' },
            { pattern: 'pom.xml', type: 'java' },
            { pattern: 'build.gradle', type: 'java' },
            { pattern: 'Dockerfile', type: 'docker' },
            { pattern: 'docker-compose.yml', type: 'docker' },
            { pattern: 'tsconfig.json', type: 'typescript' },
            { pattern: 'vite.config.ts', type: 'vite' },
            { pattern: 'webpack.config.js', type: 'webpack' },
            { pattern: 'README.md', type: 'docs' },
            { pattern: 'Makefile', type: 'build' },
            { pattern: '.github/workflows', type: 'ci' },
        ];

        const found: KeyFile[] = [];

        for (const { pattern, type } of keyPatterns) {
            try {
                const fullPath = path.join(root, pattern);
                const uri = vscode.Uri.file(fullPath);
                const stat = await vscode.workspace.fs.stat(uri);
                if (stat) {
                    found.push({ path: pattern, type, summary: `${type} configuration` });
                }
            } catch {
                // not found
            }
        }

        return found;
    }

    /**
     * 检测项目类型
     */
    private detectProjectType(keyFiles: KeyFile[]): string {
        const types = keyFiles.map(kf => kf.type);
        if (types.includes('npm') && types.includes('typescript')) return 'TypeScript/Node.js';
        if (types.includes('npm')) return 'JavaScript/Node.js';
        if (types.includes('python')) return 'Python';
        if (types.includes('rust')) return 'Rust';
        if (types.includes('go')) return 'Go';
        if (types.includes('java')) return 'Java';
        return 'Unknown';
    }

    /**
     * 提取依赖列表
     */
    private async extractDependencies(root: string, keyFiles: KeyFile[]): Promise<string[]> {
        const deps: string[] = [];

        // package.json
        if (keyFiles.find(kf => kf.type === 'npm')) {
            try {
                const content = await this.readFile(path.join(root, 'package.json'));
                const pkg = JSON.parse(content);
                deps.push(...Object.keys(pkg.dependencies || {}));
                deps.push(...Object.keys(pkg.devDependencies || {}));
            } catch {}
        }

        // requirements.txt
        if (keyFiles.find(kf => kf.path === 'requirements.txt')) {
            try {
                const content = await this.readFile(path.join(root, 'requirements.txt'));
                const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
                deps.push(...lines.map(l => l.split(/[>=<]/)[0].trim()));
            } catch {}
        }

        return deps;
    }

    /**
     * 树转文本
     */
    private treeToText(nodes: FileTreeNode[], prefix: string): string {
        const lines: string[] = [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const isLast = i === nodes.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const name = path.basename(node.path);

            if (node.type === 'dir') {
                lines.push(prefix + connector + name + '/');
                if (node.children) {
                    const childPrefix = prefix + (isLast ? '    ' : '│   ');
                    lines.push(this.treeToText(node.children, childPrefix));
                }
            } else {
                lines.push(prefix + connector + name);
            }
        }
        return lines.join('\n');
    }

    private async readFile(filePath: string): Promise<string> {
        const uri = vscode.Uri.file(filePath);
        const data = await vscode.workspace.fs.readFile(uri);
        return new TextDecoder().decode(data);
    }

    /**
     * 强制刷新索引
     */
    refresh(): void {
        this.index = null;
    }
}
