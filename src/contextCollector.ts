import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 上下文收集器
 * 自动收集项目上下文信息，用于 RAG 检索
 */
export class ContextCollector {
    private workspaceRoot: string;
    private cache: Map<string, any> = new Map();

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * 收集当前文件上下文
     */
    async collectFileContext(filePath: string): Promise<FileContext> {
        const cacheKey = `file:${filePath}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const document = await vscode.workspace.openTextDocument(filePath);
        const content = document.getText();
        const language = document.languageId;

        // 提取导入
        const imports = this.extractImports(content, language);

        // 提取函数/类定义
        const definitions = this.extractDefinitions(content, language);

        // 提取注释
        const comments = this.extractComments(content, language);

        // 提取依赖
        const dependencies = await this.extractDependencies();

        const context: FileContext = {
            filePath,
            language,
            content,
            imports,
            definitions,
            comments,
            dependencies
        };

        this.cache.set(cacheKey, context);
        return context;
    }

    /**
     * 收集项目上下文
     */
    async collectProjectContext(): Promise<ProjectContext> {
        const cacheKey = 'project';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        // 扫描项目结构
        const structure = await this.scanProjectStructure();

        // 读取配置文件
        const config = await this.readConfigFiles();

        // 提取依赖
        const dependencies = await this.extractDependencies();

        // 检测项目类型
        const projectType = this.detectProjectType(config);

        const context: ProjectContext = {
            structure,
            config,
            dependencies,
            projectType
        };

        this.cache.set(cacheKey, context);
        return context;
    }

    /**
     * 收集相关代码上下文
     */
    async collectRelatedContext(
        filePath: string,
        selectedText: string
    ): Promise<RelatedContext> {
        // 查找相关文件
        const relatedFiles = await this.findRelatedFiles(filePath);

        // 查找导入的文件
        const importedFiles = await this.findImportedFiles(filePath);

        // 查找引用
        const references = await this.findReferences(filePath, selectedText);

        // 查找定义
        const definitions = await this.findDefinitions(selectedText);

        return {
            relatedFiles,
            importedFiles,
            references,
            definitions
        };
    }

    /**
     * 收集选中代码上下文
     */
    async collectSelectionContext(
        editor: vscode.TextEditor
    ): Promise<SelectionContext> {
        const document = editor.document;
        const selection = editor.selection;
        const selectedText = document.getText(selection);

        // 获取选中代码周围的上下文
        const startLine = Math.max(0, selection.start.line - 10);
        const endLine = Math.min(document.lineCount - 1, selection.end.line + 10);
        const surroundingRange = new vscode.Range(
            startLine, 0,
            endLine, document.lineAt(endLine).text.length
        );
        const surroundingText = document.getText(surroundingRange);

        // 获取函数/类定义
        const definition = this.findEnclosingDefinition(
            document.getText(),
            selection.start.line,
            document.languageId
        );

        return {
            filePath: document.fileName,
            language: document.languageId,
            selectedText,
            surroundingText,
            definition,
            startLine: selection.start.line,
            endLine: selection.end.line
        };
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * 提取导入语句
     */
    private extractImports(content: string, language: string): string[] {
        const imports: string[] = [];

        // JavaScript/TypeScript
        if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(language)) {
            // import ... from '...'
            const importFromRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
            let match;
            while ((match = importFromRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }

            // require('...')
            const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            while ((match = requireRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }
        }

        // Python
        if (language === 'python') {
            const importRegex = /^(?:from\s+(\S+)\s+)?import\s+(.+)$/gm;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                imports.push(match[1] || match[2].split(',')[0].trim());
            }
        }

        // Go
        if (language === 'go') {
            const importRegex = /import\s+(?:\(\s*)?["']([^"']+)["']/g;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }
        }

        // Java
        if (language === 'java') {
            const importRegex = /^import\s+(?:static\s+)?([^;]+);$/gm;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }
        }

        return Array.from(new Set(imports));
    }

    /**
     * 提取函数/类定义
     */
    private extractDefinitions(content: string, language: string): Definition[] {
        const definitions: Definition[] = [];

        // JavaScript/TypeScript
        if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(language)) {
            // 函数定义
            const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
            let match;
            while ((match = funcRegex.exec(content)) !== null) {
                definitions.push({
                    type: 'function',
                    name: match[1],
                    line: content.substring(0, match.index).split('\n').length
                });
            }

            // 箭头函数
            const arrowFuncRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g;
            while ((match = arrowFuncRegex.exec(content)) !== null) {
                definitions.push({
                    type: 'function',
                    name: match[1],
                    line: content.substring(0, match.index).split('\n').length
                });
            }

            // 类定义
            const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g;
            while ((match = classRegex.exec(content)) !== null) {
                definitions.push({
                    type: 'class',
                    name: match[1],
                    line: content.substring(0, match.index).split('\n').length
                });
            }

            // 接口定义
            const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g;
            while ((match = interfaceRegex.exec(content)) !== null) {
                definitions.push({
                    type: 'interface',
                    name: match[1],
                    line: content.substring(0, match.index).split('\n').length
                });
            }
        }

        // Python
        if (language === 'python') {
            // 函数定义
            const funcRegex = /def\s+(\w+)\s*\(/g;
            let match;
            while ((match = funcRegex.exec(content)) !== null) {
                definitions.push({
                    type: 'function',
                    name: match[1],
                    line: content.substring(0, match.index).split('\n').length
                });
            }

            // 类定义
            const classRegex = /class\s+(\w+)/g;
            while ((match = classRegex.exec(content)) !== null) {
                definitions.push({
                    type: 'class',
                    name: match[1],
                    line: content.substring(0, match.index).split('\n').length
                });
            }
        }

        return definitions;
    }

    /**
     * 提取注释
     */
    private extractComments(content: string, language: string): string[] {
        const comments: string[] = [];

        // 单行注释
        const singleLineRegex = /\/\/(.*)$/gm;
        let match;
        while ((match = singleLineRegex.exec(content)) !== null) {
            const comment = match[1].trim();
            if (comment.length > 10) { // 只保留有意义的注释
                comments.push(comment);
            }
        }

        // 多行注释
        const multiLineRegex = /\/\*([\s\S]*?)\*\//g;
        while ((match = multiLineRegex.exec(content)) !== null) {
            const comment = match[1]
                .split('\n')
                .map(line => line.replace(/^\s*\*\s?/, '').trim())
                .filter(line => line.length > 0)
                .join(' ');
            if (comment.length > 10) {
                comments.push(comment);
            }
        }

        // Python 注释
        if (language === 'python') {
            const pythonCommentRegex = /#(.*)$/gm;
            while ((match = pythonCommentRegex.exec(content)) !== null) {
                const comment = match[1].trim();
                if (comment.length > 10) {
                    comments.push(comment);
                }
            }

            // Docstring
            const docstringRegex = /"""([\s\S]*?)"""|'''([\s\S]*?)'''/g;
            while ((match = docstringRegex.exec(content)) !== null) {
                const comment = (match[1] || match[2]).trim();
                if (comment.length > 10) {
                    comments.push(comment);
                }
            }
        }

        return Array.from(new Set(comments));
    }

    /**
     * 扫描项目结构
     */
    private async scanProjectStructure(): Promise<DirectoryNode> {
        const root = this.workspaceRoot;
        return this.scanDirectory(root, 0, 3); // 最多3层深度
    }

    private async scanDirectory(
        dirPath: string,
        depth: number,
        maxDepth: number
    ): Promise<DirectoryNode> {
        if (depth > maxDepth) {
            return { name: path.basename(dirPath), type: 'directory', children: [] };
        }

        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            const children: (DirectoryNode | FileNode)[] = [];

            for (const entry of entries) {
                // 跳过隐藏文件和依赖目录
                if (entry.name.startsWith('.') ||
                    ['node_modules', '__pycache__', 'dist', 'build', '.git', '.vscode'].includes(entry.name)) {
                    continue;
                }

                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    const subDir = await this.scanDirectory(fullPath, depth + 1, maxDepth);
                    if (subDir.children.length > 0) {
                        children.push(subDir);
                    }
                } else {
                    const stat = await fs.promises.stat(fullPath);
                    children.push({
                        name: entry.name,
                        type: 'file',
                        size: stat.size,
                        language: this.detectLanguage(entry.name)
                    });
                }
            }

            return {
                name: path.basename(dirPath),
                type: 'directory',
                children
            };
        } catch (error) {
            return { name: path.basename(dirPath), type: 'directory', children: [] };
        }
    }

    /**
     * 读取配置文件
     */
    private async readConfigFiles(): Promise<Record<string, any>> {
        const config: Record<string, any> = {};

        // package.json
        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                config.packageJson = JSON.parse(
                    await fs.promises.readFile(packageJsonPath, 'utf-8')
                );
            } catch (error) {
                // 忽略解析错误
            }
        }

        // tsconfig.json
        const tsconfigPath = path.join(this.workspaceRoot, 'tsconfig.json');
        if (fs.existsSync(tsconfigPath)) {
            try {
                config.tsconfig = JSON.parse(
                    await fs.promises.readFile(tsconfigPath, 'utf-8')
                );
            } catch (error) {
                // 忽略解析错误
            }
        }

        // pyproject.toml
        const pyprojectPath = path.join(this.workspaceRoot, 'pyproject.toml');
        if (fs.existsSync(pyprojectPath)) {
            config.pyproject = true;
        }

        // requirements.txt
        const requirementsPath = path.join(this.workspaceRoot, 'requirements.txt');
        if (fs.existsSync(requirementsPath)) {
            config.requirements = true;
        }

        return config;
    }

    /**
     * 提取依赖
     */
    private async extractDependencies(): Promise<string[]> {
        const dependencies: string[] = [];

        // package.json
        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(
                    await fs.promises.readFile(packageJsonPath, 'utf-8')
                );
                dependencies.push(
                    ...Object.keys(packageJson.dependencies || {}),
                    ...Object.keys(packageJson.devDependencies || {})
                );
            } catch (error) {
                // 忽略解析错误
            }
        }

        // requirements.txt
        const requirementsPath = path.join(this.workspaceRoot, 'requirements.txt');
        if (fs.existsSync(requirementsPath)) {
            try {
                const content = await fs.promises.readFile(requirementsPath, 'utf-8');
                const lines = content.split('\n')
                    .filter(line => line.trim() && !line.startsWith('#'))
                    .map(line => line.split(/[>=<]/)[0].trim());
                dependencies.push(...lines);
            } catch (error) {
                // 忽略解析错误
            }
        }

        return Array.from(new Set(dependencies));
    }

    /**
     * 检测项目类型
     */
    private detectProjectType(config: Record<string, any>): string {
        if (config.packageJson) {
            if (config.tsconfig) {
                return 'TypeScript/Node.js';
            }
            return 'JavaScript/Node.js';
        }

        if (config.pyproject || config.requirements) {
            return 'Python';
        }

        return 'Unknown';
    }

    /**
     * 检测语言
     */
    private detectLanguage(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
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
     * 查找相关文件
     */
    private async findRelatedFiles(filePath: string): Promise<string[]> {
        const relatedFiles: string[] = [];

        // 查找同目录下的文件
        const dir = path.dirname(filePath);
        try {
            const entries = await fs.promises.readdir(dir);
            for (const entry of entries) {
                if (entry !== path.basename(filePath)) {
                    relatedFiles.push(path.join(dir, entry));
                }
            }
        } catch (error) {
            // 忽略错误
        }

        return relatedFiles;
    }

    /**
     * 查找导入的文件
     */
    private async findImportedFiles(filePath: string): Promise<string[]> {
        const importedFiles: string[] = [];

        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            const content = document.getText();
            const imports = this.extractImports(content, document.languageId);
            const dir = path.dirname(filePath);

            for (const imp of imports) {
                if (imp.startsWith('.')) {
                    const resolvedPath = path.resolve(dir, imp);
                    // 尝试不同的扩展名
                    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.py'];
                    for (const ext of extensions) {
                        const fullPath = resolvedPath + ext;
                        if (fs.existsSync(fullPath)) {
                            importedFiles.push(fullPath);
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            // 忽略错误
        }

        return importedFiles;
    }

    /**
     * 查找引用
     */
    private async findReferences(
        filePath: string,
        symbol: string
    ): Promise<vscode.Location[]> {
        try {
            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                vscode.Uri.file(filePath),
                new vscode.Position(0, 0)
            );
            return locations || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * 查找定义
     */
    private async findDefinitions(
        symbol: string
    ): Promise<vscode.Location[]> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return [];
            }

            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                editor.document.uri,
                editor.selection.active
            );
            return locations || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * 查找包含的定义
     */
    private findEnclosingDefinition(
        content: string,
        line: number,
        language: string
    ): Definition | undefined {
        const definitions = this.extractDefinitions(content, language);

        // 找到包含指定行的最近定义
        let closest: Definition | undefined;
        for (const def of definitions) {
            if (def.line <= line) {
                if (!closest || def.line > closest.line) {
                    closest = def;
                }
            }
        }

        return closest;
    }
}

// 类型定义
export interface FileContext {
    filePath: string;
    language: string;
    content: string;
    imports: string[];
    definitions: Definition[];
    comments: string[];
    dependencies: string[];
}

export interface Definition {
    type: 'function' | 'class' | 'interface' | 'variable';
    name: string;
    line: number;
}

export interface ProjectContext {
    structure: DirectoryNode;
    config: Record<string, any>;
    dependencies: string[];
    projectType: string;
}

export interface DirectoryNode {
    name: string;
    type: 'directory';
    children: (DirectoryNode | FileNode)[];
}

export interface FileNode {
    name: string;
    type: 'file';
    size: number;
    language?: string;
}

export interface RelatedContext {
    relatedFiles: string[];
    importedFiles: string[];
    references: vscode.Location[];
    definitions: vscode.Location[];
}

export interface SelectionContext {
    filePath: string;
    language: string;
    selectedText: string;
    surroundingText: string;
    definition?: Definition;
    startLine: number;
    endLine: number;
}
