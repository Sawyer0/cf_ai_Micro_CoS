/**
 * Message - Individual chat message entity
 *
 * Entity in Chat Bounded Context
 * Immutable after creation (event sourcing pattern)
 */

import { MessageId } from '../value-objects/message-id.vo';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageMetadata {
	tokenCount?: number;
	model?: string;
	processingTimeMs?: number;
	[key: string]: any;
}

export class Message {
	readonly id: MessageId;
	readonly role: MessageRole;
	readonly content: string;
	readonly timestamp: Date;
	readonly metadata: MessageMetadata;

	private constructor(id: MessageId, role: MessageRole, content: string, timestamp: Date, metadata: MessageMetadata = {}) {
		if (!content || content.trim().length === 0) {
			throw new Error('Message content cannot be empty');
		}
		this.id = id;
		this.role = role;
		this.content = content;
		this.timestamp = timestamp;
		this.metadata = metadata;
	}

	static create(role: MessageRole, content: string, metadata?: MessageMetadata): Message {
		return new Message(MessageId.generate(), role, content, new Date(), metadata);
	}

	static reconstitute(id: string, role: MessageRole, content: string, timestamp: Date, metadata: MessageMetadata): Message {
		return new Message(MessageId.fromString(id), role, content, timestamp, metadata);
	}
}
