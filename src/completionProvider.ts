import * as vscode from 'vscode';
import { DifyClient } from './difyClient';

export class CompletionProvider implements vscode.InlineCompletionItemProvider {
    private client: DifyClient;
    private cache: Map<string, string> = new Map();
    private lastRequestTime: number = 0;
    private debounceMs: number = 500;

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

        // Get context
        const lineText = document.lineAt(position).text;
        const textBefore = document.getText(new vscode.Range(
            new vscode.Position(Math.max(0, position.line - 20), 0),
            position
        ));
        const textAfter = document.getText(new vscode.Range(
            position,
            new vscode.Position(Math.min(document.lineCount - 1, position.line + 5), 0)
        ));

        // Skip if line is empty or just whitespace
        if (lineText.trim().length === 0 && position.line > 0) {
            return [];
        }

        // Build prompt
        const languageId = document.languageId;
        const prompt = this.buildPrompt(textBefore, textAfter, languageId);

        // Check cache
        const cacheKey = textBefore.slice(-200);
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey)!;
            return [new vscode.InlineCompletionItem(cached)];
        }

        try {
            const response = await this.client.chat(prompt);
            let completion = this.extractCompletion(response.answer, textBefore);
            
            if (completion && !token.isCancellationRequested) {
                // Cache the result
                this.cache.set(cacheKey, completion);
                
                // Limit cache size
                if (this.cache.size > 100) {
                    const firstKey = this.cache.keys().next().value;
                    if (firstKey !== undefined) {
                        this.cache.delete(firstKey);
                    }
                }

                return [new vscode.InlineCompletionItem(completion)];
            }
        } catch (error) {
            // Silently fail for completions
        }

        return [];
    }

    private buildPrompt(textBefore: string, textAfter: string, language: string): string {
        return `You are a code completion assistant. Complete the code naturally.
Language: ${language}
Code before cursor:
\`\`\`${language}
${textBefore}
\`\`\`
Code after cursor:
\`\`\`${language}
${textAfter}
\`\`\`

Provide ONLY the completion code, no explanations. The completion should continue naturally from where the cursor is.`;
    }

    private extractCompletion(response: string, textBefore: string): string {
        // Extract code from markdown blocks
        const codeBlockMatch = response.match(/\`\`\`(?:\w+)?\n?([\s\S]*?)\`\`\`/);
        let code = codeBlockMatch ? codeBlockMatch[1].trim() : response.trim();

        // Remove any leading/trailing whitespace or newlines
        code = code.replace(/^\n+/, '').replace(/\n+$/, '');

        // If the completion starts with text that's already in textBefore, remove it
        const lastLine = textBefore.split('\n').pop() || '';
        if (code.startsWith(lastLine.trim())) {
            code = code.slice(lastLine.trim().length);
        }

        return code;
    }

    clearCache(): void {
        this.cache.clear();
    }
}
