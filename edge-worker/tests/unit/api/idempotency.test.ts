import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdempotencyService } from '../../../src/api/idempotency';

// Mock KV Namespace
const mockKV = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
} as unknown as KVNamespace;

describe('Idempotency Service', () => {
    let service: IdempotencyService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new IdempotencyService(mockKV);
    });

    it('should return null if key not found', async () => {
        (mockKV.get as any).mockResolvedValue(null);
        const result = await service.checkIdempotencyKey('key-123');
        expect(result).toBeNull();
    });

    it('should return cached response if key found', async () => {
        const cachedData = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: { success: true }
        };
        (mockKV.get as any).mockResolvedValue(cachedData);

        const result = await service.checkIdempotencyKey('key-123');
        expect(result).not.toBeNull();
        expect(result?.status).toBe(200);

        const body = await result?.json();
        expect(body).toEqual({ success: true });
    });

    it('should store response correctly', async () => {
        const response = new Response(JSON.stringify({ data: 'test' }), {
            status: 201,
            headers: { 'X-Custom': 'value' }
        });

        await service.storeResponse('key-123', response);

        expect(mockKV.put).toHaveBeenCalledWith(
            'idempotency:key-123',
            expect.stringContaining('"status":201'),
            expect.objectContaining({ expirationTtl: 86400 })
        );
    });
});
