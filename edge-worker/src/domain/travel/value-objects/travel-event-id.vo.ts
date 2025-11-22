/**
 * TravelEventId - Unique identifier for travel events
 *
 * Value Object in Travel Bounded Context
 */

export class TravelEventId {
	private readonly value: string;

	private constructor(value: string) {
		if (!value || value.trim().length === 0) {
			throw new Error('TravelEventId cannot be empty');
		}
		this.value = value;
	}

	static generate(): TravelEventId {
		return new TravelEventId(crypto.randomUUID());
	}

	static fromString(value: string): TravelEventId {
		return new TravelEventId(value);
	}

	toString(): string {
		return this.value;
	}

	equals(other: TravelEventId): boolean {
		return this.value === other.value;
	}
}
