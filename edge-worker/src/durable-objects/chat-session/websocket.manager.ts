
export class WebSocketManager {
    private sessions: Set<WebSocket>;

    constructor(state: DurableObjectState) {
        this.sessions = new Set();
        state.getWebSockets().forEach((ws: WebSocket) => {
            this.sessions.add(ws);
        });
    }

    async handleUpgrade(request: Request, state: DurableObjectState): Promise<Response> {
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        state.acceptWebSocket(server);
        this.sessions.add(server);

        return new Response(null, { status: 101, webSocket: client });
    }

    broadcast(message: any) {
        const data = JSON.stringify(message);
        this.sessions.forEach(ws => {
            try {
                ws.send(data);
            } catch (err) {
                this.sessions.delete(ws);
            }
        });
    }

    removeSession(ws: WebSocket) {
        this.sessions.delete(ws);
    }
}
