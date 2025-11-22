/**
 * GoogleCalendarMapper - Translates Google Calendar API responses to domain entities
 *
 * Implements Anti-Corruption Layer (ACL) for Google Calendar format
 */

import { CalendarEvent } from '../../../domain/calendar/entities/calendar-event.entity';
import { Logger } from '../../../observability/logger';

export interface GoogleCalendarEvent {
	id: string;
	summary: string;
	description?: string;
	start: {
		dateTime?: string;
		date?: string;
		timeZone?: string;
	};
	end: {
		dateTime?: string;
		date?: string;
		timeZone?: string;
	};
	location?: string;
	attendees?: Array<{
		email: string;
		displayName?: string;
		responseStatus: string;
	}>;
	organizer?: {
		email: string;
		displayName?: string;
	};
	status: string;
	transparency?: string;
	visibility?: string;
}

export class GoogleCalendarMapper {
	constructor(private readonly logger: Logger) {}

	translateEvents(events: GoogleCalendarEvent[], userId: string): CalendarEvent[] {
		return events.filter((e) => this.isValidEvent(e)).map((e) => this.translateEvent(e, userId));
	}

	translateEvent(event: GoogleCalendarEvent, userId: string): CalendarEvent {
		const startDate = this.parseGoogleDate(event.start);
		const endDate = this.parseGoogleDate(event.end);

		return CalendarEvent.reconstitute(
			event.id,
			event.summary,
			startDate,
			endDate,
			{
				externalId: event.id,
				calendarProvider: 'google',
				location: event.location,
				participants: event.attendees?.map((a) => a.email),
			},
			event.description,
		);
	}

	private isValidEvent(event: GoogleCalendarEvent): boolean {
		if (!event.id || !event.summary) {
			this.logger.debug('Invalid event: missing id or summary', {
				metadata: { eventId: event.id },
			});
			return false;
		}

		if (!event.start) {
			this.logger.debug('Invalid event: missing start date', {
				metadata: { eventId: event.id },
			});
			return false;
		}

		return true;
	}

	private parseGoogleDate(dateObj: { dateTime?: string; date?: string }): Date {
		if (dateObj.dateTime) {
			return new Date(dateObj.dateTime);
		}

		if (dateObj.date) {
			// Date-only format (YYYY-MM-DD)
			return new Date(`${dateObj.date}T00:00:00Z`);
		}

		throw new Error('Invalid date format in Google event');
	}
}
