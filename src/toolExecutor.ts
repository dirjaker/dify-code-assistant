import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileSystemProvider } from './fileSystem';
import { generateDiff, FileDiff } from './diffEngine';
import { DecorationManager } from './decorationManager';
import { ModeManager } from './modeManager';

/**
 * Diff 确认管理器
 * 
 * 职责：管理文件修改的 diff 预览和用户确认流程。
 * 工具执行统一走 toolServer.ts（HTTP 服务器），本模块只负责：
 * - 存储待确认的文件写入
 * - 计算 diff
 * - 用户确认后写入文件 + 高亮变更
 */
export class ToolExecutor {
    private fs: FileSystemProvider;
    private decorationManager: DecorationManager;
    private pendingWrites: Map<string, { oldContent: string; newContent: string; reason: string }> = new Map();

    constructor(fs: FileSystemProvider, _modeManager: ModeManager, decorationManager: DecorationManager) {
        this.fs = fs;
        this.decorationManager = decorationManager;
    }

    /**
     * 添加待确认的写入
     */
    addPendingWrite(filePath: string, newContent: string, reason: string = ''): FileDiff {
        const oldFile = this.fs.getWorkspaceRoot()
            ? this.readFileSync(filePath)
            : '';
        const diff = generateDiff(oldFile, newContent, filePath);
        this.pendingWrites.set(filePath, { oldContent: oldFile, newContent, reason });
        return diff;
    }

    /**
     * 获取所有待确认的写入
     */
    getPendingWrites(): Map<string, { oldContent: string; newContent: string; reason: string }> {
        return this.pendingWrites;
    }

    /**
     * 确认并应用写入 — 写入文件 + 打开编辑器 + 高亮变更
     */
    async applyPendingWrite(filePath: string): Promise<boolean> {
        const pending = this.pendingWrites.get(filePath);
        if (!pending) return false;

        const root = this.fs.getWorkspaceRoot();
        if (!root) return false;

        const absolutePath = filePath.startsWith('/') ? filePath : path.join(root, filePath);

        try {
            // 写入文件
            await fs.promises.writeFile(absolutePath, pending.newContent, 'utf-8');

            // 打开文件到编辑器
            const uri = vscode.Uri.file(absolutePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document, { preview: false });

            // 计算 diff 并高亮
            const diff = generateDiff(pending.oldContent, pending.newContent, filePath);
            this.applyDiffDecorations(editor, diff);

            this.pendingWrites.delete(filePath);
            return true;
        } catch (error) {
            console.error(`Failed to apply write to ${filePath}:`, error);
            return false;
        }
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
        for (const [filePath] of Array.from(this.pendingWrites.entries())) {
            const success = await this.applyPendingWrite(filePath);
            if (success) applied.push(filePath);
        }
        return applied;
    }

    /**
     * 清除所有高亮
     */
    clearAllDecorations(): void {
        this.decorationManager.clearAllDecorations();
    }

    // ── 内部方法 ──

    private readFileSync(filePath: string): string {
        const root = this.fs.getWorkspaceRoot();
        if (!root) return '';
        const absolutePath = filePath.startsWith('/') ? filePath : path.join(root, filePath);
        try {
            return fs.readFileSync(absolutePath, 'utf-8');
        } catch {
            return '';
        }
    }

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
            } else {
                lineNum++;
            }
        }

        this.decorationManager.highlightDiff(editor.document.uri, addedLines, removedLines);
    }
}

// 导出类型供外部使用
export interface ToolCall {
    type: string;
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
