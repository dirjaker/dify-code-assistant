import * as vscode from 'vscode';
import { DifyClient } from './difyClient';
import { BaseCompletionProvider } from './baseCompletionProvider';

/**
 * Ghost Text 内联补全提供器
 */
export class CompletionProvider extends BaseCompletionProvider {
    constructor(client: DifyClient) {
        super(client);
    }

    protected async doCompletion(
        textBefore: string,
        textAfter: string,
        languageId: string,
        fileName: string,
        signal: AbortSignal
    ): Promise<string> {
        const prompt = this.buildPrompt(textBefore, textAfter, languageId, fileName);
        return this.client.queryCodeCompletion(prompt, languageId, 'ghost-text', signal);
    }

    protected extractCompletion(
        completion: string,
        textBefore: string,
        position: vscode.Position
    ): string | null {
        if (!completion) return null;

        // 提取代码块
        const codeBlockMatch = completion.match(/```(?:\w+)?\n([\s\S]*?)```/);
        let code = codeBlockMatch ? codeBlockMatch[1].trim() : completion.trim();

        // 移除可能的前缀（与输入重复的部分）
        const lastLine = textBefore.split('\n').pop() || '';
        if (code.startsWith(lastLine.trim())) {
            code = code.substring(lastLine.trim().length);
        }

        // 确保补全从新行或合理的位置开始
        if (code.length > 0 && !code.startsWith('\n') && lastLine.trim().length > 0) {
            // 如果当前行有内容，补全应该从新行开始
            if (!lastLine.trim().endsWith('{') && !lastLine.trim().endsWith(':')) {
                code = '\n' + code;
            }
        }

        return code.length > 0 ? code : null;
    }

    private buildPrompt(
        textBefore: string,
        textAfter: string,
        languageId: string,
        fileName: string
    ): string {
        return `请补全以下 ${languageId} 代码。

文件名: ${fileName}

上下文（光标前）:
\`\`\`${languageId}
${textBefore.slice(-1000)}
\`\`\`

上下文（光标后）:
\`\`\`${languageId}
${textAfter.slice(-500)}
\`\`\`

请只返回补全的代码，不要包含解释。补全应该从光标位置开始。`;
    }
}
