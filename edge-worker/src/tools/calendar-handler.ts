/**
 * Google Calendar MCP Handler
 * Wraps Google Calendar API for event queries
 * See: .agent/tools/google-calendar-mcp/list-events.md
 */

import { WorkerEnv } from '../env';
import { Logger } from '../observability/logger';

const logger = new Logger('calendar-handler');

export interface ListEventsRequest {
	calendarId?: string; // Default: 'primary'
	timeMin: string; // ISO 8601
	timeMax: string; // ISO 8601
	maxResults?: number; // Default: 25, max: 2500
	singleEvents?: boolean; // Expand recurring
	orderBy?: 'startTime' | 'updated'; // Default: 'updated'
}

export interface CalendarEventAttendee {
	email: string;
	displayName?: string;
	responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
}

export interface CalendarEvent {
	id: string;
	summary: string;
	description?: string;
	location?: string;
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
	created: string;
	updated: string;
	attendees?: CalendarEventAttendee[];
}

/**
 * Validates calendar list request
 */
function validateRequest(req: ListEventsRequest): void {
	if (!req.timeMin || !req.timeMax) {
		throw new Error('timeMin and timeMax are required');
	}

	// Validate ISO 8601 format
	try {
		const minDate = new Date(req.timeMin);
		const maxDate = new Date(req.timeMax);
		if (isNaN(minDate.getTime()) || isNaN(maxDate.getTime())) {
			throw new Error('Invalid date format');
		}
		if (minDate >= maxDate) {
			throw new Error('timeMin must be before timeMax');
		}
	} catch (e) {
		throw new Error(`Invalid time range: ${e instanceof Error ? e.message : String(e)}`);
	}
}

/**
 * Builds cache key for calendar queries
 */
function buildCacheKey(req: ListEventsRequest): string {
	return `calendar:${req.calendarId || 'primary'}:${req.timeMin}:${req.timeMax}`;
}

/**
 * Handles calendar event list requests
 *
 * Integration Note: This method currently returns stubbed data for demonstration purposes.
 * In a production environment, this would be replaced by a direct call to the Google Calendar API
 * or an MCP client wrapper.
 */
export async function listEvents(args: Record<string, unknown>, env: WorkerEnv): Promise<Record<string, unknown>> {
	const req: ListEventsRequest = {
		calendarId: (args.calendarId as string) || 'primary',
		timeMin: args.timeMin as string,
		timeMax: args.timeMax as string,
		maxResults: (args.maxResults as number) || 25,
		singleEvents: (args.singleEvents as boolean) || false,
		orderBy: (args.orderBy as any) || 'updated',
	};

	// 1. Validate input
	validateRequest(req);

	// 2. Check cache
	const cacheKey = buildCacheKey(req);
	try {
		const cached = await env.IDEMPOTENCY_KV.get(cacheKey);
		if (cached) {
			logger.info('Calendar events cache hit', {
				metadata: {
					calendarId: req.calendarId,
					timeMin: req.timeMin,
					timeMax: req.timeMax,
				},
			});
			return JSON.parse(cached);
		}
	} catch (e) {
		// Cache miss, continue
	}

	// 3. Call Google Calendar API (STUB: replace with real implementation)
	// For now, return mock data
	const events: CalendarEvent[] = [
		{
			id: 'evt_stub_001',
			summary: 'Team Standup',
			description: 'Daily sync with the team',
			location: 'Conference Room A',
			start: { dateTime: req.timeMin },
			end: { dateTime: new Date(new Date(req.timeMin).getTime() + 60 * 60 * 1000).toISOString() },
			created: new Date().toISOString(),
			updated: new Date().toISOString(),
			attendees: [
				{
					email: 'user@company.com',
					displayName: 'You',
					responseStatus: 'accepted',
				},
				{
					email: 'colleague@company.com',
					displayName: 'Colleague',
					responseStatus: 'accepted',
				},
			],
		},
		{
			id: 'evt_stub_002',
			summary: 'Q1 Planning Meeting',
			description: 'Strategic planning for Q1',
			location: 'Virtual',
			start: {
				dateTime: new Date(new Date(req.timeMin).getTime() + 4 * 60 * 60 * 1000).toISOString(),
			},
			end: {
				dateTime: new Date(new Date(req.timeMin).getTime() + 5.5 * 60 * 60 * 1000).toISOString(),
			},
			created: new Date().toISOString(),
			updated: new Date().toISOString(),
			attendees: [
				{
					email: 'user@company.com',
					displayName: 'You',
					responseStatus: 'tentative',
				},
			],
		},
	];

	const response = {
		status: 'success',
		data: events,
		meta: {
			calendarId: req.calendarId,
			timeMin: req.timeMin,
			timeMax: req.timeMax,
			count: events.length,
		},
	};

	// 4. Cache results for 5 minutes
	try {
		await env.IDEMPOTENCY_KV.put(cacheKey, JSON.stringify(response), {
			expirationTtl: 5 * 60,
		});
	} catch (e) {
		logger.warn('Failed to cache calendar events', {
			metadata: {
				error: e instanceof Error ? e.message : String(e),
				calendarId: req.calendarId,
			},
		});
	}

	logger.info('Calendar events list completed', {
		metadata: {
			calendarId: req.calendarId,
			eventCount: events.length,
			timeMin: req.timeMin,
			timeMax: req.timeMax,
		},
	});

	return response;
}
