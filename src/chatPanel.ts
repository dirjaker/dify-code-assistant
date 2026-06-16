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
        // 获取外部资源 URI
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

        // 使用 nonce 验证脚本
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Dify AI</title>
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

    <script nonce="${nonce}" src="${scriptUri}"></script>
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
