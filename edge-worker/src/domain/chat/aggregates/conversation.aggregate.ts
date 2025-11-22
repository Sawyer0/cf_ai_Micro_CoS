/**
 * Conversation - Aggregate Root for Chat Bounded Context
 *
 * Enforces business invariants:
 * - Cannot add messages to closed conversations
 * - Must have at least one message
 * - Maintains message ordering
 */

import { ConversationId } from '../value-objects/conversation-id.vo';
import { Message } from '../entities/message.entity';

export type ConversationStatus = 'active' | 'closed';

export class Conversation {
	readonly id: ConversationId;
	private status: ConversationStatus;
	private messages: Message[];
	private readonly createdAt: Date;
	private updatedAt: Date;

	private constructor(id: ConversationId, status: ConversationStatus, messages: Message[], createdAt: Date, updatedAt: Date) {
		this.id = id;
		this.status = status;
		this.messages = messages;
		this.createdAt = createdAt;
		this.updatedAt = updatedAt;
	}

	static create(initialMessage: Message): Conversation {
		const now = new Date();
		return new Conversation(ConversationId.generate(), 'active', [initialMessage], now, now);
	}

	static reconstitute(id: string, status: ConversationStatus, messages: Message[], createdAt: Date, updatedAt: Date): Conversation {
		return new Conversation(ConversationId.fromString(id), status, messages, createdAt, updatedAt);
	}

	// Business invariant: cannot add to closed conversation
	addMessage(message: Message): void {
		if (this.status === 'closed') {
			throw new Error('Cannot add message to closed conversation');
		}
		this.messages.push(message);
		this.updatedAt = new Date();
	}

	close(): void {
		this.status = 'closed';
		this.updatedAt = new Date();
	}

	getMessages(): readonly Message[] {
		return [...this.messages];
	}

	getStatus(): ConversationStatus {
		return this.status;
	}

	messageCount(): number {
		return this.messages.length;
	}
}
