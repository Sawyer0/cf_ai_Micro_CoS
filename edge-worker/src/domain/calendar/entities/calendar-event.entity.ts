/**
 * CalendarEvent - Entity in Calendar Bounded Context
 *
 * Represents synced calendar event from external calendar
 */

export interface CalendarEventMetadata {
	externalId: string;
	calendarProvider: string;
	location?: string;
	participants?: string[];
}

export class CalendarEvent {
	readonly id: string;
	readonly title: string;
	readonly startTime: Date;
	readonly endTime: Date;
	readonly description?: string;
	readonly metadata: CalendarEventMetadata;

	private constructor(id: string, title: string, startTime: Date, endTime: Date, metadata: CalendarEventMetadata, description?: string) {
		if (startTime >= endTime) {
			throw new Error('Calendar event start must be before end');
		}

		this.id = id;
		this.title = title;
		this.startTime = startTime;
		this.endTime = endTime;
		this.metadata = metadata;
		this.description = description;
	}

	static create(title: string, startTime: Date, endTime: Date, metadata: CalendarEventMetadata, description?: string): CalendarEvent {
		return new CalendarEvent(crypto.randomUUID(), title, startTime, endTime, metadata, description);
	}

	static reconstitute(
		id: string,
		title: string,
		startTime: Date,
		endTime: Date,
		metadata: CalendarEventMetadata,
		description?: string,
	): CalendarEvent {
		return new CalendarEvent(id, title, startTime, endTime, metadata, description);
	}

	durationMs(): number {
		return this.endTime.getTime() - this.startTime.getTime();
	}

	containsTravelKeywords(): boolean {
		const keywords = ['flight', 'hotel', 'trip', 'travel', 'vacation'];
		const searchText = `${this.title} ${this.description || ''}`.toLowerCase();
		return keywords.some((keyword) => searchText.includes(keyword));
	}
}
