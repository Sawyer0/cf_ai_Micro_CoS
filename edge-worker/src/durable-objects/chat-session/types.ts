export type WSMessage =
    | { type: 'ping' }
    | { type: 'chat'; message: string; conversationId?: string };

export interface ChatSessionState {
    sessions: Set<WebSocket>;
}

export interface LogTurnArgs {
    principalId: string;
    conversationId: string;
    correlationId: string;
    userMessage?: string;
    assistantMessage: string;
}
