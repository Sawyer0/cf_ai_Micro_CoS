/**
 * DateRange - Immutable date span
 * 
 * Value Object from Shared Kernel
 * Used for calendar events, travel dates, task deadlines
 */

export class DateRange {
    readonly start: Date;
    readonly end: Date;

    private constructor(start: Date, end: Date) {
        if (start >= end) {
            throw new Error('DateRange start must be before end');
        }
        this.start = start;
        this.end = end;
    }

    static create(start: Date, end: Date): DateRange {
        return new DateRange(start, end);
    }

    overlaps(other: DateRange): boolean {
        return this.start < other.end && this.end > other.start;
    }

    contains(date: Date): boolean {
        return date >= this.start && date <= this.end;
    }

    durationMs(): number {
        return this.end.getTime() - this.start.getTime();
    }

    durationDays(): number {
        return Math.ceil(this.durationMs() / (1000 * 60 * 60 * 24));
    }
}
