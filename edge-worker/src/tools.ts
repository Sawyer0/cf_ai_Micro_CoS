/**
 * Tool definitions and execution layer
 *
 * Maps .agent/tools specifications to executable tool invocations.
 * Handles tool_call/tool_result event emissions for streaming chat.
 *
 * Supported tools:
 * - flights-mcp: Search flights via Duffel API
 * - google-calendar-mcp: Query calendar events
 */

import { WorkerEnv, SseEvent } from './env';
import { Logger } from './observability/logger';
import { searchFlights } from './tools/flights-handler';
import { listEvents } from './tools/calendar-handler';

const logger = new Logger('tools');

/**
 * Tool definition with metadata and invocation spec
 */
export interface ToolDefinition {
	id: string;
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, { type: string; description: string }>;
		required: string[];
	};
}

/**
 * Tool call event emitted to client before invoking tool
 */
export interface ToolCallEvent {
	type: 'tool_call';
	name: string;
	args: Record<string, unknown>;
}

/**
 * Tool result event emitted after tool completes
 */
export interface ToolResultEvent {
	type: 'tool_result';
	result: Record<string, unknown>;
}

/**
 * Registry of available tools with definitions and handlers
 */
export class ToolRegistry {
	private tools: Map<string, ToolDefinition> = new Map();
	private handlers: Map<string, (args: Record<string, unknown>, env: WorkerEnv) => Promise<unknown>> = new Map();

	constructor() {
		this.registerToolsFromAgent();
	}

	private registerToolsFromAgent(): void {
		// Flights MCP
		this.register(
			'flights-mcp::search-flights',
			{
				id: 'flights-mcp::search-flights',
				name: 'search_flights',
				description: 'Search for available flights between origin and destination',
				parameters: {
					type: 'object',
					properties: {
						origin: { type: 'string', description: 'IATA code (e.g., SFO)' },
						destination: { type: 'string', description: 'IATA code (e.g., CDG)' },
						departure_date: { type: 'string', description: 'YYYY-MM-DD format' },
						return_date: { type: 'string', description: 'YYYY-MM-DD format (optional)' },
						adults: { type: 'number', description: 'Number of adults (default: 1)' },
						cabin_class: {
							type: 'string',
							description: 'economy | premium_economy | business | first',
						},
						max_connections: {
							type: 'number',
							description: 'Maximum number of stops (default: 2)',
						},
					},
					required: ['origin', 'destination', 'departure_date'],
				},
			},
			searchFlights,
		);

		// Google Calendar MCP
		this.register(
			'google-calendar-mcp::list-events',
			{
				id: 'google-calendar-mcp::list-events',
				name: 'list_events',
				description: 'Fetch calendar events within a date range',
				parameters: {
					type: 'object',
					properties: {
						calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
						timeMin: { type: 'string', description: 'ISO 8601 start time' },
						timeMax: { type: 'string', description: 'ISO 8601 end time' },
						maxResults: {
							type: 'number',
							description: 'Max events to return (default: 25, max: 2500)',
						},
						singleEvents: {
							type: 'boolean',
							description: 'Expand recurring events (default: false)',
						},
					},
					required: ['timeMin', 'timeMax'],
				},
			},
			listEvents,
		);
	}

	register(id: string, definition: ToolDefinition, handler: (args: Record<string, unknown>, env: WorkerEnv) => Promise<unknown>): void {
		this.tools.set(id, definition);
		this.handlers.set(id, handler);
	}

	getTool(id: string): ToolDefinition | undefined {
		return this.tools.get(id);
	}

	getHandler(id: string): ((args: Record<string, unknown>, env: WorkerEnv) => Promise<unknown>) | undefined {
		return this.handlers.get(id);
	}

	listTools(): ToolDefinition[] {
		return Array.from(this.tools.values());
	}
}

/**
 * Tool executor: invokes tools and handles errors with structured logging
 */
export class ToolExecutor {
	private registry: ToolRegistry;
	private correlationId: string;
	private env: WorkerEnv;

	constructor(registry: ToolRegistry, env: WorkerEnv, correlationId: string) {
		this.registry = registry;
		this.env = env;
		this.correlationId = correlationId;
	}

	async execute(toolId: string, args: Record<string, unknown>, send: (event: SseEvent) => void): Promise<unknown> {
		const tool = this.registry.getTool(toolId);
		if (!tool) {
			throw new Error(`Tool not found: ${toolId}`);
		}

		const handler = this.registry.getHandler(toolId);
		if (!handler) {
			throw new Error(`Handler not registered for tool: ${toolId}`);
		}

		const operationId = crypto.randomUUID();
		const toolInvocationId = crypto.randomUUID();

		try {
			// Emit tool_call event
			const toolCallEvent: ToolCallEvent = {
				type: 'tool_call',
				name: tool.name,
				args,
			};
			send(toolCallEvent);

			// Log invocation
			logger.info('Tool invocation started', {
				correlationId: this.correlationId,
				metadata: {
					toolId,
					toolName: tool.name,
					operationId,
					toolInvocationId,
					argsSize: JSON.stringify(args).length,
				},
			});

			// Execute tool
			const startTime = performance.now();
			const result = await handler(args, this.env);
			const latency = Math.round(performance.now() - startTime);

			// Emit tool_result event
			const toolResultEvent: ToolResultEvent = {
				type: 'tool_result',
				result: result as Record<string, unknown>,
			};
			send(toolResultEvent);

			// Log success
			logger.info('Tool invocation completed', {
				correlationId: this.correlationId,
				metadata: {
					toolId,
					toolName: tool.name,
					operationId,
					toolInvocationId,
					latencyMs: latency,
					resultSize: JSON.stringify(result).length,
				},
			});

			return result;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));

			// Log failure
			logger.error('Tool invocation failed', err, {
				correlationId: this.correlationId,
				metadata: {
					toolId,
					operationId,
					toolInvocationId,
				},
			});

			throw err;
		}
	}
}

// Tool handlers are imported from tools/flights-handler.ts and tools/calendar-handler.ts
