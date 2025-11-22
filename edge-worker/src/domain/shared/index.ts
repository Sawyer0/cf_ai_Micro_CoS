/**
 * Shared Kernel - Public API
 *
 * Common value objects and base types used across all bounded contexts
 */

export { CorrelationId } from './value-objects/correlation-id.vo';
export { Principal } from './value-objects/principal.vo';
export { DateRange } from './value-objects/date-range.vo';
export { DomainEvent, BaseDomainEvent } from './events/domain-event.base';
