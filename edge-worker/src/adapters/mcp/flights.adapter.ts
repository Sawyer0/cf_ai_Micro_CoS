/**
 * DuffelFlightAdapter - Flight search adapter using Duffel API
 * 
 * Implements IFlightPort (ACL for external Duffel API)
 * Translates Duffel responses to Travel domain FlightOption entities
 */

import { IFlightPort, FlightSearchRequest } from '../../domain/travel/ports/flight.port';
import { FlightOption, FlightSegment } from '../../domain/travel/entities/flight-option.entity';
import { AirportCode } from '../../domain/travel/value-objects/airport-code.vo';
import { Logger } from '../../observability/logger';

interface DuffelFlightOffer {
    id: string;
    slices: Array<{
        segments: Array<{
            origin: { iata_code: string };
            destination: { iata_code: string };
            departing_at: string;
            arriving_at: string;
            operating_carrier: { name: string };
            operating_carrier_flight_number: string;
        }>;
    }>;
    total_amount: string;
    total_currency: string;
}

export class DuffelFlightAdapter implements IFlightPort {
    constructor(
        private readonly apiKey: string,
        private readonly logger: Logger
    ) { }

    async searchFlights(request: FlightSearchRequest): Promise<FlightOption[]> {
        try {
            this.logger.info('Searching flights via Duffel', {
                metadata: { origin: request.origin, destination: request.destination }
            });

            const response = await fetch('https://api.duffel.com/air/offer_requests', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    slices: [{
                        origin: request.origin,
                        destination: request.destination,
                        departure_date: request.departureDate
                    }],
                    passengers: [{ type: 'adult' }],
                    cabin_class: 'economy'
                })
            });

            const data = await response.json() as { data?: { offers?: DuffelFlightOffer[] } };

            // ACL: Translate Duffel API → Domain entities
            return this.translateOffers(data.data?.offers || []);
        } catch (error) {
            this.logger.error('Flight search failed', error as Error);
            return [];
        }
    }

    async getFlightDetails(flightId: string): Promise<FlightOption | null> {
        // Simplified - would fetch from Duffel API
        return null;
    }

    private translateOffers(offers: DuffelFlightOffer[]): FlightOption[] {
        return offers.map(offer => {
            const segments: FlightSegment[] = offer.slices.flatMap(slice =>
                slice.segments.map(seg => ({
                    origin: AirportCode.create(seg.origin.iata_code),
                    destination: AirportCode.create(seg.destination.iata_code),
                    departureTime: new Date(seg.departing_at),
                    arrivalTime: new Date(seg.arriving_at),
                    airline: seg.operating_carrier.name,
                    flightNumber: seg.operating_carrier_flight_number
                }))
            );

            return FlightOption.reconstitute(
                offer.id,
                segments,
                parseFloat(offer.total_amount),
                offer.total_currency
            );
        });
    }
}
