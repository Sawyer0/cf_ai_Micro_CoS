/**
 * Travel Domain Events
 *
 * Events emitted by Travel Bounded Context
 */

import { BaseDomainEvent } from '../../shared/events/domain-event.base';
import { CorrelationId } from '../../shared/value-objects/correlation-id.vo';

export class TravelIntentDetected extends BaseDomainEvent {
	constructor(
		correlationId: CorrelationId,
		public readonly travelEventId: string,
		public readonly origin: string,
		public readonly destination: string,
		public readonly departureDate: string,
		public readonly returnDate?: string,
		principalId?: string,
	) {
		super('travel.intent.detected', correlationId, travelEventId, principalId);
	}
}

export class FlightSearchStarted extends BaseDomainEvent {
	constructor(
		correlationId: CorrelationId,
		public readonly travelEventId: string,
		principalId?: string,
	) {
		super('travel.search.started', correlationId, travelEventId, principalId);
	}
}

export class FlightOptionsReceived extends BaseDomainEvent {
	constructor(
		correlationId: CorrelationId,
		public readonly travelEventId: string,
		public readonly optionCount: number,
		principalId?: string,
	) {
		super('travel.options.received', correlationId, travelEventId, principalId);
	}
}

export class FlightSelected extends BaseDomainEvent {
	constructor(
		correlationId: CorrelationId,
		public readonly travelEventId: string,
		public readonly flightId: string,
		principalId?: string,
	) {
		super('travel.flight.selected', correlationId, travelEventId, principalId);
	}
}
