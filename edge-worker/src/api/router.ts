/**
 * API Router
 * 
 * Central routing logic for all API endpoints
 */

import { handleHealthCheck } from './routes/health';
import { handleError } from './error-handler';
import { getOrCreateCorrelationId, addCorrelationIdToResponse } from './middleware/correlation';
import { requireAuth } from './middleware/auth';
import { Logger } from '../observability/logger';

export interface RouterContext {
    env: any;
    ctx: ExecutionContext;
    logger: Logger;
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

        // Route to handlers
        if (url.pathname.startsWith('/api/chat')) {
            // TODO: Implement chat routes
            return new Response('Chat API - TODO', { status: 501 });
        }

        if (url.pathname.startsWith('/api/tasks')) {
            // TODO: Implement task routes
            return new Response('Task API - TODO', { status: 501 });
        }

        if (url.pathname.startsWith('/api/tools')) {
            // TODO: Implement tool routes
            return new Response('Tools API - TODO', { status: 501 });
        }

        // 404
        return new Response('Not Found', { status: 404 });

    } catch (error) {
        const response = handleError(error as Error, correlationId.toString(), context.logger);
        return addCorrelationIdToResponse(response, correlationId);
    }
}
