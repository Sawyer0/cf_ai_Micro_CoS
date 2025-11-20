/**
 * Error Handling Utilities
 * 
 * Standardized error responses for API
 */

import { AuthenticationError } from './middleware/auth';
import { RateLimitError } from './middleware/rate-limit';
import { Logger } from '../observability/logger';

export interface ErrorResponse {
    error: {
        code: string;
        message: string;
        details?: any;
    };
    correlationId?: string;
}

export function handleError(
    error: Error,
    correlationId?: string,
    logger?: Logger
): Response {
    logger?.error('API error', error, { correlationId });

    if (error instanceof AuthenticationError) {
        return jsonError(401, 'UNAUTHORIZED', error.message, correlationId);
    }

    if (error instanceof RateLimitError) {
        const response = jsonError(429, 'RATE_LIMIT_EXCEEDED', error.message, correlationId);
        const headers = new Headers(response.headers);
        headers.set('Retry-After', error.retryAfter.toString());

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    }

    // Generic error
    return jsonError(
        500,
        'INTERNAL_ERROR',
        'An unexpected error occurred',
        correlationId
    );
}

export function jsonError(
    status: number,
    code: string,
    message: string,
    correlationId?: string,
    details?: any
): Response {
    const body: ErrorResponse = {
        error: { code, message, details },
        correlationId
    };

    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export function jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
