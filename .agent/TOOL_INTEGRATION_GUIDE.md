# Tool Integration Guide

## Quick Start: How Tool Calls Work

### 1. LLM Generates Tool Markers

When the LLM needs to call a tool, it outputs:

```
Let me search for flights... <tool_call name="search_flights" args={"origin":"SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call> I found some options.
```

### 2. Parser Extracts Tool Calls

`ToolCallParser` identifies the `<tool_call>` markers and splits the stream:

```typescript
const { text, tools } = toolParser.processChunk(chunk);
// text: "Let me search for flights...  I found some options."
// tools: [{ name: "search_flights", args: {...} }]
```

### 3. Map Tool Name to ID

Tool names from LLM → Tool IDs in registry:

```typescript
search_flights        → flights-mcp::search-flights
list_events          → google-calendar-mcp::list-events
```

### 4. Execute Tool

`ToolExecutor` runs the handler:

```typescript
await toolExecutor.execute(toolId, args, send);
// 1. Emit 'tool_call' event to client
// 2. Run handler (e.g., call Duffel API)
// 3. Emit 'tool_result' event with results
// 4. Log metrics with correlationId
```

### 5. Client Receives Events

```json
{"type": "token", "token": "Let me search for flights... "}
{"type": "tool_call", "name": "search_flights", "args": {...}}
{"type": "tool_result", "result": {...flight data...}}
{"type": "token", "token": " I found some options."}
{"type": "done", "message_id": "msg-uuid"}
```

---

## Adding a New Tool

### Step 1: Define the Handler

Create `edge-worker/src/tools/my-handler.ts`:

```typescript
export async function myTool(
	args: Record<string, unknown>,
	env: Env
): Promise<unknown> {
	const param1 = args.param1 as string;
	// ... implement tool logic
	return { result: "..." };
}
```

### Step 2: Register the Tool

In `edge-worker/src/tools.ts`, add to `ToolRegistry.registerToolsFromAgent()`:

```typescript
this.register(
	'my-mcp::my-operation',
	{
		id: 'my-mcp::my-operation',
		name: 'my_operation',
		description: 'Description of what the tool does',
		parameters: {
			type: 'object',
			properties: {
				param1: { type: 'string', description: 'First parameter' },
				param2: { type: 'number', description: 'Second parameter' },
			},
			required: ['param1'],
		},
	},
	myTool
);
```

### Step 3: Add Tool Name Mapping

In `ChatSessionDO.mapToolNameToId()`:

```typescript
private mapToolNameToId(toolName: string): string | undefined {
	const mappings: Record<string, string> = {
		search_flights: 'flights-mcp::search-flights',
		list_events: 'google-calendar-mcp::list-events',
		my_operation: 'my-mcp::my-operation',  // ← Add this
	};
	return mappings[toolName];
}
```

### Step 4: Teach the LLM

Update `SYSTEM_PROMPT` in `env.ts` to mention the new tool and when to use it.

---

## Handling Edge Cases

### Tool Not Found

```typescript
const toolId = self.mapToolNameToId(toolCall.name);
if (!toolId) {
	// Logs warning, emits error event, continues
	console.warn(`Unknown tool: ${toolCall.name}`);
	send({ type: 'error', error: `Unknown tool: ${toolCall.name}` });
	continue;
}
```

### Tool Execution Error

```typescript
try {
	await toolExecutor.execute(toolId, toolCall.args, send);
} catch (toolError) {
	// Logs error, emits error event, continues streaming
	const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
	console.error(`Tool execution error: ${errorMsg}`, toolError);
	send({ type: 'error', error: `Tool error: ${errorMsg}` });
}
```

### Incomplete Tool Call (Chunk Boundary)

Parser automatically buffers incomplete markers:

```
Chunk 1: "... <tool_call name=\"search_f"
Chunk 2: "lights\" args={...}></tool_call> ..."
```

Parser buffers chunk 1, reconstructs in chunk 2, extracts tool call.

---

## Observability

### Structured Logging

Each tool execution logs:

```json
{
	"correlationId": "corr-123",
	"operationId": "op-456",
	"toolInvocationId": "tool-789",
	"event": "tool_invocation_started|tool_invocation_success|tool_invocation_error",
	"tool": "flights-mcp::search-flights",
	"latency": 450,
	"resultSize": 2048,
	"timestamp": "2025-01-20T14:30:00Z"
}
```

### Metrics Tracked

- **latency**: Time to execute tool
- **resultSize**: Size of returned data
- **retry_count**: How many retries (future)
- **error**: Error message if failed

---

## Testing

### Parser Test

```bash
# Uncomment this line in tool-parser.ts:
// testParser();

# Run tests
npm run dev
```

### Integration Test

```bash
# Start dev server
npm run dev

# Send test request
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Search flights from SFO to CDG on 2025-05-10"}],
    "stream": true
  }'

# Watch for tool_call and tool_result events in output
```

---

## Debugging

### Enable Parser Logging

Add to `ToolCallParser.processChunk()`:

```typescript
console.log(`Found ${tools.length} tools in chunk`, tools);
```

### Check Tool Registry

```typescript
const tools = this.toolRegistry.listTools();
console.log('Available tools:', tools.map(t => t.name));
```

### Verify Tool Name Mapping

Add to `mapToolNameToId()`:

```typescript
console.log(`Mapping ${toolName} to ${mappings[toolName]}`);
```

---

## Common Pitfalls

1. **Mismatch between tool name and ID**
   - LLM outputs: `search_flights`
   - Registry expects: `flights-mcp::search-flights`
   - Map in `mapToolNameToId()` or update SYSTEM_PROMPT

2. **Parser misses tool calls**
   - Check regex in `ToolCallParser` matches LLM format
   - Ensure `flush()` is called at end of stream

3. **Tool handler crashes**
   - Parser continues streaming, but no result emitted
   - Check error logs in structured logs

4. **Arguments don't match tool parameters**
   - SYSTEM_PROMPT should clearly specify expected args
   - Handler should validate input before using

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    LLM Stream                             │
│  "... <tool_call name=... args=...></tool_call> ..."    │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │  ToolCallParser       │
            │  - parseChunk()       │
            │  - flush()            │
            │  - buffer state       │
            └────┬──────────────────┘
                 │
      ┌──────────┴──────────┐
      │                     │
      ▼                     ▼
   Text            Extracted Tool Calls
   Emit 'token'    {name, args}
                        │
                        ▼
                ┌───────────────────┐
                │  mapToolNameToId  │
                │  search_flights   │
                │    → registry ID  │
                └────┬──────────────┘
                     │
                     ▼
              ┌────────────────────┐
              │  ToolExecutor      │
              │  execute(toolId)   │
              │  - emit tool_call  │
              │  - run handler     │
              │  - emit tool_result│
              │  - log metrics     │
              └────────────────────┘
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
  SSE Event    SSE Event       SSE Event
  tool_call    tool_result     error
```

---

## References

- `edge-worker/src/tool-parser.ts` - Parser implementation
- `edge-worker/src/tools.ts` - Registry & executor
- `edge-worker/src/chat-session-do.ts` - Integration in streaming loop
- `.agent/tools/` - Tool specifications and examples
