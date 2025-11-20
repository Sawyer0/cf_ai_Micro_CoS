/**
 * Correlation ID Middleware
 * 
 * Ensures every request has a correlation ID for distributed tracing
 */

import { CorrelationId } from '../../domain/shared/value-objects/correlation-id.vo';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

export function getOrCreateCorrelationId(request: Request): CorrelationId {
    const headerValue = request.headers.get(CORRELATION_ID_HEADER);

    if (headerValue) {
        try {
            return CorrelationId.fromString(headerValue);
        } catch {
            // Invalid format, generate new one
        }
    }

    return CorrelationId.generate();
}

export function addCorrelationIdToResponse(
    response: Response,
    correlationId: CorrelationId
): Response {
    const newHeaders = new Headers(response.headers);
    newHeaders.set(CORRELATION_ID_HEADER, correlationId.toString());

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
    });
}
