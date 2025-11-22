/**
 * Tool Integration Tests
 * End-to-end: Chat message → Tool invocation → Tool result → Next LLM turn
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ToolRegistry, ToolExecutor } from '../src/tools';
import { ToolCallParser } from '../src/tool-parser';

// Mock Env for testing
const mockEnv = {
	AI: {
		run: async (model: string, input: Record<string, unknown>) => ({
			response: 'Mock LLM response',
		}),
	},
	IDEMPOTENCY_KV: {
		get: async (key: string) => null,
		put: async (key: string, value: string, options?: Record<string, unknown>) => { },
	},
};

describe('Tool Registry', () => {
	let registry: ToolRegistry;

	beforeEach(() => {
		registry = new ToolRegistry();
	});

	test('registers tools on initialization', () => {
		const tools = registry.listTools();
		expect(tools.length).toBeGreaterThan(0);

		const flightsTool = tools.find((t) => t.id === 'flights-mcp::search-flights');
		expect(flightsTool).toBeDefined();
		expect(flightsTool?.name).toBe('search_flights');

		const calendarTool = tools.find((t) => t.id === 'google-calendar-mcp::list-events');
		expect(calendarTool).toBeDefined();
		expect(calendarTool?.name).toBe('list_events');
	});

	test('retrieves tool definition by ID', () => {
		const tool = registry.getTool('flights-mcp::search-flights');

		expect(tool).toBeDefined();
		expect(tool?.parameters.required).toContain('origin');
		expect(tool?.parameters.required).toContain('destination');
		expect(tool?.parameters.required).toContain('departure_date');
	});

	test('retrieves tool handler by ID', () => {
		const handler = registry.getHandler('flights-mcp::search-flights');

		expect(handler).toBeDefined();
		expect(typeof handler).toBe('function');
	});

	test('returns undefined for non-existent tool', () => {
		const tool = registry.getTool('non-existent-tool');
		expect(tool).toBeUndefined();
	});
});

describe('ToolExecutor', () => {
	let registry: ToolRegistry;
	let executor: ToolExecutor;
	let emittedEvents: Array<Record<string, unknown>> = [];

	beforeEach(() => {
		registry = new ToolRegistry();
		executor = new ToolExecutor(registry, mockEnv as any, 'test-correlation-id');
		emittedEvents = [];
	});

	test('emits tool_call event before execution', async () => {
		const send = (event: Record<string, unknown>) => {
			emittedEvents.push(event);
		};

		const args = {
			origin: 'SFO',
			destination: 'CDG',
			departure_date: '2025-05-10',
		};

		try {
			await executor.execute('flights-mcp::search-flights', args, send as any);
		} catch (e) {
			// Handler may throw, that's ok
		}

		// Should have at least one tool_call event
		const toolCallEvent = emittedEvents.find((e) => e.type === 'tool_call');
		expect(toolCallEvent).toBeDefined();
		expect(toolCallEvent?.name).toBe('search_flights');
		expect(toolCallEvent?.args).toEqual(args);
	});

	test('emits tool_result event after successful execution', async () => {
		const send = (event: Record<string, unknown>) => {
			emittedEvents.push(event);
		};

		const args = {
			origin: 'SFO',
			destination: 'CDG',
			departure_date: '2025-05-10',
		};

		await executor.execute('flights-mcp::search-flights', args, send as any);

		// Should have tool_result event
		const toolResultEvent = emittedEvents.find((e) => e.type === 'tool_result');
		expect(toolResultEvent).toBeDefined();
		expect((toolResultEvent?.result as any)?.status).toBe('success');
	});

	test('throws error for non-existent tool', async () => {
		const send = (event: Record<string, unknown>) => {
			emittedEvents.push(event);
		};

		await expect(
			executor.execute('non-existent-tool', {}, send as any),
		).rejects.toThrow('Tool not found');
	});

	test('throws error for invalid tool arguments', async () => {
		const send = (event: Record<string, unknown>) => {
			emittedEvents.push(event);
		};

		const invalidArgs = {
			origin: 'INVALID', // Too long for IATA code
			destination: 'CDG',
			departure_date: '2025-05-10',
		};

		await expect(
			executor.execute('flights-mcp::search-flights', invalidArgs, send as any),
		).rejects.toThrow();
	});
});

describe('Tool Integration: Chat → Tool → Result Flow', () => {
	let registry: ToolRegistry;
	let executor: ToolExecutor;
	let parser: ToolCallParser;

	beforeEach(() => {
		registry = new ToolRegistry();
		executor = new ToolExecutor(registry, mockEnv as any, 'test-correlation-id');
		parser = new ToolCallParser();
	});

	test('parses tool_call from LLM response and executes', async () => {
		const llmResponse =
			'Let me search for flights from SFO to CDG. <tool_call name="search_flights" args={"origin":"SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call> I found some flights.';

		// Parse tool calls from response
		const parseResult = parser.processChunk(llmResponse);
		expect(parseResult.tools).toHaveLength(1);

		// Execute tool
		const emittedEvents: Array<Record<string, unknown>> = [];
		const toolCall = parseResult.tools[0];

		const result = await executor.execute(
			`flights-mcp::${toolCall.name}`,
			toolCall.args,
			(event) => emittedEvents.push(event),
		);

		// Verify execution
		expect(result).toBeDefined();
		expect((result as any).status).toBe('success');
		expect((result as any).data).toBeDefined();

		// Verify events
		const toolCallEvent = emittedEvents.find((e) => e.type === 'tool_call');
		const toolResultEvent = emittedEvents.find((e) => e.type === 'tool_result');

		expect(toolCallEvent).toBeDefined();
		expect(toolResultEvent).toBeDefined();
	});

	test('handles multiple tool calls in sequence', async () => {
		const llmResponse =
			'Let me check your calendar. <tool_call name="list_events" args={"timeMin":"2025-05-10T00:00:00Z","timeMax":"2025-05-15T23:59:59Z"}></tool_call> And find flights. <tool_call name="search_flights" args={"origin":"SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call> Done.';

		// Parse all tool calls
		const parseResult = parser.processChunk(llmResponse);
		expect(parseResult.tools).toHaveLength(2);

		// Execute each tool
		const allEmittedEvents: Array<Record<string, unknown>> = [];

		for (const toolCall of parseResult.tools) {
			const toolId =
				toolCall.name === 'list_events'
					? 'google-calendar-mcp::list-events'
					: 'flights-mcp::search-flights';

			await executor.execute(toolId, toolCall.args, (event) => {
				allEmittedEvents.push(event);
			});
		}

		// Should have 2 tool_call and 2 tool_result events
		const toolCallEvents = allEmittedEvents.filter((e) => e.type === 'tool_call');
		const toolResultEvents = allEmittedEvents.filter((e) => e.type === 'tool_result');

		expect(toolCallEvents).toHaveLength(2);
		expect(toolResultEvents).toHaveLength(2);
	});

	test('preserves text between tool calls', async () => {
		const llmResponse =
			'Start. <tool_call name="search_flights" args={"origin":"SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call> Middle. <tool_call name="list_events" args={"timeMin":"2025-05-10T00:00:00Z","timeMax":"2025-05-15T23:59:59Z"}></tool_call> End.';

		const parseResult = parser.processChunk(llmResponse);

		expect(parseResult.text).toContain('Start');
		expect(parseResult.text).toContain('Middle');
		expect(parseResult.text).toContain('End');
		expect(parseResult.tools).toHaveLength(2);
	});
});

describe('Tool Error Handling', () => {
	let executor: ToolExecutor;

	beforeEach(() => {
		const registry = new ToolRegistry();
		executor = new ToolExecutor(registry, mockEnv as any, 'test-correlation-id');
	});

	test('handles missing required parameters', async () => {
		const send = () => { };

		await expect(
			executor.execute('flights-mcp::search-flights', { origin: 'SFO' }, send as any),
		).rejects.toThrow();
	});

	test('handles invalid IATA codes', async () => {
		const send = () => { };

		await expect(
			executor.execute(
				'flights-mcp::search-flights',
				{ origin: 'INVALID', destination: 'CDG', departure_date: '2025-05-10' },
				send as any,
			),
		).rejects.toThrow();
	});

	test('handles invalid date format', async () => {
		const send = () => { };

		await expect(
			executor.execute(
				'flights-mcp::search-flights',
				{ origin: 'SFO', destination: 'CDG', departure_date: 'invalid-date' },
				send as any,
			),
		).rejects.toThrow();
	});
});
