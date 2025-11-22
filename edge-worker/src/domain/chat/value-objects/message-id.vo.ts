/**
 * MessageId - Unique identifier for chat messages
 *
 * Value Object in Chat Bounded Context
 */

export class MessageId {
	private readonly value: string;

	private constructor(value: string) {
		if (!value || value.trim().length === 0) {
			throw new Error('MessageId cannot be empty');
		}
		this.value = value;
	}

	static generate(): MessageId {
		return new MessageId(crypto.randomUUID());
	}

	static fromString(value: string): MessageId {
		return new MessageId(value);
	}

	toString(): string {
		return this.value;
	}

	equals(other: MessageId): boolean {
		return this.value === other.value;
	}
}
