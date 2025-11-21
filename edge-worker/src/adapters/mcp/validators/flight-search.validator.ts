/**
 * FlightSearchValidator - Validates flight search requests
 *
 * Ensures data integrity before API calls
 */

import { FlightSearchRequest } from '../../../domain/travel/ports/flight.port';

export class FlightSearchValidator {
	validateSearchRequest(request: FlightSearchRequest): void {
		if (!request.origin || request.origin.trim() === '') {
			throw new Error('Flight search requires origin airport code');
		}

		if (!request.destination || request.destination.trim() === '') {
			throw new Error('Flight search requires destination airport code');
		}

		if (!request.departureDate) {
			throw new Error('Flight search requires departure date');
		}

		this.validateAirportCode(request.origin, 'origin');
		this.validateAirportCode(request.destination, 'destination');
		this.validateDate(request.departureDate, 'departureDate');

		if (request.returnDate) {
			this.validateDate(request.returnDate, 'returnDate');
		}

		if (request.passengers !== undefined) {
			if (request.passengers < 1 || request.passengers > 9) {
				throw new Error('Flight search requires 1-9 passengers');
			}
		}
	}

	private validateAirportCode(code: string, fieldName: string): void {
		// IATA codes are typically 3 uppercase letters, but some are 4
		// Accept flexible format and let API validate strictly
		if (code.length < 2 || code.length > 4) {
			throw new Error(`Invalid ${fieldName} airport code format: ${code}`);
		}

		if (!/^[A-Z]{2,4}$/.test(code)) {
			throw new Error(`${fieldName} must contain only letters: ${code}`);
		}
	}

	private validateDate(dateStr: string, fieldName: string): void {
		// Accept YYYY-MM-DD format or ISO string
		const date = new Date(dateStr);

		if (isNaN(date.getTime())) {
			throw new Error(`Invalid ${fieldName} date format: ${dateStr}`);
		}
	}

	formatDateForApi(date: string | Date): string {
		if (typeof date === 'string') {
			// Assume already formatted as YYYY-MM-DD
			return date;
		}

		return date.toISOString().split('T')[0];
	}
}
