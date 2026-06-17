import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { DifyClient } from './difyClient';
import { FileSystemProvider } from './fileSystem';
import { ModeManager, AgentMode } from './modeManager';
import { ToolExecutor, ToolCall, ToolResult } from './toolExecutor';
import { DecorationManager } from './decorationManager';
import { diffToHtml, FileDiff } from './diffEngine';
import { WorkspaceIndexer } from './workspaceIndexer';

interface ChatSession {
    id: string;
    messages: { role: string; text: string; ts: number }[];
    mode: AgentMode;
    createdAt: number;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'difyChatView';
    private _view?: vscode.WebviewView;
    private _client: DifyClient;
    private _fs: FileSystemProvider;
    private _modeManager: ModeManager;
    private _toolExecutor: ToolExecutor;
    private _decorationManager: DecorationManager;
    private _extensionContext: vscode.ExtensionContext;
    private _chatHistory: { role: string; text: string; ts: number }[] = [];
    private _slashCommands: Map<string, { description: string; handler: (args: string) => Promise<string> }> = new Map();
    private _workspaceIndexer?: WorkspaceIndexer;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        client: DifyClient,
        fs: FileSystemProvider,
        modeManager: ModeManager,
        decorationManager: DecorationManager,
        extensionContext?: vscode.ExtensionContext,
        workspaceIndexer?: WorkspaceIndexer
    ) {
        this._client = client;
        this._fs = fs;
        this._modeManager = modeManager;
        this._decorationManager = decorationManager;
        this._toolExecutor = new ToolExecutor(fs, modeManager, decorationManager);
        this._extensionContext = extensionContext!;
        this._workspaceIndexer = workspaceIndexer;
        this._registerSlashCommands();
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
                    this._chatHistory = [];
                    this._currentSessionId = '';
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
                case 'searchFiles':
                    await this._handleSearchFiles(message.query || '');
                    break;
                case 'executeTerminal':
                    await this._handleTerminalCommand(message.command_text || '');
                    break;
                case 'slashCommand':
                    await this._handleSlashCommand(message.text || '');
                    break;
                case 'applyInlineEdit':
                    await this._handleApplyInlineEdit(message.filePath, message.newContent);
                    break;
                case 'loadHistory':
                    this._sendHistory();
                    break;
                case 'loadSession':
                    this._loadSession(message.sessionId);
                    break;
                case 'deleteSession':
                    this._deleteSession(message.sessionId);
                    break;
                case 'newTab':
                    this._newTab();
                    break;
                case 'switchTab':
                    this._switchTab(message.tabId);
                    break;
                case 'closeTab':
                    this._closeTab(message.tabId);
                    break;
            }
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._postMessage({ command: 'focusInput' });
                this._sendContextPills();
                // 发送斜杠命令列表
                const cmds = Array.from(this._slashCommands.entries()).map(([name, cmd]) => ({
                    name, description: cmd.description
                }));
                this._postMessage({ command: 'slashCommandsList', commands: cmds });
                // 恢复历史
                this._sendHistory();
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
     * 处理用户消息 — 核心 Agent 循环（流式输出）
     */
    /**
     * 处理 @文件引用 — 将 @path 替换为文件内容
     */
    private async _resolveFileReferences(text: string): Promise<string> {
        const fileRefRegex = /@(\S+)/g;
        let match;
        let resolved = text;
        const refs: { placeholder: string; filePath: string }[] = [];

        while ((match = fileRefRegex.exec(text)) !== null) {
            refs.push({ placeholder: match[0], filePath: match[1] });
        }

        for (const ref of refs) {
            const file = await this._fs.readFile(ref.filePath);
            if (file) {
                const lines = file.content.split('\n').slice(0, 100).join('\n');
                const truncated = file.lineCount > 100;
                resolved = resolved.replace(
                    ref.placeholder,
                    `\`\`\`${file.language} (${ref.filePath}, ${file.lineCount} lines)\n${lines}${truncated ? '\n... (truncated)' : ''}\n\`\`\``
                );
            }
        }
        return resolved;
    }

    private async _handleMessage(text: string): Promise<void> {
        this._postMessage({ command: 'startThinking' });
        this._saveMessage('user', text);

        try {
            // 解析 @文件引用
            const resolvedText = await this._resolveFileReferences(text);

            // 构建上下文
            const context = await this._buildContext();

            // 构建系统提示词
            const systemPrompt = this._buildSystemPrompt(context);

            // 流式发送消息到 Dify
            let fullAnswer = '';
            let streamStarted = false;

            const response = await this._client.chatStream(
                context ? `${context}\n\n---\n\n${resolvedText}` : resolvedText,
                (chunk: string) => {
                    if (!streamStarted) {
                        // 第一个 chunk 到达，通知 webview 开始流式渲染
                        this._postMessage({ command: 'startStream' });
                        streamStarted = true;
                    }
                    fullAnswer += chunk;
                    this._postMessage({ command: 'streamChunk', chunk });
                },
                systemPrompt
            );

            // 流式结束
            if (streamStarted) {
                this._postMessage({ command: 'endStream' });
                this._saveMessage('assistant', fullAnswer);
            }

            // 解析工具调用
            const toolCalls = this._toolExecutor.parseToolCalls(fullAnswer);

            if (toolCalls.length > 0) {
                // 有工具调用 — 执行工具
                const results = await this._toolExecutor.executeAll(toolCalls);

                for (const result of results) {
                    if (result.type === 'write_file' && result.diff) {
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
            } else if (!streamStarted) {
                // 没有流式输出也没有工具调用，显示完整回复
                this._postMessage({ command: 'receiveMessage', text: fullAnswer, role: 'assistant' });
                this._saveMessage('assistant', fullAnswer);
            }
        } catch (error: any) {
            this._postMessage({ command: 'receiveMessage', text: 'Error: ' + error.message, role: 'error' });
        } finally {
            this._postMessage({ command: 'stopThinking' });
        }
    }

    /**
     * 发送上下文标签到 Webview
     */
    private _sendContextPills(): void {
        const contexts: { type: string; label: string; icon: string }[] = [];

        const editor = this._fs.getActiveEditor();
        if (editor) {
            contexts.push({
                type: 'file',
                label: editor.relativePath,
                icon: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M9 2v4h4"/></svg>'
            });

            const selectedText = this._fs.getSelectedText();
            if (selectedText) {
                const lineCount = selectedText.split('\n').length;
                contexts.push({
                    type: 'selection',
                    label: `${lineCount} line${lineCount > 1 ? 's' : ''} selected`,
                    icon: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12M2 8h8M2 12h10"/></svg>'
                });
            }
        }

        this._postMessage({ command: 'updateContext', contexts });
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

    /**
     * @文件引用 — 搜索工作区文件
     */
    private async _handleSearchFiles(query: string): Promise<void> {
        const files = await this._fs.scanWorkspace(200);
        const q = query.toLowerCase();
        const matches = files
            .filter(f => f.relativePath.toLowerCase().includes(q))
            .sort((a, b) => {
                // Score: prefix match > contains > depth
                const aPath = a.relativePath.toLowerCase();
                const bPath = b.relativePath.toLowerCase();
                const aPrefix = aPath.startsWith(q) ? 0 : 1;
                const bPrefix = bPath.startsWith(q) ? 0 : 1;
                if (aPrefix !== bPrefix) return aPrefix - bPrefix;
                return aPath.length - bPath.length;
            })
            .slice(0, 15)
            .map(f => ({
                path: f.relativePath,
                language: f.language,
                icon: this._getLanguageIcon(f.language),
                size: f.size
            }));
        this._postMessage({ command: 'fileSearchResults', results: matches });
    }

    private _getLanguageIcon(lang: string): string {
        const icons: Record<string, string> = {
            typescript: 'TS', javascript: 'JS', python: 'PY',
            rust: 'RS', go: 'GO', java: 'JA', html: 'HT',
            css: 'CS', json: 'JS', yaml: 'YM', markdown: 'MD',
            shell: 'SH', sql: 'SQ', vue: 'VU'
        };
        return icons[lang] || lang.slice(0, 2).toUpperCase();
    }

    /**
     * 终端命令执行
     */
    private async _handleTerminalCommand(cmd: string): Promise<void> {
        const root = this._fs.getWorkspaceRoot();
        try {
            const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
                cp.exec(cmd, { cwd: root, timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
                    resolve({
                        stdout: stdout || '',
                        stderr: stderr || '',
                        code: error ? (error as any).code || 1 : 0
                    });
                });
            });
            this._postMessage({
                command: 'terminalResult',
                stdout: result.stdout,
                stderr: result.stderr,
                code: result.code
            });
        } catch (err: any) {
            this._postMessage({ command: 'terminalResult', stdout: '', stderr: err.message, code: 1 });
        }
    }

    /**
     * 斜杠命令系统
     */
    private _registerSlashCommands(): void {
        this._slashCommands.set('explain', {
            description: '解释选中的代码',
            handler: async (args) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return '请先打开一个文件';
                const text = editor.document.getText(editor.selection) || editor.document.getText();
                return `请解释以下代码:\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\``;
            }
        });
        this._slashCommands.set('fix', {
            description: '修复代码问题',
            handler: async (args) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return '请先打开一个文件';
                const text = editor.document.getText(editor.selection) || editor.document.getText();
                return `请找出并修复以下代码的问题:\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\``;
            }
        });
        this._slashCommands.set('refactor', {
            description: '重构代码',
            handler: async (args) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return '请先打开一个文件';
                const text = editor.document.getText(editor.selection) || editor.document.getText();
                return `请重构以下代码，提升可读性和性能:\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\``;
            }
        });
        this._slashCommands.set('test', {
            description: '生成单元测试',
            handler: async (args) => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return '请先打开一个文件';
                const text = editor.document.getText(editor.selection) || editor.document.getText();
                return `请为以下代码生成单元测试:\n\`\`\`${editor.document.languageId}\n${text}\n\`\`\``;
            }
        });
        this._slashCommands.set('clear', {
            description: '清空对话',
            handler: async () => {
                this._client.resetConversation();
                this._chatHistory = [];
                this._postMessage({ command: 'clearChat' });
                return '';
            }
        });
        this._slashCommands.set('terminal', {
            description: '执行终端命令',
            handler: async (args) => {
                if (!args.trim()) return '用法: /terminal <命令>';
                this._postMessage({ command: 'runTerminal', commandText: args.trim() });
                return '';
            }
        });
        this._slashCommands.set('help', {
            description: '显示所有可用命令',
            handler: async () => {
                const lines = Array.from(this._slashCommands.entries())
                    .map(([name, cmd]) => `/${name} — ${cmd.description}`)
                    .join('\n');
                this._postMessage({ command: 'receiveMessage', text: '**可用斜杠命令:**\n\n' + lines, role: 'assistant' });
                return '';
            }
        });
        this._slashCommands.set('file', {
            description: '读取文件内容',
            handler: async (args) => {
                if (!args.trim()) return '用法: /file <路径>';
                const file = await this._fs.readFile(args.trim());
                if (!file) return `文件未找到: ${args}`;
                return `请分析文件 ${file.relativePath}:\n\`\`\`${file.language}\n${file.content}\n\`\`\``;
            }
        });
        this._slashCommands.set('mode', {
            description: '切换模式 (ask/plan/agent)',
            handler: async (args) => {
                const mode = args.trim().toLowerCase() as AgentMode;
                if (!['ask', 'plan', 'agent'].includes(mode)) {
                    this._postMessage({ command: 'receiveMessage', text: '用法: /mode <ask|plan|agent>', role: 'assistant' });
                    return '';
                }
                this._modeManager.setMode(mode);
                this._postMessage({ command: 'modeChanged', mode });
                this._postMessage({ command: 'receiveMessage', text: `已切换到 ${mode} 模式`, role: 'system' });
                return '';
            }
        });
        this._slashCommands.set('compact', {
            description: '压缩对话上下文',
            handler: async () => {
                const history = this._client.getMessageHistory();
                const summary = history.slice(-6).map(m => `${m.role}: ${m.content.slice(0, 100)}`).join('\n');
                this._client.resetConversation();
                return `之前的对话摘要:\n${summary}\n请继续。`;
            }
        });
    }

    private async _handleSlashCommand(text: string): Promise<void> {
        const match = text.match(/^\/(\w+)\s*(.*)/);
        if (!match) return;
        const [, cmd, args] = match;
        const slashCmd = this._slashCommands.get(cmd);
        if (!slashCmd) {
            this._postMessage({ command: 'receiveMessage', text: `未知命令: /${cmd}\n可用命令: ${Array.from(this._slashCommands.keys()).map(k => '/' + k).join(', ')}`, role: 'error' });
            return;
        }
        const result = await slashCmd.handler(args);
        if (result) {
            await this._handleMessage(result);
        }
    }

    /**
     * 内联编辑
     */
    private _loadSession(sessionId: string): void {
        if (!this._extensionContext) return;
        const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
        const session = sessions[sessionId];
        if (!session) return;
        this._currentSessionId = session.id;
        this._chatHistory = session.messages;
        this._client.resetConversation();
        this._postMessage({ command: 'clearChat' });
        this._postMessage({ command: 'restoreHistory', messages: session.messages });
    }

    private _deleteSession(sessionId: string): void {
        if (!this._extensionContext) return;
        const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
        delete sessions[sessionId];
        this._extensionContext.globalState.update('difyChatSessions', sessions);
        if (this._currentSessionId === sessionId) {
            this._currentSessionId = '';
            this._chatHistory = [];
        }
        this._sendSessionList();
    }

    private async _handleApplyInlineEdit(filePath: string, newContent: string): Promise<void> {
        const success = await this._fs.writeFile(filePath, newContent);
        if (success) {
            const root = this._fs.getWorkspaceRoot();
            if (root) {
                const uri = vscode.Uri.joinPath(vscode.Uri.file(root), filePath);
                await vscode.window.showTextDocument(uri);
            }
            this._postMessage({ command: 'inlineEditApplied', filePath });
        } else {
            this._postMessage({ command: 'receiveMessage', text: `写入失败: ${filePath}`, role: 'error' });
        }
    }

    /**
     * 历史记录
     */
    private _currentSessionId: string = '';

    private _saveMessage(role: string, text: string): void {
        this._chatHistory.push({ role, text, ts: Date.now() });
        if (this._extensionContext) {
            const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
            if (!this._currentSessionId) {
                this._currentSessionId = 'session_' + Date.now();
            }
            sessions[this._currentSessionId] = {
                id: this._currentSessionId,
                messages: this._chatHistory,
                mode: this._modeManager.getMode(),
                createdAt: sessions[this._currentSessionId]?.createdAt || Date.now()
            };
            this._extensionContext.globalState.update('difyChatSessions', sessions);
            // Update tab title with first user message
            if (role === 'user' && this._chatHistory.length === 1) {
                const tab = this._openTabs.find(t => t.id === this._activeTabId);
                if (tab) {
                    tab.title = text.slice(0, 20) || 'New Chat';
                    tab.id = this._currentSessionId; // Link tab to session
                    this._activeTabId = this._currentSessionId;
                }
            }
            this._sendSessionList();
        }
    }

    private _sendHistory(): void {
        if (this._extensionContext) {
            const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
            this._sendSessionList();
            const sessionIds = Object.keys(sessions).sort((a, b) => {
                return (sessions[b].createdAt || 0) - (sessions[a].createdAt || 0);
            });
            if (sessionIds.length > 0) {
                const latest = sessions[sessionIds[0]];
                this._currentSessionId = latest.id;
                this._chatHistory = latest.messages;
                this._postMessage({ command: 'restoreHistory', messages: latest.messages });
                // Initialize with one tab for latest session
                if (this._openTabs.length === 0) {
                    const title = latest.messages.length > 0 ? latest.messages[0].text.slice(0, 20) : 'New Chat';
                    this._openTabs.push({ id: latest.id, title });
                    this._activeTabId = latest.id;
                }
            } else if (this._openTabs.length === 0) {
                this._newTab();
            }
            this._sendTabUpdate();
        }
    }

    private _sendSessionList(): void {
        if (!this._extensionContext) return;
        const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
        const list = Object.values(sessions)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 20)
            .map(s => ({
                id: s.id,
                preview: s.messages.length > 0 ? s.messages[0].text.slice(0, 60) : '(empty)',
                messageCount: s.messages.length,
                createdAt: s.createdAt
            }));
        this._postMessage({ command: 'sessionList', sessions: list });
        this._sendTabUpdate();
    }

    // ═══════════════════════════════════════
    // Tab Management
    // ═══════════════════════════════════════
    private _openTabs: { id: string; title: string }[] = [];
    private _activeTabId: string = '';

    private _sendTabUpdate(): void {
        const tabs = this._openTabs.map(t => ({
            id: t.id,
            title: t.title,
            active: t.id === this._activeTabId
        }));
        this._postMessage({ command: 'tabUpdate', tabs, activeTabId: this._activeTabId });
    }

    private _newTab(): void {
        // Save current session before creating new
        const tabId = 'tab_' + Date.now();
        this._openTabs.push({ id: tabId, title: 'New Chat' });
        this._activeTabId = tabId;
        this._currentSessionId = '';
        this._chatHistory = [];
        this._client.resetConversation();
        this._postMessage({ command: 'clearChat' });
        this._sendTabUpdate();
    }

    private _switchTab(tabId: string): void {
        const tab = this._openTabs.find(t => t.id === tabId);
        if (!tab) return;
        this._activeTabId = tabId;
        // Load session associated with this tab
        if (this._extensionContext) {
            const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
            // Find session for this tab
            const session = Object.values(sessions).find(s => s.id === tabId || s.id === this._currentSessionId);
            if (session) {
                this._currentSessionId = session.id;
                this._chatHistory = session.messages;
                this._client.resetConversation();
                this._postMessage({ command: 'clearChat' });
                this._postMessage({ command: 'restoreHistory', messages: session.messages });
            }
        }
        this._sendTabUpdate();
    }

    private _closeTab(tabId: string): void {
        const idx = this._openTabs.findIndex(t => t.id === tabId);
        if (idx < 0) return;
        this._openTabs.splice(idx, 1);
        // If closing active tab, switch to another
        if (this._activeTabId === tabId) {
            if (this._openTabs.length > 0) {
                const newActive = this._openTabs[Math.min(idx, this._openTabs.length - 1)];
                this._switchTab(newActive.id);
            } else {
                this._newTab();
            }
        } else {
            this._sendTabUpdate();
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
    <div class="grid-layout">
        <!-- Tab Bar — 多标签页 -->
        <div class="tab-bar" id="tabBar">
            <div class="tab-list" id="tabList"></div>
            <button class="tab-new" id="tabNewBtn" title="New Chat">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M8 2v12M2 8h12"/>
                </svg>
            </button>
        </div>

        <!-- Steps Area — 消息滚动区 -->
        <div class="steps-area" id="stepsArea">
            <div class="welcome" id="welcome">
                <div class="welcome-title">Dify Code Assistant</div>
                <div class="welcome-desc">Ask questions, plan tasks, or let the agent write code.</div>
                <div class="welcome-features">
                    <div class="feature-hint"><kbd>@</kbd> Reference files</div>
                    <div class="feature-hint"><kbd>/</kbd> Slash commands</div>
                    <div class="feature-hint"><kbd>Ctrl+.</kbd> Switch mode</div>
                    <div class="feature-hint"><kbd>Esc</kbd> Cancel stream</div>
                </div>
                <div class="conversation-starters">
                    <button class="starter-btn" data-prompt="Explain this code">
                        <div>
                            <div class="starter-label">Explain</div>
                            <div class="starter-desc">Describe what the selected code does</div>
                        </div>
                    </button>
                    <button class="starter-btn" data-prompt="Find and fix bugs in this code">
                        <div>
                            <div class="starter-label">Fix Bugs</div>
                            <div class="starter-desc">Identify and resolve issues</div>
                        </div>
                    </button>
                    <button class="starter-btn" data-prompt="Refactor this code to improve readability">
                        <div>
                            <div class="starter-label">Refactor</div>
                            <div class="starter-desc">Improve code structure and readability</div>
                        </div>
                    </button>
                    <button class="starter-btn" data-prompt="Write unit tests for this code">
                        <div>
                            <div class="starter-label">Write Tests</div>
                            <div class="starter-desc">Generate test cases</div>
                        </div>
                    </button>
                </div>
            </div>

            <!-- Thinking Indicator -->
            <div class="thinking" id="thinking">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
                <span>Thinking...</span>
            </div>
        </div>

        <!-- Input Area — Continue 风格，固定底部 -->
        <div class="input-area">
            <!-- Mode Toolbar -->
            <div class="input-toolbar">
                <div class="toolbar-left">
                    <button class="mode-btn active" data-mode="ask">Ask</button>
                    <button class="mode-btn" data-mode="plan">Plan</button>
                    <button class="mode-btn" data-mode="agent">Agent</button>
                </div>
                <div class="toolbar-right">
                    <button class="icon-btn" id="historyBtn" title="History">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="8" cy="8" r="6"/>
                            <path d="M8 4v4l3 2"/>
                        </svg>
                    </button>
                    <button class="icon-btn" id="clearBtn" title="New Chat">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M2 2h12M5 2V1h6v1M3 2v11a1 1 0 001 1h8a1 1 0 001-1V2"/>
                        </svg>
                    </button>
                    <button class="icon-btn" id="settingsBtn" title="Settings">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="8" cy="8" r="2.5"/>
                            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Context Tags -->
            <div class="context-tags" id="inputContext"></div>

            <!-- @File Autocomplete Dropdown -->
            <div class="file-dropdown" id="fileDropdown"></div>

            <!-- Slash Command Dropdown -->
            <div class="slash-dropdown" id="slashDropdown"></div>

            <!-- Input Row -->
            <div class="input-row">
                <textarea id="userInput" placeholder="Ask anything... (type @ for files, / for commands)" rows="1"></textarea>
                <button id="sendBtn" title="Send (Enter)">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2L7 9M14 2l-5 12-3-7-7-3 12-5z"/>
                    </svg>
                </button>
            </div>

            <!-- Hint -->
            <div class="input-hint">
                <span><kbd>Enter</kbd> send / <kbd>Shift+Enter</kbd> newline</span>
                <span class="input-mode-label" id="modeLabel">Ask mode</span>
            </div>
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
