/**
 * Tool Parser Unit Tests
 */

import { ToolCallParser } from '../src/tool-parser';

describe('ToolCallParser', () => {
	let parser: ToolCallParser;

	beforeEach(() => {
		parser = new ToolCallParser();
	});

	test('extracts single tool call from text', () => {
		const input =
			'Let me search for flights. <tool_call name="search_flights" args={"origin":"SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call> I found some options.';

		const result = parser.processChunk(input);

		expect(result.text).toContain('Let me search for flights');
		expect(result.text).toContain('I found some options');
		expect(result.tools).toHaveLength(1);
		expect(result.tools[0].name).toBe('search_flights');
		expect(result.tools[0].args.origin).toBe('SFO');
		expect(result.tools[0].args.destination).toBe('CDG');
		expect(result.tools[0].args.departure_date).toBe('2025-05-10');
		expect(result.hasIncompleteToolCall).toBe(false);
	});

	test('extracts multiple tool calls from text', () => {
		const input =
			'<tool_call name="list_events" args={"timeMin":"2025-05-10T00:00:00Z","timeMax":"2025-05-15T23:59:59Z"}></tool_call> Your calendar shows several events. <tool_call name="search_flights" args={"origin":"SFO","destination":"JFK","departure_date":"2025-05-10"}></tool_call> Here are flights.';

		const result = parser.processChunk(input);

		expect(result.tools).toHaveLength(2);
		expect(result.tools[0].name).toBe('list_events');
		expect(result.tools[1].name).toBe('search_flights');
		expect(result.hasIncompleteToolCall).toBe(false);
	});

	test('handles incomplete tool call at chunk boundary', () => {
		const chunk1 = 'Let me search. <tool_call name="search_flights" args={"origin":"';
		const result1 = parser.processChunk(chunk1);

		expect(result1.tools).toHaveLength(0);
		expect(result1.hasIncompleteToolCall).toBe(true);
		expect(result1.text).toBe('Let me search. ');

		const chunk2 =
			'SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call> Done.';
		const result2 = parser.processChunk(chunk2);

		expect(result2.tools).toHaveLength(1);
		expect(result2.tools[0].name).toBe('search_flights');
		expect(result2.hasIncompleteToolCall).toBe(false);
		expect(result2.text).toContain('Done');
	});

	test('handles text without tool calls', () => {
		const input = 'Just regular text, no tools here.';

		const result = parser.processChunk(input);

		expect(result.text).toBe('Just regular text, no tools here.');
		expect(result.tools).toHaveLength(0);
		expect(result.hasIncompleteToolCall).toBe(false);
	});

	test('preserves text outside tool calls', () => {
		const input =
			'Start. <tool_call name="search_flights" args={"origin":"SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call> Middle. <tool_call name="list_events" args={"timeMin":"2025-05-10T00:00:00Z","timeMax":"2025-05-15T23:59:59Z"}></tool_call> End.';

		const result = parser.processChunk(input);

		expect(result.text).toContain('Start');
		expect(result.text).toContain('Middle');
		expect(result.text).toContain('End');
		expect(result.tools).toHaveLength(2);
	});

	test('resets parser state', () => {
		parser.processChunk('Some text');
		parser.reset();
		const result = parser.processChunk('Other text');

		expect(result.text).toBe('Other text');
		expect(result.tools).toHaveLength(0);
	});

	test('flushes remaining buffer on stream end', () => {
		parser.processChunk('Regular text');
		const result = parser.flush();

		expect(result.text).toBe('Regular text');
		expect(result.tools).toHaveLength(0);
	});

	test('handles malformed JSON in tool args gracefully', () => {
		const input =
			'<tool_call name="search_flights" args={"invalid": json}></tool_call> Continued text.';

		const result = parser.processChunk(input);

		// Malformed tool call is skipped
		expect(result.tools).toHaveLength(0);
		expect(result.text).toContain('Continued text');
	});

	test('handles tool call with nested JSON args', () => {
		const input =
			'<tool_call name="complex_tool" args={"outer":{"inner":"value"},"array":[1,2,3]}></tool_call> Done.';

		const result = parser.processChunk(input);

		expect(result.tools).toHaveLength(1);
		expect(result.tools[0].args.outer.inner).toBe('value');
		expect(result.tools[0].args.array).toEqual([1, 2, 3]);
	});
});
