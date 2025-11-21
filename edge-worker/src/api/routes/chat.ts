/**
 * Chat Routes - POST /api/chat
 * 
 * Handles chat message sending with streaming support
 */

import { ChatService } from '../../application/chat.service';
import { validateChatRequest } from '../dto/chat.dto';
import { requireAuth } from '../middleware/auth';
import { getOrCreateCorrelationId } from '../middleware/correlation';
import { jsonResponse } from '../error-handler';
import { Logger } from '../../observability/logger';
import { Principal, CorrelationId } from '../../domain/shared';
import { Container } from '../../config/container';

export async function handleChatRequest(
    request: Request,
    principal: Principal,
    correlationId: CorrelationId,
    container: Container
): Promise<Response> {
    // Use Principal ID to scope the Durable Object (One DO per user)
    // This ensures all user sessions are coordinated
    const doId = container.chatSessions.idFromName(principal.id);
    const stub = container.chatSessions.get(doId);

    // Forward the request to the Durable Object
    // The DO handles both POST /chat and WebSocket Upgrades
    // We need to rewrite the URL to match what the DO expects (/chat)
    const url = new URL(request.url);
    url.pathname = '/chat';
    const newRequest = new Request(url.toString(), request);

    return stub.fetch(newRequest);
}
