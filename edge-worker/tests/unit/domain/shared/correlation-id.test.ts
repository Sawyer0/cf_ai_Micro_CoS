import { describe, it, expect } from 'vitest';
import { CorrelationId } from '@/domain/shared/value-objects/correlation-id.vo';

describe('CorrelationId', () => {
    it('should create a new valid correlation ID', () => {
        const id = CorrelationId.generate();
        expect(id).toBeDefined();
        expect(id.toString()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should create from existing string', () => {
        const uuid = '123e4567-e89b-42d3-a456-426614174000'; // Valid v4 UUID
        const id = CorrelationId.fromString(uuid);
        expect(id.toString()).toBe(uuid);
    });

    it('should throw error for invalid UUID', () => {
        expect(() => CorrelationId.fromString('invalid-uuid')).toThrow();
    });
});
