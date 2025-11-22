import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth, AuthenticationError } from '../../../../src/api/middleware/auth';

describe('Auth Middleware', () => {
    let env: any;

    beforeEach(() => {
        env = {
            ENVIRONMENT: 'production',
            CF_ACCESS_AUD: 'test-aud'
        };
    });

    const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    } as any;

    it('should allow dev bypass in development environment', async () => {
        env.ENVIRONMENT = 'development';
        const request = new Request('http://localhost', {
            headers: { 'X-Test-Bypass-Auth': 'true' }
        });

        const principal = await requireAuth(request, env, mockLogger);
        expect(principal.id).toBe('dev-user');
        expect(principal.email).toBe('dev@example.com');
    });

    it('should NOT allow dev bypass in production environment', async () => {
        env.ENVIRONMENT = 'production';
        const request = new Request('http://localhost', {
            headers: { 'X-Test-Bypass-Auth': 'true' }
        });

        await expect(requireAuth(request, env, mockLogger)).rejects.toThrow(AuthenticationError);
    });

    it('should throw if no JWT header is present', async () => {
        const request = new Request('http://localhost');
        await expect(requireAuth(request, env, mockLogger)).rejects.toThrow('Missing Cloudflare Access JWT');
    });

    // Note: Full JWT verification testing requires mocking crypto.subtle and fetch, 
    // which is complex in this environment. Focusing on logic paths for now.
});
