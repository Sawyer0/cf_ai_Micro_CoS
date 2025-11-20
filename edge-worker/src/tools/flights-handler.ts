/**
 * Flights MCP Handler
 * Wraps Duffel API for flight searches
 * See: .agent/tools/flights-mcp/search-flights.md
 */

import { Env } from '../env';

export interface FlightSearchRequest {
	origin: string; // IATA code
	destination: string; // IATA code
	departure_date: string; // YYYY-MM-DD
	return_date?: string; // YYYY-MM-DD (optional)
	adults?: number;
	children?: number;
	cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
	max_connections?: number;
}

export interface FlightOption {
	id: string;
	airline: string;
	airline_name: string;
	flight_number: string;
	origin: { code: string; name: string };
	destination: { code: string; name: string };
	departure: { date: string; time: string; datetime: string };
	arrival: { date: string; time: string; datetime: string };
	duration_minutes: number;
	stops: number;
	direct: boolean;
	price: { amount: number; currency: string };
	expires_at: string;
}

/**
 * Validates flight search request
 */
function validateRequest(req: FlightSearchRequest): void {
	if (!req.origin || !req.destination || !req.departure_date) {
		throw new Error('origin, destination, and departure_date are required');
	}

	// Validate IATA codes (3 uppercase letters)
	const iataRegex = /^[A-Z]{3}$/;
	if (!iataRegex.test(req.origin)) {
		throw new Error(`Invalid origin IATA code: ${req.origin}`);
	}
	if (!iataRegex.test(req.destination)) {
		throw new Error(`Invalid destination IATA code: ${req.destination}`);
	}

	// Validate date format YYYY-MM-DD
	const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
	if (!dateRegex.test(req.departure_date)) {
		throw new Error(`Invalid departure_date format: ${req.departure_date}. Expected YYYY-MM-DD`);
	}

	if (req.return_date && !dateRegex.test(req.return_date)) {
		throw new Error(`Invalid return_date format: ${req.return_date}. Expected YYYY-MM-DD`);
	}
}

/**
 * Builds cache key for flight search results
 */
function buildCacheKey(req: FlightSearchRequest): string {
	return `flights:${req.origin}:${req.destination}:${req.departure_date}:${req.cabin_class || 'economy'}`;
}

/**
 * Handles flight search requests
 * TODO: Replace stub with actual Duffel API call
 */
export async function searchFlights(
	args: Record<string, unknown>,
	env: Env,
): Promise<Record<string, unknown>> {
	const req: FlightSearchRequest = {
		origin: args.origin as string,
		destination: args.destination as string,
		departure_date: args.departure_date as string,
		return_date: args.return_date as string | undefined,
		adults: (args.adults as number) || 1,
		cabin_class: (args.cabin_class as any) || 'economy',
		max_connections: (args.max_connections as number) || 2,
	};

	// 1. Validate input
	validateRequest(req);

	// 2. Check cache
	const cacheKey = buildCacheKey(req);
	try {
		const cached = await env.IDEMPOTENCY_KV.get(cacheKey);
		if (cached) {
			console.log(JSON.stringify({
				event: 'flight_search_cache_hit',
				cacheKey,
				timestamp: new Date().toISOString(),
			}));
			return JSON.parse(cached);
		}
	} catch (e) {
		// Cache miss, continue
	}

	// 3. Call Duffel API (STUB: replace with real implementation)
	// For now, return mock data
	const flights: FlightOption[] = [
		{
			id: 'off_stub_001',
			airline: 'BA',
			airline_name: 'British Airways',
			flight_number: '112',
			origin: { code: req.origin, name: `${req.origin} Airport` },
			destination: { code: req.destination, name: `${req.destination} Airport` },
			departure: {
				date: req.departure_date,
				time: '08:00',
				datetime: `${req.departure_date}T08:00:00Z`,
			},
			arrival: {
				date: req.departure_date,
				time: '21:00',
				datetime: `${req.departure_date}T21:00:00Z`,
			},
			duration_minutes: 780,
			stops: 0,
			direct: true,
			price: { amount: 920, currency: 'USD' },
			expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
		},
		{
			id: 'off_stub_002',
			airline: 'AF',
			airline_name: 'Air France',
			flight_number: '380',
			origin: { code: req.origin, name: `${req.origin} Airport` },
			destination: { code: req.destination, name: `${req.destination} Airport` },
			departure: {
				date: req.departure_date,
				time: '14:30',
				datetime: `${req.departure_date}T14:30:00Z`,
			},
			arrival: {
				date: req.departure_date,
				time: '04:00',
				datetime: `${req.departure_date}T04:00:00+01:00`,
			},
			duration_minutes: 810,
			stops: 1,
			direct: false,
			price: { amount: 750, currency: 'USD' },
			expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
		},
	];

	const response = {
		status: 'success',
		data: flights,
		meta: {
			origin: req.origin,
			destination: req.destination,
			departure_date: req.departure_date,
			count: flights.length,
		},
	};

	// 4. Cache results for 30 minutes
	try {
		await env.IDEMPOTENCY_KV.put(cacheKey, JSON.stringify(response), {
			expirationTtl: 30 * 60,
		});
	} catch (e) {
		console.warn('Failed to cache flight results', e);
	}

	console.log(JSON.stringify({
		event: 'flight_search_completed',
		origin: req.origin,
		destination: req.destination,
		resultCount: flights.length,
		timestamp: new Date().toISOString(),
	}));

	return response;
}
