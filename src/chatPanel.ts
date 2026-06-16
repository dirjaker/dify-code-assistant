import * as vscode from 'vscode';
import { DifyClient } from './difyClient';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'difyChatView';
    private _view?: vscode.WebviewView;
    private _client: DifyClient;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        client: DifyClient
    ) {
        this._client = client;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'sendMessage':
                    await this._handleMessage(message.text);
                    break;
                case 'clearChat':
                    this._client.resetConversation();
                    this._postMessage({ command: 'clearChat' });
                    break;
                case 'insertCode':
                    await this._insertCode(message.code);
                    break;
                case 'copyCode':
                    await vscode.env.clipboard.writeText(message.code);
                    vscode.window.showInformationMessage('代码已复制');
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'dify');
                    break;
            }
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._postMessage({ command: 'focusInput' });
            }
        });
    }

    private _postMessage(message: any): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    public sendToChat(text: string, role: string = 'system'): void {
        this._postMessage({ command: 'receiveMessage', text, role });
    }

    private async _handleMessage(text: string): Promise<void> {
        this._postMessage({ command: 'startThinking' });

        try {
            const systemPrompt = `你是一个专业的 AI 编程助手。请用中文回答问题。

回答规范：
1. 代码块使用 Markdown 格式，标注语言类型
2. 简单问题简洁回答，复杂问题详细解释
3. 如果不确定，诚实说明`;

            const response = await this._client.chat(text, systemPrompt);
            this._postMessage({ command: 'receiveMessage', text: response.answer, role: 'assistant' });
        } catch (error: any) {
            this._postMessage({ command: 'receiveMessage', text: '错误: ' + error.message, role: 'error' });
        } finally {
            this._postMessage({ command: 'stopThinking' });
        }
    }

    private async _insertCode(code: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await editor.edit((editBuilder) => {
                editBuilder.insert(editor.selection.active, code);
            });
            vscode.window.showInformationMessage('代码已插入');
        } else {
            vscode.window.showWarningMessage('请先打开一个文件');
        }
    }

    private _getHtml(webview: vscode.Webview): string {
        // 使用 webview.cspSource 获取正确的 CSP 源
        const cspSource = webview.cspSource;
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Dify AI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground, #ccc);
            background: var(--vscode-sideBar-background, #1e1e1e);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: var(--vscode-titleBar-activeBackground, #333);
            border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
        }

        .toolbar-title { font-size: 12px; font-weight: 600; }

        .toolbar-btn {
            background: none;
            border: none;
            color: var(--vscode-foreground, #ccc);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 16px;
            line-height: 1;
        }

        .toolbar-btn:hover {
            background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
        }

        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        }

        .messages::-webkit-scrollbar { width: 6px; }
        .messages::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, #666); border-radius: 3px; }

        .welcome {
            text-align: center;
            padding: 40px 20px;
        }

        .welcome-icon { font-size: 48px; margin-bottom: 16px; }
        .welcome-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
        .welcome-desc { font-size: 12px; color: var(--vscode-descriptionForeground, #999); margin-bottom: 20px; }

        .quick-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }

        .quick-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px;
            background: var(--vscode-editor-background, #252526);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
            border-radius: 8px;
            color: var(--vscode-foreground, #ccc);
            cursor: pointer;
            font-size: 12px;
            text-align: left;
        }

        .quick-btn:hover {
            border-color: var(--vscode-focusBorder, #007fd4);
            background: var(--vscode-list-hoverBackground, #2a2d2e);
        }

        .quick-btn-icon { font-size: 18px; }

        .msg { margin-bottom: 16px; }

        .msg-header {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 6px;
        }

        .msg-avatar {
            width: 22px;
            height: 22px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }

        .msg.user .msg-avatar { background: var(--vscode-button-background, #0e639c); }
        .msg.bot .msg-avatar { background: #7c3aed; }
        .msg.error .msg-avatar { background: var(--vscode-errorForeground, #f44747); }

        .msg-name { font-size: 11px; font-weight: 600; }

        .msg-body {
            margin-left: 28px;
            padding: 10px 12px;
            border-radius: 8px;
            line-height: 1.6;
        }

        .msg.user .msg-body {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
        }

        .msg.bot .msg-body {
            background: var(--vscode-editor-inactiveSelectionBackground, #2a2d2e);
        }

        .msg.error .msg-body {
            background: rgba(244, 71, 71, 0.1);
            color: var(--vscode-errorForeground, #f44747);
            border: 1px solid rgba(244, 71, 71, 0.3);
        }

        .msg-body pre {
            background: var(--vscode-textCodeBlock-background, #1e1e1e);
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
            border-radius: 6px;
            margin: 8px 0;
            overflow: hidden;
        }

        .code-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 12px;
            background: rgba(0,0,0,0.3);
            border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
        }

        .code-lang { font-size: 11px; color: var(--vscode-descriptionForeground, #999); }

        .code-copy {
            background: none;
            border: none;
            color: var(--vscode-descriptionForeground, #999);
            cursor: pointer;
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 4px;
        }

        .code-copy:hover {
            background: rgba(255,255,255,0.1);
            color: var(--vscode-foreground, #ccc);
        }

        .msg-body code {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
        }

        .msg-body pre code {
            display: block;
            padding: 12px;
            overflow-x: auto;
        }

        .msg-body p code {
            background: var(--vscode-textCodeBlock-background, #1e1e1e);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .thinking {
            display: none;
            padding: 8px 12px;
            margin-left: 28px;
        }

        .thinking.show { display: flex; align-items: center; gap: 8px; }

        .dot {
            width: 6px;
            height: 6px;
            background: var(--vscode-button-background, #0e639c);
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out;
        }

        .dot:nth-child(2) { animation-delay: 0.16s; }
        .dot:nth-child(3) { animation-delay: 0.32s; }

        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }

        .thinking-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground, #999);
        }

        .input-area {
            padding: 12px;
            border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
        }

        .input-row {
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }

        #userInput {
            flex: 1;
            background: var(--vscode-input-background, #3c3c3c);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #3c3c3c);
            border-radius: 8px;
            padding: 10px 12px;
            font-family: inherit;
            font-size: 13px;
            line-height: 1.4;
            resize: none;
            min-height: 40px;
            max-height: 120px;
            outline: none;
        }

        #userInput:focus {
            border-color: var(--vscode-focusBorder, #007fd4);
        }

        #sendBtn {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border: none;
            border-radius: 8px;
            width: 36px;
            height: 36px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        #sendBtn:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }

        #sendBtn:disabled { opacity: 0.5; cursor: not-allowed; }

        #sendBtn svg { width: 16px; height: 16px; }

        .hint {
            font-size: 10px;
            color: var(--vscode-descriptionForeground, #999);
            margin-top: 6px;
            text-align: center;
        }

        .hint kbd {
            background: var(--vscode-editor-background, #252526);
            padding: 1px 4px;
            border-radius: 3px;
            border: 1px solid var(--vscode-panel-border, #3c3c3c);
            font-size: 10px;
        }

        .msg-body h1, .msg-body h2, .msg-body h3 { margin: 10px 0 6px; font-weight: 600; }
        .msg-body h1 { font-size: 16px; }
        .msg-body h2 { font-size: 14px; }
        .msg-body h3 { font-size: 13px; }
        .msg-body ul, .msg-body ol { margin: 6px 0; padding-left: 20px; }
        .msg-body li { margin: 4px 0; }
        .msg-body blockquote { border-left: 3px solid var(--vscode-button-background, #0e639c); padding-left: 12px; margin: 8px 0; color: var(--vscode-descriptionForeground, #999); }
        .msg-body a { color: var(--vscode-textLink-foreground, #3794ff); }
        .msg-body hr { border: none; border-top: 1px solid var(--vscode-panel-border, #3c3c3c); margin: 12px 0; }
        .msg-body table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
        .msg-body th, .msg-body td { border: 1px solid var(--vscode-panel-border, #3c3c3c); padding: 6px 10px; text-align: left; }
        .msg-body th { background: var(--vscode-editor-background, #252526); }
    </style>
</head>
<body>
    <div class="toolbar">
        <span class="toolbar-title">Dify AI 助手</span>
        <button class="toolbar-btn" id="clearBtn" title="清空对话">🗑️</button>
    </div>

    <div class="messages" id="messages">
        <div class="welcome" id="welcome">
            <div class="welcome-icon">🤖</div>
            <div class="welcome-title">你好，我是 AI 编程助手</div>
            <div class="welcome-desc">可以帮你写代码、解释代码、调试和重构</div>
            <div class="quick-actions">
                <button class="quick-btn" data-prompt="请解释这段代码">
                    <span class="quick-btn-icon">📖</span>
                    <span>解释代码</span>
                </button>
                <button class="quick-btn" data-prompt="请帮我修复这段代码的问题">
                    <span class="quick-btn-icon">🐛</span>
                    <span>修复 Bug</span>
                </button>
                <button class="quick-btn" data-prompt="请帮我重构这段代码">
                    <span class="quick-btn-icon">♻️</span>
                    <span>重构代码</span>
                </button>
                <button class="quick-btn" data-prompt="请帮我生成代码">
                    <span class="quick-btn-icon">✨</span>
                    <span>生成代码</span>
                </button>
            </div>
        </div>
    </div>

    <div class="thinking" id="thinking">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <span class="thinking-text">AI 思考中...</span>
    </div>

    <div class="input-area">
        <div class="input-row">
            <textarea id="userInput" placeholder="输入消息..." rows="1"></textarea>
            <button id="sendBtn" title="发送 (Enter)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
            </button>
        </div>
        <div class="hint">
            <kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const messagesEl = document.getElementById('messages');
        const welcomeEl = document.getElementById('welcome');
        const thinkingEl = document.getElementById('thinking');
        const inputEl = document.getElementById('userInput');
        const sendBtnEl = document.getElementById('sendBtn');
        const clearBtnEl = document.getElementById('clearBtn');

        function focusInput() {
            inputEl.focus();
        }

        function doSend() {
            const text = inputEl.value.trim();
            if (!text) return;

            welcomeEl.style.display = 'none';
            appendMessage(text, 'user');
            vscode.postMessage({ command: 'sendMessage', text: text });
            inputEl.value = '';
            inputEl.style.height = 'auto';
            focusInput();
        }

        function doClear() {
            messagesEl.innerHTML = '';
            messagesEl.appendChild(welcomeEl);
            welcomeEl.style.display = '';
            vscode.postMessage({ command: 'clearChat' });
        }

        function appendMessage(text, role) {
            const div = document.createElement('div');
            div.className = 'msg ' + role;

            const names = { user: '你', bot: 'AI', error: '错误', system: '系统' };
            const icons = { user: '👤', bot: '🤖', error: '❌', system: 'ℹ️' };

            const header = document.createElement('div');
            header.className = 'msg-header';

            const avatar = document.createElement('div');
            avatar.className = 'msg-avatar';
            avatar.textContent = icons[role] || '💬';

            const name = document.createElement('span');
            name.className = 'msg-name';
            name.textContent = names[role] || role;

            header.appendChild(avatar);
            header.appendChild(name);

            const body = document.createElement('div');
            body.className = 'msg-body';
            body.innerHTML = renderMarkdown(text);

            div.appendChild(header);
            div.appendChild(body);
            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;

            // 给代码块添加复制按钮
            div.querySelectorAll('pre').forEach(function(pre) {
                const code = pre.querySelector('code');
                if (!code) return;

                const langMatch = code.className.match(/language-(\w+)/);
                const lang = langMatch ? langMatch[1] : 'code';

                const bar = document.createElement('div');
                bar.className = 'code-bar';

                const langSpan = document.createElement('span');
                langSpan.className = 'code-lang';
                langSpan.textContent = lang;

                const copyBtn = document.createElement('button');
                copyBtn.className = 'code-copy';
                copyBtn.textContent = '复制';
                copyBtn.addEventListener('click', function() {
                    vscode.postMessage({ command: 'copyCode', code: code.textContent });
                    copyBtn.textContent = '已复制!';
                    setTimeout(function() { copyBtn.textContent = '复制'; }, 2000);
                });

                bar.appendChild(langSpan);
                bar.appendChild(copyBtn);
                pre.insertBefore(bar, pre.firstChild);
            });
        }

        function renderMarkdown(text) {
            let html = text;

            html = html.replace(/\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g, function(match, lang, code) {
                return '<pre><code class="language-' + (lang || 'text') + '">' + escapeHtml(code.trim()) + '</code></pre>';
            });

            html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
            html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
            html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
            html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
            html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
            html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
            html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
            html = html.replace(/^---$/gm, '<hr>');
            html = html.replace(/\n\n/g, '</p><p>');
            html = html.replace(/\n/g, '<br>');

            return '<p>' + html + '</p>';
        }

        function escapeHtml(text) {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // 事件绑定
        sendBtnEl.addEventListener('click', function(e) {
            e.preventDefault();
            doSend();
        });

        inputEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                doSend();
            }
        });

        inputEl.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        clearBtnEl.addEventListener('click', function(e) {
            e.preventDefault();
            doClear();
        });

        document.querySelectorAll('.quick-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const prompt = this.getAttribute('data-prompt');
                if (prompt) {
                    inputEl.value = prompt;
                    focusInput();
                }
            });
        });

        messagesEl.addEventListener('click', function(e) {
            if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                focusInput();
            }
        });

        window.addEventListener('message', function(event) {
            const msg = event.data;
            switch (msg.command) {
                case 'receiveMessage':
                    appendMessage(msg.text, msg.role);
                    break;
                case 'startThinking':
                    thinkingEl.classList.add('show');
                    sendBtnEl.disabled = true;
                    break;
                case 'stopThinking':
                    thinkingEl.classList.remove('show');
                    sendBtnEl.disabled = false;
                    focusInput();
                    break;
                case 'clearChat':
                    messagesEl.innerHTML = '';
                    messagesEl.appendChild(welcomeEl);
                    welcomeEl.style.display = '';
                    break;
                case 'focusInput':
                    focusInput();
                    break;
            }
        });

        focusInput();
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
