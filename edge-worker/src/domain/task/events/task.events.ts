/**
 * Task Domain Events
 */

import { BaseDomainEvent } from '../../shared/events/domain-event.base';
import { CorrelationId } from '../../shared/value-objects/correlation-id.vo';

export class TaskCreated extends BaseDomainEvent {
    constructor(
        correlationId: CorrelationId,
        public readonly taskId: string,
        public readonly title: string,
        principalId?: string
    ) {
        super('task.created', correlationId, taskId, principalId);
    }
}

export class TaskStarted extends BaseDomainEvent {
    constructor(
        correlationId: CorrelationId,
        public readonly taskId: string,
        principalId?: string
    ) {
        super('task.started', correlationId, taskId, principalId);
    }
}

export class TaskCompleted extends BaseDomainEvent {
    constructor(
        correlationId: CorrelationId,
        public readonly taskId: string,
        principalId?: string
    ) {
        super('task.completed', correlationId, taskId, principalId);
    }
}

export class TaskCancelled extends BaseDomainEvent {
    constructor(
        correlationId: CorrelationId,
        public readonly taskId: string,
        principalId?: string
    ) {
        super('task.cancelled', correlationId, taskId, principalId);
    }
}
