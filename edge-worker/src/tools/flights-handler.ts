/**
 * Flights Handler
 * Wires Duffel Offers API for flight searches
 * See: .agent/tools/flights-mcp/search-flights.md
 *
 * API Reference: https://duffel.com/docs/api/offer-requests/create-offer-request
 */

import { WorkerEnv } from '../env';
import { Logger } from '../observability/logger';

const DUFFEL_API_BASE = 'https://api.duffel.com';
const DUFFEL_API_VERSION = 'v2';
const logger = new Logger('flights-handler');

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
 * Duffel API response types
 */
interface DuffelPassenger {
	type: 'adult' | 'child' | 'infant';
	age?: number;
}

interface DuffelSlice {
	origin: string;
	destination: string;
	departure_date: string;
}

interface DuffelSegment {
	id: string;
	operating_carrier: {
		iata_code: string;
		name: string;
	};
	aircraft: {
		iata_code: string;
		name: string;
	};
	origin: {
		iata_code: string;
		name: string;
	};
	destination: {
		iata_code: string;
		name: string;
	};
	departure_at: string;
	arrival_at: string;
	duration: string; // ISO 8601 duration
	marketing_carrier: {
		iata_code: string;
		name: string;
	};
	flight_number: string;
	stops: Array<{ iata_code: string }>;
}

interface DuffelOfferSlice {
	segments: DuffelSegment[];
}

interface DuffelOffer {
	id: string;
	slices: DuffelOfferSlice[];
	owner: {
		iata_code: string;
		name: string;
	};
	base_amount: string;
	base_currency: string;
	tax_amount: string;
	tax_currency: string;
	total_amount: string;
	total_currency: string;
	expires_at: string;
}

interface DuffelOfferRequest {
	id: string;
	offers: DuffelOffer[];
	slices: DuffelSlice[];
	passengers: DuffelPassenger[];
}

/**
 * Parse ISO 8601 duration to minutes
 * Example: PT10H30M -> 630
 */
function isoDurationToMinutes(duration: string): number {
	const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return 0;

	let minutes = 0;
	if (match[1]) minutes += parseInt(match[1]) * 60;
	if (match[2]) minutes += parseInt(match[2]);
	if (match[3]) minutes += Math.ceil(parseInt(match[3]) / 60);
	return minutes;
}

/**
 * Maps Duffel offer to FlightOption
 */
function mapDuffelOfferToFlightOption(offer: DuffelOffer, sliceIndex: number = 0): FlightOption {
	const slice = offer.slices[sliceIndex];
	const firstSegment = slice.segments[0];
	const lastSegment = slice.segments[slice.segments.length - 1];

	// Calculate total duration
	const totalDuration = slice.segments.reduce((acc, seg) => acc + isoDurationToMinutes(seg.duration), 0);

	return {
		id: offer.id,
		airline: firstSegment.operating_carrier.iata_code,
		airline_name: firstSegment.operating_carrier.name,
		flight_number: firstSegment.flight_number,
		origin: {
			code: firstSegment.origin.iata_code,
			name: firstSegment.origin.name,
		},
		destination: {
			code: lastSegment.destination.iata_code,
			name: lastSegment.destination.name,
		},
		departure: {
			date: firstSegment.departure_at.split('T')[0],
			time: firstSegment.departure_at.split('T')[1].substring(0, 5),
			datetime: firstSegment.departure_at,
		},
		arrival: {
			date: lastSegment.arrival_at.split('T')[0],
			time: lastSegment.arrival_at.split('T')[1].substring(0, 5),
			datetime: lastSegment.arrival_at,
		},
		duration_minutes: totalDuration,
		stops: slice.segments.length - 1,
		direct: slice.segments.length === 1,
		price: {
			amount: parseFloat(offer.total_amount),
			currency: offer.total_currency,
		},
		expires_at: offer.expires_at,
	};
}

/**
 * Handles flight search requests
 * Makes real calls to Duffel Offers API
 */
export async function searchFlights(args: Record<string, unknown>, env: WorkerEnv): Promise<Record<string, unknown>> {
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
			logger.info('Flight search cache hit', {
				metadata: {
					cacheKey,
					origin: req.origin,
					destination: req.destination,
					departureDate: req.departure_date,
				},
			});
			return JSON.parse(cached);
		}
	} catch (e) {
		// Cache miss, continue
	}

	// 3. Call Duffel API
	const apiKey = env.DUFFEL_API_KEY;
	if (!apiKey) {
		throw new Error('DUFFEL_API_KEY environment variable is required');
	}

	// Build request slices
	const slices: DuffelSlice[] = [
		{
			origin: req.origin,
			destination: req.destination,
			departure_date: req.departure_date,
		},
	];

	// Add return slice if return_date provided
	if (req.return_date) {
		slices.push({
			origin: req.destination,
			destination: req.origin,
			departure_date: req.return_date,
		});
	}

	// Build request passengers
	const passengers: DuffelPassenger[] = [];
	const adultsCount = req.adults || 1;
	for (let i = 0; i < adultsCount; i++) {
		passengers.push({ type: 'adult' });
	}
	if (req.children) {
		for (let i = 0; i < req.children; i++) {
			passengers.push({ type: 'child', age: 10 }); // Default age for child
		}
	}

	const duffelRequest = {
		data: {
			slices,
			passengers,
			cabin_class: req.cabin_class,
			max_connections: req.max_connections,
		},
	};

	try {
		const startTime = performance.now();
		const offerResponse = await fetch(`${DUFFEL_API_BASE}/air/offer_requests?return_offers=true`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Duffel-Version': DUFFEL_API_VERSION,
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'Accept-Encoding': 'gzip',
			},
			body: JSON.stringify(duffelRequest),
		});

		const latency = performance.now() - startTime;

		if (!offerResponse.ok) {
			const errorBody = await offerResponse.text();
			const error = new Error(`Duffel API error: ${offerResponse.status} ${offerResponse.statusText}`);
			logger.error('Duffel API request failed', error, {
				metadata: {
					status: offerResponse.status,
					statusText: offerResponse.statusText,
					errorBody,
					origin: req.origin,
					destination: req.destination,
				},
			});
			throw error;
		}

		const offerData = (await offerResponse.json()) as { data: DuffelOfferRequest };
		const duffelOffers = offerData.data.offers || [];

		// Map Duffel offers to FlightOption format
		const flights: FlightOption[] = duffelOffers.map((offer) => mapDuffelOfferToFlightOption(offer, 0));

		const response = {
			status: 'success',
			data: flights,
			meta: {
				origin: req.origin,
				destination: req.destination,
				departure_date: req.departure_date,
				count: flights.length,
				latency_ms: Math.round(latency),
			},
		};

		// 4. Cache results for 30 minutes
		try {
			await env.IDEMPOTENCY_KV.put(cacheKey, JSON.stringify(response), {
				expirationTtl: 30 * 60,
			});
		} catch (e) {
			logger.warn('Failed to cache flight results', {
				metadata: {
					cacheKey,
					error: e instanceof Error ? e.message : String(e),
				},
			});
		}

		logger.info('Flight search completed', {
			metadata: {
				origin: req.origin,
				destination: req.destination,
				flightCount: flights.length,
				latencyMs: Math.round(latency),
				cabinClass: req.cabin_class,
			},
		});

		return response;
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		logger.error('Flight search failed', err, {
			metadata: {
				origin: req.origin,
				destination: req.destination,
				departureDate: req.departure_date,
			},
		});
		throw err;
	}
}
