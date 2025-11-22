/**
 * IFlightPort - Port for flight search operations
 *
 * Port in Travel Bounded Context
 * ACL for external flight APIs (e.g., Duffel)
 */

import { FlightOption } from '../entities/flight-option.entity';

export interface FlightSearchRequest {
	origin: string;
	destination: string;
	departureDate: string;
	returnDate?: string;
	passengers?: number;
}

export interface IFlightPort {
	searchFlights(request: FlightSearchRequest): Promise<FlightOption[]>;

	getFlightDetails(flightId: string): Promise<FlightOption | null>;
}
