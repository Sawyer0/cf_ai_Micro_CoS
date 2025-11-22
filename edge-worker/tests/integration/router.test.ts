import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRequest } from '../../src/api/router';
import { CorrelationId } from '../../src/domain/shared/value-objects/correlation-id.vo';

// Mock dependencies
const mockEnv = {
    ENVIRONMENT: 'test',
    AI: {
        run: vi.fn().mockResolvedValue({ response: 'mock response' })
    },
    DB: {
        prepare: vi.fn(),
        batch: vi.fn(),
        exec: vi.fn(),
        dump: vi.fn(),
        withSession: vi.fn(),
    },
    KV: {},
    CHAT_SESSIONS: {
        idFromName: vi.fn(),
        get: vi.fn(),
    },
    IDEMPOTENCY_KV: {
        get: vi.fn(),
        put: vi.fn(),
    },
    RATE_LIMIT_KV: {
        get: vi.fn(),
        put: vi.fn(),
    },
    TRAVEL_PLANNING: {
        create: vi.fn(),
        get: vi.fn(),
    },
    TASK_EXTRACTION: {
        create: vi.fn(),
        get: vi.fn(),
    },
    DAILY_PLANNING: {
        create: vi.fn(),
        get: vi.fn(),
    }
};

const mockContainer = {
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
    idempotency: {
        checkIdempotencyKey: vi.fn().mockResolvedValue(null),
        storeResponse: vi.fn().mockResolvedValue(undefined),
    },
    // Add other services as needed for specific route tests
    chatService: {
        processChat: vi.fn().mockResolvedValue({
            response: 'Hello',
            conversationId: 'conv-123',
            messageId: 'msg-123'
        })
    }
};

const mockCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
};

describe('Router Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle health check without auth', async () => {
        const request = new Request('http://localhost/api/health');
        const context = {
            env: mockEnv,
            ctx: mockCtx as any,
            container: mockContainer as any,
            correlationId: CorrelationId.generate().toString()
        };

        const response = await handleRequest(request, context);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ status: 'healthy', environment: 'test' });
    });

    it('should require auth for chat endpoints', async () => {
        const request = new Request('http://localhost/api/chat', {
            method: 'POST',
            body: JSON.stringify({ message: 'Hi' })
        });
        const context = {
            env: mockEnv,
            ctx: mockCtx as any,
            container: mockContainer as any,
            correlationId: CorrelationId.generate().toString()
        };

        // Mock requireAuth to throw (since we can't easily mock the module import here without more setup)
        // In a real integration test, we might mock the middleware or provide valid headers.
        // Here we assume the router calls requireAuth.

        // Note: Since we are importing handleRequest which imports requireAuth, 
        // we would need to mock requireAuth module. 
        // For this file, we'll rely on the fact that it fails if no headers are present, 
        // which requireAuth does.

        const response = await handleRequest(request, context);
        // Expect 401 or 403 or 500 depending on how requireAuth fails when missing headers
        // requireAuth throws AuthenticationError, which handleError catches and returns 401
        expect(response.status).toBe(401);
    });

    it('should return 404 for unknown routes', async () => {
        const request = new Request('http://localhost/api/unknown');
        const context = {
            env: mockEnv,
            ctx: mockCtx as any,
            container: mockContainer as any,
            correlationId: CorrelationId.generate().toString()
        };

        // We need to bypass auth for this test to reach 404, 
        // or assert that it fails auth first.
        // Actually, router checks auth for "All other routes" before 404 check?
        // Let's check router.ts logic.
        // It checks health, then requireAuth, then routes.
        // So unknown routes will require auth first.

        // If we provide auth headers (mocked)
        const authRequest = new Request('http://localhost/api/unknown', {
            headers: {
                'X-Test-Bypass-Auth': 'true' // Assuming dev env or mocked env allows this
            }
        });

        // We need to set env to development for bypass to work
        const devEnv = { ...mockEnv, ENVIRONMENT: 'development' };

        const response = await handleRequest(authRequest, { ...context, env: devEnv });
        expect(response.status).toBe(404);
    });
});
