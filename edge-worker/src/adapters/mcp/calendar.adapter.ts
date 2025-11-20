/**
 * GoogleCalendarAdapter - Calendar adapter using Google Calendar MCP
 * 
 * Implements ICalendarPort (ACL for Google Calendar API)
 * Note: This is a stub - actual MCP integration would use proper MCP client
 */

import { ICalendarPort } from '../../domain/calendar/ports/calendar.port';
import { CalendarEvent } from '../../domain/calendar/entities/calendar-event.entity';
import { Logger } from '../../observability/logger';

export class GoogleCalendarAdapter implements ICalendarPort {
    constructor(private readonly logger: Logger) { }

    async syncEvents(userId: string, since?: Date): Promise<CalendarEvent[]> {
        try {
            this.logger.info('Syncing calendar events', {
                metadata: { userId, since: since?.toISOString() }
            });

            // TODO: Actual MCP integration
            // For now, return empty array
            // In production, would call Google Calendar MCP server

            return [];
        } catch (error) {
            this.logger.error('Calendar sync failed', error as Error);
            return [];
        }
    }

    async createEvent(userId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent> {
        this.logger.info('Creating calendar event', { metadata: { userId } });

        // TODO: Actual MCP integration
        throw new Error('Not implemented - requires MCP integration');
    }
}
