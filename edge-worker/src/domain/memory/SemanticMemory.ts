/**
 * Semantic Memory: User facts and preferences
 * 
 * This represents long-term memory about user preferences, habits, and profile information.
 * Examples: "Prefers Delta airlines", "Home airport is PHL", "Likes window seats"
 */

export interface UserProfile {
    userId: string;
    homeAirport?: string;
    preferredSeat?: 'window' | 'aisle' | 'middle';
    budgetDomesticUsd?: number;
    budgetInternationalUsd?: number;
    notificationPreferences?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserPreference {
    id: string;
    userId: string;
    category: 'airline' | 'hotel' | 'travel' | 'task';
    preferenceKey: string;
    preferenceValue: string;
    confidence: number; // 0.0-1.0
    source: 'explicit' | 'inferred';
    createdAt: Date;
    updatedAt: Date;
}

export class SemanticMemory {
    constructor(
        public readonly profile: UserProfile,
        public readonly preferences: Map<string, UserPreference>
    ) { }

    static empty(userId: string): SemanticMemory {
        return new SemanticMemory(
            {
                userId,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            new Map()
        );
    }

    getPreference(category: string, key: string): string | undefined {
        return this.preferences.get(`${category}:${key}`)?.preferenceValue;
    }

    getPreferredAirlines(): string[] {
        return Array.from(this.preferences.values())
            .filter(p => p.category === 'airline' && p.preferenceKey === 'preferred')
            .map(p => p.preferenceValue);
    }

    /**
     * Convert semantic memory to prompt context string
     * This is injected into the LLM's system prompt
     */
    toPromptContext(): string {
        const parts: string[] = [];

        if (this.profile.homeAirport) {
            parts.push(`Home airport: ${this.profile.homeAirport}`);
        }
        if (this.profile.preferredSeat) {
            parts.push(`Seat preference: ${this.profile.preferredSeat}`);
        }
        if (this.profile.budgetDomesticUsd) {
            parts.push(`Domestic flight budget: $${this.profile.budgetDomesticUsd}`);
        }

        const preferredAirlines = this.getPreferredAirlines();
        if (preferredAirlines.length > 0) {
            parts.push(`Preferred airlines: ${preferredAirlines.join(', ')}`);
        }

        // Add high-confidence preferences (>= 0.8)
        const highConfidencePrefs = Array.from(this.preferences.values())
            .filter(p => p.confidence >= 0.8 && p.category !== 'airline');

        for (const pref of highConfidencePrefs) {
            parts.push(`${pref.category} preference: ${pref.preferenceKey} = ${pref.preferenceValue}`);
        }

        return parts.length > 0
            ? `\n\n[User Profile]\n${parts.join('\n')}\n`
            : '';
    }

    /**
     * Serialize to JSON for storage
     */
    toJSON(): { profile: UserProfile; preferences: UserPreference[] } {
        return {
            profile: this.profile,
            preferences: Array.from(this.preferences.values())
        };
    }
}
