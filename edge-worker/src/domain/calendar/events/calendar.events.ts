/**
 * Calendar Domain Events
 */

import { BaseDomainEvent } from '../../shared/events/domain-event.base';
import { CorrelationId } from '../../shared/value-objects/correlation-id.vo';

export class CalendarSyncStarted extends BaseDomainEvent {
    constructor(
        correlationId: CorrelationId,
        public readonly userId: string,
        principalId?: string
    ) {
        super('calendar.sync.started', correlationId, userId, principalId);
    }
}

export class CalendarEventsSynced extends BaseDomainEvent {
    constructor(
        correlationId: CorrelationId,
        public readonly userId: string,
        public readonly eventCount: number,
        principalId?: string
    ) {
        super('calendar.events.synced', correlationId, userId, principalId);
    }
}

export class TravelEventDetectedInCalendar extends BaseDomainEvent {
    constructor(
        correlationId: CorrelationId,
        public readonly userId: string,
        public readonly calendarEventId: string,
        principalId?: string
    ) {
        super('calendar.travel.detected', correlationId, userId, principalId);
    }
}
