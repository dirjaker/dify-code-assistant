import * as vscode from 'vscode';
import { DifyClient } from './difyClient';
import { BaseCompletionProvider } from './baseCompletionProvider';

/**
 * RAG 增强的补全提供器
 * 结合工作区上下文和知识库进行更精准的代码补全
 */
export class RAGCompletionProvider extends BaseCompletionProvider {
    private workspaceRoot: string;

    constructor(client: DifyClient, workspaceRoot: string) {
        super(client);
        this.workspaceRoot = workspaceRoot;
    }

    protected async doCompletion(
        textBefore: string,
        textAfter: string,
        languageId: string,
        fileName: string,
        signal: AbortSignal
    ): Promise<string> {
        // 收集文件上下文
        const fileContext = await this.collectFileContext(fileName, languageId);

        // 构建 RAG 查询
        const ragQuery = this.buildRAGQuery(
            textBefore, textAfter, languageId, fileName, fileContext
        );

        return this.client.queryCodeCompletion(
            ragQuery,
            languageId,
            this.detectCompletionType(textBefore),
            signal
        );
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

        // 移除可能的前缀
        const lastLine = textBefore.split('\n').pop() || '';
        if (code.startsWith(lastLine.trim())) {
            code = code.substring(lastLine.trim().length);
        }

        return code.length > 0 ? code : null;
    }

    private async collectFileContext(fileName: string, languageId: string): Promise<string> {
        const contextParts: string[] = [];

        // 获取当前打开的文件列表
        const openEditors = vscode.window.visibleTextEditors;
        for (const editor of openEditors) {
            if (editor.document.fileName !== fileName) {
                const content = editor.document.getText();
                const relativePath = vscode.workspace.asRelativePath(editor.document.fileName);
                contextParts.push(`文件: ${relativePath}\n${content.substring(0, 2000)}`);
            }
        }

        // 获取选中的文本
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.selections.length > 0) {
            const selectedText = activeEditor.document.getText(activeEditor.selections[0]);
            if (selectedText) {
                contextParts.push(`选中的代码:\n${selectedText}`);
            }
        }

        return contextParts.join('\n\n---\n\n');
    }

    private buildRAGQuery(
        textBefore: string,
        textAfter: string,
        languageId: string,
        fileName: string,
        fileContext: string
    ): string {
        return `请补全以下 ${languageId} 代码。

文件名: ${fileName}
工作区: ${this.workspaceRoot}

当前文件上下文（光标前）:
\`\`\`${languageId}
${textBefore.slice(-1000)}
\`\`\`

当前文件上下文（光标后）:
\`\`\`${languageId}
${textAfter.slice(-500)}
\`\`\`

${fileContext ? `其他文件上下文:\n${fileContext}` : ''}

请根据上下文提供精准的代码补全。只返回补全的代码，不要包含解释。`;
    }

    private detectCompletionType(textBefore: string): string {
        const lastLine = textBefore.split('\n').pop()?.trim() || '';

        if (lastLine.endsWith('{') || lastLine.endsWith(':')) {
            return 'block';
        }
        if (lastLine.startsWith('function') || lastLine.startsWith('def') || lastLine.startsWith('class')) {
            return 'declaration';
        }
        if (lastLine.includes('//') || lastLine.includes('#')) {
            return 'comment';
        }
        if (lastLine.endsWith('.') || lastLine.endsWith('->')) {
            return 'member';
        }

        return 'general';
    }
}
