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
    private _toolServerPort: number = 0;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        client: DifyClient,
        fs: FileSystemProvider,
        modeManager: ModeManager,
        decorationManager: DecorationManager,
        extensionContext: vscode.ExtensionContext,
        workspaceIndexer?: WorkspaceIndexer
    ) {
        this._client = client;
        this._fs = fs;
        this._modeManager = modeManager;
        this._decorationManager = decorationManager;
        this._toolExecutor = new ToolExecutor(fs, modeManager, decorationManager);
        this._extensionContext = extensionContext;
        this._workspaceIndexer = workspaceIndexer;
        this._registerSlashCommands();
    }

    public setToolServerPort(port: number): void {
        this._toolServerPort = port;
        this._client.setToolServerPort(port);
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
                    this._clearCurrentChat();
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

    /**
     * 处理用户消息 — 使用 Dify Agent 原生工具调用
     */
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

            // 使用 Agent 循环处理消息
            const fullMessage = context ? `${context}\n\n---\n\n${resolvedText}` : resolvedText;

            // 调用 Agent 循环
            const result = await this._client.chatWithAgent(
                fullMessage,
                systemPrompt,
                {
                    onThinking: () => {
                        this._postMessage({ command: 'startThinking' });
                    },
                    onStreamStart: () => {
                        this._postMessage({ command: 'startStream' });
                    },
                    onStreamChunk: (chunk: string) => {
                        this._postMessage({ command: 'streamChunk', chunk });
                    },
                    onStreamEnd: () => {
                        this._postMessage({ command: 'endStream' });
                    },
                    onToolStart: (toolName: string) => {
                        this._postMessage({ command: 'toolStart', toolName });
                    },
                    onToolEnd: (toolName: string, result: string) => {
                        this._postMessage({ command: 'toolEnd', toolName, result });
                    },
                    onAgentThought: (thought: string) => {
                        this._postMessage({ command: 'agentThought', thought });
                    }
                }
            );

            // 保存最终答案
            if (result.answer && result.answer.trim()) {
                this._postMessage({ command: 'receiveMessage', text: result.answer, role: 'assistant' });
                this._saveMessage('assistant', result.answer);
            }

            // 如果有工具结果需要显示
            if (result.toolResults.length > 0) {
                for (const toolResult of result.toolResults) {
                    // 处理文件操作结果
                    if (toolResult.type === 'edit_file' && toolResult.success) {
                        // edit_file 成功时不显示 diff，因为文件已直接写入
                        this._postMessage({
                            command: 'toolResult',
                            type: 'edit_file',
                            data: toolResult.data
                        });
                    } else if (toolResult.type === 'read_file' && toolResult.success) {
                        this._postMessage({
                            command: 'toolResult',
                            type: 'read_file',
                            data: toolResult.data
                        });
                    } else if (toolResult.type === 'list_files' && toolResult.success) {
                        this._postMessage({
                            command: 'toolResult',
                            type: 'list_files',
                            data: toolResult.data
                        });
                    } else if (toolResult.type === 'search_code' && toolResult.success) {
                        this._postMessage({
                            command: 'toolResult',
                            type: 'search_files',
                            data: toolResult.data
                        });
                    } else if (!toolResult.success) {
                        // 工具执行失败
                        this._postMessage({
                            command: 'toolError',
                            type: toolResult.type,
                            error: toolResult.error || 'Tool execution failed'
                        });
                    }
                }
            }

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this._postMessage({ command: 'receiveMessage', text: 'Error: ' + msg, role: 'error' });
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

## 可用工具
当你需要操作文件或执行命令时，使用以下工具（用 \`\`\`tool 代码块）：

### read_file — 读取文件
\`\`\`tool
tool_name: read_file
path: src/main.ts
start_line: 1
end_line: 50
\`\`\`

### write_file — 写入文件
\`\`\`tool
tool_name: write_file
path: src/new-file.ts
content: // file content here
\`\`\`

### edit_file — 精确替换（old_text 必须在文件中唯一）
\`\`\`tool
tool_name: edit_file
path: src/main.ts
old_text: const old = "value"
new_text: const updated = "newValue"
\`\`\`

### search_files — 搜索代码
\`\`\`tool
tool_name: search_files
query: functionName
include: *.ts
\`\`\`

### list_files — 列出目录
\`\`\`tool
tool_name: list_files
path: src
recursive: true
max_depth: 2
\`\`\`

### execute_command — 执行终端命令
\`\`\`tool
tool_name: execute_command
command: npm test
\`\`\`

### create_directory — 创建目录
\`\`\`tool
tool_name: create_directory
path: src/utils
\`\`\`

### delete_file — 删除文件
\`\`\`tool
tool_name: delete_file
path: src/old-file.ts
\`\`\`

### move_file — 移动/重命名
\`\`\`tool
tool_name: move_file
source: src/old.ts
destination: src/new.ts
\`\`\`

### get_diagnostics — 获取诊断信息
\`\`\`tool
tool_name: get_diagnostics
path: src/main.ts
\`\`\`

### insert_code — 在指定行插入代码
\`\`\`tool
tool_name: insert_code
path: src/main.ts
line: 10
content: const newVar = "hello";
position: after
\`\`\`

### get_symbols — 获取文件中的符号
\`\`\`tool
tool_name: get_symbols
path: src/main.ts
\`\`\`

## 工具使用规则
1. 需要读文件时，先用 read_file 或 list_files 了解结构
2. 修改文件时，用 edit_file 精确替换（不要用 write_file 覆写整个文件，除非是新文件）
3. 一次可以发多个 \`\`\`tool 块，会按顺序执行
4. 工具结果会以 [Tool Result] 格式返回
5. 先读后改，先理解再动手

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
                this._clearCurrentChat();
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

        // 知识库查询命令
        this._slashCommands.set('knowledge', {
            description: '查询知识库',
            handler: async (args) => {
                if (!args.trim()) return '用法: /knowledge <查询内容>';
                try {
                    const result = await this._client.queryKnowledge(args.trim());
                    return result.answer || '未找到相关知识';
                } catch (error: any) {
                    return `查询失败: ${error.message}`;
                }
            }
        });

        this._slashCommands.set('api', {
            description: '查询 API 文档',
            handler: async (args) => {
                if (!args.trim()) return '用法: /api <API名称>';
                try {
                    const editor = vscode.window.activeTextEditor;
                    const language = editor?.document.languageId || 'unknown';
                    const result = await this._client.queryApiDoc(args.trim(), language);
                    return result || '未找到 API 文档';
                } catch (error: any) {
                    return `查询失败: ${error.message}`;
                }
            }
        });

        this._slashCommands.set('arch', {
            description: '查询项目架构',
            handler: async () => {
                try {
                    const result = await this._client.queryArchitecture();
                    return result || '未找到架构信息';
                } catch (error: any) {
                    return `查询失败: ${error.message}`;
                }
            }
        });

        this._slashCommands.set('best', {
            description: '查询最佳实践',
            handler: async (args) => {
                if (!args.trim()) return '用法: /best <主题>';
                try {
                    const editor = vscode.window.activeTextEditor;
                    const language = editor?.document.languageId || 'unknown';
                    const result = await this._client.queryBestPractices(args.trim(), language);
                    return result || '未找到最佳实践';
                } catch (error: any) {
                    return `查询失败: ${error.message}`;
                }
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

        // Find or create a tab for this session
        let tab = this._openTabs.find(t => t.id === sessionId);
        if (!tab) {
            const title = session.messages.length > 0 ? session.messages[0].text.slice(0, 20) : 'New Chat';
            tab = { id: sessionId, title };
            this._openTabs.push(tab);
        }

        this._activeTabId = sessionId;
        this._currentSessionId = session.id;
        this._chatHistory = session.messages;
        this._client.resetConversation();
        this._postMessage({ command: 'clearChat' });
        this._postMessage({ command: 'restoreHistory', messages: session.messages });
        this._sendTabUpdate();
    }

    /**
     * 清空当前聊天 — 删除当前session + 重置tab
     */
    private _clearCurrentChat(): void {
        // Delete current session from storage
        if (this._extensionContext && this._currentSessionId) {
            const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
            delete sessions[this._currentSessionId];
            this._extensionContext.globalState.update('difyChatSessions', sessions);
        }

        // Reset tab to "New Chat" with temp ID
        const activeTab = this._openTabs.find(t => t.id === this._activeTabId);
        if (activeTab) {
            // If tab was linked to session, replace with new temp ID
            if (activeTab.id.startsWith('session_')) {
                const newTabId = 'tab_' + Date.now();
                activeTab.id = newTabId;
                this._activeTabId = newTabId;
            }
            activeTab.title = 'New Chat';
        }

        this._client.resetConversation();
        this._chatHistory = [];
        this._currentSessionId = '';
        this._postMessage({ command: 'clearChat' });
        this._sendSessionList();
    }

    private _deleteSession(sessionId: string): void {
        if (!this._extensionContext) return;
        const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
        delete sessions[sessionId];
        this._extensionContext.globalState.update('difyChatSessions', sessions);

        // Remove any tab linked to this session
        const tabIdx = this._openTabs.findIndex(t => t.id === sessionId);
        if (tabIdx >= 0) {
            this._openTabs.splice(tabIdx, 1);
        }

        // If deleting the active session, switch to another tab or create new
        if (this._currentSessionId === sessionId) {
            this._currentSessionId = '';
            this._chatHistory = [];
            if (this._openTabs.length > 0) {
                this._switchTab(this._openTabs[Math.min(tabIdx, this._openTabs.length - 1)].id);
            } else {
                this._newTab();
            }
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

            // Update tab title and link tab to session on first user message
            if (role === 'user' && this._chatHistory.length === 1) {
                const activeTab = this._openTabs.find(t => t.id === this._activeTabId);
                if (activeTab) {
                    activeTab.title = text.slice(0, 20) || 'New Chat';
                    // If this is a new tab (temp ID), replace with session ID
                    if (activeTab.id !== this._currentSessionId) {
                        const oldId = activeTab.id;
                        activeTab.id = this._currentSessionId;
                        // Update activeTabId if it pointed to the old temp ID
                        if (this._activeTabId === oldId) {
                            this._activeTabId = this._currentSessionId;
                        }
                    }
                }
            }
            this._sendSessionList();
        }
    }

    private _sendHistory(): void {
        if (!this._extensionContext) return;

        // Always send the session list for the history panel
        this._sendSessionList();

        // Only initialize state on first load (when no tabs exist yet)
        if (this._openTabs.length > 0) {
            // Already initialized — just send current tab state
            this._sendTabUpdate();
            // Restore the current tab's messages in the webview
            if (this._chatHistory.length > 0) {
                this._postMessage({ command: 'restoreHistory', messages: this._chatHistory });
            }
            return;
        }

        // First load — initialize from latest session
        const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
        const sessionIds = Object.keys(sessions).sort((a, b) => {
            return (sessions[b].createdAt || 0) - (sessions[a].createdAt || 0);
        });

        if (sessionIds.length > 0) {
            const latest = sessions[sessionIds[0]];
            this._currentSessionId = latest.id;
            this._chatHistory = latest.messages;
            const title = latest.messages.length > 0 ? latest.messages[0].text.slice(0, 20) : 'New Chat';
            this._openTabs.push({ id: latest.id, title });
            this._activeTabId = latest.id;
            this._postMessage({ command: 'restoreHistory', messages: latest.messages });
        } else {
            this._newTab();
        }

        this._sendTabUpdate();
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

        // Clear current chat state first
        this._postMessage({ command: 'clearChat' });

        // Load session associated with this tab (tab ID === session ID after first message)
        if (this._extensionContext && tabId.startsWith('session_')) {
            const sessions = this._extensionContext.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
            const session = sessions[tabId];
            if (session) {
                this._currentSessionId = session.id;
                this._chatHistory = session.messages;
                this._client.resetConversation();
                this._postMessage({ command: 'restoreHistory', messages: session.messages });
            }
        } else {
            // New empty tab (temp ID) — reset state
            this._currentSessionId = '';
            this._chatHistory = [];
            this._client.resetConversation();
        }

        this._sendTabUpdate();
    }

    private _closeTab(tabId: string): void {
        const idx = this._openTabs.findIndex(t => t.id === tabId);
        if (idx < 0) return;
        this._openTabs.splice(idx, 1);

        // If closing the active tab, switch to another or create new
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
                <div class="welcome-logo">D</div>
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
                        <span class="starter-icon">💡</span>
                        <div>
                            <div class="starter-label">Explain</div>
                            <div class="starter-desc">Describe what the selected code does</div>
                        </div>
                    </button>
                    <button class="starter-btn" data-prompt="Find and fix bugs in this code">
                        <span class="starter-icon">🐛</span>
                        <div>
                            <div class="starter-label">Fix Bugs</div>
                            <div class="starter-desc">Identify and resolve issues</div>
                        </div>
                    </button>
                    <button class="starter-btn" data-prompt="Refactor this code to improve readability">
                        <span class="starter-icon">🔧</span>
                        <div>
                            <div class="starter-label">Refactor</div>
                            <div class="starter-desc">Improve code structure</div>
                        </div>
                    </button>
                    <button class="starter-btn" data-prompt="Write unit tests for this code">
                        <span class="starter-icon">🧪</span>
                        <div>
                            <div class="starter-label">Write Tests</div>
                            <div class="starter-desc">Generate test cases</div>
                        </div>
                    </button>
                </div>
            </div>

            <!-- Thinking Indicator -->
            <div class="thinking" id="thinking">
                <div class="thinking-dots">
                    <div class="thinking-dot"></div>
                    <div class="thinking-dot"></div>
                    <div class="thinking-dot"></div>
                </div>
                <span class="thinking-text">Agent is thinking...</span>
            </div>
        </div>

        <!-- Input Area — Premium Design -->
        <div class="input-area">
            <!-- Context Tags -->
            <div class="context-tags" id="inputContext"></div>

            <!-- Input Container -->
            <div class="input-container">
                <!-- @File Autocomplete Dropdown -->
                <div class="file-dropdown" id="fileDropdown"></div>

                <!-- Slash Command Dropdown -->
                <div class="slash-dropdown" id="slashDropdown"></div>

                <!-- Input Box -->
                <div class="input-box">
                    <div class="input-wrapper">
                        <textarea id="userInput" placeholder="Tell me what to build... (type @ for files, / for commands)" rows="1"></textarea>
                    </div>
                    <button id="sendBtn" title="Send (Enter)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"/>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                    </button>
                </div>

                <!-- Input Footer -->
                <div class="input-footer">
                    <!-- Mode Dropdown -->
                    <div class="mode-dropdown" id="modeDropdown">
                        <button class="mode-trigger" id="modeTrigger">
                            <span class="mode-trigger-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="3"/>
                                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                                </svg>
                            </span>
                            <span id="currentModeText">Agent</span>
                            <span class="mode-trigger-chevron">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6 9 12 15 18 9"/>
                                </svg>
                            </span>
                        </button>

                        <!-- Dropdown Menu -->
                        <div class="mode-menu" id="modeMenu"></div>
                    </div>

                    <!-- Keyboard Shortcuts -->
                    <div class="input-hints">
                        <span class="input-hint"><kbd>Enter</kbd> send</span>
                        <span class="input-hint"><kbd>Shift+Enter</kbd> newline</span>
                    </div>

                    <!-- Toolbar Actions -->
                    <div class="toolbar-actions">
                        <button class="action-btn" id="historyBtn" title="History">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                        </button>
                        <button class="action-btn" id="clearBtn" title="Clear">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                        <button class="action-btn" id="settingsBtn" title="Settings">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                            </svg>
                        </button>
                    </div>
                </div>
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
