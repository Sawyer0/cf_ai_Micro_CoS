/**
 * API Router
 * 
 * Central routing logic for all API endpoints
 */

import { handleHealthCheck } from './routes/health';
import { handleChatRequest } from './routes/chat';
import { handleTasksRequest } from './routes/tasks';
import { handleError } from './error-handler';
import { getOrCreateCorrelationId, addCorrelationIdToResponse } from './middleware/correlation';
import { requireAuth } from './middleware/auth';
import { CorrelationId } from '../domain/shared';
import { Container } from '../config/container';

export interface RouterContext {
    env: any;
    ctx: ExecutionContext;
    container: Container;
}

export async function handleRequest(
    request: Request,
    context: RouterContext
): Promise<Response> {
    const correlationId = getOrCreateCorrelationId(request);
    const url = new URL(request.url);

    try {
        // Health check (no auth required)
        if (url.pathname === '/api/health') {
            const response = await handleHealthCheck(context.env);
            return addCorrelationIdToResponse(response, correlationId);
        }

        // All other routes require authentication
        const principal = await requireAuth(request);

        // Route to handlers using container from context
        if (url.pathname.startsWith('/api/chat')) {
            const response = await handleChatRequest(
                request,
                principal,
                CorrelationId.fromString(correlationId.toString()),
                context.container
            );
            return addCorrelationIdToResponse(response, correlationId);
        }

        if (url.pathname.startsWith('/api/tasks')) {
            const response = await handleTasksRequest(
                request,
                principal,
                CorrelationId.fromString(correlationId.toString()),
                context.container
            );
            return addCorrelationIdToResponse(response, correlationId);
        }

        if (url.pathname.startsWith('/api/tools')) {
            // TODO: Implement tool routes
            return new Response('Tools API - TODO', { status: 501 });
        }

        // 404
        return new Response('Not Found', { status: 404 });

    } catch (error) {
        const response = handleError(
            error as Error,
            correlationId.toString(),
            context.container.logger
        );
        return addCorrelationIdToResponse(response, correlationId);
    }
}
