/**
 * D1EventLogAdapter - Event deduplication using D1
 *
 * Implements IEventLog for idempotent event handling
 */

import { IEventLog } from '../../domain/shared/ports/event-log.port';
import { Logger } from '../../observability/logger';

export class D1EventLogAdapter implements IEventLog {
	constructor(
		private readonly db: D1Database,
		private readonly logger: Logger,
		private readonly ttlDays: number = 7,
	) {}

	async hasProcessed(eventId: string): Promise<boolean> {
		try {
			const row = await this.db
				.prepare(
					`
        SELECT 1 FROM event_log WHERE event_id = ?
      `,
				)
				.bind(eventId)
				.first();

			return row !== null;
		} catch (error) {
			this.logger.error('Failed to check event log', error as Error);
			return false;
		}
	}

	async markProcessed(eventId: string, eventType: string): Promise<void> {
		try {
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + this.ttlDays);

			await this.db
				.prepare(
					`
        INSERT INTO event_log (event_id, event_type, processed_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(event_id) DO NOTHING
      `,
				)
				.bind(eventId, eventType, new Date().toISOString(), expiresAt.toISOString())
				.run();
		} catch (error) {
			this.logger.error('Failed to mark event processed', error as Error);
			throw error;
		}
	}
}
