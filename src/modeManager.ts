/**
 * 模式管理器 — Ask / Plan / Agent 三种交互模式
 */

export type AgentMode = 'ask' | 'plan' | 'agent';

export interface ModeConfig {
    name: string;
    label: string;
    description: string;
    systemPromptSuffix: string;
    canWriteFiles: boolean;
    canRunCommands: boolean;
    canAutoApply: boolean;
    requiresConfirmation: boolean;
}

export const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
    ask: {
        name: 'ask',
        label: 'Ask',
        description: '问答模式 — 只回答问题，不修改代码',
        systemPromptSuffix: `
## 模式：Ask（问答）
你处于问答模式。只回答用户的问题，提供解释和建议。
- 不要主动修改任何文件
- 不要输出 action 指令
- 专注于解释、分析、建议
- 如果用户要求修改代码，给出详细的修改方案供参考
`,
        canWriteFiles: false,
        canRunCommands: false,
        canAutoApply: false,
        requiresConfirmation: false
    },
    plan: {
        name: 'plan',
        label: 'Plan',
        description: '规划模式 — 分析任务，生成执行计划',
        systemPromptSuffix: `
## 模式：Plan（规划）
你处于规划模式。分析用户的任务，生成详细的执行计划。
- 先阅读相关文件，理解现状
- 生成分步执行计划，每步说明：做什么、为什么、影响哪些文件
- 不要直接执行修改，等用户确认计划
- 计划确认后，用户可以切换到 Agent 模式执行
- 使用 read_file 读取需要分析的文件
`,
        canWriteFiles: false,
        canRunCommands: false,
        canAutoApply: false,
        requiresConfirmation: true
    },
    agent: {
        name: 'agent',
        label: 'Agent',
        description: '代理模式 — 自主读写代码、执行操作',
        systemPromptSuffix: `
## 模式：Agent（代理）
你处于代理模式。可以自主读写代码、执行操作。
- 可以读取文件了解现状
- 可以直接修改代码文件
- 修改前先说明你要做什么，然后输出 write_file action
- 每次修改后说明改动内容
- 遵循项目现有代码风格
- 修改要精确，不要重写不需要改的部分
`,
        canWriteFiles: true,
        canRunCommands: true,
        canAutoApply: true,
        requiresConfirmation: false
    }
};

export class ModeManager {
    private currentMode: AgentMode = 'ask';
    private listeners: ((mode: AgentMode) => void)[] = [];

    getMode(): AgentMode {
        return this.currentMode;
    }

    getModeConfig(): ModeConfig {
        return MODE_CONFIGS[this.currentMode];
    }

    setMode(mode: AgentMode): void {
        this.currentMode = mode;
        this.listeners.forEach(fn => fn(mode));
    }

    onModeChange(fn: (mode: AgentMode) => void): void {
        this.listeners.push(fn);
    }

    canWriteFiles(): boolean {
        return MODE_CONFIGS[this.currentMode].canWriteFiles;
    }

    canRunCommands(): boolean {
        return MODE_CONFIGS[this.currentMode].canRunCommands;
    }

    getSystemPromptSuffix(): string {
        return MODE_CONFIGS[this.currentMode].systemPromptSuffix;
    }
}
