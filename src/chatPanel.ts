import * as vscode from 'vscode';
import { DifyClient } from './difyClient';

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _client: DifyClient;
    private _chatHistory: Array<{role: string, content: string}> = [];

    private constructor(panel: vscode.WebviewPanel, client: DifyClient) {
        this._panel = panel;
        this._client = client;

        this._panel.webview.html = this._getHtml();

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendMessage':
                        await this._handleMessage(message.text);
                        break;
                    case 'clearChat':
                        this._chatHistory = [];
                        this._client.resetConversation();
                        this._panel.webview.postMessage({ command: 'clearChat' });
                        break;
                    case 'insertCode':
                        await this._insertCode(message.code);
                        break;
                }
            },
            null,
            this._disposables
        );

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(client: DifyClient): void {
        const column = vscode.ViewColumn.Beside;

        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'difyChat',
            'Dify Code Assistant',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ChatPanel.currentPanel = new ChatPanel(panel, client);
    }

    public static sendToChat(text: string): void {
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.webview.postMessage({
                command: 'receiveMessage',
                text: text,
                role: 'system'
            });
        }
    }

    private async _handleMessage(text: string): Promise<void> {
        this._chatHistory.push({ role: 'user', content: text });
        this._panel.webview.postMessage({ command: 'startThinking' });

        try {
            const systemPrompt = `You are a helpful coding assistant. You help users write, understand, debug, and refactor code. 
When providing code, always use markdown code blocks with the language specified.
Be concise and direct. Focus on the code.`;

            const response = await this._client.chat(text, systemPrompt);
            
            this._chatHistory.push({ role: 'assistant', content: response.answer });
            
            this._panel.webview.postMessage({
                command: 'receiveMessage',
                text: response.answer,
                role: 'assistant',
                metadata: response.metadata
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'receiveMessage',
                text: `Error: ${error.message}`,
                role: 'error'
            });
        } finally {
            this._panel.webview.postMessage({ command: 'stopThinking' });
        }
    }

    private async _insertCode(code: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await editor.edit((editBuilder) => {
                editBuilder.insert(editor.selection.active, code);
            });
        }
    }

    public dispose(): void {
        ChatPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) { d.dispose(); }
        }
    }

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dify Code Assistant</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            padding: 12px 16px;
            background: var(--vscode-titleBar-activeBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h3 {
            font-size: 14px;
            font-weight: 600;
        }

        .header button {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
        }

        .header button:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
        }

        .message {
            margin-bottom: 16px;
            display: flex;
            flex-direction: column;
        }

        .message.user {
            align-items: flex-end;
        }

        .message.assistant {
            align-items: flex-start;
        }

        .message-bubble {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 8px;
            line-height: 1.5;
            word-wrap: break-word;
        }

        .message.user .message-bubble {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .message.assistant .message-bubble {
            background: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-foreground);
        }

        .message.error .message-bubble {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-errorForeground);
        }

        .message-bubble pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;
            position: relative;
        }

        .message-bubble code {
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
        }

        .message-bubble pre code {
            display: block;
        }

        .code-actions {
            position: absolute;
            top: 4px;
            right: 4px;
            display: flex;
            gap: 4px;
        }

        .code-actions button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        }

        .code-actions button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .thinking {
            display: none;
            padding: 8px 16px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .thinking.active {
            display: block;
        }

        .input-container {
            padding: 12px 16px;
            border-top: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-background);
        }

        .input-wrapper {
            display: flex;
            gap: 8px;
        }

        textarea {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 10px 12px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            resize: none;
            min-height: 44px;
            max-height: 120px;
            outline: none;
            line-height: 1.4;
        }

        textarea:focus {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        .send-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 13px;
            align-self: flex-end;
        }

        .send-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .welcome {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .welcome h2 {
            margin-bottom: 12px;
            font-size: 18px;
        }

        .welcome p {
            margin-bottom: 8px;
            font-size: 13px;
        }

        .shortcuts {
            margin-top: 20px;
            text-align: left;
            display: inline-block;
        }

        .shortcuts div {
            margin: 4px 0;
            font-size: 12px;
        }

        kbd {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h3>Dify Code Assistant</h3>
        <button onclick="clearChat()" title="Clear chat">Clear</button>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="welcome" id="welcome">
            <h2>Dify Code Assistant</h2>
            <p>我是你的 AI 编程助手，可以帮你写代码、解释代码、调试和重构</p>
            <div class="shortcuts">
                <div><kbd>Ctrl+Shift+D</kbd> 打开聊天</div>
                <div><kbd>Enter</kbd> 发送消息</div>
                <div><kbd>Shift+Enter</kbd> 换行</div>
            </div>
        </div>
    </div>

    <div class="thinking" id="thinking">思考中...</div>

    <div class="input-container">
        <div class="input-wrapper">
            <textarea id="input" placeholder="输入消息... (Enter 发送, Shift+Enter 换行)" rows="1" autofocus></textarea>
            <button class="send-btn" id="sendBtn" onclick="sendMessage()">Send</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const input = document.getElementById('input');
        const sendBtn = document.getElementById('sendBtn');
        const thinking = document.getElementById('thinking');
        const welcome = document.getElementById('welcome');

        // 确保 textarea 获得焦点
        function focusInput() {
            if (input) {
                input.focus();
            }
        }

        // 页面加载后聚焦
        focusInput();

        // 监听键盘事件
        input.addEventListener('keydown', function(e) {
            // Enter 发送消息 (不带 Shift)
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                sendMessage();
                return false;
            }
        });

        // 自动调整高度
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        // 点击容器时聚焦输入框
        document.addEventListener('click', function(e) {
            if (e.target.tagName !== 'BUTTON') {
                focusInput();
            }
        });

        function sendMessage() {
            const text = input.value.trim();
            if (!text) return;

            welcome.style.display = 'none';
            addMessage(text, 'user');
            vscode.postMessage({ command: 'sendMessage', text: text });
            input.value = '';
            input.style.height = 'auto';
            focusInput();
        }

        function clearChat() {
            chatContainer.innerHTML = '';
            welcome.style.display = 'block';
            vscode.postMessage({ command: 'clearChat' });
        }

        function addMessage(text, role) {
            const div = document.createElement('div');
            div.className = 'message ' + role;
            
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            bubble.innerHTML = formatMarkdown(text);
            
            div.appendChild(bubble);
            chatContainer.appendChild(div);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            // Add copy/insert buttons to code blocks
            bubble.querySelectorAll('pre').forEach(pre => {
                const actions = document.createElement('div');
                actions.className = 'code-actions';
                
                const copyBtn = document.createElement('button');
                copyBtn.textContent = 'Copy';
                copyBtn.onclick = () => {
                    const code = pre.querySelector('code').textContent;
                    navigator.clipboard.writeText(code);
                };
                
                const insertBtn = document.createElement('button');
                insertBtn.textContent = 'Insert';
                insertBtn.onclick = () => {
                    const code = pre.querySelector('code').textContent;
                    vscode.postMessage({ command: 'insertCode', code: code });
                };
                
                actions.appendChild(copyBtn);
                actions.appendChild(insertBtn);
                pre.style.position = 'relative';
                pre.appendChild(actions);
            });
        }

        function formatMarkdown(text) {
            // Simple markdown formatting
            let html = text
                // Code blocks
                .replace(/\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g, (match, lang, code) => {
                    return '<pre><code class="language-' + lang + '">' + escapeHtml(code.trim()) + '</code></pre>';
                })
                // Inline code
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                // Bold
                .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
                // Italic
                .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
                // Line breaks
                .replace(/\n/g, '<br>');
            
            return html;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'receiveMessage':
                    addMessage(message.text, message.role);
                    break;
                case 'startThinking':
                    thinking.classList.add('active');
                    sendBtn.disabled = true;
                    break;
                case 'stopThinking':
                    thinking.classList.remove('active');
                    sendBtn.disabled = false;
                    input.focus();
                    break;
                case 'clearChat':
                    chatContainer.innerHTML = '';
                    welcome.style.display = 'block';
                    break;
            }
        });

        input.focus();
    </script>
</body>
</html>`;
    }
}
