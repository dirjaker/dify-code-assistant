/**
 * Diff 引擎 — 生成和应用代码差异
 */

export interface DiffHunk {
    type: 'add' | 'remove' | 'context';
    line: number;
    content: string;
}

export interface FileDiff {
    filePath: string;
    hunks: DiffHunk[];
    oldContent: string;
    newContent: string;
    additions: number;
    deletions: number;
}

/**
 * 生成两个文本之间的 diff
 */
export function generateDiff(oldContent: string, newContent: string, filePath: string): FileDiff {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const hunks: DiffHunk[] = [];

    // 大文件保护：超过 5000 行跳过 LCS，使用简单 diff
    if (oldLines.length > 5000 || newLines.length > 5000) {
        const maxLen = Math.max(oldLines.length, newLines.length);
        let additions = 0;
        let deletions = 0;
        for (let i = 0; i < maxLen; i++) {
            if (i >= oldLines.length) {
                hunks.push({ type: 'add', content: newLines[i], line: i + 1 });
                additions++;
            } else if (i >= newLines.length) {
                hunks.push({ type: 'remove', content: oldLines[i], line: i + 1 });
                deletions++;
            } else if (oldLines[i] !== newLines[i]) {
                hunks.push({ type: 'remove', content: oldLines[i], line: i + 1 });
                hunks.push({ type: 'add', content: newLines[i], line: i + 1 });
                additions++;
                deletions++;
            } else {
                hunks.push({ type: 'context', content: oldLines[i], line: i + 1 });
            }
        }
        return { filePath, hunks, oldContent, newContent, additions, deletions };
    }

    // 使用简单的 LCS diff 算法
    const lcs = computeLCS(oldLines, newLines);
    const diff = backtrackDiff(oldLines, newLines, lcs);

    let additions = 0;
    let deletions = 0;

    for (const item of diff) {
        if (item.type === 'add') { additions++; }
        if (item.type === 'remove') { deletions++; }
        hunks.push(item);
    }

    return {
        filePath,
        hunks,
        oldContent,
        newContent,
        additions,
        deletions
    };
}

/**
 * 将 diff 格式化为 Webview 可渲染的 HTML
 */
export function diffToHtml(diff: FileDiff): string {
    const lines: string[] = [];
    lines.push(`<div class="diff-file">`);
    lines.push(`<div class="diff-header">`);
    lines.push(`<span class="diff-path">${escapeHtml(diff.filePath)}</span>`);
    lines.push(`<span class="diff-stats">`);
    lines.push(`<span class="diff-add">+${diff.additions}</span>`);
    lines.push(`<span class="diff-del">-${diff.deletions}</span>`);
    lines.push(`</span>`);
    lines.push(`</div>`);
    lines.push(`<div class="diff-body">`);

    for (const hunk of diff.hunks) {
        const cls = hunk.type === 'add' ? 'diff-line-add' :
                    hunk.type === 'remove' ? 'diff-line-del' : 'diff-line-ctx';
        const prefix = hunk.type === 'add' ? '+' :
                       hunk.type === 'remove' ? '-' : ' ';
        lines.push(`<div class="${cls}"><span class="diff-prefix">${prefix}</span><span class="diff-content">${escapeHtml(hunk.content)}</span></div>`);
    }

    lines.push(`</div>`);
    lines.push(`</div>`);
    return lines.join('\n');
}

/**
 * 将 diff 格式化为纯文本（发送给 AI）
 */
export function diffToText(diff: FileDiff): string {
    const lines: string[] = [];
    lines.push(`--- a/${diff.filePath}`);
    lines.push(`+++ b/${diff.filePath}`);

    for (const hunk of diff.hunks) {
        const prefix = hunk.type === 'add' ? '+' :
                       hunk.type === 'remove' ? '-' : ' ';
        lines.push(`${prefix}${hunk.content}`);
    }

    return lines.join('\n');
}

// --- LCS 算法 ---

interface DiffItem {
    type: 'add' | 'remove' | 'context';
    line: number;
    content: string;
}

function computeLCS(a: string[], b: string[]): number[][] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    return dp;
}

function backtrackDiff(a: string[], b: string[], dp: number[][]): DiffItem[] {
    const result: DiffItem[] = [];
    let i = a.length;
    let j = b.length;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            result.unshift({ type: 'context', line: i, content: a[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: 'add', line: j, content: b[j - 1] });
            j--;
        } else if (i > 0) {
            result.unshift({ type: 'remove', line: i, content: a[i - 1] });
            i--;
        }
    }

    return result;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
