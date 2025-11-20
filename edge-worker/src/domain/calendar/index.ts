/**
 * Calendar Bounded Context - Public API
 */

// Aggregates
export { CalendarSync, SyncStatus } from './aggregates/calendar-sync.aggregate';

// Entities
export { CalendarEvent, CalendarEventMetadata } from './entities/calendar-event.entity';

// Events
export {
    CalendarSyncStarted,
    CalendarEventsSynced,
    TravelEventDetectedInCalendar
} from './events/calendar.events';

// Ports
export { ICalendarPort } from './ports/calendar.port';
