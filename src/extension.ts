import * as vscode from 'vscode';
import { DifyClient } from './difyClient';
import { ChatViewProvider } from './chatPanel';
import { CompletionProvider } from './completionProvider';
import { getConfig, validateConfig } from './config';

let client: DifyClient;
let completionProvider: CompletionProvider;
let chatViewProvider: ChatViewProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Dify Code Assistant is now active!');

    // Initialize client
    const config = getConfig();
    client = new DifyClient(config);

    // Register chat view provider (sidebar)
    chatViewProvider = new ChatViewProvider(context.extensionUri, client);
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

    // Register completion provider
    completionProvider = new CompletionProvider(client);
    const completionDisposable = vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' },
        completionProvider
    );
    context.subscriptions.push(completionDisposable);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('dify.openChat', () => {
            checkConfigAndRun(() => {
                // 聚焦到侧边栏的聊天视图
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

    // Watch for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('dify')) {
                const newConfig = getConfig();
                client.updateConfig(newConfig);
                completionProvider.clearCache();
            }
        })
    );

    // Status bar
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = "$(comment-discussion) Dify";
    statusBarItem.tooltip = "打开 Dify AI 助手";
    statusBarItem.command = 'dify.openChat';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

function checkConfigAndRun(fn: () => void): void {
    const config = getConfig();
    const error = validateConfig(config);
    if (error) {
        vscode.window.showErrorMessage(error, '打开设置').then((selection) => {
            if (selection === '打开设置') {
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
        vscode.window.showWarningMessage('请先打开一个文件');
        return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText && action !== 'complete') {
        vscode.window.showWarningMessage('请先选中代码');
        return;
    }

    const languageId = editor.document.languageId;
    const prompts: Record<string, string> = {
        explain: `请详细解释以下 ${languageId} 代码的作用和逻辑：\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\``,
        refactor: `请重构以下 ${languageId} 代码，提高可读性和性能：\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\`\n\n请提供重构后的代码并解释改进点。`,
        fix: `请找出并修复以下 ${languageId} 代码中的问题：\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\`\n\n请提供修复后的代码并解释问题原因。`,
        complete: selectedText 
            ? `请根据以下代码上下文，补全或生成代码：\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\``
            : `请帮我生成 ${languageId} 代码。`
    };

    // 确保聊天视图可见
    await vscode.commands.executeCommand('difyChatView.focus');
    
    // 发送消息到聊天视图
    setTimeout(async () => {
        chatViewProvider.sendToChat(prompts[action], 'user');
        
        // 触发 AI 响应
        try {
            const systemPrompt = `你是一个专业的 AI 编程助手，运行在 VS Code 编辑器中。你的职责是帮助开发者高效完成编程任务。

## 回答规范

1. 代码块使用 Markdown 格式，标注语言类型
2. 修改现有代码时，输出完整文件或明确标注修改部分
3. 涉及多个文件时，按文件名分组展示
4. 简单问题简洁回答，复杂问题详细解释
5. 如果不确定，诚实说明并给出可能的解决方案
6. 默认使用中文回答，代码注释也使用中文`;

            const response = await client.chat(prompts[action], systemPrompt);
            chatViewProvider.sendToChat(response.answer, 'assistant');
        } catch (error: any) {
            chatViewProvider.sendToChat(`❌ 错误: ${error.message}`, 'error');
        }
    }, 300);
}

export function deactivate() {
    console.log('Dify Code Assistant is deactivated');
}
