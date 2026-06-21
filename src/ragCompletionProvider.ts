import * as vscode from 'vscode';
import { DifyClient } from './difyClient';
import { ContextCollector } from './contextCollector';

/**
 * RAG 增强的代码补全提供者
 * 结合知识库检索和 LLM 生成
 */
export class RAGCompletionProvider implements vscode.InlineCompletionItemProvider {
    private client: DifyClient;
    private contextCollector: ContextCollector;
    private cache: Map<string, string> = new Map();
    private lastRequestTime: number = 0;
    private debounceMs: number = 500;
    private pendingRequest: AbortController | null = null;

    constructor(client: DifyClient, contextCollector: ContextCollector) {
        this.client = client;
        this.contextCollector = contextCollector;
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[]> {
        // Debounce
        const now = Date.now();
        if (now - this.lastRequestTime < this.debounceMs) {
            return [];
        }
        this.lastRequestTime = now;

        // Skip empty lines (unless continuing a pattern)
        const lineText = document.lineAt(position).text;
        const trimmed = lineText.trim();
        if (trimmed.length === 0 && position.line > 0) {
            // Check if previous line suggests continuation
            const prevLine = document.lineAt(position.line - 1).text.trim();
            if (!prevLine.endsWith(':') && !prevLine.endsWith('{') && !prevLine.endsWith('(')) {
                return [];
            }
        }

        // Skip inside strings and comments
        if (this.isInStringOrComment(document, position)) {
            return [];
        }

        // Get context
        const textBefore = document.getText(new vscode.Range(
            new vscode.Position(Math.max(0, position.line - 30), 0),
            position
        ));
        const textAfter = document.getText(new vscode.Range(
            position,
            new vscode.Position(Math.min(document.lineCount - 1, position.line + 10), 0)
        ));

        // Check cache
        const cacheKey = textBefore.slice(-300);
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey)!;
            if (cached) {
                return [new vscode.InlineCompletionItem(cached)];
            }
        }

        // Cancel previous request
        if (this.pendingRequest) {
            this.pendingRequest.abort();
        }
        this.pendingRequest = new AbortController();

        try {
            const languageId = document.languageId;
            const fileName = document.fileName.split(/[/\\]/).pop() || '';

            // 收集上下文
            const fileContext = await this.contextCollector.collectFileContext(document.fileName);
            const editor = vscode.window.activeTextEditor;
            if (!editor) return [];
            const selectionContext = await this.contextCollector.collectSelectionContext(editor);

            // 构建 RAG 查询
            const ragQuery = this.buildRAGQuery(
                textBefore,
                textAfter,
                languageId,
                fileName,
                fileContext
            );

            // 调用 RAG 增强的代码补全
            const completion = await this.client.queryCodeCompletion(
                ragQuery,
                languageId,
                this.detectCompletionType(textBefore, position)
            );

            if (completion && !token.isCancellationRequested) {
                // 提取代码部分
                const code = this.extractCode(completion, textBefore, position);
                if (code) {
                    this.cache.set(cacheKey, code);
                    this.limitCache(100);
                    return [new vscode.InlineCompletionItem(code)];
                }
            }
        } catch {
            // Silent fail for completions
        }

        return [];
    }

    /**
     * 构建 RAG 查询
     */
    private buildRAGQuery(
        textBefore: string,
        textAfter: string,
        language: string,
        fileName: string,
        fileContext: any
    ): string {
        const parts: string[] = [];

        // 添加文件信息
        parts.push(`文件: ${fileName}`);
        parts.push(`语言: ${language}`);

        // 添加导入信息
        if (fileContext.imports.length > 0) {
            parts.push(`导入: ${fileContext.imports.slice(0, 5).join(', ')}`);
        }

        // 添加定义信息
        if (fileContext.definitions.length > 0) {
            const defs = fileContext.definitions
                .slice(0, 5)
                .map((d: any) => `${d.type} ${d.name}`)
                .join(', ');
            parts.push(`定义: ${defs}`);
        }

        // 添加光标前代码
        parts.push(`\n光标前代码:\n${textBefore.slice(-500)}`);

        // 添加光标后代码
        if (textAfter.trim()) {
            parts.push(`\n光标后代码:\n${textAfter.slice(0, 200)}`);
        }

        return parts.join('\n');
    }

    /**
     * 检测补全类型
     */
    private detectCompletionType(textBefore: string, position: vscode.Position): string {
        const lastLine = textBefore.split('\n').pop() || '';
        const trimmed = lastLine.trim();

        // 函数定义
        if (trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/)) {
            return '函数补全';
        }

        // 类定义
        if (trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+\w+/)) {
            return '类补全';
        }

        // 接口定义
        if (trimmed.match(/^(?:export\s+)?interface\s+\w+/)) {
            return '接口补全';
        }

        // 代码块
        if (trimmed.endsWith('{') || trimmed.endsWith(':')) {
            return '代码块补全';
        }

        // 行补全
        return '行补全';
    }

    /**
     * 提取代码部分
     */
    private extractCode(
        response: string,
        textBefore: string,
        position: vscode.Position
    ): string {
        let code = response.trim();

        // 移除 Markdown 代码块
        const codeBlockMatch = code.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        if (codeBlockMatch) {
            code = codeBlockMatch[1].trim();
        }

        // 移除前导/尾随换行
        code = code.replace(/^\n+/, '').replace(/\n+$/, '');

        // 如果补全以光标处已有的文本开头，移除它
        const currentLine = textBefore.split('\n').pop() || '';
        const currentTrimmed = currentLine.trim();
        if (currentTrimmed && code.startsWith(currentTrimmed)) {
            code = code.slice(currentTrimmed.length);
        }

        // 限制长度
        const lines = code.split('\n');
        if (lines.length > 15) {
            code = lines.slice(0, 15).join('\n');
        }

        return code;
    }

    private isInStringOrComment(document: vscode.TextDocument, position: vscode.Position): boolean {
        const line = document.lineAt(position.line).text;
        const textBeforeCursor = line.substring(0, position.character);

        // Simple heuristic: if odd number of quotes before cursor, we're in a string
        const singleQuotes = (textBeforeCursor.match(/'/g) || []).length;
        const doubleQuotes = (textBeforeCursor.match(/"/g) || []).length;
        if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1) {
            return true;
        }

        // Check for line comment
        const commentIndex = textBeforeCursor.indexOf('//');
        const hashIndex = textBeforeCursor.indexOf('#');
        if (commentIndex >= 0 || hashIndex >= 0) {
            return true;
        }

        return false;
    }

    private limitCache(maxSize: number): void {
        if (this.cache.size > maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
    }

    clearCache(): void {
        this.cache.clear();
    }
}
