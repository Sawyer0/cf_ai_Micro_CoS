/**
 * D1 Database adapter for semantic memory
 * Implements ISemanticMemoryRepository using Cloudflare D1
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { ISemanticMemoryRepository } from '../../domain/memory/ports/ISemanticMemoryRepository';
import { SemanticMemory, UserProfile, UserPreference } from '../../domain/memory/SemanticMemory';

export class D1SemanticMemoryRepository implements ISemanticMemoryRepository {
    constructor(private readonly db: D1Database) { }

    async getSemanticMemory(userId: string): Promise<SemanticMemory> {
        // Ensure profile exists
        await this.ensureProfile(userId);

        // Fetch profile
        const profileResult = await this.db
            .prepare('SELECT * FROM user_profiles WHERE user_id = ?')
            .bind(userId)
            .first<any>();

        // Fetch preferences
        const preferencesResult = await this.db
            .prepare('SELECT * FROM user_preferences WHERE user_id = ? ORDER BY confidence DESC')
            .bind(userId)
            .all<any>();

        const profile: UserProfile = {
            userId: profileResult.user_id,
            homeAirport: profileResult.home_airport,
            preferredSeat: profileResult.preferred_seat,
            budgetDomesticUsd: profileResult.budget_domestic_usd,
            budgetInternationalUsd: profileResult.budget_international_usd,
            notificationPreferences: profileResult.notification_preferences
                ? JSON.parse(profileResult.notification_preferences)
                : undefined,
            createdAt: new Date(profileResult.created_at),
            updatedAt: new Date(profileResult.updated_at)
        };

        const preferences = new Map(
            (preferencesResult.results || []).map((p: any) => {
                const pref: UserPreference = {
                    id: p.id,
                    userId: p.user_id,
                    category: p.category,
                    preferenceKey: p.preference_key,
                    preferenceValue: p.preference_value,
                    confidence: p.confidence,
                    source: p.source || 'explicit',
                    createdAt: new Date(p.created_at),
                    updatedAt: new Date(p.updated_at)
                };
                return [`${p.category}:${p.preference_key}`, pref];
            })
        );

        return new SemanticMemory(profile, preferences);
    }

    async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
        const allowedFields = [
            'home_airport',
            'preferred_seat',
            'budget_domestic_usd',
            'budget_international_usd',
            'notification_preferences'
        ];

        const fields: string[] = [];
        const values: any[] = [];

        if (updates.homeAirport !== undefined) {
            fields.push('home_airport = ?');
            values.push(updates.homeAirport);
        }
        if (updates.preferredSeat !== undefined) {
            fields.push('preferred_seat = ?');
            values.push(updates.preferredSeat);
        }
        if (updates.budgetDomesticUsd !== undefined) {
            fields.push('budget_domestic_usd = ?');
            values.push(updates.budgetDomesticUsd);
        }
        if (updates.budgetInternationalUsd !== undefined) {
            fields.push('budget_international_usd = ?');
            values.push(updates.budgetInternationalUsd);
        }
        if (updates.notificationPreferences !== undefined) {
            fields.push('notification_preferences = ?');
            values.push(JSON.stringify(updates.notificationPreferences));
        }

        if (fields.length === 0) return;

        values.push(userId);

        await this.db
            .prepare(`
        UPDATE user_profiles 
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ?
      `)
            .bind(...values)
            .run();
    }

    async addPreference(
        userId: string,
        pref: Omit<UserPreference, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
    ): Promise<void> {
        const id = crypto.randomUUID();

        await this.db
            .prepare(`
        INSERT INTO user_preferences (
          id, user_id, category, preference_key, preference_value, confidence, source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, category, preference_key) 
        DO UPDATE SET 
          preference_value = excluded.preference_value,
          confidence = MAX(confidence, excluded.confidence),
          source = excluded.source,
          updated_at = CURRENT_TIMESTAMP
      `)
            .bind(
                id,
                userId,
                pref.category,
                pref.preferenceKey,
                pref.preferenceValue,
                pref.confidence || 1.0,
                pref.source || 'explicit'
            )
            .run();
    }

    async deletePreference(userId: string, category: string, key: string): Promise<void> {
        await this.db
            .prepare('DELETE FROM user_preferences WHERE user_id = ? AND category = ? AND preference_key = ?')
            .bind(userId, category, key)
            .run();
    }

    async ensureProfile(userId: string): Promise<void> {
        await this.db
            .prepare(`
        INSERT OR IGNORE INTO user_profiles (user_id) 
        VALUES (?)
      `)
            .bind(userId)
            .run();
    }
}
