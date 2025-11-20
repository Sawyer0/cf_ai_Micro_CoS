/**
 * CorrelationId - Immutable unique identifier for request tracing
 * 
 * Value Object from Shared Kernel
 * Used across all bounded contexts for distributed tracing
 */

import { randomUUID } from 'crypto';

export class CorrelationId {
  private readonly value: string;

  private constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('CorrelationId cannot be empty');
    }
    this.value = value;
  }

  static generate(): CorrelationId {
    return new CorrelationId(randomUUID());
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
