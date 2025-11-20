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

import { Env, SseEvent } from './env';
import { searchFlights } from './tools/flights-handler';
import { listEvents } from './tools/calendar-handler';

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
	private handlers: Map<string, (args: Record<string, unknown>, env: Env) => Promise<unknown>> =
		new Map();

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

	register(
		id: string,
		definition: ToolDefinition,
		handler: (args: Record<string, unknown>, env: Env) => Promise<unknown>,
	): void {
		this.tools.set(id, definition);
		this.handlers.set(id, handler);
	}

	getTool(id: string): ToolDefinition | undefined {
		return this.tools.get(id);
	}

	getHandler(id: string): ((args: Record<string, unknown>, env: Env) => Promise<unknown>) | undefined {
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
	private env: Env;

	constructor(registry: ToolRegistry, env: Env, correlationId: string) {
		this.registry = registry;
		this.env = env;
		this.correlationId = correlationId;
	}

	async execute(
		toolId: string,
		args: Record<string, unknown>,
		send: (event: SseEvent) => void,
	): Promise<unknown> {
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
			console.log(JSON.stringify({
				correlationId: this.correlationId,
				operationId,
				toolInvocationId,
				event: 'tool_invocation_started',
				tool: toolId,
				args,
				timestamp: new Date().toISOString(),
			}));

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
			console.log(JSON.stringify({
				correlationId: this.correlationId,
				operationId,
				toolInvocationId,
				event: 'tool_invocation_success',
				tool: toolId,
				latency,
				resultSize: JSON.stringify(result).length,
				timestamp: new Date().toISOString(),
			}));

			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Log failure
			console.log(JSON.stringify({
				correlationId: this.correlationId,
				operationId,
				toolInvocationId,
				event: 'tool_invocation_error',
				tool: toolId,
				error: errorMessage,
				timestamp: new Date().toISOString(),
			}));

			throw error;
		}
	}
}

// Tool handlers are imported from tools/flights-handler.ts and tools/calendar-handler.ts
