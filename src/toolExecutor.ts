import * as vscode from 'vscode';
import { FileSystemProvider } from './fileSystem';
import { generateDiff, diffToHtml, diffToText, FileDiff } from './diffEngine';
import { ModeManager } from './modeManager';

/**
 * AI 工具调用协议
 */
export interface ToolCall {
    type: 'read_file' | 'write_file' | 'list_files' | 'search_files' | 'get_editor';
    path?: string;
    content?: string;
    query?: string;
    reason?: string;
}

export interface ToolResult {
    type: string;
    success: boolean;
    data: string;
    diff?: FileDiff;
}

/**
 * 工具执行器 — 解析和执行 AI 返回的工具调用
 */
export class ToolExecutor {
    private fs: FileSystemProvider;
    private modeManager: ModeManager;
    private pendingWrites: Map<string, { oldContent: string; newContent: string; reason: string }> = new Map();

    constructor(fs: FileSystemProvider, modeManager: ModeManager) {
        this.fs = fs;
        this.modeManager = modeManager;
    }

    /**
     * 从 AI 响应中提取工具调用
     */
    parseToolCalls(response: string): ToolCall[] {
        const calls: ToolCall[] = [];
        // 匹配 ```action ... ``` 代码块
        const regex = /```action\s*\n([\s\S]*?)```/g;
        let match;

        while ((match = regex.exec(response)) !== null) {
            try {
                const json = JSON.parse(match[1].trim());
                if (json.type) {
                    calls.push(json as ToolCall);
                }
            } catch {
                // 忽略无效的 action 块
            }
        }

        return calls;
    }

    /**
     * 执行单个工具调用
     */
    async executeTool(call: ToolCall): Promise<ToolResult> {
        switch (call.type) {
            case 'read_file':
                return this.executeReadFile(call.path || '');
            case 'write_file':
                return this.executeWriteFile(call.path || '', call.content || '', call.reason || '');
            case 'list_files':
                return this.executeListFiles();
            case 'search_files':
                return this.executeSearchFiles(call.query || '');
            case 'get_editor':
                return this.executeGetEditor();
            default:
                return { type: call.type, success: false, data: `Unknown tool: ${call.type}` };
        }
    }

    /**
     * 执行所有工具调用
     */
    async executeAll(calls: ToolCall[]): Promise<ToolResult[]> {
        const results: ToolResult[] = [];
        for (const call of calls) {
            results.push(await this.executeTool(call));
        }
        return results;
    }

    /**
     * 获取待确认的写入操作
     */
    getPendingWrites(): Map<string, { oldContent: string; newContent: string; reason: string }> {
        return this.pendingWrites;
    }

    /**
     * 确认并应用写入
     */
    async applyPendingWrite(filePath: string): Promise<boolean> {
        const pending = this.pendingWrites.get(filePath);
        if (!pending) { return false; }

        const success = await this.fs.writeFile(filePath, pending.newContent);
        if (success) {
            this.pendingWrites.delete(filePath);
        }
        return success;
    }

    /**
     * 拒绝写入
     */
    rejectPendingWrite(filePath: string): void {
        this.pendingWrites.delete(filePath);
    }

    /**
     * 应用所有待确认的写入
     */
    async applyAllPending(): Promise<string[]> {
        const applied: string[] = [];
        const entries = Array.from(this.pendingWrites.entries());
        for (const [filePath, pending] of entries) {
            const success = await this.fs.writeFile(filePath, pending.newContent);
            if (success) {
                applied.push(filePath);
            }
        }
        // 清除已应用的
        for (const f of applied) {
            this.pendingWrites.delete(f);
        }
        return applied;
    }

    // --- 内部执行 ---

    private async executeReadFile(filePath: string): Promise<ToolResult> {
        const file = await this.fs.readFile(filePath);
        if (!file) {
            return { type: 'read_file', success: false, data: `File not found: ${filePath}` };
        }

        const lines = file.content.split('\n');
        const numbered = lines.map((l, i) => `${i + 1} | ${l}`).join('\n');
        return {
            type: 'read_file',
            success: true,
            data: `File: ${file.relativePath} (${file.language}, ${file.lineCount} lines)\n\`\`\`${file.language}\n${numbered}\n\`\`\``
        };
    }

    private async executeWriteFile(filePath: string, content: string, reason: string): Promise<ToolResult> {
        if (!this.modeManager.canWriteFiles()) {
            return { type: 'write_file', success: false, data: 'Write not allowed in current mode' };
        }

        // 读取旧内容生成 diff
        const oldFile = await this.fs.readFile(filePath);
        const oldContent = oldFile?.content || '';
        const diff = generateDiff(oldContent, content, filePath);

        // 存入待确认队列
        this.pendingWrites.set(filePath, { oldContent, newContent: content, reason });

        return {
            type: 'write_file',
            success: true,
            data: `Pending write to ${filePath} (${diff.additions} additions, ${diff.deletions} deletions). Awaiting user confirmation.`,
            diff
        };
    }

    private async executeListFiles(): Promise<ToolResult> {
        const tree = await this.fs.getFileTree();
        return { type: 'list_files', success: true, data: tree };
    }

    private async executeSearchFiles(query: string): Promise<ToolResult> {
        const files = await this.fs.scanWorkspace();
        const matches = files
            .filter(f => f.relativePath.toLowerCase().includes(query.toLowerCase()))
            .map(f => f.relativePath)
            .slice(0, 20);

        return {
            type: 'search_files',
            success: true,
            data: matches.length > 0 ? matches.join('\n') : 'No files matched.'
        };
    }

    private async executeGetEditor(): Promise<ToolResult> {
        const editor = this.fs.getActiveEditor();
        if (!editor) {
            return { type: 'get_editor', success: false, data: 'No active editor' };
        }

        const selectedText = this.fs.getSelectedText();
        let data = `File: ${editor.relativePath} (${editor.language}, ${editor.lineCount} lines)`;

        if (selectedText) {
            data += `\nSelected code:\n\`\`\`${editor.language}\n${selectedText}\n\`\`\``;
        } else {
            // 发送完整文件内容（限制行数）
            const lines = editor.content.split('\n');
            const truncated = lines.length > 100;
            const preview = lines.slice(0, 100).map((l, i) => `${i + 1} | ${l}`).join('\n');
            data += `\n\`\`\`${editor.language}\n${preview}\n\`\`\``;
            if (truncated) { data += `\n... (${lines.length - 100} more lines)`; }
        }

        return { type: 'get_editor', success: true, data };
    }
}
