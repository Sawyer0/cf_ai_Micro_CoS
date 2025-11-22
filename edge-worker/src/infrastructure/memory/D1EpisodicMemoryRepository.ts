/**
 * D1 Database adapter for episodic memory
 * Implements IEpisodicMemoryRepository using Cloudflare D1
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { IEpisodicMemoryRepository } from '../../domain/memory/ports/IEpisodicMemoryRepository';
import { EpisodicMemory, ConversationSummary, TravelHistoryEntry, TaskHistoryEntry } from '../../domain/memory/EpisodicMemory';

export class D1EpisodicMemoryRepository implements IEpisodicMemoryRepository {
	constructor(private readonly db: D1Database) {}

	async getEpisodicMemory(userId: string, limit = 10): Promise<EpisodicMemory> {
		// Fetch conversation summaries
		const conversationsResult = await this.db
			.prepare('SELECT * FROM conversation_summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
			.bind(userId, limit)
			.all<any>();

		const conversations: ConversationSummary[] = (conversationsResult.results || []).map((row: any) => ({
			id: row.id,
			userId: row.user_id,
			conversationId: row.conversation_id,
			summary: row.summary,
			keyEntities: row.key_entities ? JSON.parse(row.key_entities) : undefined,
			sentiment: row.sentiment as any,
			createdAt: new Date(row.created_at),
		}));

		// Fetch travel history
		const travelResult = await this.db
			.prepare('SELECT * FROM travel_history WHERE user_id = ? ORDER BY departure_date DESC LIMIT ?')
			.bind(userId, limit)
			.all<any>();

		const travelHistory: TravelHistoryEntry[] = (travelResult.results || []).map((row: any) => ({
			id: row.id,
			userId: row.user_id,
			fromAirport: row.from_airport,
			toAirport: row.to_airport,
			departureDate: row.departure_date ? new Date(row.departure_date) : undefined,
			returnDate: row.return_date ? new Date(row.return_date) : undefined,
			airline: row.airline,
			costUsd: row.cost_usd,
			cabinClass: row.cabin_class,
			bookingStatus: row.booking_status as any,
			createdAt: new Date(row.created_at),
		}));

		// Fetch task history
		const tasksResult = await this.db
			.prepare('SELECT * FROM task_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
			.bind(userId, limit)
			.all<any>();

		const taskHistory: TaskHistoryEntry[] = (tasksResult.results || []).map((row: any) => ({
			id: row.id,
			userId: row.user_id,
			taskDescription: row.task_description,
			taskCategory: row.task_category as any,
			status: row.status as any,
			dueDate: row.due_date ? new Date(row.due_date) : undefined,
			completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
			createdAt: new Date(row.created_at),
		}));

		return new EpisodicMemory(conversations, travelHistory, taskHistory);
	}

	async addConversationSummary(summary: Omit<ConversationSummary, 'id' | 'createdAt'>): Promise<void> {
		const id = crypto.randomUUID();
		await this.db
			.prepare(
				`
        INSERT INTO conversation_summaries (id, user_id, conversation_id, summary, key_entities, sentiment)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
			)
			.bind(
				id,
				summary.userId,
				summary.conversationId,
				summary.summary,
				summary.keyEntities ? JSON.stringify(summary.keyEntities) : null,
				summary.sentiment || 'neutral',
			)
			.run();
	}

	async addTravelHistory(entry: Omit<TravelHistoryEntry, 'id' | 'createdAt'>): Promise<void> {
		const id = crypto.randomUUID();
		await this.db
			.prepare(
				`
        INSERT INTO travel_history (
          id, user_id, from_airport, to_airport, departure_date, return_date,
          airline, cost_usd, cabin_class, booking_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
			)
			.bind(
				id,
				entry.userId,
				entry.fromAirport,
				entry.toAirport,
				entry.departureDate?.toISOString().split('T')[0] || null,
				entry.returnDate?.toISOString().split('T')[0] || null,
				entry.airline || null,
				entry.costUsd || null,
				entry.cabinClass || null,
				entry.bookingStatus,
			)
			.run();
	}

	async updateTravelStatus(entryId: string, status: TravelHistoryEntry['bookingStatus']): Promise<void> {
		await this.db.prepare('UPDATE travel_history SET booking_status = ? WHERE id = ?').bind(status, entryId).run();
	}

	async addTaskHistory(entry: Omit<TaskHistoryEntry, 'id' | 'createdAt'>): Promise<void> {
		const id = crypto.randomUUID();
		await this.db
			.prepare(
				`
        INSERT INTO task_history (
          id, user_id, task_description, task_category, status, due_date, completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
			)
			.bind(
				id,
				entry.userId,
				entry.taskDescription,
				entry.taskCategory || null,
				entry.status,
				entry.dueDate?.toISOString().split('T')[0] || null,
				entry.completedAt?.toISOString() || null,
			)
			.run();
	}

	async updateTaskStatus(taskId: string, status: TaskHistoryEntry['status'], completedAt?: Date): Promise<void> {
		await this.db
			.prepare('UPDATE task_history SET status = ?, completed_at = ? WHERE id = ?')
			.bind(status, completedAt?.toISOString() || null, taskId)
			.run();
	}
}
