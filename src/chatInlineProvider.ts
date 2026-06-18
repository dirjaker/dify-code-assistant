import * as vscode from 'vscode';
import { DifyClient } from './difyClient';

/**
 * Inline Chat Provider — Ctrl+I 在编辑器内直接对话
 * 类似 Copilot Inline Chat
 */
export class InlineChatProvider {
    private client: DifyClient;
    private panel: vscode.WebviewPanel | null = null;
    private lastEditor: vscode.TextEditor | null = null;

    constructor(client: DifyClient) {
        this.client = client;
    }

    /**
     * 启动 Inline Chat
     */
    async start(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }
        this.lastEditor = editor;

        // 获取选中文本或当前行
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        const languageId = editor.document.languageId;
        const fileName = editor.document.fileName.split(/[\\/]/).pop() || '';

        // 获取上下文（前后各 20 行）
        const startLine = Math.max(0, selection.start.line - 20);
        const endLine = Math.min(editor.document.lineCount - 1, selection.end.line + 20);
        const contextRange = new vscode.Range(startLine, 0, endLine, 0);
        const contextCode = editor.document.getText(contextRange);

        // 创建或复用 panel
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel(
                'difyInlineChat',
                'Inline Chat',
                { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                { enableScripts: true }
            );

            this.panel.onDidDispose(() => {
                this.panel = null;
            });

            this.panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'ask':
                        await this.handleAsk(message.text, contextCode, selectedText, languageId, fileName, selection);
                        break;
                    case 'insert':
                        await this.insertAtCursor(message.text);
                        break;
                    case 'close':
                        this.panel?.dispose();
                        break;
                }
            });
        }

        this.panel.webview.html = this.getHtml(selectedText, languageId, fileName);
        this.panel.reveal(vscode.ViewColumn.Beside, true);
    }

    private async handleAsk(
        question: string,
        contextCode: string,
        selectedText: string,
        languageId: string,
        fileName: string,
        selection: vscode.Selection
    ): Promise<void> {
        if (!this.panel) return;

        this.panel.webview.postMessage({ command: 'startStream' });

        const hasSelection = selectedText.length > 0;
        const prompt = hasSelection
            ? `File: ${fileName} (${languageId})
Selected code (lines ${selection.start.line + 1}-${selection.end.line + 1}):
\`\`\`${languageId}
${selectedText}
\`\`\`

Surrounding context:
\`\`\`${languageId}
${contextCode}
\`\`\`

User request: ${question}

Respond with:
1. Explanation of what you'll do
2. The complete modified code in a single code block
3. Keep changes minimal and precise`
            : `File: ${fileName} (${languageId})
Code context (lines ${selection.start.line + 1}-${selection.end.line + 20}):
\`\`\`${languageId}
${contextCode}
\`\`\`

User request: ${question}

Respond with code or explanation as appropriate.`;

        try {
            let fullAnswer = '';
            await this.client.chatStream(prompt, undefined, {
                onStreamChunk: (chunk: string) => {
                    fullAnswer += chunk;
                    this.panel?.webview.postMessage({ command: 'streamChunk', chunk });
                }
            });

            this.panel?.webview.postMessage({ command: 'endStream', fullText: fullAnswer });
        } catch (err: any) {
            this.panel?.webview.postMessage({ command: 'error', text: err.message });
        }
    }

    private async insertAtCursor(text: string): Promise<void> {
        const editor = this.lastEditor || vscode.window.activeTextEditor;
        if (!editor) return;

        // Extract code from markdown fences
        const codeMatch = text.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        const code = codeMatch ? codeMatch[1].trim() : text;

        await editor.edit((editBuilder) => {
            if (!editor.selection.isEmpty) {
                editBuilder.replace(editor.selection, code);
            } else {
                editBuilder.insert(editor.selection.active, code);
            }
        });
    }

    private getHtml(selectedText: string, language: string, fileName: string): string {
        const preview = selectedText
            ? selectedText.slice(0, 200) + (selectedText.length > 200 ? '...' : '')
            : '(no selection)';

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 13px;
            color: #cccccc;
            background: #1e1e1e;
            padding: 16px;
        }
        .context-preview {
            background: #2d2d2d;
            border: 1px solid #3c3c3c;
            border-radius: 6px;
            padding: 10px 12px;
            font-family: 'Cascadia Code', 'Fira Code', monospace;
            font-size: 12px;
            color: #999;
            max-height: 120px;
            overflow-y: auto;
            margin-bottom: 12px;
            white-space: pre-wrap;
            line-height: 1.5;
        }
        .file-badge {
            display: inline-block;
            background: #0e639c;
            color: #fff;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .input-row {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }
        #question {
            flex: 1;
            background: #3c3c3c;
            color: #cccccc;
            border: 1px solid #3c3c3c;
            border-radius: 6px;
            padding: 10px 12px;
            font-size: 13px;
            font-family: inherit;
            resize: none;
            min-height: 40px;
            max-height: 120px;
            outline: none;
        }
        #question:focus { border-color: #007fd4; }
        #askBtn {
            background: #0e639c;
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            align-self: flex-end;
        }
        #askBtn:hover { background: #1177bb; }
        #askBtn:disabled { opacity: 0.4; cursor: not-allowed; }
        .response {
            background: #2d2d2d;
            border: 1px solid #3c3c3c;
            border-radius: 6px;
            padding: 12px;
            margin-top: 12px;
            white-space: pre-wrap;
            line-height: 1.65;
            max-height: 400px;
            overflow-y: auto;
            display: none;
        }
        .response.streaming::after {
            content: '';
            display: inline-block;
            width: 2px;
            height: 14px;
            background: #007fd4;
            margin-left: 2px;
            vertical-align: text-bottom;
            animation: blink 1s step-end infinite;
        }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
        .actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
            justify-content: flex-end;
            display: none;
        }
        .action-btn {
            padding: 6px 14px;
            border-radius: 4px;
            border: 1px solid #3c3c3c;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            background: transparent;
            color: #999;
        }
        .action-btn:hover { color: #ccc; border-color: #999; }
        .action-btn.insert {
            background: #0e639c;
            color: #fff;
            border-color: #0e639c;
        }
        .action-btn.insert:hover { background: #1177bb; }
    </style>
</head>
<body>
    <div class="file-badge">${fileName} (${language})</div>
    <div class="context-preview">${escapeHtmlForTemplate(preview)}</div>
    <div class="input-row">
        <textarea id="question" placeholder="Ask about this code..." rows="2"></textarea>
        <button id="askBtn">Ask</button>
    </div>
    <div class="response" id="response"></div>
    <div class="actions" id="actions">
        <button class="action-btn" onclick="closePanel()">Close</button>
        <button class="action-btn insert" onclick="insertCode()">Insert at Cursor</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const questionEl = document.getElementById('question');
        const askBtn = document.getElementById('askBtn');
        const responseEl = document.getElementById('response');
        const actionsEl = document.getElementById('actions');
        let fullText = '';

        askBtn.addEventListener('click', doAsk);
        questionEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAsk(); }
        });

        function doAsk() {
            var q = questionEl.value.trim();
            if (!q) return;
            askBtn.disabled = true;
            responseEl.style.display = 'block';
            responseEl.classList.add('streaming');
            responseEl.textContent = '';
            actionsEl.style.display = 'none';
            fullText = '';
            vscode.postMessage({ command: 'ask', text: q });
        }

        function insertCode() {
            vscode.postMessage({ command: 'insert', text: fullText });
        }

        function closePanel() {
            vscode.postMessage({ command: 'close' });
        }

        window.addEventListener('message', function(e) {
            var msg = e.data;
            switch (msg.command) {
                case 'startStream':
                    responseEl.textContent = '';
                    break;
                case 'streamChunk':
                    fullText += msg.chunk;
                    responseEl.textContent = fullText;
                    responseEl.scrollTop = responseEl.scrollHeight;
                    break;
                case 'endStream':
                    responseEl.classList.remove('streaming');
                    responseEl.textContent = msg.fullText || fullText;
                    fullText = msg.fullText || fullText;
                    askBtn.disabled = false;
                    actionsEl.style.display = 'flex';
                    break;
                case 'error':
                    responseEl.classList.remove('streaming');
                    responseEl.textContent = 'Error: ' + msg.text;
                    askBtn.disabled = false;
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}

function escapeHtmlForTemplate(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
