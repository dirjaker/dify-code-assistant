import * as vscode from 'vscode';
import { DifyClient } from './difyClient';

/**
 * 补全提供器基类 - 消除 CompletionProvider 和 RAGCompletionProvider 的重复代码
 */
export abstract class BaseCompletionProvider implements vscode.InlineCompletionItemProvider {
    protected client: DifyClient;
    protected cache: Map<string, string> = new Map();
    protected pendingRequest: AbortController | null = null;
    protected debounceTimer: NodeJS.Timeout | null = null;
    protected lastRequestTime: number = 0;
    protected readonly minInterval: number = 500;

    constructor(client: DifyClient) {
        this.client = client;
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | undefined> {
        // 跳过空行
        const lineText = document.lineAt(position.line).text;
        if (lineText.trim().length === 0) return [];

        // 跳过字符串或注释中
        if (this.isInStringOrComment(document, position)) return [];

        // 防抖
        const now = Date.now();
        if (now - this.lastRequestTime < this.minInterval) return [];
        this.lastRequestTime = now;

        // 获取上下文
        const textBefore = document.getText(new vscode.Range(
            new vscode.Position(Math.max(0, position.line - 30), 0),
            position
        ));
        const textAfter = document.getText(new vscode.Range(
            position,
            new vscode.Position(Math.min(document.lineCount - 1, position.line + 10), 0)
        ));

        // 检查缓存
        const cacheKey = textBefore.slice(-300);
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey)!;
            if (cached) {
                return [new vscode.InlineCompletionItem(cached)];
            }
        }

        // 取消上一个请求
        if (this.pendingRequest) {
            this.pendingRequest.abort();
        }
        this.pendingRequest = new AbortController();

        try {
            const languageId = document.languageId;
            const fileName = document.fileName.split(/[\\/]/).pop() || '';
            const completion = await this.doCompletion(
                textBefore, textAfter, languageId, fileName, this.pendingRequest.signal
            );

            if (completion && !token.isCancellationRequested) {
                const extracted = this.extractCompletion(completion, textBefore, position);
                if (extracted) {
                    this.cache.set(cacheKey, extracted);
                    this.limitCache(100);
                    return [new vscode.InlineCompletionItem(extracted)];
                }
            }
        } catch {
            // 补全失败静默处理
        }

        return [];
    }

    protected abstract doCompletion(
        textBefore: string,
        textAfter: string,
        languageId: string,
        fileName: string,
        signal: AbortSignal
    ): Promise<string>;

    protected abstract extractCompletion(
        completion: string,
        textBefore: string,
        position: vscode.Position
    ): string | null;

    protected isInStringOrComment(document: vscode.TextDocument, position: vscode.Position): boolean {
        const line = document.lineAt(position.line).text;
        const textBefore = line.substring(0, position.character);

        // 简单的启发式检测
        const trimmed = textBefore.trim();

        // 检查是否在行注释中
        for (const commentMarker of ['//', '#', '--']) {
            const idx = trimmed.indexOf(commentMarker);
            if (idx !== -1) {
                // 检查注释前是否有引号（可能是字符串中的注释）
                const beforeComment = trimmed.substring(0, idx);
                const singleQuotes = (beforeComment.match(/'/g) || []).length;
                const doubleQuotes = (beforeComment.match(/"/g) || []).length;
                if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
                    return true;
                }
            }
        }

        // 检查是否在块注释中
        const fullText = document.getText();
        const offset = document.offsetAt(position);
        const textUpToCursor = fullText.substring(0, offset);
        const openBlockComments = (textUpToCursor.match(/\/\*/g) || []).length;
        const closeBlockComments = (textUpToCursor.match(/\*\//g) || []).length;
        if (openBlockComments > closeBlockComments) {
            return true;
        }

        // 检查是否在字符串中
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inTemplateLiteral = false;
        let escaped = false;

        for (let i = 0; i < textBefore.length; i++) {
            const char = textBefore[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === "'" && !inDoubleQuote && !inTemplateLiteral) {
                inSingleQuote = !inSingleQuote;
            } else if (char === '"' && !inSingleQuote && !inTemplateLiteral) {
                inDoubleQuote = !inDoubleQuote;
            } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
                inTemplateLiteral = !inTemplateLiteral;
            }
        }

        return inSingleQuote || inDoubleQuote || inTemplateLiteral;
    }

    protected limitCache(maxSize: number): void {
        if (this.cache.size > maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
    }

    dispose(): void {
        if (this.pendingRequest) {
            this.pendingRequest.abort();
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }

    clearCache(): void {
        this.cache.clear();
    }
}
