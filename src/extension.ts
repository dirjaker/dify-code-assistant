import * as vscode from 'vscode';
import { DifyClient } from './difyClient';
import { ChatPanel } from './chatPanel';
import { CompletionProvider } from './completionProvider';
import { getConfig, validateConfig } from './config';

let client: DifyClient;
let completionProvider: CompletionProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Dify Code Assistant is now active!');

    // Initialize client
    const config = getConfig();
    client = new DifyClient(config);

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
            checkConfigAndRun(() => ChatPanel.createOrShow(client));
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
    statusBarItem.tooltip = "Open Dify Code Assistant";
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

async function handleCodeAction(action: 'explain' | 'refactor' | 'fix'): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    
    if (!selectedText) {
        vscode.window.showWarningMessage('No code selected');
        return;
    }

    const languageId = editor.document.languageId;
    const prompts: Record<string, string> = {
        explain: `Explain the following ${languageId} code in detail:\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\``,
        refactor: `Refactor the following ${languageId} code to improve readability and performance:\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\`\n\nProvide the refactored code with explanations.`,
        fix: `Find and fix any bugs in the following ${languageId} code:\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\`\n\nProvide the fixed code with explanations.`
    };

    // Open chat panel
    ChatPanel.createOrShow(client);
    
    // Send the action to chat
    setTimeout(async () => {
        try {
            const response = await client.chat(prompts[action]);
            ChatPanel.sendToChat(response.answer);
        } catch (error: any) {
            ChatPanel.sendToChat(`Error: ${error.message}`);
        }
    }, 500);
}

export function deactivate() {
    console.log('Dify Code Assistant is deactivated');
}
