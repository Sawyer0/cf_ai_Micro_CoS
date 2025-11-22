/**
 * TravelEvent - Aggregate Root for Travel Bounded Context
 *
 * Enforces business invariants:
 * - Dates must be in the future
 * - Origin and destination must differ
 * - Search results belong to this travel event
 */

import { TravelEventId } from '../value-objects/travel-event-id.vo';
import { AirportCode } from '../value-objects/airport-code.vo';
import { FlightOption } from '../entities/flight-option.entity';
import { DateRange } from '../../shared/value-objects/date-range.vo';

export type TravelEventStatus = 'detected' | 'searching' | 'options_available' | 'booked' | 'cancelled';

export class TravelEvent {
	readonly id: TravelEventId;
	private status: TravelEventStatus;
	private origin: AirportCode;
	private destination: AirportCode;
	private dates: DateRange;
	private flightOptions: FlightOption[];
	private selectedFlightId?: string;
	private readonly conversationId: string;

	private constructor(
		id: TravelEventId,
		status: TravelEventStatus,
		origin: AirportCode,
		destination: AirportCode,
		dates: DateRange,
		conversationId: string,
		flightOptions: FlightOption[] = [],
		selectedFlightId?: string,
	) {
		// Business invariant: origin != destination
		if (origin.equals(destination)) {
			throw new Error('Origin and destination must be different');
		}

		this.id = id;
		this.status = status;
		this.origin = origin;
		this.destination = destination;
		this.dates = dates;
		this.conversationId = conversationId;
		this.flightOptions = flightOptions;
		this.selectedFlightId = selectedFlightId;
	}

	static create(origin: AirportCode, destination: AirportCode, dates: DateRange, conversationId: string): TravelEvent {
		return new TravelEvent(TravelEventId.generate(), 'detected', origin, destination, dates, conversationId);
	}

	static reconstitute(
		id: string,
		status: TravelEventStatus,
		origin: AirportCode,
		destination: AirportCode,
		dates: DateRange,
		conversationId: string,
		flightOptions: FlightOption[],
		selectedFlightId?: string,
	): TravelEvent {
		return new TravelEvent(
			TravelEventId.fromString(id),
			status,
			origin,
			destination,
			dates,
			conversationId,
			flightOptions,
			selectedFlightId,
		);
	}

	markSearching(): void {
		this.status = 'searching';
	}

	addFlightOptions(options: FlightOption[]): void {
		this.flightOptions.push(...options);
		if (this.flightOptions.length > 0) {
			this.status = 'options_available';
		}
	}

	selectFlight(flightId: string): void {
		const exists = this.flightOptions.some((f) => f.id === flightId);
		if (!exists) {
			throw new Error('Cannot select flight that is not in options');
		}
		this.selectedFlightId = flightId;
	}

	getStatus(): TravelEventStatus {
		return this.status;
	}

	getFlightOptions(): readonly FlightOption[] {
		return [...this.flightOptions];
	}
}
