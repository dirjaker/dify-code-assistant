import * as vscode from 'vscode';
import { DifyClient } from './difyClient';
import { ChatViewProvider } from './chatPanel';
import { CompletionProvider } from './completionProvider';
import { FileSystemProvider } from './fileSystem';
import { ModeManager } from './modeManager';
import { DecorationManager } from './decorationManager';
import { InlineChatProvider } from './chatInlineProvider';
import { WorkspaceIndexer } from './workspaceIndexer';
import { getConfig, validateConfig } from './config';
import { LocalToolServer } from './toolServer';
import { ContextCollector } from './contextCollector';
import { RAGCompletionProvider } from './ragCompletionProvider';

let client: DifyClient;
let completionProvider: CompletionProvider;
let chatViewProvider: ChatViewProvider;
let fileSystem: FileSystemProvider;
let modeManager: ModeManager;
let decorationManager: DecorationManager;
let inlineChatProvider: InlineChatProvider;
let workspaceIndexer: WorkspaceIndexer;
let toolServer: LocalToolServer;
let contextCollector: ContextCollector;
let ragCompletionProvider: RAGCompletionProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Dify Code Assistant is now active!');

    // 初始化核心组件
    const config = getConfig();
    client = new DifyClient(config);
    fileSystem = new FileSystemProvider();
    modeManager = new ModeManager();
    decorationManager = new DecorationManager();

    // 初始化上下文收集器
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    contextCollector = new ContextCollector(workspaceRoot);

    // 注册侧边栏视图
    chatViewProvider = new ChatViewProvider(context.extensionUri, client, fileSystem, modeManager, decorationManager, context, workspaceIndexer);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            chatViewProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // Workspace indexer
    workspaceIndexer = new WorkspaceIndexer();

    // 启动本地工具服务器
    const outputChannel = vscode.window.createOutputChannel('Dify Code Assistant');
    toolServer = new LocalToolServer(outputChannel);
    toolServer.start().then(port => {
        outputChannel.appendLine(`[Extension] Tool server started on port ${port}`);
        // 将工具服务器端口传给 ChatViewProvider
        chatViewProvider.setToolServerPort(port);

        // 注册工具到 Dify
        client.registerTools().then(success => {
            if (success) {
                outputChannel.appendLine(`[Extension] Tools registered with Dify successfully`);
            } else {
                outputChannel.appendLine(`[Extension] Failed to register tools with Dify`);
            }
        });
    }).catch(err => {
        outputChannel.appendLine(`[Extension] Failed to start tool server: ${err.message}`);
    });

    // 注册 Inline Chat
    inlineChatProvider = new InlineChatProvider(client);
    context.subscriptions.push(
        vscode.commands.registerCommand('dify.inlineChat', () => {
            checkConfigAndRun(() => inlineChatProvider.start());
        })
    );

    // 注册代码补全
    completionProvider = new CompletionProvider(client);
    ragCompletionProvider = new RAGCompletionProvider(client, contextCollector);
    
    // 注册普通补全
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**' },
            completionProvider
        )
    );
    
    // 注册 RAG 增强补全
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**' },
            ragCompletionProvider
        )
    );

    // 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('dify.openChat', () => {
            checkConfigAndRun(() => {
                vscode.commands.executeCommand('difyChatView.focus');
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dify.explainCode', () => {
            checkConfigAndRun(() => handleCodeAction('explain'));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dify.refactorCode', () => {
            checkConfigAndRun(() => handleCodeAction('refactor'));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dify.fixCode', () => {
            checkConfigAndRun(() => handleCodeAction('fix'));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dify.completeCode', () => {
            checkConfigAndRun(() => handleCodeAction('complete'));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dify.settings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'dify');
        })
    );

    // RAG 知识库查询命令
    context.subscriptions.push(
        vscode.commands.registerCommand('dify.queryKnowledge', async () => {
            const query = await vscode.window.showInputBox({
                prompt: '输入查询内容',
                placeHolder: '例如: 如何使用 DifyClient'
            });
            if (query) {
                try {
                    const result = await client.queryKnowledge(query);
                    // 显示结果
                    const panel = vscode.window.createWebviewPanel(
                        'knowledgeResult',
                        '知识库查询结果',
                        vscode.ViewColumn.Beside,
                        { enableScripts: true }
                    );
                    panel.webview.html = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <style>
                                body {
                                    font-family: var(--vscode-font-family);
                                    padding: 20px;
                                    color: var(--vscode-foreground);
                                }
                                pre {
                                    background: var(--vscode-editor-background);
                                    padding: 12px;
                                    border-radius: 6px;
                                    overflow-x: auto;
                                }
                                code {
                                    font-family: var(--vscode-editor-font-family);
                                }
                            </style>
                        </head>
                        <body>
                            <h2>查询: ${query}</h2>
                            <div>${result.answer.replace(/\n/g, '<br>')}</div>
                        </body>
                        </html>
                    `;
                } catch (error: any) {
                    vscode.window.showErrorMessage(`查询失败: ${error.message}`);
                }
            }
        })
    );

    // 查询项目架构命令
    context.subscriptions.push(
        vscode.commands.registerCommand('dify.queryArchitecture', async () => {
            try {
                const result = await client.queryArchitecture();
                vscode.window.showInformationMessage('架构查询完成，请查看输出');
                console.log('Architecture:', result);
            } catch (error: any) {
                vscode.window.showErrorMessage(`查询失败: ${error.message}`);
            }
        })
    );

    // 查询最佳实践命令
    context.subscriptions.push(
        vscode.commands.registerCommand('dify.queryBestPractices', async () => {
            const topic = await vscode.window.showInputBox({
                prompt: '输入主题',
                placeHolder: '例如: 代码规范、设计模式'
            });
            if (topic) {
                try {
                    const editor = vscode.window.activeTextEditor;
                    const language = editor?.document.languageId || 'unknown';
                    const result = await client.queryBestPractices(topic, language);
                    vscode.window.showInformationMessage('最佳实践查询完成，请查看输出');
                    console.log('Best Practices:', result);
                } catch (error: any) {
                    vscode.window.showErrorMessage(`查询失败: ${error.message}`);
                }
            }
        })
    );

    // 监听配置变更
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('dify')) {
                const newConfig = getConfig();
                client.updateConfig(newConfig);
                completionProvider.clearCache();
            }
        })
    );

    // 状态栏
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = "$(comment-discussion) Dify";
    statusBarItem.tooltip = "Open Dify AI Assistant";
    statusBarItem.command = 'dify.openChat';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

function checkConfigAndRun(fn: () => void): void {
    const config = getConfig();
    const error = validateConfig(config);
    if (error) {
        vscode.window.showErrorMessage(error, 'Open Settings').then((selection) => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'dify');
            }
        });
        return;
    }
    fn();
}

async function handleCodeAction(action: 'explain' | 'refactor' | 'fix' | 'complete'): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText && action !== 'complete') {
        vscode.window.showWarningMessage('Select code first');
        return;
    }

    const languageId = editor.document.languageId;
    const fileName = editor.document.fileName.split(/[/\\]/).pop() || '';

    const prompts: Record<string, string> = {
        explain: `Explain the following ${languageId} code from ${fileName}:\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\``,
        refactor: `Refactor this ${languageId} code from ${fileName} to improve readability and performance:\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\`\n\nProvide the refactored code and explain the improvements.`,
        fix: `Find and fix bugs in this ${languageId} code from ${fileName}:\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\`\n\nProvide the fixed code and explain the issues.`,
        complete: selectedText
            ? `Complete or generate code based on this ${languageId} context from ${fileName}:\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\``
            : `Generate ${languageId} code.`
    };

    await vscode.commands.executeCommand('difyChatView.focus');
    setTimeout(async () => {
        chatViewProvider.sendToChat(prompts[action], 'user');
    }, 300);
}

export function deactivate() {
    console.log('Dify Code Assistant is deactivated');
}
