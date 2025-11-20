/**
 * CalendarSync - Aggregate Root for Calendar Bounded Context
 * 
 * Tracks calendar synchronization state per user
 */

export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'failed';

export class CalendarSync {
    readonly userId: string;
    private status: SyncStatus;
    private lastSyncTime?: Date;
    private nextSyncTime?: Date;
    private eventCount: number;
    private errorMessage?: string;

    private constructor(
        userId: string,
        status: SyncStatus,
        eventCount: number,
        lastSyncTime?: Date,
        nextSyncTime?: Date,
        errorMessage?: string
    ) {
        this.userId = userId;
        this.status = status;
        this.eventCount = eventCount;
        this.lastSyncTime = lastSyncTime;
        this.nextSyncTime = nextSyncTime;
        this.errorMessage = errorMessage;
    }

    static create(userId: string): CalendarSync {
        return new CalendarSync(userId, 'idle', 0);
    }

    static reconstitute(
        userId: string,
        status: SyncStatus,
        eventCount: number,
        lastSyncTime?: Date,
        nextSyncTime?: Date,
        errorMessage?: string
    ): CalendarSync {
        return new CalendarSync(
            userId,
            status,
            eventCount,
            lastSyncTime,
            nextSyncTime,
            errorMessage
        );
    }

    startSync(): void {
        this.status = 'syncing';
        this.errorMessage = undefined;
    }

    completeSync(eventCount: number, nextSyncTime?: Date): void {
        this.status = 'completed';
        this.lastSyncTime = new Date();
        this.eventCount = eventCount;
        this.nextSyncTime = nextSyncTime;
        this.errorMessage = undefined;
    }

    failSync(error: string): void {
        this.status = 'failed';
        this.errorMessage = error;
    }

    getStatus(): SyncStatus {
        return this.status;
    }

    needsSync(intervalMs: number): boolean {
        if (!this.lastSyncTime) return true;
        return Date.now() - this.lastSyncTime.getTime() > intervalMs;
    }
}
