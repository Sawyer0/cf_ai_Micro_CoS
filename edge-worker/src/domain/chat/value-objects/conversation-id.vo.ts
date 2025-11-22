/**
 * ConversationId - Unique identifier for chat conversations
 *
 * Value Object in Chat Bounded Context
 */

export class ConversationId {
	private readonly value: string;

	private constructor(value: string) {
		if (!value || value.trim().length === 0) {
			throw new Error('ConversationId cannot be empty');
		}
		this.value = value;
	}

	static generate(): ConversationId {
		return new ConversationId(crypto.randomUUID());
	}

	static fromString(value: string): ConversationId {
		return new ConversationId(value);
	}

	toString(): string {
		return this.value;
	}

	equals(other: ConversationId): boolean {
		return this.value === other.value;
	}
}
