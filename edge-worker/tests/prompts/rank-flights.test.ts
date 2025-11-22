import { describe, it, expect, beforeEach } from 'vitest';
import {
    buildFlightRankingPrompt,
    parseFlightRanking,
    RankingContext
} from '../../src/prompts/rank-flights.prompt';
import { FlightOption } from '../../src/domain/travel/entities/flight-option.entity';
import { AirportCode } from '../../src/domain/travel/value-objects/airport-code.vo';

describe('Flight Ranking Prompt', () => {
    let mockFlights: FlightOption[];

    beforeEach(() => {
        // Create mock flights
        mockFlights = [
            FlightOption.create(
                [
                    {
                        origin: AirportCode.create('JFK'),
                        destination: AirportCode.create('BOS'),
                        departureTime: new Date('2024-12-10T08:00:00Z'),
                        arrivalTime: new Date('2024-12-10T09:30:00Z'),
                        airline: 'United Airlines',
                        flightNumber: 'UA123'
                    }
                ],
                450,
                'USD'
            ),
            FlightOption.create(
                [
                    {
                        origin: AirportCode.create('JFK'),
                        destination: AirportCode.create('BOS'),
                        departureTime: new Date('2024-12-10T06:00:00Z'),
                        arrivalTime: new Date('2024-12-10T12:00:00Z'),
                        airline: 'American Airlines',
                        flightNumber: 'AA456'
                    }
                ],
                320,
                'USD'
            ),
            FlightOption.create(
                [
                    {
                        origin: AirportCode.create('JFK'),
                        destination: AirportCode.create('BOS'),
                        departureTime: new Date('2024-12-10T15:00:00Z'),
                        arrivalTime: new Date('2024-12-10T21:00:00Z'),
                        airline: 'Delta',
                        flightNumber: 'DL789'
                    }
                ],
                280,
                'USD'
            )
        ];
    });

    describe('buildFlightRankingPrompt', () => {
        it('should build prompt with flights and no calendar events', () => {
            const context: RankingContext = {
                flights: mockFlights,
                calendarEvents: [],
                userPreferences: {}
            };

            const prompt = buildFlightRankingPrompt(context);

            expect(prompt).toContain('You are a travel planning assistant');
            expect(prompt).toContain('United Airlines');
            expect(prompt).toContain('American Airlines');
            expect(prompt).toContain('Delta');
            expect(prompt).toContain('No calendar conflicts detected');
            expect(prompt).toContain('OUTPUT (JSON array only):');
        });

        it('should include calendar events in prompt', () => {
            const context: RankingContext = {
                flights: mockFlights,
                calendarEvents: [
                    {
                        title: 'Important Meeting',
                        startTime: '2024-12-10T14:00:00Z',
                        endTime: '2024-12-10T15:00:00Z'
                    }
                ],
                userPreferences: {}
            };

            const prompt = buildFlightRankingPrompt(context);

            expect(prompt).toContain('Calendar Events on Arrival Day');
            expect(prompt).toContain('Important Meeting');
            expect(prompt).toContain('14:00');
        });

        it('should include user preferences in prompt', () => {
            const context: RankingContext = {
                flights: mockFlights,
                calendarEvents: [],
                userPreferences: {
                    maxBudget: 400,
                    preferredAirlines: ['United Airlines', 'Delta'],
                    cabinClass: 'business',
                    priorities: ['convenience', 'price']
                }
            };

            const prompt = buildFlightRankingPrompt(context);

            expect(prompt).toContain('Budget Limit: $400');
            expect(prompt).toContain('United Airlines, Delta');
            expect(prompt).toContain('business');
            expect(prompt).toContain('convenience > price');
        });

        it('should include few-shot example', () => {
            const context: RankingContext = {
                flights: mockFlights,
                calendarEvents: [],
                userPreferences: {}
            };

            const prompt = buildFlightRankingPrompt(context);

            expect(prompt).toContain('Example Input:');
            expect(prompt).toContain('Example Output:');
            expect(prompt).toContain('[1, 2, 3]');
        });
    });

    describe('parseFlightRanking', () => {
        it('should parse valid JSON array', () => {
            const llmResponse = '[1, 3, 2]';
            const ranked = parseFlightRanking(llmResponse, mockFlights);

            expect(ranked).toHaveLength(3);
            expect(ranked[0]).toBe(mockFlights[0]); // 1st flight
            expect(ranked[1]).toBe(mockFlights[2]); // 3rd flight
            expect(ranked[2]).toBe(mockFlights[1]); // 2nd flight
        });

        it('should parse JSON array with markdown wrapper', () => {
            const llmResponse = '```json\n[2, 1, 3]\n```';
            const ranked = parseFlightRanking(llmResponse, mockFlights);

            expect(ranked).toHaveLength(3);
            expect(ranked[0]).toBe(mockFlights[1]); // 2nd flight
            expect(ranked[1]).toBe(mockFlights[0]); // 1st flight
            expect(ranked[2]).toBe(mockFlights[2]); // 3rd flight
        });

        it('should parse JSON array with extra text', () => {
            const llmResponse = 'Here is the ranking:\n[3, 2, 1]\nBased on the criteria provided.';
            const ranked = parseFlightRanking(llmResponse, mockFlights);

            expect(ranked).toHaveLength(3);
            expect(ranked[0]).toBe(mockFlights[2]); // 3rd flight
            expect(ranked[1]).toBe(mockFlights[1]); // 2nd flight
            expect(ranked[2]).toBe(mockFlights[0]); // 1st flight
        });

        it('should return original order if parsing fails', () => {
            const llmResponse = 'Invalid response without array';
            const ranked = parseFlightRanking(llmResponse, mockFlights);

            expect(ranked).toHaveLength(3);
            expect(ranked).toEqual(mockFlights);
        });

        it('should return original order if ranking length mismatch', () => {
            const llmResponse = '[1, 2]'; // Only 2 indices, but 3 flights
            const ranked = parseFlightRanking(llmResponse, mockFlights);

            expect(ranked).toEqual(mockFlights);
        });

        it('should handle whitespace in JSON array', () => {
            const llmResponse = '[\n  1,\n  2,\n  3\n]';
            const ranked = parseFlightRanking(llmResponse, mockFlights);

            expect(ranked).toHaveLength(3);
            expect(ranked[0]).toBe(mockFlights[0]);
        });
    });
});
