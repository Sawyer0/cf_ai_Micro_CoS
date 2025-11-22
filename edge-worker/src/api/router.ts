/**
 * API Router
 * 
 * Central routing logic for all API endpoints
 */

import { handleHealthCheck } from './routes/health';
import { handleChatRequest } from './routes/chat';
import { handleTasksRequest } from './routes/tasks';
import {
    handleChatConversationsRequest,
    handleChatHistoryRequest,
    handleSaveConversationRequest,
    handleDeleteConversationRequest
} from './routes/chat-history';
import { handleError } from './error-handler';
import { getOrCreateCorrelationId, addCorrelationIdToResponse } from './middleware/correlation';
import { requireAuth } from './middleware/auth';
import { CorrelationId } from '../domain/shared';
import { Container } from '../config/container';
import { WorkerEnv } from '../env';

export interface RouterContext {
    env: WorkerEnv;
    ctx: ExecutionContext;
    container: Container;
    correlationId: string;
}

export async function handleRequest(
    request: Request,
    context: RouterContext
): Promise<Response> {
    // Use correlation ID from context (guaranteed to match index.ts)
    const correlationId = CorrelationId.fromString(context.correlationId);
    const url = new URL(request.url);

    try {
        // CORS preflight
        if (request.method === 'OPTIONS') {
            return withCors(
                new Response(null, {
                    status: 204,
                })
            );
        }

        // Idempotency Check
        const idempotencyKey = request.headers.get('Idempotency-Key');
        if (idempotencyKey && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
            const cached = await context.container.idempotency.checkIdempotencyKey(idempotencyKey);
            if (cached) {
                return withCors(addCorrelationIdToResponse(cached, correlationId));
            }
        }

        let response: Response;

        // Health check (no auth required)
        if (url.pathname === '/api/health') {
            response = await handleHealthCheck(context.env);
        } else {
            // All other routes require authentication
            const principal = await requireAuth(request, context.env, context.container.logger);

            // Route to handlers using container from context
            if (url.pathname === '/api/chat') {
                if (request.method === 'POST' || (request.method === 'GET' && request.headers.get('Upgrade') === 'websocket')) {
                    response = await handleChatRequest(
                        request,
                        principal,
                        CorrelationId.fromString(correlationId.toString()),
                        context.container
                    );
                } else {
                    response = new Response('Method Not Allowed', { status: 405 });
                }
            }
            // Conversations endpoints
            else if (url.pathname === '/api/conversations') {
                if (request.method === 'GET') {
                    response = await handleChatConversationsRequest(
                        request,
                        principal,
                        CorrelationId.fromString(correlationId.toString()),
                        context.env.DB
                    );
                } else if (request.method === 'POST') {
                    response = await handleSaveConversationRequest(
                        request,
                        principal,
                        CorrelationId.fromString(correlationId.toString()),
                        context.env.DB
                    );
                } else {
                    response = new Response('Method Not Allowed', { status: 405 });
                }
            }
            // Delete conversation & History
            else if (url.pathname.match(/^\/api\/conversations\/([^/]+)$/)) {
                const conversationMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
                const conversationId = conversationMatch![1];
                if (request.method === 'DELETE') {
                    response = await handleDeleteConversationRequest(
                        request,
                        principal,
                        CorrelationId.fromString(correlationId.toString()),
                        context.env.DB,
                        conversationId
                    );
                } else if (request.method === 'GET') {
                    // Get messages for specific conversation
                    const modifiedUrl = new URL(request.url);
                    modifiedUrl.searchParams.set('conversationId', conversationId);

                    // IMPORTANT: When creating a new Request with a modified URL,
                    // we must explicitly pass headers in the init object.
                    // Passing a Request as the second param doesn't clone headers properly!
                    const modifiedRequest = new Request(modifiedUrl.toString(), {
                        method: request.method,
                        headers: request.headers, // This preserves all headers including X-Test-Bypass-Auth
                        body: request.body,
                        redirect: request.redirect,
                        signal: request.signal
                    });

                    response = await handleChatHistoryRequest(
                        modifiedRequest,
                        principal,
                        CorrelationId.fromString(correlationId.toString()),
                        context.env.DB
                    );
                } else {
                    response = new Response('Method Not Allowed', { status: 405 });
                }
            }
            // Legacy endpoints
            else if (url.pathname === '/api/chat/conversations') {
                response = await handleChatConversationsRequest(
                    request,
                    principal,
                    CorrelationId.fromString(correlationId.toString()),
                    context.env.DB
                );
            } else if (url.pathname === '/api/chat/history') {
                response = await handleChatHistoryRequest(
                    request,
                    principal,
                    CorrelationId.fromString(correlationId.toString()),
                    context.env.DB
                );
            } else if (url.pathname.startsWith('/api/tasks')) {
                response = await handleTasksRequest(
                    request,
                    principal,
                    CorrelationId.fromString(correlationId.toString()),
                    context.container
                );
            } else if (url.pathname.startsWith('/api/tools')) {
                response = new Response('Tools API - TODO', { status: 501 });
            } else {
                response = new Response('Not Found', { status: 404 });
            }
        }

        // Store Idempotency Response
        if (idempotencyKey && response.ok && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
            context.ctx.waitUntil(
                context.container.idempotency.storeResponse(idempotencyKey, response)
            );
        }

        return withCors(addCorrelationIdToResponse(response, correlationId));

    } catch (error) {
        const response = handleError(
            error as Error,
            correlationId.toString(),
            context.container.logger
        );
        return withCors(addCorrelationIdToResponse(response, correlationId));
    }
}

function withCors(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Test-Bypass-Auth, Cf-Access-Jwt-Assertion'
    );

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
