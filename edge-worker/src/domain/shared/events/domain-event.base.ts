/**
 * DomainEvent - Base interface for all domain events
 * 
 * Shared Kernel
 * All events across bounded contexts extend this interface
 */

import { CorrelationId } from '../value-objects/correlation-id.vo';

export interface DomainEvent {
    readonly eventId: string;
    readonly eventType: string;
    readonly timestamp: Date;
    readonly correlationId: CorrelationId;
    readonly aggregateId: string;
    readonly principalId?: string;
}

/**
 * Base implementation helper
 */
export abstract class BaseDomainEvent implements DomainEvent {
    readonly eventId: string;
    readonly timestamp: Date;

    constructor(
        public readonly eventType: string,
        public readonly correlationId: CorrelationId,
        public readonly aggregateId: string,
        public readonly principalId?: string
    ) {
        this.eventId = crypto.randomUUID();
        this.timestamp = new Date();
    }
}
