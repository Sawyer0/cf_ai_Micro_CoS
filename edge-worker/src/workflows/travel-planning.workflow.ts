/**
 * TravelPlanningWorkflow - Multi-step durable workflow for travel planning
 * 
 * Orchestrates flight search, calendar conflict checking, and LLM-powered ranking
 * with automatic retries and state persistence.
 * 
 * Workflow Steps:
 * 1. Calendar Check - Query events in travel date range
 * 2. Flight Search - Call Duffel via flights adapter  
 * 3. LLM Ranking - Rank flights with calendar context + user preferences
 * 4. Return Results - Top 5 ranked options
 * 
 * Adheres to Cloudflare Workflows best practices:
 * - Granular steps (one API call per step)
 * - Idempotent operations (search is idempotent)
 * - State returned from steps (no external state)
 * - Deterministic step names
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { Env } from '../env';
import { FlightSearchRequest } from '../domain/travel/ports/flight.port';
import { FlightOption } from '../domain/travel/entities/flight-option.entity';
import { AirportCode } from '../domain/travel/value-objects/airport-code.vo';
import { DuffelFlightAdapter } from '../adapters/mcp/flights.adapter';
import { DuffelApiClient } from '../adapters/mcp/clients/duffel-api.client';
import { DuffelFlightMapper } from '../adapters/mcp/mappers/duffel-flight.mapper';
import { FlightSearchValidator } from '../adapters/mcp/validators/flight-search.validator';
import { WorkersAIAdapter } from '../adapters/llm/workers-ai.adapter';
import { Logger } from '../observability/logger';
import { buildFlightRankingPrompt, parseFlightRanking } from '../prompts/rank-flights.prompt';

export interface TravelIntent {
    userId: string;
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    passengers?: number;
    conversationId: string;
    correlationId: string;
}

export class TravelPlanningWorkflow extends WorkflowEntrypoint<Env, TravelIntent> {
    async run(event: WorkflowEvent<TravelIntent>, step: WorkflowStep) {
        const { userId, origin, destination, departureDate, returnDate, passengers, conversationId, correlationId } = event.payload;

        // Initialize adapters (happens outside step.do - no side effects, just object creation)
        const logger = new Logger('travel-workflow');
        const duffelClient = new DuffelApiClient(this.env.DUFFEL_API_KEY || '', logger);
        const duffelMapper = new DuffelFlightMapper(logger);
        const flightValidator = new FlightSearchValidator();
        const flightAdapter = new DuffelFlightAdapter(
            duffelClient,
            duffelMapper,
            flightValidator,
            logger,
            this.env.DUFFEL_API_KEY || ''
        );
        const llmAdapter = new WorkersAIAdapter(this.env.AI as any, logger);

        // Map common city names to IATA airport codes
        const normalizeAirportCode = (code: string): string => {
            const cityMap: Record<string, string> = {
                'NYC': 'JFK',
                'LA': 'LAX',
                'SF': 'SFO',
                'CHI': 'ORD',
                'London': 'LHR',
                'Paris': 'CDG',
                'Tokyo': 'NRT',
                'Ibiza': 'IBZ'
            };
            const upper = code.toUpperCase();
            return cityMap[upper] || cityMap[code] || code.toUpperCase();
        };

        const normalizedOrigin = normalizeAirportCode(origin);
        const normalizedDestination = normalizeAirportCode(destination);

        // Step 1: Search flights via Duffel
        // Granular step - single API call to Duffel
        const flightOptionsData = await step.do('search-flights-duffel', async () => {
            logger.info('Searching flights', {
                metadata: { origin: normalizedOrigin, destination: normalizedDestination, departureDate, correlationId }
            });

            const searchRequest: FlightSearchRequest = {
                origin: normalizedOrigin,
                destination: normalizedDestination,
                departureDate,
                returnDate,
                passengers: passengers || 1
            };

            const results = await flightAdapter.searchFlights(searchRequest);

            // Serialize to plain objects to avoid DataCloneError with class instances
            // MUST serialize nested Value Objects (AirportCode) to strings
            return results.map(f => ({
                id: f.id,
                segments: f.segments.map(s => ({
                    origin: s.origin.toString(),
                    destination: s.destination.toString(),
                    departureTime: s.departureTime,
                    arrivalTime: s.arrivalTime,
                    airline: s.airline,
                    flightNumber: s.flightNumber
                })),
                totalPrice: f.totalPrice,
                currency: f.currency,
                bookingUrl: f.bookingUrl
            }));
        });

        // Reconstitute domain entities (handling potential Date stringification and AirportCode creation)
        const flightOptions = flightOptionsData.map((d: any) => FlightOption.reconstitute(
            d.id,
            d.segments.map((s: any) => ({
                origin: AirportCode.create(s.origin),
                destination: AirportCode.create(s.destination),
                departureTime: new Date(s.departureTime),
                arrivalTime: new Date(s.arrivalTime),
                airline: s.airline,
                flightNumber: s.flightNumber
            })),
            d.totalPrice,
            d.currency,
            d.bookingUrl
        ));

        // Early return if no flights found
        if (flightOptions.length === 0) {
            logger.warn('No flights found', { metadata: { correlationId } });
            return {
                success: true,
                flightCount: 0,
                topFlights: [],
                message: 'No flights found for this route',
                correlationId
            };
        }

        // Step 2: Check calendar for conflicts on arrival day
        // Granular step - single query to calendar (TODO: implement calendar integration)
        const calendarEvents = await step.do('check-calendar-conflicts', async () => {
            // TODO: Implement calendar query
            // For now, return empty array (no conflicts)
            logger.info('Checking calendar conflicts (not yet implemented)', {
                metadata: { userId, arrivalDate: departureDate, correlationId }
            });
            return [];
        });

        // Step 3: Rank flights with LLM using calendar context + preferences
        // Granular step - single LLM call
        const rankedFlightsData = await step.do('rank-flights-with-llm', async () => {
            logger.info('Ranking flights with LLM', {
                metadata: { flightCount: flightOptions.length, correlationId }
            });

            const prompt = buildFlightRankingPrompt({
                flights: flightOptions,
                calendarEvents,
                userPreferences: {
                    priorities: ['price', 'convenience']
                }
            });

            const llmResponse = await llmAdapter.generateCompletion(
                {
                    messages: [
                        { role: 'system', content: 'You are a travel planning assistant.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3, // Low temperature for consistent ranking
                    maxTokens: 100
                },
                correlationId
            );

            // Parse LLM ranking and reorder flights
            const ranked = parseFlightRanking(llmResponse.content, flightOptions);

            logger.info('Flight ranking complete', {
                metadata: { rankedCount: ranked.length, correlationId }
            });

            // Serialize to plain objects for step persistence
            return ranked.map(f => ({
                id: f.id,
                segments: f.segments.map(s => ({
                    origin: s.origin.toString(),
                    destination: s.destination.toString(),
                    departureTime: s.departureTime,
                    arrivalTime: s.arrivalTime,
                    airline: s.airline,
                    flightNumber: s.flightNumber
                })),
                totalPrice: f.totalPrice,
                currency: f.currency,
                bookingUrl: f.bookingUrl
            }));
        });

        // Reconstitute ranked flights
        const rankedFlights = (rankedFlightsData as any[]).map((d: any) => FlightOption.reconstitute(
            d.id,
            d.segments.map((s: any) => ({
                origin: AirportCode.create(s.origin),
                destination: AirportCode.create(s.destination),
                departureTime: new Date(s.departureTime),
                arrivalTime: new Date(s.arrivalTime),
                airline: s.airline,
                flightNumber: s.flightNumber
            })),
            d.totalPrice,
            d.currency,
            d.bookingUrl
        ));

        // Return final ranked results to caller (top 5)
        // Return final ranked results to caller (top 5)
        const result = {
            success: true,
            flightCount: rankedFlights.length,
            topFlights: rankedFlights.slice(0, 5),
            correlationId
        };

        // Notify Chat DO with results
        if (conversationId) {
            try {
                const doId = this.env.CHAT_SESSIONS.idFromName(conversationId);
                const stub = this.env.CHAT_SESSIONS.get(doId);

                const topFlight = rankedFlights[0];
                const firstSegment = topFlight.segments[0];
                const message = rankedFlights.length > 0
                    ? `I've found ${rankedFlights.length} flights from ${origin} to ${destination}. \n\nTop Recommendation:\nAirline: ${firstSegment.airline}\nPrice: ${topFlight.totalPrice} ${topFlight.currency}\nDeparture: ${new Date(firstSegment.departureTime).toLocaleString()}\n\nWould you like to book this?`
                    : `I couldn't find any flights from ${origin} to ${destination} on ${departureDate}.`;

                await stub.fetch('http://do/workflow-result', {
                    method: 'POST',
                    body: JSON.stringify({
                        message,
                        conversationId,
                        correlationId
                    })
                });
            } catch (error) {
                console.error('Failed to notify Chat DO:', error);
            }
        }

        return result;
    }
}
