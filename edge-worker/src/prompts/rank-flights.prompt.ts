/**
 * Flight Ranking Prompt Template
 *
 * LLM prompt for ranking flight options based on:
 * - Calendar conflicts (early meetings → avoid early arrivals)
 * - User preferences (budget, airline, cabin class)
 * - Price/convenience tradeoffs
 */

import { FlightOption } from '../domain/travel/entities/flight-option.entity';
import { Logger } from '../observability/logger';

export interface RankingContext {
	flights: FlightOption[];
	calendarEvents?: Array<{
		title: string;
		startTime: string;
		endTime: string;
	}>;
	userPreferences?: {
		maxBudget?: number;
		preferredAirlines?: string[];
		cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
		priorities?: Array<'price' | 'duration' | 'convenience' | 'airline'>;
	};
}

export function buildFlightRankingPrompt(context: RankingContext): string {
	const { flights, calendarEvents = [], userPreferences = {} } = context;

	// Format flights for LLM
	const flightList = flights
		.map((flight, idx) => {
			const firstSegment = flight.segments[0];
			const lastSegment = flight.segments[flight.segments.length - 1];
			const durationHours = Math.round((flight.totalDurationMs() / (1000 * 60 * 60)) * 10) / 10;
			const stops = flight.segments.length - 1;

			return `
${idx + 1}. ${firstSegment.airline}
   Departs: ${firstSegment.departureTime.toLocaleString()} from ${firstSegment.origin}
   Arrives: ${lastSegment.arrivalTime.toLocaleString()} at ${lastSegment.destination}
   Duration: ${durationHours}h | Stops: ${stops} | Price: ${flight.totalPrice} ${flight.currency}
`;
		})
		.join('\n');

	// Format calendar events
	const calendarInfo =
		calendarEvents.length > 0
			? `\nCalendar Events on Arrival Day:
${calendarEvents.map((e) => `- ${e.title}: ${e.startTime} - ${e.endTime}`).join('\n')}

Recommendation: Avoid flight arrivals too close to early meetings (prefer 2+ hour buffer for airport transit).`
			: '\nNo calendar conflicts detected.';

	// Format preferences
	const preferencesInfo = `

User Preferences:
- Budget Limit: ${userPreferences.maxBudget ? `$${userPreferences.maxBudget}` : 'None'}
- Preferred Airlines: ${userPreferences.preferredAirlines?.join(', ') || 'Any'}
- Cabin Class: ${userPreferences.cabinClass || 'economy'}
- Priorities: ${userPreferences.priorities?.join(' > ') || 'price > convenience'}`;

	// Few-shot example for consistency
	const fewShotExample = `
Example Input:
1. United Airlines - Departs 8:00 AM, Arrives 2:00 PM, $450, Nonstop
2. American Airlines - Departs 6:00 AM, Arrives 12:00 PM, $320, 1 stop
3. Delta - Departs 3:00 PM, Arrives 9:00 PM, $280, 2 stops
Calendar: Meeting at 3:00 PM on arrival day
Priorities: convenience > price

Example Output:
[1, 2, 3]

Reasoning: Flight 1 is nonstop and arrives 1 hour before the meeting (tight but doable). Flight 2 is cheapest but arrives at noon (safe buffer). Flight 3 is very cheap but 2 stops + arrives late evening (misses meeting).`;

	return `You are a travel planning assistant. Your task is to rank flight options from BEST to WORST for the user based on their calendar and preferences.

AVAILABLE FLIGHTS:
${flightList}
${calendarInfo}
${preferencesInfo}

RANKING CRITERIA (in order of importance):
1. Calendar Conflicts:avoid arrivals<2h before meetings (critical)
2. User Preferences: Honor budget limits and preferred airlines/cabin
3. Price: Lower is better (within budget)
4. Convenience: Prefer nonstop > 1 stop > 2+ stops
5. Timing: Reasonable departure/arrival times (avoid red-eyes unless necessary)
${fewShotExample}

INSTRUCTIONS:
- Return ONLY a JSON array of flight indices (1-based numbering)
- Format: [best_idx, second_best_idx, ..., worst_idx]
- NO explanatory text, NO markdown code fences, ONLY the JSON array
- All ${flights.length} flights must be included exactly once

OUTPUT (JSON array only):`;
}

export function parseFlightRanking(llmResponse: string | any[], flights: FlightOption[]): FlightOption[] {
	const logger = new Logger('rank-flights-prompt');
	try {
		logger.debug('Parsing flight ranking from LLM response', {
			metadata: {
				responseType: typeof llmResponse,
				isArray: Array.isArray(llmResponse),
				flightCount: flights.length,
			},
		});

		let ranking: number[] = [];

		// Handle array input (if LLM returns structured output directly)
		if (Array.isArray(llmResponse)) {
			ranking = llmResponse;
		} else if (typeof llmResponse === 'string') {
			// Clean response: remove markdown code fences, extra whitespace
			let cleaned = llmResponse
				.trim()
				.replace(/```json\n?/g, '')
				.replace(/```\n?/g, '')
				.trim();

			// Extract JSON array (handles both raw arrays and text+array)
			const match = cleaned.match(/\[[\d,\s]+\]/);
			if (!match) {
				logger.warn('Could not parse ranking from LLM response', {
					metadata: {
						responsePreview: llmResponse.substring(0, 200),
						flightCount: flights.length,
					},
				});
				return flights;
			}
			ranking = JSON.parse(match[0]);
		} else {
			logger.warn('Unexpected LLM response type', {
				metadata: { responseType: typeof llmResponse, flightCount: flights.length },
			});
			return flights;
		}

		// Validate ranking
		if (!Array.isArray(ranking) || ranking.length !== flights.length) {
			logger.warn('Invalid ranking length', {
				metadata: {
					expected: flights.length,
					received: ranking.length,
					ranking: ranking.slice(0, 5),
				},
			});
			return flights;
		}

		// Convert 1-based indices to 0-based and reorder flights
		return ranking.map((idx) => flights[idx - 1]).filter((f) => f !== undefined);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		logger.error('Error parsing flight ranking', err, {
			metadata: {
				responseType: typeof llmResponse,
				flightCount: flights.length,
				responsePreview: typeof llmResponse === 'string' ? llmResponse.substring(0, 100) : 'non-string',
			},
		});
		return flights;
	}
}
