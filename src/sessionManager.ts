import * as vscode from 'vscode';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    text: string;
    ts: number;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    mode: string;
    createdAt: number;
    updatedAt?: number;
}

/**
 * 会话管理器 - 负责聊天会话的创建、保存、加载和切换
 */
export class SessionManager {
    private _sessions: Record<string, ChatSession> = {};
    private _currentSessionId: string = '';
    private _idCounter: number = 0;
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._loadSessions();
    }

    get currentSessionId(): string { return this._currentSessionId; }
    get currentSession(): ChatSession | undefined {
        return this._sessions[this._currentSessionId];
    }
    get sessions(): Record<string, ChatSession> { return this._sessions; }

    private _generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${++this._idCounter}`;
    }

    private _loadSessions(): void {
        this._sessions = this._context.globalState.get<Record<string, ChatSession>>('difyChatSessions', {});
    }

    private _saveSessions(): void {
        this._context.globalState.update('difyChatSessions', this._sessions);
    }

    createSession(mode: string): string {
        const sessionId = this._generateId('session');
        this._sessions[sessionId] = {
            id: sessionId,
            title: 'New Chat',
            messages: [],
            mode,
            createdAt: Date.now()
        };
        this._currentSessionId = sessionId;
        this._saveSessions();
        return sessionId;
    }

    switchSession(sessionId: string): boolean {
        if (this._sessions[sessionId]) {
            this._currentSessionId = sessionId;
            return true;
        }
        return false;
    }

    addMessage(role: 'user' | 'assistant' | 'system', text: string): void {
        if (!this._currentSessionId) {
            this.createSession('ask');
        }

        const session = this._sessions[this._currentSessionId];
        if (session) {
            session.messages.push({ role, text, ts: Date.now() });
            session.updatedAt = Date.now();

            // 自动设置标题（使用第一条用户消息）
            if (role === 'user' && session.messages.filter(m => m.role === 'user').length === 1) {
                session.title = text.substring(0, 50) + (text.length > 50 ? '...' : '');
            }

            this._saveSessions();
        }
    }

    getMessages(): ChatMessage[] {
        const session = this._sessions[this._currentSessionId];
        return session ? [...session.messages] : [];
    }

    deleteSession(sessionId: string): void {
        delete this._sessions[sessionId];
        if (this._currentSessionId === sessionId) {
            const remaining = Object.keys(this._sessions);
            this._currentSessionId = remaining.length > 0 ? remaining[remaining.length - 1] : '';
        }
        this._saveSessions();
    }

    clearCurrentSession(): void {
        if (this._currentSessionId && this._sessions[this._currentSessionId]) {
            this._sessions[this._currentSessionId].messages = [];
            this._saveSessions();
        }
    }

    resetConversation(): void {
        this._currentSessionId = '';
    }

    getSessionList(): Array<{ id: string; title: string; mode: string; updatedAt?: number }> {
        return Object.values(this._sessions).map(s => ({
            id: s.id,
            title: s.title,
            mode: s.mode,
            updatedAt: s.updatedAt
        }));
    }

    updateSessionMode(mode: string): void {
        if (this._currentSessionId && this._sessions[this._currentSessionId]) {
            this._sessions[this._currentSessionId].mode = mode;
            this._saveSessions();
        }
    }
}
