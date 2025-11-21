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
import { Logger } from '../../observability/logger';
import { DuffelApiClient } from './clients/duffel-api.client';
import { DuffelFlightMapper, DuffelFlightOffer } from './mappers/duffel-flight.mapper';
import { FlightSearchValidator } from './validators/flight-search.validator';

interface DuffelOfferResponse {
    data?: {
        offers?: DuffelFlightOffer[];
        id: string;
    };
}

export class DuffelFlightAdapter implements IFlightPort {
    private readonly client: DuffelApiClient;
    private readonly mapper: DuffelFlightMapper;
    private readonly validator: FlightSearchValidator;

    constructor(
        private readonly apiKey: string,
        private readonly logger: Logger
    ) {
        this.validateCredentials();
        this.client = new DuffelApiClient(apiKey, logger);
        this.mapper = new DuffelFlightMapper(logger);
        this.validator = new FlightSearchValidator();
    }

    async searchFlights(request: FlightSearchRequest): Promise<FlightOption[]> {
        const correlationId = this.generateCorrelationId();

        try {
            // Validate request
            this.validator.validateSearchRequest(request);

            this.logger.info('Searching flights via Duffel', {
                metadata: {
                    origin: request.origin,
                    destination: request.destination,
                    departureDate: request.departureDate,
                    correlationId
                }
            });

            // Build search payload
            const payload = this.buildSearchPayload(request);

            // Call Duffel API
            const response = await this.client.post<DuffelOfferResponse>(
                '/offer_requests',
                payload,
                correlationId
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

        return {
            slices,
            passengers: Array(request.passengers || 1).fill({ type: 'adult' }),
            cabin_class: 'economy'
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
