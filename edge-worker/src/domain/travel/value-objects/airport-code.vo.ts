/**
 * AirportCode - IATA airport code value object
 * 
 * Value Object in Travel Bounded Context
 * Enforces 3-letter IATA format
 */

export class AirportCode {
    private readonly value: string;

    private constructor(value: string) {
        const normalized = value.toUpperCase().trim();
        if (!/^[A-Z]{3}$/.test(normalized)) {
            throw new Error(`Invalid airport code: ${value}. Must be 3 letters.`);
        }
        this.value = normalized;
    }

    static create(value: string): AirportCode {
        return new AirportCode(value);
    }

    toString(): string {
        return this.value;
    }

    equals(other: AirportCode): boolean {
        return this.value === other.value;
    }
}
