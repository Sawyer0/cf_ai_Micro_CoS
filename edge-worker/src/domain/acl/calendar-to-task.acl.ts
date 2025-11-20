/**
 * CalendarToTaskACL - Anti-Corruption Layer
 * 
 * Translates Calendar domain events into Task domain entities
 * Extracts actionable tasks from calendar events
 */

import { CalendarEvent } from '../calendar/entities/calendar-event.entity';
import { Task } from '../task/aggregates/task.aggregate';

export interface TaskExtractionResult {
    tasks: Task[];
    calendarEventId: string;
}

export class CalendarToTaskACL {
    /**
     * Extract tasks from calendar event
     */
    extractTasks(
        calendarEvent: CalendarEvent,
        userId: string
    ): TaskExtractionResult {
        const tasks: Task[] = [];

        // Example: create prep task for meetings
        if (this.isMeeting(calendarEvent)) {
            const prepTask = Task.create(
                `Prepare for: ${calendarEvent.title}`,
                userId,
                'medium',
                {
                    source: 'calendar',
                    relatedEventId: calendarEvent.id,
                    tags: ['meeting']
                },
                `Meeting at ${calendarEvent.startTime.toISOString()}`,
                new Date(calendarEvent.startTime.getTime() - 3600000) // 1 hour before
            );
            tasks.push(prepTask);
        }

        // Example: create follow-up task
        if (this.requiresFollowUp(calendarEvent)) {
            const followUpTask = Task.create(
                `Follow up: ${calendarEvent.title}`,
                userId,
                'low',
                {
                    source: 'calendar',
                    relatedEventId: calendarEvent.id,
                    tags: ['follow-up']
                },
                undefined,
                new Date(calendarEvent.endTime.getTime() + 86400000) // 1 day after
            );
            tasks.push(followUpTask);
        }

        return {
            tasks,
            calendarEventId: calendarEvent.id
        };
    }

    private isMeeting(event: CalendarEvent): boolean {
        const meetingKeywords = ['meeting', 'call', 'sync', 'standup', '1:1'];
        const title = event.title.toLowerCase();
        return meetingKeywords.some(keyword => title.includes(keyword));
    }

    private requiresFollowUp(event: CalendarEvent): boolean {
        const followUpKeywords = ['interview', 'client', 'review', 'presentation'];
        const title = event.title.toLowerCase();
        return followUpKeywords.some(keyword => title.includes(keyword));
    }
}
