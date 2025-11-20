/**
 * Tool Call Parser
 * Extracts tool_call markers from LLM response stream
 * Format: <tool_call name="tool_name" args={...}></tool_call>
 */

export interface ParsedToolCall {
	name: string;
	args: Record<string, unknown>;
}

/**
 * State machine for parsing tool_call markers from streaming text
 */
export class ToolCallParser {
	private buffer = '';
	private inToolCall = false;
	private toolCallStart = 0;

	/**
	 * Process a chunk of text, extracting complete tool_call markers
	 * Returns: { text: remaining text without tool calls, tools: extracted tool calls }
	 */
	processChunk(
		chunk: string,
	): { text: string; tools: ParsedToolCall[]; hasIncompleteToolCall: boolean } {
		this.buffer += chunk;

		const tools: ParsedToolCall[] = [];
		const toolCallRegex = /<tool_call\s+name="([^"]+)"\s+args=({[^}]*})<\/tool_call>/g;

		let lastIndex = 0;
		let textOutput = '';
		let match;

		// Extract all complete tool_call markers
		while ((match = toolCallRegex.exec(this.buffer)) !== null) {
			// Add text before this tool call
			textOutput += this.buffer.slice(lastIndex, match.index);
			lastIndex = toolCallRegex.lastIndex;

			// Parse tool call
			const toolName = match[1];
			const argsJson = match[2];

			try {
				const args = JSON.parse(argsJson);
				tools.push({ name: toolName, args });
			} catch (e) {
				console.error(`Failed to parse tool args: ${argsJson}`, e);
				// Skip malformed tool call
			}
		}

		// Add remaining text after last tool call
		textOutput += this.buffer.slice(lastIndex);

		// Check if we have an incomplete tool call at the end
		const incompleteMark = '<tool_call';
		const incompleteIndex = this.buffer.lastIndexOf(incompleteMark);
		let hasIncomplete = false;

		if (incompleteIndex > -1 && incompleteIndex >= lastIndex) {
			// We have an incomplete tool_call marker
			// Keep it in buffer for next chunk
			textOutput = textOutput.slice(0, textOutput.length - (this.buffer.length - incompleteIndex));
			this.buffer = this.buffer.slice(incompleteIndex);
			hasIncomplete = true;
		} else {
			// All tool calls were complete, clear buffer
			this.buffer = '';
		}

		return { text: textOutput, tools, hasIncompleteToolCall: hasIncomplete };
	}

	/**
	 * Flush remaining buffered content (for end of stream)
	 */
	flush(): { text: string; tools: ParsedToolCall[] } {
		const result = this.processChunk('');
		return { text: result.text, tools: result.tools };
	}

	/**
	 * Reset parser state
	 */
	reset(): void {
		this.buffer = '';
		this.inToolCall = false;
	}
}

/**
 * Test parser with examples
 */
export function testParser(): void {
	const parser = new ToolCallParser();

	// Test 1: Single tool call
	const chunk1 =
		'Let me search for flights. <tool_call name="search_flights" args={"origin":"SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call> I found some options.';
	const result1 = parser.processChunk(chunk1);
	console.log('Test 1:', result1);
	// Expected: text: 'Let me search for flights.  I found some options.', tools: [{name: 'search_flights', args: {...}}]

	parser.reset();

	// Test 2: Multiple tool calls
	const chunk2 =
		'<tool_call name="list_events" args={"timeMin":"2025-05-10T00:00:00Z","timeMax":"2025-05-15T23:59:59Z"}></tool_call> Your calendar shows... <tool_call name="search_flights" args={"origin":"SFO","destination":"JFK","departure_date":"2025-05-10"}></tool_call> Here are flights.';
	const result2 = parser.processChunk(chunk2);
	console.log('Test 2:', result2);
	// Expected: 2 tools extracted

	parser.reset();

	// Test 3: Incomplete tool call at chunk boundary
	const chunk3a =
		'Let me search. <tool_call name="search_flights" args={"origin":"';
	const result3a = parser.processChunk(chunk3a);
	console.log('Test 3a:', result3a);
	// Expected: hasIncompleteToolCall: true

	const chunk3b = 'SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call> Done.';
	const result3b = parser.processChunk(chunk3b);
	console.log('Test 3b:', result3b);
	// Expected: 1 tool extracted

	parser.reset();

	// Test 4: No tool calls
	const chunk4 = 'Just regular text, no tools here.';
	const result4 = parser.processChunk(chunk4);
	console.log('Test 4:', result4);
	// Expected: text: 'Just regular text, no tools here.', tools: []
}

// Uncomment to run tests
// testParser();
