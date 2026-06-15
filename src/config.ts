import * as vscode from 'vscode';

export interface DifyConfig {
    apiUrl: string;
    apiKey: string;
    model: string;
    enableAutocomplete: boolean;
    maxTokens: number;
}

export function getConfig(): DifyConfig {
    const config = vscode.workspace.getConfiguration('dify');
    return {
        apiUrl: config.get<string>('apiUrl', 'http://192.168.31.100:9000'),
        apiKey: config.get<string>('apiKey', ''),
        model: config.get<string>('model', 'deepseek-coder'),
        enableAutocomplete: config.get<boolean>('enableAutocomplete', true),
        maxTokens: config.get<number>('maxTokens', 2048)
    };
}

export function validateConfig(config: DifyConfig): string | null {
    if (!config.apiUrl) {
        return 'Dify API URL is not configured. Please set dify.apiUrl in settings.';
    }
    if (!config.apiKey) {
        return 'Dify API Key is not configured. Please set dify.apiKey in settings.';
    }
    return null;
}
