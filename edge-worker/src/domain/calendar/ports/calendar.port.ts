/**
 * ICalendarPort - Port for calendar operations
 *
 * ACL for external calendar APIs (Google Calendar MCP)
 */

import { CalendarEvent } from '../entities/calendar-event.entity';

export interface ICalendarPort {
	syncEvents(userId: string, since?: Date): Promise<CalendarEvent[]>;

	createEvent(userId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent>;
}
