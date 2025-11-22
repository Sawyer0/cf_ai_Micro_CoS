/**
 * Distributed Tracing with Correlation IDs
 *
 * Traces operations across services and stores
 */

import { Logger } from './logger';

export interface TraceSpan {
	operation: string;
	startTime: number;
	duration?: number;
	status: 'ok' | 'error';
	metadata?: Record<string, any>;
}

export class Tracer {
	private spans: Map<string, TraceSpan> = new Map();

	constructor(
		private readonly correlationId: string,
		private readonly logger: Logger,
	) {}

	async trace<T>(operation: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
		const spanId = crypto.randomUUID();
		const startTime = Date.now();

		this.spans.set(spanId, {
			operation,
			startTime,
			status: 'ok',
			metadata,
		});

		try {
			const result = await fn();
			const duration = Date.now() - startTime;

			this.spans.get(spanId)!.duration = duration;
			this.logger.debug(`Trace: ${operation} completed`, {
				correlationId: this.correlationId,
				metadata: { duration, ...metadata },
			});

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			this.spans.get(spanId)!.status = 'error';
			this.spans.get(spanId)!.duration = duration;

			this.logger.error(`Trace: ${operation} failed`, error as Error, {
				correlationId: this.correlationId,
				metadata: { duration, ...metadata },
			});

			throw error;
		}
	}

	getSpans(): TraceSpan[] {
		return Array.from(this.spans.values());
	}
}
