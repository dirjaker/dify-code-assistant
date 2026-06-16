import * as vscode from 'vscode';
import { DifyClient } from './difyClient';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'difyChatView';
    private _view?: vscode.WebviewView;
    private _client: DifyClient;
    private _chatHistory: Array<{role: string, content: string}> = [];

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

        webviewView.webview.html = this._getHtml();

        // 处理来自 webview 的消息
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'sendMessage':
                    await this._handleMessage(message.text);
                    break;
                case 'clearChat':
                    this._chatHistory = [];
                    this._client.resetConversation();
                    this._view?.webview.postMessage({ command: 'clearChat' });
                    break;
                case 'insertCode':
                    await this._insertCode(message.code);
                    break;
                case 'copyCode':
                    await vscode.env.clipboard.writeText(message.code);
                    vscode.window.showInformationMessage('代码已复制到剪贴板');
                    break;
                case 'ready':
                    // Webview 已准备好
                    break;
            }
        });

        // 当视图可见时聚焦输入框
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                webviewView.webview.postMessage({ command: 'focusInput' });
            }
        });
    }

    public sendToChat(text: string, role: string = 'system'): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'receiveMessage',
                text: text,
                role: role
            });
        }
    }

    private async _handleMessage(text: string): Promise<void> {
        this._chatHistory.push({ role: 'user', content: text });
        this._view?.webview.postMessage({ command: 'startThinking' });

        try {
            const systemPrompt = `你是一个专业的 AI 编程助手，运行在 VS Code 编辑器中。你的职责是帮助开发者高效完成编程任务。

## 能力要求

### 代码解释
- 逐行解释代码逻辑，标注关键变量和函数的作用
- 说明设计模式和架构决策
- 指出潜在的性能问题或安全隐患

### 代码补全
- 根据上下文生成完整、可运行的代码
- 遵循项目现有的代码风格和命名规范
- 添加必要的类型注解和文档字符串

### Debug 调试
- 分析错误信息，定位问题根因
- 提供修复方案并解释修复原因
- 建议添加防御性编程措施

### 代码重构
- 在不改变行为的前提下优化代码结构
- 提取重复逻辑为公共函数
- 改善可读性和可维护性

## 回答规范

1. 代码块使用 Markdown 格式，标注语言类型
2. 修改现有代码时，输出完整文件或明确标注修改部分
3. 涉及多个文件时，按文件名分组展示
4. 简单问题简洁回答，复杂问题详细解释
5. 如果不确定，诚实说明并给出可能的解决方案
6. 默认使用中文回答，代码注释也使用中文`;

            const response = await this._client.chat(text, systemPrompt);
            this._chatHistory.push({ role: 'assistant', content: response.answer });

            this._view?.webview.postMessage({
                command: 'receiveMessage',
                text: response.answer,
                role: 'assistant',
                metadata: response.metadata
            });
        } catch (error: any) {
            this._view?.webview.postMessage({
                command: 'receiveMessage',
                text: `❌ 错误: ${error.message}`,
                role: 'error'
            });
        } finally {
            this._view?.webview.postMessage({ command: 'stopThinking' });
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

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' vscode-resource:; script-src 'unsafe-inline' vscode-resource:;">
    <title>Dify Code Assistant</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :root {
            --bg-primary: var(--vscode-sideBar-background, #1e1e1e);
            --bg-secondary: var(--vscode-editor-background, #252526);
            --bg-input: var(--vscode-input-background, #3c3c3c);
            --text-primary: var(--vscode-foreground, #cccccc);
            --text-secondary: var(--vscode-descriptionForeground, #999999);
            --text-input: var(--vscode-input-foreground, #cccccc);
            --border-color: var(--vscode-panel-border, #3c3c3c);
            --accent-color: var(--vscode-button-background, #0e639c);
            --accent-hover: var(--vscode-button-hoverBackground, #1177bb);
            --accent-text: var(--vscode-button-foreground, #ffffff);
            --user-bubble: var(--vscode-button-background, #0e639c);
            --user-text: var(--vscode-button-foreground, #ffffff);
            --assistant-bubble: var(--vscode-editor-inactiveSelectionBackground, #2a2d2e);
            --error-color: var(--vscode-errorForeground, #f44747);
            --code-bg: var(--vscode-textCodeBlock-background, #1e1e1e);
            --focus-border: var(--vscode-focusBorder, #007fd4);
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--text-primary);
            background: var(--bg-primary);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* 顶部工具栏 */
        .toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            flex-shrink: 0;
        }

        .toolbar-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .toolbar-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .toolbar-badge {
            font-size: 10px;
            padding: 2px 6px;
            background: var(--accent-color);
            color: var(--accent-text);
            border-radius: 10px;
        }

        .toolbar-actions {
            display: flex;
            gap: 4px;
        }

        .toolbar-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 4px;
            font-size: 14px;
            line-height: 1;
            transition: all 0.15s ease;
        }

        .toolbar-btn:hover {
            background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
            color: var(--text-primary);
        }

        /* 消息容器 */
        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            scroll-behavior: smooth;
        }

        .messages-container::-webkit-scrollbar {
            width: 6px;
        }

        .messages-container::-webkit-scrollbar-track {
            background: transparent;
        }

        .messages-container::-webkit-scrollbar-thumb {
            background: var(--border-color);
            border-radius: 3px;
        }

        .messages-container::-webkit-scrollbar-thumb:hover {
            background: var(--text-secondary);
        }

        /* 欢迎页面 */
        .welcome {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: 24px;
            text-align: center;
        }

        .welcome-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.8;
        }

        .welcome-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--text-primary);
        }

        .welcome-desc {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 24px;
            line-height: 1.5;
        }

        .welcome-features {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            width: 100%;
            max-width: 280px;
        }

        .feature-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .feature-item:hover {
            border-color: var(--accent-color);
            background: var(--bg-input);
        }

        .feature-icon {
            font-size: 16px;
        }

        /* 消息样式 */
        .message {
            margin-bottom: 12px;
            animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 6px;
        }

        .message-avatar {
            width: 20px;
            height: 20px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            flex-shrink: 0;
        }

        .message.user .message-avatar {
            background: var(--accent-color);
            color: var(--accent-text);
        }

        .message.assistant .message-avatar {
            background: #8b5cf6;
            color: white;
        }

        .message.error .message-avatar {
            background: var(--error-color);
            color: white;
        }

        .message-role {
            font-size: 11px;
            font-weight: 600;
            color: var(--text-secondary);
        }

        .message-time {
            font-size: 10px;
            color: var(--text-secondary);
            margin-left: auto;
        }

        .message-content {
            padding: 10px 12px;
            border-radius: 8px;
            line-height: 1.6;
            word-wrap: break-word;
            font-size: 13px;
        }

        .message.user .message-content {
            background: var(--user-bubble);
            color: var(--user-text);
            margin-left: 26px;
        }

        .message.assistant .message-content {
            background: var(--assistant-bubble);
            color: var(--text-primary);
            margin-left: 26px;
        }

        .message.error .message-content {
            background: rgba(244, 71, 71, 0.1);
            color: var(--error-color);
            border: 1px solid rgba(244, 71, 71, 0.3);
            margin-left: 26px;
        }

        /* 代码块样式 */
        .message-content pre {
            background: var(--code-bg);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 12px;
            margin: 8px 0;
            overflow-x: auto;
            position: relative;
        }

        .message-content code {
            font-family: var(--vscode-editor-font-family, 'Fira Code', 'Consolas', monospace);
            font-size: 12px;
            line-height: 1.5;
        }

        .message-content pre code {
            display: block;
            white-space: pre;
        }

        .message-content p code {
            background: var(--code-bg);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
        }

        .code-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 12px;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid var(--border-color);
            margin: -12px -12px 8px -12px;
            border-radius: 6px 6px 0 0;
        }

        .code-lang {
            font-size: 11px;
            color: var(--text-secondary);
            font-weight: 500;
        }

        .code-actions {
            display: flex;
            gap: 4px;
        }

        .code-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            transition: all 0.15s ease;
        }

        .code-btn:hover {
            background: rgba(255,255,255,0.1);
            color: var(--text-primary);
        }

        /* 思考状态 */
        .thinking {
            display: none;
            padding: 8px 12px;
            margin-left: 26px;
        }

        .thinking.active {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .thinking-dots {
            display: flex;
            gap: 4px;
        }

        .thinking-dot {
            width: 6px;
            height: 6px;
            background: var(--accent-color);
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out;
        }

        .thinking-dot:nth-child(1) { animation-delay: -0.32s; }
        .thinking-dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }

        .thinking-text {
            font-size: 12px;
            color: var(--text-secondary);
            font-style: italic;
        }

        /* 输入区域 */
        .input-container {
            padding: 12px;
            border-top: 1px solid var(--border-color);
            background: var(--bg-primary);
            flex-shrink: 0;
        }

        .input-wrapper {
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }

        .input-field {
            flex: 1;
            background: var(--bg-input);
            color: var(--text-input);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 10px 12px;
            font-family: inherit;
            font-size: 13px;
            line-height: 1.4;
            resize: none;
            min-height: 40px;
            max-height: 120px;
            outline: none;
            transition: border-color 0.15s ease;
        }

        .input-field:focus {
            border-color: var(--focus-border);
            box-shadow: 0 0 0 1px var(--focus-border);
        }

        .input-field::placeholder {
            color: var(--text-secondary);
        }

        .send-btn {
            background: var(--accent-color);
            color: var(--accent-text);
            border: none;
            border-radius: 8px;
            width: 36px;
            height: 36px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
            flex-shrink: 0;
        }

        .send-btn:hover:not(:disabled) {
            background: var(--accent-hover);
            transform: scale(1.05);
        }

        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .send-btn svg {
            width: 16px;
            height: 16px;
        }

        .input-hint {
            font-size: 10px;
            color: var(--text-secondary);
            margin-top: 6px;
            text-align: center;
        }

        .input-hint kbd {
            background: var(--bg-secondary);
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 10px;
            border: 1px solid var(--border-color);
        }

        /* Markdown 格式 */
        .message-content h1, .message-content h2, .message-content h3 {
            margin: 12px 0 6px 0;
            font-weight: 600;
        }

        .message-content h1 { font-size: 16px; }
        .message-content h2 { font-size: 14px; }
        .message-content h3 { font-size: 13px; }

        .message-content ul, .message-content ol {
            margin: 6px 0;
            padding-left: 20px;
        }

        .message-content li {
            margin: 4px 0;
        }

        .message-content blockquote {
            border-left: 3px solid var(--accent-color);
            padding-left: 12px;
            margin: 8px 0;
            color: var(--text-secondary);
        }

        .message-content a {
            color: var(--accent-color);
            text-decoration: none;
        }

        .message-content a:hover {
            text-decoration: underline;
        }

        .message-content strong {
            font-weight: 600;
        }

        .message-content em {
            font-style: italic;
        }

        .message-content hr {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 12px 0;
        }

        /* 表格样式 */
        .message-content table {
            border-collapse: collapse;
            width: 100%;
            margin: 8px 0;
            font-size: 12px;
        }

        .message-content th, .message-content td {
            border: 1px solid var(--border-color);
            padding: 6px 10px;
            text-align: left;
        }

        .message-content th {
            background: var(--bg-secondary);
            font-weight: 600;
        }

        .message-content tr:nth-child(even) {
            background: rgba(255,255,255,0.02);
        }
    </style>
</head>
<body>
    <!-- 顶部工具栏 -->
    <div class="toolbar">
        <div class="toolbar-left">
            <span class="toolbar-title">Dify AI</span>
            <span class="toolbar-badge">Beta</span>
        </div>
        <div class="toolbar-actions">
            <button class="toolbar-btn" id="clearBtn" title="清空对话">🗑️</button>
            <button class="toolbar-btn" id="settingsBtn" title="设置">⚙️</button>
        </div>
    </div>

    <!-- 消息容器 -->
    <div class="messages-container" id="messagesContainer">
        <div class="welcome" id="welcome">
            <div class="welcome-icon">🤖</div>
            <div class="welcome-title">Dify AI 编程助手</div>
            <div class="welcome-desc">我可以帮你写代码、解释代码、调试和重构</div>
            <div class="welcome-features">
                <div class="feature-item" data-action="explain">
                    <span class="feature-icon">📖</span>
                    <span>解释代码</span>
                </div>
                <div class="feature-item" data-action="fix">
                    <span class="feature-icon">🐛</span>
                    <span>修复 Bug</span>
                </div>
                <div class="feature-item" data-action="refactor">
                    <span class="feature-icon">♻️</span>
                    <span>重构优化</span>
                </div>
                <div class="feature-item" data-action="complete">
                    <span class="feature-icon">✨</span>
                    <span>生成代码</span>
                </div>
            </div>
        </div>
    </div>

    <!-- 思考状态 -->
    <div class="thinking" id="thinking">
        <div class="thinking-dots">
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
        </div>
        <span class="thinking-text">AI 正在思考...</span>
    </div>

    <!-- 输入区域 -->
    <div class="input-container">
        <div class="input-wrapper">
            <textarea class="input-field" id="inputField" placeholder="输入你的问题..." rows="1"></textarea>
            <button class="send-btn" id="sendBtn" title="发送消息 (Enter)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
            </button>
        </div>
        <div class="input-hint">
            <kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行
        </div>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const messagesContainer = document.getElementById('messagesContainer');
            const welcome = document.getElementById('welcome');
            const thinking = document.getElementById('thinking');
            const inputField = document.getElementById('inputField');
            const sendBtn = document.getElementById('sendBtn');
            const clearBtn = document.getElementById('clearBtn');
            const settingsBtn = document.getElementById('settingsBtn');

            // 聚焦输入框
            function focusInput() {
                if (inputField) {
                    inputField.focus();
                }
            }

            // 发送消息
            function sendMessage() {
                const text = inputField.value.trim();
                if (!text) return;

                welcome.style.display = 'none';
                addMessage(text, 'user');
                vscode.postMessage({ command: 'sendMessage', text: text });
                inputField.value = '';
                inputField.style.height = 'auto';
                focusInput();
            }

            // 清空对话
            function clearChat() {
                messagesContainer.innerHTML = '';
                messagesContainer.appendChild(welcome);
                welcome.style.display = 'flex';
                vscode.postMessage({ command: 'clearChat' });
            }

            // 添加消息
            function addMessage(text, role) {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + role;

                const now = new Date();
                const timeStr = now.getHours().toString().padStart(2, '0') + ':' + 
                               now.getMinutes().toString().padStart(2, '0');

                const roleNames = {
                    'user': '你',
                    'assistant': 'AI',
                    'error': '错误',
                    'system': '系统'
                };

                const roleIcons = {
                    'user': '👤',
                    'assistant': '🤖',
                    'error': '❌',
                    'system': 'ℹ️'
                };

                messageDiv.innerHTML = 
                    '<div class="message-header">' +
                        '<div class="message-avatar">' + (roleIcons[role] || '💬') + '</div>' +
                        '<span class="message-role">' + (roleNames[role] || role) + '</span>' +
                        '<span class="message-time">' + timeStr + '</span>' +
                    '</div>' +
                    '<div class="message-content">' + formatMarkdown(text) + '</div>';

                messagesContainer.appendChild(messageDiv);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

                // 为代码块添加操作按钮
                messageDiv.querySelectorAll('pre').forEach(function(pre) {
                    const code = pre.querySelector('code');
                    if (!code) return;

                    const lang = (code.className.match(/language-(\\w+)/) || ['', ''])[1];
                    
                    const header = document.createElement('div');
                    header.className = 'code-header';
                    header.innerHTML = 
                        '<span class="code-lang">' + (lang || 'code') + '</span>' +
                        '<div class="code-actions">' +
                            '<button class="code-btn copy-btn">复制</button>' +
                            '<button class="code-btn insert-btn">插入</button>' +
                        '</div>';

                    pre.insertBefore(header, pre.firstChild);

                    // 复制按钮事件
                    header.querySelector('.copy-btn').addEventListener('click', function() {
                        vscode.postMessage({ 
                            command: 'copyCode', 
                            code: code.textContent 
                        });
                    });

                    // 插入按钮事件
                    header.querySelector('.insert-btn').addEventListener('click', function() {
                        vscode.postMessage({ 
                            command: 'insertCode', 
                            code: code.textContent 
                        });
                    });
                });
            }

            // 格式化 Markdown
            function formatMarkdown(text) {
                let html = text;

                // 代码块
                html = html.replace(/\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g, function(match, lang, code) {
                    return '<pre><code class="language-' + lang + '">' + escapeHtml(code.trim()) + '</code></pre>';
                });

                // 行内代码
                html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

                // 标题
                html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
                html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
                html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

                // 粗体和斜体
                html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

                // 链接
                html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

                // 列表
                html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
                html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
                html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

                // 引用
                html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

                // 分割线
                html = html.replace(/^---$/gm, '<hr>');

                // 段落（换行）
                html = html.replace(/\n\n/g, '</p><p>');
                html = html.replace(/\n/g, '<br>');
                html = '<p>' + html + '</p>';

                // 清理空段落
                html = html.replace(/<p><\/p>/g, '');
                html = html.replace(/<p>(<h[123]>)/g, '$1');
                html = html.replace(/(<\/h[123]>)<\/p>/g, '$1');
                html = html.replace(/<p>(<pre>)/g, '$1');
                html = html.replace(/(<\/pre>)<\/p>/g, '$1');
                html = html.replace(/<p>(<ul>)/g, '$1');
                html = html.replace(/(<\/ul>)<\/p>/g, '$1');
                html = html.replace(/<p>(<blockquote>)/g, '$1');
                html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
                html = html.replace(/<p>(<hr>)/g, '$1');
                html = html.replace(/(<hr>)<\/p>/g, '$1');

                return html;
            }

            // HTML 转义
            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            // 事件监听 - 使用 addEventListener 而非内联事件

            // Enter 键发送
            inputField.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    sendMessage();
                }
            });

            // 自动调整高度
            inputField.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });

            // 发送按钮
            sendBtn.addEventListener('click', function(e) {
                e.preventDefault();
                sendMessage();
            });

            // 清空按钮
            clearBtn.addEventListener('click', function(e) {
                e.preventDefault();
                clearChat();
            });

            // 设置按钮
            settingsBtn.addEventListener('click', function(e) {
                e.preventDefault();
                vscode.postMessage({ command: 'openSettings' });
            });

            // 功能项点击
            document.querySelectorAll('.feature-item').forEach(function(item) {
                item.addEventListener('click', function() {
                    const action = this.getAttribute('data-action');
                    const prompts = {
                        'explain': '请解释这段代码的作用和逻辑',
                        'fix': '请帮我找出并修复这段代码中的问题',
                        'refactor': '请帮我重构这段代码，提高可读性和性能',
                        'complete': '请帮我生成代码'
                    };
                    if (prompts[action]) {
                        inputField.value = prompts[action];
                        focusInput();
                    }
                });
            });

            // 点击消息区域聚焦输入框
            messagesContainer.addEventListener('click', function(e) {
                if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                    focusInput();
                }
            });

            // 监听来自扩展的消息
            window.addEventListener('message', function(event) {
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
                        focusInput();
                        break;
                    case 'clearChat':
                        messagesContainer.innerHTML = '';
                        messagesContainer.appendChild(welcome);
                        welcome.style.display = 'flex';
                        break;
                    case 'focusInput':
                        focusInput();
                        break;
                }
            });

            // 通知扩展已准备好
            vscode.postMessage({ command: 'ready' });

            // 初始聚焦
            focusInput();
        })();
    </script>
</body>
</html>`;
    }
}
