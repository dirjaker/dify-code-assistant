import * as vscode from 'vscode';

/**
 * 装饰管理器 — 行内代码高亮
 * 用于标记 AI 修改的代码行（新增/删除/修改）
 */
export class DecorationManager {
    private addedDecorationType: vscode.TextEditorDecorationType;
    private removedDecorationType: vscode.TextEditorDecorationType;
    private modifiedDecorationType: vscode.TextEditorDecorationType;
    private activeDecorations: Map<string, vscode.TextEditorDecorationType[]> = new Map();

    constructor() {
        // 新增行 — 左侧绿色竖条 + 浅绿背景
        this.addedDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: 'rgba(78, 201, 176, 0.08)',
            overviewRulerColor: 'rgba(78, 201, 176, 0.6)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            before: {
                contentText: '+',
                color: '#4ec9b0',
                fontWeight: 'bold',
                margin: '0 8px 0 4px',
                width: '12px'
            }
        });

        // 删除行 — 左侧红色竖条 + 浅红背景
        this.removedDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: 'rgba(244, 71, 71, 0.08)',
            overviewRulerColor: 'rgba(244, 71, 71, 0.6)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            before: {
                contentText: '-',
                color: '#f44747',
                fontWeight: 'bold',
                margin: '0 8px 0 4px',
                width: '12px'
            }
        });

        // 修改行 — 左侧黄色竖条 + 浅黄背景
        this.modifiedDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: 'rgba(215, 186, 125, 0.08)',
            overviewRulerColor: 'rgba(215, 186, 125, 0.6)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            before: {
                contentText: '~',
                color: '#d7ba7d',
                fontWeight: 'bold',
                margin: '0 8px 0 4px',
                width: '12px'
            }
        });
    }

    /**
     * 在编辑器中高亮新增的行
     * @param uri 文件 URI
     * @param ranges 行范围数组 [startLine, endLine]（0-indexed）
     */
    highlightAddedLines(uri: vscode.Uri, ranges: [number, number][]): void {
        this.applyDecoration(uri, this.addedDecorationType, ranges);
    }

    /**
     * 高亮删除的行（以 decoration 形式展示在对应位置）
     */
    highlightRemovedLines(uri: vscode.Uri, ranges: [number, number][]): void {
        this.applyDecoration(uri, this.removedDecorationType, ranges);
    }

    /**
     * 高亮修改的行
     */
    highlightModifiedLines(uri: vscode.Uri, ranges: [number, number][]): void {
        this.applyDecoration(uri, this.modifiedDecorationType, ranges);
    }

    /**
     * 从 diff 结果自动高亮
     * @param uri 文件 URI
     * @param addedLines 新增行号数组（0-indexed）
     * @param removedLines 删除行号数组（0-indexed）
     * @param modifiedLines 修改行号数组（0-indexed）
     */
    highlightDiff(
        uri: vscode.Uri,
        addedLines: number[],
        removedLines: number[],
        modifiedLines: number[] = []
    ): void {
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === uri.toString()
        );

        if (!editor) { return; }

        // 转换为 ranges
        const toRanges = (lines: number[]): vscode.Range[] => {
            return lines.map(line => new vscode.Range(line, 0, line, 0));
        };

        if (addedLines.length > 0) {
            editor.setDecorations(this.addedDecorationType, toRanges(addedLines));
        }
        if (removedLines.length > 0) {
            editor.setDecorations(this.removedDecorationType, toRanges(removedLines));
        }
        if (modifiedLines.length > 0) {
            editor.setDecorations(this.modifiedDecorationType, toRanges(modifiedLines));
        }

        // 记录活跃的装饰
        this.activeDecorations.set(uri.toString(), [
            this.addedDecorationType,
            this.removedDecorationType,
            this.modifiedDecorationType
        ]);
    }

    /**
     * 清除指定文件的所有装饰
     */
    clearDecorations(uri: vscode.Uri): void {
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === uri.toString()
        );

        if (editor) {
            editor.setDecorations(this.addedDecorationType, []);
            editor.setDecorations(this.removedDecorationType, []);
            editor.setDecorations(this.modifiedDecorationType, []);
        }

        this.activeDecorations.delete(uri.toString());
    }

    /**
     * 清除所有文件的装饰
     */
    clearAllDecorations(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.addedDecorationType, []);
            editor.setDecorations(this.removedDecorationType, []);
            editor.setDecorations(this.modifiedDecorationType, []);
        }
        this.activeDecorations.clear();
    }

    private applyDecoration(
        uri: vscode.Uri,
        decorationType: vscode.TextEditorDecorationType,
        ranges: [number, number][]
    ): void {
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === uri.toString()
        );

        if (!editor) { return; }

        const vscodeRanges = ranges.map(
            ([start, end]) => new vscode.Range(start, 0, end, 0)
        );

        editor.setDecorations(decorationType, vscodeRanges);

        // 记录
        const key = uri.toString();
        const existing = this.activeDecorations.get(key) || [];
        if (!existing.includes(decorationType)) {
            existing.push(decorationType);
            this.activeDecorations.set(key, existing);
        }
    }

    dispose(): void {
        this.addedDecorationType.dispose();
        this.removedDecorationType.dispose();
        this.modifiedDecorationType.dispose();
    }
}
