/**
 * Port (interface) for memory repository
 * Defines contract for semantic memory persistence
 */

import type { SemanticMemory, UserProfile, UserPreference } from '../SemanticMemory';

export interface ISemanticMemoryRepository {
    /**
     * Retrieve all semantic memory for a user
     */
    getSemanticMemory(userId: string): Promise<SemanticMemory>;

    /**
     * Update user profile fields
     */
    updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void>;

    /**
     * Add or update a user preference
     * Uses UPSERT logic - updates if exists, inserts if new
     */
    addPreference(
        userId: string,
        preference: Omit<UserPreference, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
    ): Promise<void>;

    /**
     * Delete a specific preference
     */
    deletePreference(userId: string, category: string, key: string): Promise<void>;

    /**
     * Initialize user profile if not exists
     */
    ensureProfile(userId: string): Promise<void>;
}
