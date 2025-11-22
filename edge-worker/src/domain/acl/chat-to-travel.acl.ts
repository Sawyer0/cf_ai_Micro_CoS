/**
 * ChatToTravelACL - Anti-Corruption Layer
 *
 * Translates Chat domain intents into Travel domain events
 * Prevents Chat concepts from leaking into Travel bounded context
 */

import { TravelIntentDetected } from '../travel/events/travel.events';
import { CorrelationId } from '../shared/value-objects/correlation-id.vo';

export interface ChatTravelIntent {
	conversationId: string;
	messageId: string;
	origin: string;
	destination: string;
	departureDate: string;
	returnDate?: string;
	principalId?: string;
}

export class ChatToTravelACL {
	/**
	 * Translate chat-detected travel intent to Travel domain event
	 */
	translateTravelIntent(intent: ChatTravelIntent, correlationId: CorrelationId): TravelIntentDetected {
		// Generate a new travel event ID (not tied to chat domain IDs)
		const travelEventId = crypto.randomUUID();

		return new TravelIntentDetected(
			correlationId,
			travelEventId,
			intent.origin,
			intent.destination,
			intent.departureDate,
			intent.returnDate,
			intent.principalId,
		);
	}

	/**
	 * Extract travel keywords from chat message
	 */
	static detectTravelKeywords(message: string): boolean {
		const travelKeywords = ['flight', 'fly', 'trip', 'travel', 'book', 'from', 'to', 'depart', 'arrive', 'airport'];

		const lowerMessage = message.toLowerCase();
		return travelKeywords.some((keyword) => lowerMessage.includes(keyword));
	}
}
