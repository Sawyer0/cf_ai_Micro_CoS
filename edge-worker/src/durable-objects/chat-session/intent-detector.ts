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

export interface DialogueState {
	lastSuggestion?: {
		origin?: string;
		destination?: string;
		date?: string;
		type: 'travel' | 'task' | 'planning';
	};
}

export interface IntentDetectionResult {
	workflow: WorkflowType;
	confidence: number; // 0-1
	entities: Record<string, unknown>;
	reasoning?: string;
	usedFallback?: boolean;
}

export class IntentDetector {
	/**
	 * Detect intent from user message using keyword matching
	 * Optionally use previous message context for fallback entity extraction
	 * 
	 * Uses dialogue state to preserve context across turns (e.g., "yes do that")
	 */
	detect(message: string, previousMessages?: string[], dialogueState?: DialogueState): IntentDetectionResult {
		const lowerMessage = message.toLowerCase();

		// Check if this is a confirmation of previous suggestion
		const confirmationKeywords = ['yes', 'yep', 'ok', 'sure', 'do that', 'go ahead', 'perfect', 'sounds good'];
		const isConfirmation = confirmationKeywords.some((kw) => lowerMessage.includes(kw));
		
		if (isConfirmation && message.length < 50 && dialogueState?.lastSuggestion) {
			// Use the stored suggestion from dialogue state (best practice for DST)
			const suggestion = dialogueState.lastSuggestion;
			return {
				workflow: suggestion.type,
				confidence: 0.95,
				entities: {
					origin: suggestion.origin,
					destination: suggestion.destination,
					departureDate: suggestion.date || new Date().toISOString().split('T')[0],
				},
				reasoning: 'User confirmed previous suggestion via dialogue state',
				usedFallback: false,
			};
		}

		// Travel keywords (base detection)
		const travelKeywords = ['flight', 'fly', 'trip', 'travel', 'visit', 'going to', 'book', 'somewhere', 'leave'];
		const hasTravelKeyword = travelKeywords.some((keyword) => lowerMessage.includes(keyword));

		// City-to-city patterns (e.g., "NYC to PHL")
		const cityToCityPattern = /[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?\s+to\s+[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?/;
		const hasCityToCity = cityToCityPattern.test(message);

		if (hasTravelKeyword || hasCityToCity) {
			let entities = this.extractTravelEntities(message);
			let usedFallback = false;

			// If no destination found but travel intent is clear, try previous messages
			if (!entities.destination && previousMessages && previousMessages.length > 0) {
				const fallbackEntities = this.extractTravelEntitiesFromContext(previousMessages);
				if (fallbackEntities.destination) {
					entities = {
						...entities,
						destination: fallbackEntities.destination,
						origin: fallbackEntities.origin || entities.origin,
					};
					usedFallback = true;
				}
			}

			return {
				workflow: 'travel',
				confidence: hasCityToCity ? 0.9 : 0.8,
				entities,
				reasoning: hasCityToCity ? 'Detected city-to-city travel pattern' : 'Detected travel keywords',
				usedFallback,
			};
		}

		// Planning keywords
		const planningKeywords = ['plan my day', 'schedule', 'agenda', 'what should i do'];
		const hasPlanningKeyword = planningKeywords.some((keyword) => lowerMessage.includes(keyword));

		if (hasPlanningKeyword) {
			return {
				workflow: 'planning',
				confidence: 0.9,
				entities: { date: this.extractDate(message) || new Date().toISOString().split('T')[0] },
				reasoning: 'Detected planning keywords',
			};
		}

		// Task keywords
		const taskKeywords = ['remind me', 'add task', 'todo', 'need to', 'prep for'];
		const hasTaskKeyword = taskKeywords.some((keyword) => lowerMessage.includes(keyword));

		if (hasTaskKeyword) {
			return {
				workflow: 'task',
				confidence: 0.7,
				entities: this.extractTaskEntities(message),
				reasoning: 'Detected task keywords',
			};
		}

		// No clear intent detected
		return {
			workflow: null,
			confidence: 0,
			entities: {},
			reasoning: 'No workflow-triggering intent detected',
		};
	}

	/**
	 * Extract travel entities (origin, destination, dates)
	 * Falls back to previous message context if not found
	 */
	private extractTravelEntities(message: string): Record<string, unknown> {
		return {
			origin: this.extractOrigin(message) || 'JFK', // Default to JFK for now if not found
			destination: this.extractDestination(message) || this.extractRelativeDestination(message),
			departureDate: this.extractDate(message) || new Date().toISOString().split('T')[0],
			returnDate: null,
		};
	}

	/**
	 * Extract travel entities from conversation history (previous messages)
	 * Used as fallback when current message lacks destination/origin
	 */
	private extractTravelEntitiesFromContext(previousMessages: string[]): Record<string, unknown> {
		// Search backwards through previous messages to find explicit travel intent
		for (const msg of previousMessages) {
			const destination = this.extractDestination(msg) || this.extractRelativeDestination(msg);
			const origin = this.extractOrigin(msg);

			if (destination) {
				return {
					origin: origin || 'JFK',
					destination,
					departureDate: this.extractDate(msg) || new Date().toISOString().split('T')[0],
				};
			}
		}

		return {
			destination: null,
			origin: 'JFK',
			departureDate: new Date().toISOString().split('T')[0],
		};
	}

	/**
	 * Extract task entities (description, deadline)
	 */
	private extractTaskEntities(message: string): Record<string, unknown> {
		return {
			description: message,
			deadline: this.extractDate(message),
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
			/to ([A-Z]{3})/, // Airport code
		];

		for (const pattern of patterns) {
			const match = message.match(pattern);
			if (match) return match[1];
		}

		return null;
	}

	/**
	 * Extract relative destination (e.g., "somewhere else like NYC to PHL" patterns)
	 * Catches follow-up queries that reference cities without explicit "to"
	 */
	private extractRelativeDestination(message: string): string | null {
		// Match patterns like "NYC to PHL" (city-to-city format)
		const cityPairPattern = /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s+to\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/;
		const match = message.match(cityPairPattern);
		if (match) {
			return match[2]; // Return the destination (second city)
		}

		// Match standalone city names when context suggests travel (e.g., "somewhere lese like NYC to PHL")
		const cityPattern = /like\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/;
		const cityMatch = message.match(cityPattern);
		if (cityMatch) {
			return cityMatch[1];
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
			/from ([A-Z]{3})/, // Airport code
		];

		for (const pattern of patterns) {
			const match = message.match(pattern);
			if (match) return match[1];
		}

		// Also extract origin from city-to-city pattern (e.g., "NYC to PHL")
		const cityPairPattern = /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s+to\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/;
		const match = message.match(cityPairPattern);
		if (match) {
			return match[1]; // Return the origin (first city)
		}

		return null;
	}

	/**
	 * Extract date from message (simple patterns)
	 */
	private extractDate(message: string): string | null {
		const lowerMessage = message.toLowerCase();

		// Match YYYY-MM-DD
		const isoMatch = message.match(/\d{4}-\d{2}-\d{2}/);
		if (isoMatch) return isoMatch[0];

		// Match "next week" (approximate - 7 days from now)
		if (lowerMessage.includes('next week')) {
			const d = new Date();
			d.setDate(d.getDate() + 7);
			return d.toISOString().split('T')[0];
		}

		// Match "leave next week" or similar
		if (lowerMessage.includes('leave') && lowerMessage.includes('week')) {
			const d = new Date();
			d.setDate(d.getDate() + 7);
			return d.toISOString().split('T')[0];
		}

		// Match "tomorrow"
		if (lowerMessage.includes('tomorrow')) {
			const d = new Date();
			d.setDate(d.getDate() + 1);
			return d.toISOString().split('T')[0];
		}

		// Match relative dates like "next [day]"
		const nextDayMatch = lowerMessage.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
		if (nextDayMatch) {
			const dayName = nextDayMatch[1];
			const d = new Date();
			const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayName.toLowerCase());
			const currentDay = d.getDay();
			const daysAhead = dayIndex - currentDay;
			if (daysAhead <= 0) {
				d.setDate(d.getDate() + daysAhead + 7);
			} else {
				d.setDate(d.getDate() + daysAhead);
			}
			return d.toISOString().split('T')[0];
		}

		return null;
	}
}
