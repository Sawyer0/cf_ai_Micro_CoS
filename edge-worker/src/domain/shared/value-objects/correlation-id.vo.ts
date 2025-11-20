/**
 * CorrelationId - Distributed tracing identifier
 * 
 * Value Object from Shared Kernel
 * Links requests across services and logs
 */

export class CorrelationId {
  private constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('CorrelationId cannot be empty');
    }
  }

  static generate(): CorrelationId {
    return new CorrelationId(crypto.randomUUID());
  }

  static fromString(value: string): CorrelationId {
    return new CorrelationId(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: CorrelationId): boolean {
    return this.value === other.value;
  }
}
