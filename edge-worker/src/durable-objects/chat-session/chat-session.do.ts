import { DurableObject } from 'cloudflare:workers';
import { Env } from '../../env';
import { createErrorResponse, getPrincipalIdFromRequest } from '../../http';
import { WebSocketManager } from './websocket.manager';
import { StorageManager } from './storage.manager';
import { LLMHandler } from './llm.handler';
import { WSMessage } from './types';

export class ChatSessionDO extends DurableObject<Env> {
    private wsManager: WebSocketManager;
    private storage: StorageManager;
    private llm: LLMHandler;

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
        this.wsManager = new WebSocketManager(state);
        this.storage = new StorageManager(env.DB, this.wsManager);
        this.llm = new LLMHandler(env, this.storage);
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (request.headers.get('Upgrade') === 'websocket') {
            return this.wsManager.handleUpgrade(request, this.ctx);
        }

        if (request.method === 'POST' && url.pathname === '/chat') {
            return this.handleChat(request);
        }

        if (request.method === 'POST' && url.pathname === '/log') {
            return this.handleLog(request);
        }

        return new Response('Not found', { status: 404 });
    }

    async alarm() {
        await this.storage.cleanup();
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
        try {
            const data = JSON.parse(message.toString()) as WSMessage;
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        } catch (err) {
            // Ignore invalid messages
        }
    }

    async webSocketClose(ws: WebSocket) {
        this.wsManager.removeSession(ws);
    }

    async webSocketError(ws: WebSocket) {
        this.wsManager.removeSession(ws);
    }

    private async handleChat(request: Request): Promise<Response> {
        const correlationId = request.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
        const body = await request.json().catch(() => null) as any;

        if (!body?.messages || !Array.isArray(body.messages)) {
            return createErrorResponse('VALIDATION_ERROR', 'Invalid messages', 400, correlationId);
        }

        const principalId = getPrincipalIdFromRequest(request);
        const conversationId = body.conversation_id || crypto.randomUUID();
        const userContent = body.messages.reverse().find((m: any) => m.role === 'user')?.content;

        // Schedule cleanup
        await this.ctx.storage.setAlarm(Date.now() + 7 * 24 * 60 * 60 * 1000);

        return this.llm.processChat(
            body.messages,
            userContent,
            conversationId,
            principalId,
            correlationId,
            body.stream !== false
        );
    }

    private async handleLog(request: Request): Promise<Response> {
        const body = await request.json() as any;
        await this.storage.logTurn({
            principalId: body.principal_id,
            conversationId: body.conversation_id,
            correlationId: body.correlation_id,
            userMessage: body.user_message,
            assistantMessage: body.assistant_message
        });
        return new Response(null, { status: 204 });
    }
}
