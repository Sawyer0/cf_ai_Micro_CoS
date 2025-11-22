import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../../../../src/api/middleware/rate-limit';

// Mock KV Namespace
const mockKV = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
} as unknown as KVNamespace;

describe('Rate Limiter', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
        vi.clearAllMocks();
        rateLimiter = new RateLimiter(mockKV, {
            requestsPerMinute: 10,
            requestsPerHour: 100
        });
    });

    it('should allow request when within limits', async () => {
        (mockKV.get as any).mockResolvedValue(null); // No previous hits

        await expect(rateLimiter.checkLimit('user-123')).resolves.not.toThrow();
        expect(mockKV.put).toHaveBeenCalledTimes(2); // Minute and Hour counters
    });

    it('should block request when minute limit exceeded', async () => {
        (mockKV.get as any).mockImplementation((key: string) => {
            console.log('Mock KV Get:', key);
            if (key.includes(':minute:')) return Promise.resolve('10');
            return Promise.resolve('5');
        });

        await expect(rateLimiter.checkLimit('user-123')).rejects.toThrow('Rate limit exceeded (per minute)');
    });

    it('should block request when hour limit exceeded', async () => {
        (mockKV.get as any).mockImplementation((key: string) => {
            if (key.includes(':min:')) return Promise.resolve('5');
            if (key.includes(':hour:')) return Promise.resolve('100');
            return Promise.resolve(null);
        });

        await expect(rateLimiter.checkLimit('user-123')).rejects.toThrow('Rate limit exceeded (per hour)');
    });
});
