/**
 * Episodic Memory: Past conversations and experiences
 * 
 * This represents long-term memory about specific events and experiences.
 * Examples: "Booked flight to LAX on Nov 28", "Discussed project deadline last week"
 */

export interface ConversationSummary {
    id: string;
    userId: string;
    conversationId: string;
    summary: string;
    keyEntities?: {
        airports?: string[];
        dates?: string[];
        people?: string[];
        tasks?: string[];
    };
    sentiment?: 'positive' | 'neutral' | 'negative';
    createdAt: Date;
}

export interface TravelHistoryEntry {
    id: string;
    userId: string;
    fromAirport: string;
    toAirport: string;
    departureDate?: Date;
    returnDate?: Date;
    airline?: string;
    costUsd?: number;
    cabinClass?: string;
    bookingStatus: 'planned' | 'booked' | 'completed' | 'cancelled';
    createdAt: Date;
}

export interface TaskHistoryEntry {
    id: string;
    userId: string;
    taskDescription: string;
    taskCategory?: 'work' | 'personal' | 'travel';
    status: 'pending' | 'completed' | 'cancelled';
    dueDate?: Date;
    completedAt?: Date;
    createdAt: Date;
}

export class EpisodicMemory {
    constructor(
        public readonly conversations: ConversationSummary[],
        public readonly travelHistory: TravelHistoryEntry[],
        public readonly taskHistory: TaskHistoryEntry[]
    ) { }

    static empty(): EpisodicMemory {
        return new EpisodicMemory([], [], []);
    }

    /**
     * Get recent trips for context
     */
    getRecentTrips(limit = 3): TravelHistoryEntry[] {
        return this.travelHistory
            .filter(t => t.bookingStatus !== 'cancelled')
            .slice(0, limit);
    }

    /**
     * Get pending tasks
     */
    getPendingTasks(): TaskHistoryEntry[] {
        return this.taskHistory.filter(t => t.status === 'pending');
    }

    /**
     * Convert episodic memory to prompt context string
     */
    toPromptContext(): string {
        const parts: string[] = [];

        // Recent trips
        const recentTrips = this.getRecentTrips(3);
        if (recentTrips.length > 0) {
            parts.push('[Recent Trips]');
            recentTrips.forEach(trip => {
                const dateStr = trip.departureDate?.toLocaleDateString() || 'TBD';
                const status = trip.bookingStatus === 'completed' ? '(completed)' :
                    trip.bookingStatus === 'booked' ? '(booked)' : '(planned)';
                parts.push(`- ${trip.fromAirport} → ${trip.toAirport} on ${dateStr} ${status}`);
            });
        }

        // Pending tasks
        const pending = this.getPendingTasks().slice(0, 3);
        if (pending.length > 0) {
            parts.push('\n[Pending Tasks]');
            pending.forEach(task => {
                const dueStr = task.dueDate ? ` (due ${task.dueDate.toLocaleDateString()})` : '';
                parts.push(`- ${task.taskDescription}${dueStr}`);
            });
        }

        // Recent conversation summaries
        if (this.conversations.length > 0) {
            parts.push('\n[Recent Conversation Topics]');
            this.conversations.slice(0, 2).forEach(conv => {
                parts.push(`- ${conv.summary}`);
            });
        }

        return parts.length > 0 ? `\n${parts.join('\n')}\n` : '';
    }
}
