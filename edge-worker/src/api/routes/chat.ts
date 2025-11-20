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

export async function handleChatPost(
    request: Request,
    chatService: ChatService,
    logger: Logger
): Promise<Response> {
    const correlationId = getOrCreateCorrelationId(request);
    const principal = await requireAuth(request);

    const body = await request.json();
    const chatRequest = validateChatRequest(body);

    const { conversation, assistantMessage } = await chatService.sendMessage(
        chatRequest.conversationId || null,
        chatRequest.message,
        principal,
        correlationId
    );

    return jsonResponse({
        conversationId: conversation.id.toString(),
        messageId: assistantMessage.id.toString(),
        content: assistantMessage.content,
        role: 'assistant',
        timestamp: assistantMessage.timestamp.toISOString()
    });
}

// Unified handler for routing
export async function handleChatRequest(
    request: Request,
    principal: Principal,
    correlationId: CorrelationId,
    container: Container
): Promise<Response> {
    if (request.method === 'POST') {
        return handleChatPost(request, container.chatService, container.logger);
    }

    return new Response('Method not allowed', { status: 405 });
}
