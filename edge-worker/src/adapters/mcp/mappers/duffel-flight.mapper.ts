/**
 * DuffelFlightMapper - Translates Duffel API responses to domain entities
 *
 * Implements Anti-Corruption Layer (ACL) for Duffel API format
 */

import { FlightOption, FlightSegment } from '../../../domain/travel/entities/flight-option.entity';
import { AirportCode } from '../../../domain/travel/value-objects/airport-code.vo';
import { Logger } from '../../../observability/logger';

export interface DuffelSegment {
	origin: { iata_code: string };
	destination: { iata_code: string };
	departing_at: string;
	arriving_at: string;
	operating_carrier: { name: string };
	operating_carrier_flight_number: string;
	aircraft?: { iata_code?: string };
	stops_count?: number;
	duration?: string;
}

export interface DuffelSlice {
	segments: DuffelSegment[];
	duration?: string;
	stops_count?: number;
}

export interface DuffelFlightOffer {
	id: string;
	slices: DuffelSlice[];
	total_amount: string;
	total_currency: string;
	owner: { name: string };
	passengers: Array<{ type: string }>;
	available_services?: Array<{
		id: string;
		name: string;
		total_amount: string;
	}>;
}

export class DuffelFlightMapper {
	constructor(private readonly logger: Logger) {}

	translateOffers(offers: DuffelFlightOffer[]): FlightOption[] {
		return offers
			.filter((offer) => this.isValidOffer(offer))
			.map((offer) => this.translateOffer(offer));
	}

	private translateOffer(offer: DuffelFlightOffer): FlightOption {
		const segments: FlightSegment[] = offer.slices.flatMap((slice) =>
			slice.segments.map((seg) => ({
				origin: AirportCode.create(seg.origin.iata_code),
				destination: AirportCode.create(seg.destination.iata_code),
				departureTime: new Date(seg.departing_at),
				arrivalTime: new Date(seg.arriving_at),
				airline: seg.operating_carrier.name,
				flightNumber: seg.operating_carrier_flight_number,
				stops: seg.stops_count || 0,
				aircraft: seg.aircraft?.iata_code
			}))
		);

		return FlightOption.reconstitute(
			offer.id,
			segments,
			parseFloat(offer.total_amount),
			offer.total_currency
		);
	}

	private isValidOffer(offer: DuffelFlightOffer): boolean {
		if (!offer.id || !offer.slices || offer.slices.length === 0) {
			this.logger.debug('Invalid offer: missing id or slices', {
				metadata: { offerId: offer.id }
			});
			return false;
		}

		if (!offer.total_amount || !offer.total_currency) {
			this.logger.debug('Invalid offer: missing price or currency', {
				metadata: { offerId: offer.id }
			});
			return false;
		}

		// Verify all segments have required fields
		for (const slice of offer.slices) {
			for (const segment of slice.segments) {
				if (
					!segment.origin?.iata_code ||
					!segment.destination?.iata_code ||
					!segment.departing_at ||
					!segment.arriving_at
				) {
					this.logger.debug('Invalid segment: missing required fields', {
						metadata: { offerId: offer.id }
					});
					return false;
				}
			}
		}

		return true;
	}
}
