/**
 * DuffelFlightAdapter - Flight search adapter using Duffel API
 *
 * Implements IFlightPort by composing:
 * - DuffelApiClient (HTTP layer)
 * - DuffelFlightMapper (ACL/translation layer)
 * - FlightSearchValidator (validation layer)
 */

import { IFlightPort, FlightSearchRequest } from '../../domain/travel/ports/flight.port';
import { FlightOption } from '../../domain/travel/entities/flight-option.entity';
import { AirportCode } from '../../domain/travel/value-objects/airport-code.vo';
import { DuffelApiClient, DuffelOfferResponse, DuffelFlightOffer } from './clients/duffel-api.client';
import { DuffelFlightMapper } from './mappers/duffel-flight.mapper';
import { FlightSearchValidator } from './validators/flight-search.validator';
import { Logger } from '../../observability/logger';
import { withRetry } from '../../infrastructure/retry';

export class DuffelFlightAdapter implements IFlightPort {
    constructor(
        private readonly client: DuffelApiClient,
        private readonly mapper: DuffelFlightMapper,
        private readonly validator: FlightSearchValidator,
        private readonly logger: Logger,
        private readonly apiKey: string
    ) { }

    async searchFlights(request: FlightSearchRequest): Promise<FlightOption[]> {
        const correlationId = this.generateCorrelationId();

        // Mock check
        if (request.origin === 'MOCK') {
            return this.getMockFlights(request);
        }

        try {
            this.validateCredentials();
            this.validator.validateSearchRequest(request);

            this.logger.info('Searching flights', {
                metadata: {
                    origin: request.origin,
                    destination: request.destination,
                    date: request.departureDate,
                    correlationId
                }
            });

            // Build search payload
            const payload = this.buildSearchPayload(request);

            // Call Duffel API with Retry
            const response = await withRetry(
                () => this.client.post<DuffelOfferResponse>(
                    '/offer_requests',
                    payload,
                    correlationId
                ),
                {
                    maxAttempts: 3,
                    initialDelayMs: 200,
                    maxDelayMs: 2000,
                    backoffMultiplier: 2,
                    retryableErrors: (err) => {
                        // Retry on network errors or 5xx (client throws on non-2xx)
                        const msg = err.message || '';
                        return msg.includes('fetch failed') || msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504');
                    }
                },
                this.logger,
                { correlationId, operation: 'DuffelFlightAdapter.searchFlights' }
            );

            // Translate response to domain entities
            const offers = response.data?.offers || [];
            const flights = this.mapper.translateOffers(offers);

            this.logger.info('Flight search completed', {
                metadata: {
                    correlationId,
                    offerCount: flights.length,
                    requestId: response.data?.id
                }
            });

            return flights;
        } catch (error) {
            this.logger.error('Flight search failed', error as Error, {
                metadata: { correlationId }
            });
            return [];
        }
    }

    private getMockFlights(request: FlightSearchRequest): FlightOption[] {
        // Return 3 mock options
        const mockSegments = (airline: string, flightNum: string, price: number, time: string) => {
            return FlightOption.create(
                [{
                    origin: AirportCode.create(request.origin),
                    destination: AirportCode.create(request.destination),
                    departureTime: new Date(`${request.departureDate}T${time}:00Z`),
                    arrivalTime: new Date(`${request.departureDate}T${parseInt(time) + 7}:00Z`),
                    airline,
                    flightNumber: flightNum
                }],
                price,
                'USD',
                'https://example.com/book'
            );
        };

        return [
            mockSegments('British Airways', 'BA112', 850, '18:00'),
            mockSegments('Virgin Atlantic', 'VS004', 920, '20:00'),
            mockSegments('Delta', 'DL402', 780, '16:30')
        ];
    }

    async getFlightDetails(flightId: string): Promise<FlightOption | null> {
        const correlationId = this.generateCorrelationId();

        try {
            if (!flightId) {
                throw new Error('flightId is required');
            }

            this.logger.info('Fetching flight details', {
                metadata: { flightId, correlationId }
            });

            const response = await this.client.get<{ data: DuffelFlightOffer }>(
                `/offers/${flightId}`,
                correlationId
            );

            if (!response.data) {
                this.logger.warn('Flight offer not found', {
                    metadata: { flightId, correlationId }
                });
                return null;
            }

            const flights = this.mapper.translateOffers([response.data]);
            return flights[0] || null;
        } catch (error) {
            this.logger.error('Flight detail fetch failed', error as Error, {
                metadata: { flightId, correlationId }
            });
            return null;
        }
    }

    private buildSearchPayload(request: FlightSearchRequest): Record<string, unknown> {
        const slices = [
            {
                origin: request.origin,
                destination: request.destination,
                departure_date: this.validator.formatDateForApi(request.departureDate)
            }
        ];

        // Add return slice if round-trip
        if (request.returnDate) {
            slices.push({
                origin: request.destination,
                destination: request.origin,
                departure_date: this.validator.formatDateForApi(request.returnDate)
            });
        }

        // Duffel API v2 requires the payload to be wrapped in a 'data' key
        return {
            data: {
                slices,
                passengers: Array(request.passengers || 1).fill({ type: 'adult' }),
                cabin_class: 'economy'
            }
        };
    }

    private validateCredentials(): void {
        if (!this.apiKey) {
            this.logger.warn('Duffel API key is not configured');
        }
    }

    private generateCorrelationId(): string {
        return `flight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
