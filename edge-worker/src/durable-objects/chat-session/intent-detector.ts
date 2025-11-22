/**
 * IntentDetector - Lightweight intent detection for routing chat to workflows
 * 
 * Analyzes user messages to detect travel, task extraction, or planning intents
 * using keyword matching and optional simple LLM classification.
 * 
 * Returns workflow type to trigger + extracted entities.
 * 
 * Design principles:
 * - Lightweight (runs in Durable Object, not workflow)
 * - Fast keyword matching first
 * - Optional LLM call for ambiguous cases
 * - Extracts structured entities (dates, locations, etc.)
 */

export type WorkflowType = 'travel' | 'task' | 'planning' | null;

export interface IntentDetectionResult {
    workflow: WorkflowType;
    confidence: number; // 0-1
    entities: Record<string, unknown>;
    reasoning?: string;
}

export class IntentDetector {
    /**
     * Detect intent from user message using keyword matching
     */
    detect(message: string): IntentDetectionResult {
        const lowerMessage = message.toLowerCase();

        // Travel keywords
        const travelKeywords = ['flight', 'fly', 'trip', 'travel', 'visit', 'going to', 'book'];
        const hasTravelKeyword = travelKeywords.some(keyword => lowerMessage.includes(keyword));

        if (hasTravelKeyword) {
            return {
                workflow: 'travel',
                confidence: 0.8,
                entities: this.extractTravelEntities(message),
                reasoning: 'Detected travel keywords'
            };
        }

        // Planning keywords
        const planningKeywords = ['plan my day', 'schedule', 'agenda', 'what should i do'];
        const hasPlanningKeyword = planningKeywords.some(keyword => lowerMessage.includes(keyword));

        if (hasPlanningKeyword) {
            return {
                workflow: 'planning',
                confidence: 0.9,
                entities: { date: this.extractDate(message) || new Date().toISOString().split('T')[0] },
                reasoning: 'Detected planning keywords'
            };
        }

        // Task keywords
        const taskKeywords = ['remind me', 'add task', 'todo', 'need to', 'prep for'];
        const hasTaskKeyword = taskKeywords.some(keyword => lowerMessage.includes(keyword));

        if (hasTaskKeyword) {
            return {
                workflow: 'task',
                confidence: 0.7,
                entities: this.extractTaskEntities(message),
                reasoning: 'Detected task keywords'
            };
        }

        // No clear intent detected
        return {
            workflow: null,
            confidence: 0,
            entities: {},
            reasoning: 'No workflow-triggering intent detected'
        };
    }

    /**
     * Extract travel entities (origin, destination, dates)
     */
    private extractTravelEntities(message: string): Record<string, unknown> {
        return {
            origin: this.extractOrigin(message) || 'JFK', // Default to JFK for now if not found
            destination: this.extractDestination(message),
            departureDate: this.extractDate(message) || new Date().toISOString().split('T')[0],
            returnDate: null
        };
    }

    /**
     * Extract task entities (description, deadline)
     */
    private extractTaskEntities(message: string): Record<string, unknown> {
        return {
            description: message,
            deadline: this.extractDate(message)
        };
    }

    /**
     * Extract destination from message (simple regex)
     */
    private extractDestination(message: string): string | null {
        // Match "to [City]" or "going to [City]" or "to [AIRPORT]"
        const patterns = [
            /to ([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/,
            /going to ([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/,
            /visit ([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/,
            /to ([A-Z]{3})/ // Airport code
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    /**
     * Extract origin from message (simple regex)
     */
    private extractOrigin(message: string): string | null {
        // Match "from [City]" or "from [AIRPORT]"
        const patterns = [
            /from ([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/,
            /from ([A-Z]{3})/ // Airport code
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    /**
     * Extract date from message (simple patterns)
     */
    private extractDate(message: string): string | null {
        // Match YYYY-MM-DD
        const isoMatch = message.match(/\d{4}-\d{2}-\d{2}/);
        if (isoMatch) return isoMatch[0];

        // Match "next week" (approximate)
        if (message.includes('next week')) {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            return d.toISOString().split('T')[0];
        }

        // Match "tomorrow"
        if (message.includes('tomorrow')) {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            return d.toISOString().split('T')[0];
        }

        return null;
    }
}
