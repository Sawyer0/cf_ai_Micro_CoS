export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
	readonly id: string;
	readonly role: MessageRole;
	readonly content: string;
	readonly timestamp: Date;
	readonly conversationId: string;
}

export class MessageEntity {
	private constructor(
		public readonly id: string,
		public readonly role: MessageRole,
		public readonly content: string,
		public readonly timestamp: Date,
		public readonly conversationId: string,
	) {}

	static create(role: MessageRole, content: string, conversationId: string): MessageEntity {
		return new MessageEntity(crypto.randomUUID(), role, content, new Date(), conversationId);
	}

	static reconstitute(data: Message): MessageEntity {
		return new MessageEntity(data.id, data.role, data.content, new Date(data.timestamp), data.conversationId);
	}

	toJSON(): Message {
		return {
			id: this.id,
			role: this.role,
			content: this.content,
			timestamp: this.timestamp,
			conversationId: this.conversationId,
		};
	}
}
