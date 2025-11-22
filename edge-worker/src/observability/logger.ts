/**
 * Structured Logger for Cloudflare Workers
 *
 * Provides JSON-formatted logging with correlation IDs and context
 * Compatible with Cloudflare Logpush
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
	correlationId?: string;
	principalId?: string;
	conversationId?: string;
	eventId?: string;
	metadata?: Record<string, any>;
}

export class Logger {
	constructor(private readonly serviceName: string) {}

	debug(message: string, context?: LogContext): void {
		this.log('debug', message, context);
	}

	info(message: string, context?: LogContext): void {
		this.log('info', message, context);
	}

	warn(message: string, context?: LogContext): void {
		this.log('warn', message, context);
	}

	error(message: string, error?: Error, context?: LogContext): void {
		const errorContext = error ? { ...context, error: { message: error.message, stack: error.stack } } : context;
		this.log('error', message, errorContext);
	}

	private log(level: LogLevel, message: string, context?: LogContext): void {
		const logEntry: Record<string, any> = {
			level,
			timestamp: new Date().toISOString(),
			service: this.serviceName,
			message,
			...context?.metadata,
			correlationId: context?.correlationId,
			principalId: context?.principalId,
			conversationId: context?.conversationId,
			eventId: context?.eventId,
		};

		// Remove undefined fields
		Object.keys(logEntry).forEach((key) => logEntry[key] === undefined && delete logEntry[key]);

		console.log(JSON.stringify(logEntry));
	}
}
