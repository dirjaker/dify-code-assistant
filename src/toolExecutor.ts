import * as vscode from 'vscode';
import { FileSystemProvider } from './fileSystem';
import { generateDiff, diffToHtml, diffToText, FileDiff } from './diffEngine';
import { ModeManager } from './modeManager';
import { DecorationManager } from './decorationManager';

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
    private decorationManager: DecorationManager;
    private pendingWrites: Map<string, { oldContent: string; newContent: string; reason: string }> = new Map();

    constructor(fs: FileSystemProvider, modeManager: ModeManager, decorationManager: DecorationManager) {
        this.fs = fs;
        this.modeManager = modeManager;
        this.decorationManager = decorationManager;
    }

    /**
     * 从 AI 响应中提取工具调用 — 多格式容错解析
     */
    parseToolCalls(response: string): ToolCall[] {
        const calls: ToolCall[] = [];
        const seen = new Set<string>();

        // Pattern 1: ```action\n{...}\n``` (标准格式)
        const actionRegex = /```action\s*\n([\s\S]*?)```/g;
        let match;
        while ((match = actionRegex.exec(response)) !== null) {
            const parsed = this._tryParseJson(match[1].trim());
            if (parsed && parsed.type) {
                const key = JSON.stringify(parsed);
                if (!seen.has(key)) { seen.add(key); calls.push(parsed); }
            }
        }

        // Pattern 2: ```json\n{"type":"read_file",...}\n``` (JSON代码块)
        const jsonBlockRegex = /```(?:json|tool)?\s*\n([\s\S]*?)```/g;
        while ((match = jsonBlockRegex.exec(response)) !== null) {
            const parsed = this._tryParseJson(match[1].trim());
            if (parsed && parsed.type && ['read_file', 'write_file', 'list_files', 'search_files', 'get_editor'].includes(parsed.type)) {
                const key = JSON.stringify(parsed);
                if (!seen.has(key)) { seen.add(key); calls.push(parsed); }
            }
        }

        // Pattern 3: 行内 JSON {"type":"read_file",...} (无代码块)
        const inlineRegex = /\{"type"\s*:\s*"(read_file|write_file|list_files|search_files|get_editor)"[^}]*\}/g;
        while ((match = inlineRegex.exec(response)) !== null) {
            const parsed = this._tryParseJson(match[0]);
            if (parsed && parsed.type) {
                const key = JSON.stringify(parsed);
                if (!seen.has(key)) { seen.add(key); calls.push(parsed); }
            }
        }

        return calls;
    }

    private _tryParseJson(text: string): ToolCall | null {
        try {
            // 直接解析
            const obj = JSON.parse(text);
            if (obj && typeof obj.type === 'string') return obj as ToolCall;
        } catch {}
        try {
            // 修复常见格式问题：单引号、尾逗号、无引号key
            let fixed = text
                .replace(/'/g, '"')
                .replace(/,\s*([}\]])/g, '$1')
                .replace(/(\w+)\s*:/g, '"$1":');
            const obj = JSON.parse(fixed);
            if (obj && typeof obj.type === 'string') return obj as ToolCall;
        } catch {}
        return null;
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
     * 确认并应用写入 — 写入文件 + 打开编辑器 + 高亮变更
     */
    async applyPendingWrite(filePath: string): Promise<boolean> {
        const pending = this.pendingWrites.get(filePath);
        if (!pending) { return false; }

        const root = this.fs.getWorkspaceRoot();
        if (!root) { return false; }

        const absolutePath = filePath.startsWith('/') ? filePath : `${root}/${filePath}`;
        const uri = vscode.Uri.file(absolutePath);

        // 1. 写入文件
        const success = await this.fs.writeFile(filePath, pending.newContent);
        if (!success) { return false; }

        // 2. 打开文件到编辑器
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, { preview: false });

        // 3. 计算 diff 并高亮
        const diff = generateDiff(pending.oldContent, pending.newContent, filePath);
        this.applyDiffDecorations(editor, diff);

        // 4. 清除 pending
        this.pendingWrites.delete(filePath);

        return true;
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
                // 打开并高亮
                const root = this.fs.getWorkspaceRoot();
                if (root) {
                    const absolutePath = filePath.startsWith('/') ? filePath : `${root}/${filePath}`;
                    const uri = vscode.Uri.file(absolutePath);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    const editor = await vscode.window.showTextDocument(doc, { preview: false });
                    const diff = generateDiff(pending.oldContent, pending.newContent, filePath);
                    this.applyDiffDecorations(editor, diff);
                }
            }
        }
        for (const f of applied) {
            this.pendingWrites.delete(f);
        }
        return applied;
    }

    /**
     * 清除所有高亮
     */
    clearAllDecorations(): void {
        this.decorationManager.clearAllDecorations();
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
            return { type: 'write_file', success: false, data: 'Write not allowed in current mode. Switch to Agent mode.' };
        }

        const oldFile = await this.fs.readFile(filePath);
        const oldContent = oldFile?.content || '';
        const diff = generateDiff(oldContent, content, filePath);

        // 存入待确认队列
        this.pendingWrites.set(filePath, { oldContent, newContent: content, reason });

        return {
            type: 'write_file',
            success: true,
            data: `Pending write to ${filePath} (+${diff.additions} -${diff.deletions}). Awaiting confirmation.`,
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
            const lines = editor.content.split('\n');
            const truncated = lines.length > 100;
            const preview = lines.slice(0, 100).map((l, i) => `${i + 1} | ${l}`).join('\n');
            data += `\n\`\`\`${editor.language}\n${preview}\n\`\`\``;
            if (truncated) { data += `\n... (${lines.length - 100} more lines)`; }
        }

        return { type: 'get_editor', success: true, data };
    }

    /**
     * 将 diff 转换为编辑器装饰
     */
    private applyDiffDecorations(editor: vscode.TextEditor, diff: FileDiff): void {
        const addedLines: number[] = [];
        const removedLines: number[] = [];
        let lineNum = 0;

        for (const hunk of diff.hunks) {
            if (hunk.type === 'add') {
                addedLines.push(lineNum);
                lineNum++;
            } else if (hunk.type === 'remove') {
                removedLines.push(lineNum);
                // remove 行不增加 lineNum（已从文件中删除）
            } else {
                lineNum++;
            }
        }

        const uri = editor.document.uri;
        this.decorationManager.highlightDiff(uri, addedLines, removedLines);
    }
}
