/**
 * Port (interface) for episodic memory repository
 * Manages past conversations and experiences
 */

import type { EpisodicMemory, ConversationSummary, TravelHistoryEntry, TaskHistoryEntry } from '../EpisodicMemory';

export interface IEpisodicMemoryRepository {
	/**
	 * Retrieve episodic memory for a user
	 * @param limit Maximum number of items per category to retrieve
	 */
	getEpisodicMemory(userId: string, limit?: number): Promise<EpisodicMemory>;

	/**
	 * Add a conversation summary
	 */
	addConversationSummary(summary: Omit<ConversationSummary, 'id' | 'createdAt'>): Promise<void>;

	/**
	 * Add a travel history entry
	 */
	addTravelHistory(entry: Omit<TravelHistoryEntry, 'id' | 'createdAt'>): Promise<void>;

	/**
	 * Update travel booking status
	 */
	updateTravelStatus(entryId: string, status: TravelHistoryEntry['bookingStatus']): Promise<void>;

	/**
	 * Add a task history entry
	 */
	addTaskHistory(entry: Omit<TaskHistoryEntry, 'id' | 'createdAt'>): Promise<void>;

	/**
	 * Update task status
	 */
	updateTaskStatus(taskId: string, status: TaskHistoryEntry['status'], completedAt?: Date): Promise<void>;
}
