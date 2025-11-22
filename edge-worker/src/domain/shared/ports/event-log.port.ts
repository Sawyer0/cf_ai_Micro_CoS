/**
 * IEventLog - Port for event idempotency tracking
 *
 * Ensures at-least-once event semantics without duplicate side-effects
 */

export interface IEventLog {
	hasProcessed(eventId: string): Promise<boolean>;

	markProcessed(eventId: string, eventType: string): Promise<void>;
}
