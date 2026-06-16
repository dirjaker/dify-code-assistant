import * as vscode from 'vscode';
import { DifyClient } from './difyClient';
import { FileSystemProvider } from './fileSystem';
import { ModeManager, AgentMode } from './modeManager';
import { ToolExecutor, ToolCall, ToolResult } from './toolExecutor';
import { DecorationManager } from './decorationManager';
import { diffToHtml, FileDiff } from './diffEngine';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'difyChatView';
    private _view?: vscode.WebviewView;
    private _client: DifyClient;
    private _fs: FileSystemProvider;
    private _modeManager: ModeManager;
    private _toolExecutor: ToolExecutor;

    private _decorationManager: DecorationManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        client: DifyClient,
        fs: FileSystemProvider,
        modeManager: ModeManager,
        decorationManager: DecorationManager
    ) {
        this._client = client;
        this._fs = fs;
        this._modeManager = modeManager;
        this._decorationManager = decorationManager;
        this._toolExecutor = new ToolExecutor(fs, modeManager, decorationManager);
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
                case 'setMode':
                    this._modeManager.setMode(message.mode as AgentMode);
                    this._postMessage({ command: 'modeChanged', mode: message.mode });
                    break;
                case 'insertCode':
                    await this._insertCode(message.code);
                    break;
                case 'copyCode':
                    await vscode.env.clipboard.writeText(message.code);
                    this._postMessage({ command: 'info', text: '已复制到剪贴板' });
                    break;
                case 'applyDiff':
                    await this._applyDiff(message.filePath);
                    break;
                case 'rejectDiff':
                    this._toolExecutor.rejectPendingWrite(message.filePath);
                    this._postMessage({ command: 'diffRejected', filePath: message.filePath });
                    break;
                case 'applyAllDiffs':
                    await this._applyAllDiffs();
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'dify');
                    break;
                case 'insertPrompt':
                    this._postMessage({ command: 'fillInput', text: message.text });
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

    /**
     * 处理用户消息 — 核心 Agent 循环
     */
    private async _handleMessage(text: string): Promise<void> {
        this._postMessage({ command: 'startThinking' });

        try {
            // 构建上下文
            const context = await this._buildContext();

            // 构建系统提示词
            const systemPrompt = this._buildSystemPrompt(context);

            // 发送消息到 Dify
            const response = await this._client.chat(
                context ? `${context}\n\n---\n\n${text}` : text,
                systemPrompt
            );

            // 解析工具调用
            const toolCalls = this._toolExecutor.parseToolCalls(response.answer);

            if (toolCalls.length > 0) {
                // 有工具调用 — 先显示 AI 的文字部分
                const textOnly = response.answer.replace(/```action\s*\n[\s\S]*?```/g, '').trim();
                if (textOnly) {
                    this._postMessage({ command: 'receiveMessage', text: textOnly, role: 'assistant' });
                }

                // 执行工具调用
                const results = await this._toolExecutor.executeAll(toolCalls);

                // 处理工具结果
                for (const result of results) {
                    if (result.type === 'write_file' && result.diff) {
                        // 显示 diff 预览
                        this._postMessage({
                            command: 'showDiff',
                            filePath: result.diff.filePath,
                            html: diffToHtml(result.diff),
                            additions: result.diff.additions,
                            deletions: result.diff.deletions
                        });
                    } else if (result.type === 'read_file' && result.success) {
                        this._postMessage({
                            command: 'toolResult',
                            type: 'read_file',
                            data: result.data
                        });
                    }
                }
            } else {
                // 纯文字回复
                this._postMessage({ command: 'receiveMessage', text: response.answer, role: 'assistant' });
            }
        } catch (error: any) {
            this._postMessage({ command: 'receiveMessage', text: 'Error: ' + error.message, role: 'error' });
        } finally {
            this._postMessage({ command: 'stopThinking' });
        }
    }

    /**
     * 构建上下文信息
     */
    private async _buildContext(): Promise<string> {
        const parts: string[] = [];

        // 当前编辑器文件
        const editor = this._fs.getActiveEditor();
        if (editor) {
            const selectedText = this._fs.getSelectedText();
            if (selectedText) {
                parts.push(`当前选中的代码 (${editor.relativePath}):\n\`\`\`${editor.language}\n${selectedText}\n\`\`\``);
            } else {
                // 发送文件前 50 行作为上下文
                const lines = editor.content.split('\n').slice(0, 50).join('\n');
                const truncated = editor.lineCount > 50;
                parts.push(`当前文件: ${editor.relativePath} (${editor.language}, ${editor.lineCount} lines)\n\`\`\`${editor.language}\n${lines}${truncated ? '\n... (truncated)' : ''}\n\`\`\``);
            }
        }

        // 工作区文件列表（简要）
        const files = await this._fs.scanWorkspace(50);
        if (files.length > 0) {
            const fileList = files.map(f => f.relativePath).join('\n');
            parts.push(`工作区文件:\n${fileList}`);
        }

        return parts.join('\n\n');
    }

    /**
     * 构建系统提示词
     */
    private _buildSystemPrompt(context: string): string {
        const modeSuffix = this._modeManager.getSystemPromptSuffix();

        return `你是一个专业的 AI 编程助手，运行在 VS Code 编辑器中。

## 能力
- 阅读和分析代码
- 解释代码逻辑
- 生成和修改代码
- 规划和执行开发任务

## 工具调用协议
当需要读取文件时，输出：
\`\`\`action
{"type": "read_file", "path": "相对路径"}
\`\`\`

当需要写入文件时（仅 Agent 模式），输出：
\`\`\`action
{"type": "write_file", "path": "相对路径", "content": "完整文件内容", "reason": "修改原因"}
\`\`\`

当需要列出文件时，输出：
\`\`\`action
{"type": "list_files"}
\`\`\`

## 回答规范
- 默认使用中文回答
- 代码块使用 Markdown 格式，标注语言类型
- 修改代码时说明改动原因
- 简洁专业，不说废话
${modeSuffix}`;
    }

    /**
     * 应用单个 diff
     */
    private async _applyDiff(filePath: string): Promise<void> {
        const success = await this._toolExecutor.applyPendingWrite(filePath);
        if (success) {
            this._postMessage({ command: 'diffApplied', filePath });
            // 打开修改的文件
            const root = this._fs.getWorkspaceRoot();
            if (root) {
                const uri = vscode.Uri.joinPath(vscode.Uri.file(root), filePath);
                await vscode.window.showTextDocument(uri);
            }
        }
    }

    /**
     * 应用所有 diff
     */
    private async _applyAllDiffs(): Promise<void> {
        const applied = await this._toolExecutor.applyAllPending();
        for (const filePath of applied) {
            this._postMessage({ command: 'diffApplied', filePath });
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

    private _getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
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
    <div class="header">
        <div class="mode-switcher">
            <button class="mode-btn active" data-mode="ask">Ask</button>
            <button class="mode-btn" data-mode="plan">Plan</button>
            <button class="mode-btn" data-mode="agent">Agent</button>
        </div>
        <div class="header-actions">
            <button class="icon-btn" id="clearBtn" title="New Chat">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M2 2h12M5 2V1h6v1M3 2v11a1 1 0 001 1h8a1 1 0 001-1V2"/>
                </svg>
            </button>
            <button class="icon-btn" id="settingsBtn" title="Settings">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="8" cy="8" r="2.5"/>
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
                </svg>
            </button>
        </div>
    </div>

    <div class="messages" id="messages">
        <div class="welcome" id="welcome">
            <div class="welcome-title">Dify Code Assistant</div>
            <div class="welcome-desc">Ask questions, plan tasks, or let the agent write code.</div>
            <div class="quick-actions">
                <button class="quick-btn" data-prompt="Explain this code">
                    <span>Explain</span>
                </button>
                <button class="quick-btn" data-prompt="Find and fix bugs">
                    <span>Fix Bugs</span>
                </button>
                <button class="quick-btn" data-prompt="Refactor this code">
                    <span>Refactor</span>
                </button>
                <button class="quick-btn" data-prompt="Write tests for this code">
                    <span>Write Tests</span>
                </button>
            </div>
        </div>
    </div>

    <div class="thinking" id="thinking">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <span>Thinking...</span>
    </div>

    <div class="input-area">
        <div class="input-row">
            <textarea id="userInput" placeholder="Ask anything..." rows="1"></textarea>
            <button id="sendBtn" title="Send (Enter)">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2L7 9M14 2l-5 12-3-7-7-3 12-5z"/>
                </svg>
            </button>
        </div>
        <div class="hint">
            <kbd>Enter</kbd> send / <kbd>Shift+Enter</kbd> newline
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
