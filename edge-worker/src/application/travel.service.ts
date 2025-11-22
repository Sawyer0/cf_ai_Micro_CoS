/**
 * TravelService - Application service for travel workflows
 *
 * Orchestrates flight search and travel event management
 */

import { TravelEvent } from '../domain/travel/aggregates/travel-event.aggregate';
import { AirportCode } from '../domain/travel/value-objects/airport-code.vo';
import { DateRange } from '../domain/shared/value-objects/date-range.vo';
import { IFlightPort } from '../domain/travel/ports/flight.port';
import { FlightOption } from '../domain/travel/entities/flight-option.entity';
import { Logger } from '../observability/logger';

export interface SearchFlightsCommand {
	origin: string;
	destination: string;
	departureDate: string;
	returnDate?: string;
	conversationId: string;
}

export class TravelService {
	constructor(
		private readonly flightPort: IFlightPort,
		private readonly logger: Logger,
	) {}

	async searchFlights(command: SearchFlightsCommand): Promise<{
		travelEvent: TravelEvent;
		flights: FlightOption[];
	}> {
		// Create travel event
		const origin = AirportCode.create(command.origin);
		const destination = AirportCode.create(command.destination);
		const dates = DateRange.create(
			new Date(command.departureDate),
			command.returnDate ? new Date(command.returnDate) : new Date(command.departureDate),
		);

		const travelEvent = TravelEvent.create(origin, destination, dates, command.conversationId);

		travelEvent.markSearching();

		// Search flights via adapter
		const flights = await this.flightPort.searchFlights({
			origin: command.origin,
			destination: command.destination,
			departureDate: command.departureDate,
			returnDate: command.returnDate,
		});

		travelEvent.addFlightOptions(flights);

		this.logger.info('Flight search completed', {
			metadata: {
				travelEventId: travelEvent.id.toString(),
				flightCount: flights.length,
			},
		});

		return { travelEvent, flights };
	}
}
