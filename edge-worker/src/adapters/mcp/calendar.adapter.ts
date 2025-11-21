/**
 * GoogleCalendarAdapter - Calendar adapter using Google Calendar MCP
 *
 * Implements ICalendarPort by composing:
 * - GoogleCalendarMcpClient (HTTP layer)
 * - GoogleCalendarMapper (ACL/translation layer)
 */

import { ICalendarPort } from '../../domain/calendar/ports/calendar.port';
import { CalendarEvent } from '../../domain/calendar/entities/calendar-event.entity';
import { Logger } from '../../observability/logger';
import { GoogleCalendarMcpClient } from './clients/google-calendar-mcp.client';
import { GoogleCalendarMapper, GoogleCalendarEvent } from './mappers/google-calendar.mapper';

interface ListEventsResponse {
    events: GoogleCalendarEvent[];
}

export class GoogleCalendarAdapter implements ICalendarPort {
    private readonly client: GoogleCalendarMcpClient;
    private readonly mapper: GoogleCalendarMapper;

    constructor(
        private readonly mcpUrl: string,
        private readonly logger: Logger
    ) {
        this.client = new GoogleCalendarMcpClient(mcpUrl, logger);
        this.mapper = new GoogleCalendarMapper(logger);
    }

    async syncEvents(userId: string, since?: Date): Promise<CalendarEvent[]> {
        const correlationId = this.generateCorrelationId();

        try {
            this.logger.info('Starting calendar sync', {
                metadata: { userId, since: since?.toISOString(), correlationId }
            });

            const timeMin = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

            const response = await this.client.call<ListEventsResponse>(
                'list_events',
                {
                    calendarId: 'primary',
                    timeMin: timeMin.toISOString(),
                    timeMax: timeMax.toISOString(),
                    maxResults: 250,
                    singleEvents: true,
                    orderBy: 'startTime'
                },
                correlationId
            );

            const events = response.events || [];
            const converted = this.mapper.translateEvents(events, userId);

            this.logger.info('Calendar sync completed', {
                metadata: { userId, eventCount: converted.length, correlationId }
            });

            return converted;
        } catch (error) {
            this.logger.error('Calendar sync failed', error as Error, {
                metadata: { userId, correlationId }
            });
            return [];
        }
    }

    async createEvent(userId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent> {
        const correlationId = this.generateCorrelationId();

        try {
            this.logger.info('Creating calendar event', {
                metadata: { userId, title: event.title, correlationId }
            });

            // Build Google Calendar event format
            const location = (event.metadata as any)?.location;
            const participants = (event.metadata as any)?.participants;

            const googleEvent = {
                summary: event.title,
                description: event.description,
                start: {
                    dateTime: event.startTime?.toISOString(),
                    timeZone: 'UTC'
                },
                end: {
                    dateTime: event.endTime?.toISOString(),
                    timeZone: 'UTC'
                },
                location,
                attendees: participants?.map((email: string) => ({
                    email,
                    displayName: email
                }))
            };

            const result = await this.client.call<GoogleCalendarEvent>(
                'create_event',
                {
                    calendarId: 'primary',
                    body: googleEvent
                },
                correlationId
            );

            const converted = this.mapper.translateEvent(result, userId);

            this.logger.info('Calendar event created', {
                metadata: { userId, eventId: result.id, correlationId }
            });

            return converted;
        } catch (error) {
            this.logger.error('Event creation failed', error as Error, {
                metadata: { userId, correlationId }
            });
            throw error;
        }
    }

    private generateCorrelationId(): string {
        return `cal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
