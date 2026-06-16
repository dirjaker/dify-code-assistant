import * as vscode from 'vscode';
import { DifyClient } from './difyClient';

/**
 * Ghost Text 补全提供者
 * 类似 Copilot 的内联灰色建议文本
 */
export class CompletionProvider implements vscode.InlineCompletionItemProvider {
    private client: DifyClient;
    private cache: Map<string, string> = new Map();
    private lastRequestTime: number = 0;
    private debounceMs: number = 300;
    private pendingRequest: AbortController | null = null;

    constructor(client: DifyClient) {
        this.client = client;
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
            const fileName = document.fileName.split(/[\/]/).pop() || '';
            const prompt = this.buildPrompt(textBefore, textAfter, languageId, fileName);

            const response = await this.client.chat(prompt);
            let completion = this.extractCompletion(response.answer, textBefore, position);

            if (completion && !token.isCancellationRequested) {
                this.cache.set(cacheKey, completion);
                this.limitCache(100);
                return [new vscode.InlineCompletionItem(completion)];
            }
        } catch {
            // Silent fail for completions
        }

        return [];
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

    private buildPrompt(textBefore: string, textAfter: string, language: string, fileName: string): string {
        return `You are a code completion engine. Output ONLY the continuation code, nothing else.
No explanations, no markdown fences, no prefixes.
Language: ${language}
File: ${fileName}

Code before cursor:
${textBefore}

Code after cursor:
${textAfter}

Continue the code from the cursor position. Output only the new code that should be inserted.`;
    }

    private extractCompletion(response: string, textBefore: string, position: vscode.Position): string {
        let code = response.trim();

        // Remove markdown fences if present
        const codeBlockMatch = code.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        if (codeBlockMatch) {
            code = codeBlockMatch[1].trim();
        }

        // Remove leading/trailing newlines
        code = code.replace(/^\n+/, '').replace(/\n+$/, '');

        // If completion starts with text that's already at cursor, remove it
        const currentLine = textBefore.split('\n').pop() || '';
        const currentTrimmed = currentLine.trim();
        if (currentTrimmed && code.startsWith(currentTrimmed)) {
            code = code.slice(currentTrimmed.length);
        }

        // Limit to reasonable length
        const lines = code.split('\n');
        if (lines.length > 15) {
            code = lines.slice(0, 15).join('\n');
        }

        return code;
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
