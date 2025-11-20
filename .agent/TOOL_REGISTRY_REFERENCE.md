# Tool Registry Reference

Current state of tool definitions, handlers, and mappings.

## Registered Tools

### 1. Flights Search

**Tool ID:** `flights-mcp::search-flights`  
**LLM Name:** `search_flights`  
**Handler:** `edge-worker/src/tools/flights-handler.ts`

#### Parameters

```typescript
{
  origin: string,              // IATA code (e.g., "SFO")
  destination: string,         // IATA code (e.g., "CDG")
  departure_date: string,      // "YYYY-MM-DD"
  return_date?: string,        // Optional: for round-trip
  adults?: number,             // Default: 1
  cabin_class?: string,        // economy | premium_economy | business | first
  max_connections?: number,    // Default: 2
}
```

#### Example Usage

```typescript
// In handler
const flights = await searchFlights({
  origin: 'SFO',
  destination: 'CDG',
  departure_date: '2025-05-10',
  cabin_class: 'economy',
}, env);

// LLM output
<tool_call name="search_flights" args={"origin":"SFO","destination":"CDG","departure_date":"2025-05-10","cabin_class":"economy"}></tool_call>
```

#### Implementation

File: `edge-worker/src/tools/flights-handler.ts`

```typescript
export async function searchFlights(
  args: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  // Calls Duffel API via MCP
  // Returns: { flights: [...], count, status }
}
```

---

### 2. Calendar Events

**Tool ID:** `google-calendar-mcp::list-events`  
**LLM Name:** `list_events`  
**Handler:** `edge-worker/src/tools/calendar-handler.ts`

#### Parameters

```typescript
{
  calendarId?: string,         // Default: "primary"
  timeMin: string,             // ISO 8601 start time (required)
  timeMax: string,             // ISO 8601 end time (required)
  maxResults?: number,         // Default: 25, max: 2500
  singleEvents?: boolean,      // Expand recurring (default: false)
}
```

#### Example Usage

```typescript
// In handler
const events = await listEvents({
  timeMin: '2025-05-10T00:00:00Z',
  timeMax: '2025-05-15T23:59:59Z',
  maxResults: 50,
}, env);

// LLM output
<tool_call name="list_events" args={"timeMin":"2025-05-10T00:00:00Z","timeMax":"2025-05-15T23:59:59Z","maxResults":50}></tool_call>
```

#### Implementation

File: `edge-worker/src/tools/calendar-handler.ts`

```typescript
export async function listEvents(
  args: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  // Calls Google Calendar API via MCP
  // Returns: { events: [...], count, status }
}
```

---

## Registry Structure

### Tool Registration (in `tools.ts`)

```typescript
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private handlers: Map<string, HandlerFunction> = new Map();

  registerToolsFromAgent(): void {
    // Flights MCP
    this.register(
      'flights-mcp::search-flights',
      { id, name, description, parameters },
      searchFlights
    );

    // Google Calendar MCP
    this.register(
      'google-calendar-mcp::list-events',
      { id, name, description, parameters },
      listEvents
    );
  }
}
```

### Tool Definition Interface

```typescript
export interface ToolDefinition {
  id: string;                    // Unique ID
  name: string;                  // Name LLM uses
  description: string;           // What it does
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];          // Required parameters
  };
}
```

### Name Mapping (in `ChatSessionDO`)

```typescript
private mapToolNameToId(toolName: string): string | undefined {
  const mappings: Record<string, string> = {
    search_flights: 'flights-mcp::search-flights',
    list_events: 'google-calendar-mcp::list-events',
  };
  return mappings[toolName];
}
```

---

## Handler Signature

All tool handlers follow this pattern:

```typescript
async function toolHandler(
  args: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  // 1. Validate and extract args
  const param1 = args.param1 as string;
  if (!param1) throw new Error('param1 required');

  // 2. Call external API or service
  const result = await callExternalService(param1, env);

  // 3. Return structured result
  return {
    status: 'success',
    data: result,
    count: result.length,
  };
}
```

---

## Tool Executor Flow

```typescript
export class ToolExecutor {
  async execute(
    toolId: string,                      // 'flights-mcp::search-flights'
    args: Record<string, unknown>,       // { origin: 'SFO', ... }
    send: (event: SseEvent) => void      // Emit to client
  ): Promise<unknown> {
    // 1. Look up tool definition
    const tool = this.registry.getTool(toolId);
    if (!tool) throw new Error(`Tool not found: ${toolId}`);

    // 2. Get handler function
    const handler = this.registry.getHandler(toolId);

    // 3. Emit tool_call event (before execution)
    send({
      type: 'tool_call',
      name: tool.name,
      args,
    });

    // 4. Execute handler
    const result = await handler(args, this.env);

    // 5. Emit tool_result event
    send({
      type: 'tool_result',
      result,
    });

    // 6. Log metrics
    console.log(JSON.stringify({
      correlationId,
      event: 'tool_invocation_success',
      tool: toolId,
      latency,
    }));

    return result;
  }
}
```

---

## Event Types

### During Execution

```typescript
// Before tool runs
{
  type: 'tool_call',
  name: 'search_flights',        // From tool definition
  args: { origin: 'SFO', ... }   // Parsed from LLM
}

// After tool completes
{
  type: 'tool_result',
  result: { flights: [...], ... } // From handler return value
}

// If tool fails
{
  type: 'error',
  error: 'Tool execution error: ...'
}
```

---

## Expanding the Tool Registry

### Checklist

To add tool `my_operation` from `my-mcp`:

- [ ] **Create handler file**
  - Location: `edge-worker/src/tools/my-handler.ts`
  - Signature: `async function myOperation(args, env): Promise<unknown>`

- [ ] **Register in ToolRegistry**
  - Add to `registerToolsFromAgent()`
  - Create `ToolDefinition` with parameters schema
  - Map handler function

- [ ] **Add name mapping**
  - Update `ChatSessionDO.mapToolNameToId()`
  - Map: `my_operation: 'my-mcp::my-operation'`

- [ ] **Document tool spec**
  - Create `.agent/tools/my-mcp/my-operation.md`
  - Include parameters, examples, error handling

- [ ] **Update system prompt**
  - Edit `SYSTEM_PROMPT` in `env.ts`
  - Teach LLM when and how to use the tool

- [ ] **Test**
  - Add test cases in tool handler
  - Test in streaming context
  - Check error handling

---

## Debugging Tools

### Check Available Tools

```typescript
const registry = new ToolRegistry();
const tools = registry.listTools();
console.log('Available tools:', tools.map(t => t.name));
// Output: ['search_flights', 'list_events']
```

### Verify Tool Registration

```typescript
const tool = registry.getTool('flights-mcp::search-flights');
console.log('Tool definition:', tool);
// Should return the ToolDefinition object
```

### Check Handler

```typescript
const handler = registry.getHandler('flights-mcp::search-flights');
console.log('Has handler:', !!handler);
// Should be true
```

### Trace Tool Execution

Enable console logging in `ToolExecutor.execute()`:

```typescript
console.log(`Starting tool: ${toolId}`);
console.log(`Args: ${JSON.stringify(args)}`);
console.log(`Latency: ${latency}ms`);
```

---

## Performance Considerations

### Handler Timeout

Each handler should complete within ~5-10 seconds for good UX.

```typescript
// Add timeout wrapper (future enhancement)
async function executeWithTimeout(
  handler: Function,
  args: Record<string, unknown>,
  timeoutMs: number = 10000
): Promise<unknown> {
  return Promise.race([
    handler(args),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tool timeout')), timeoutMs)
    ),
  ]);
}
```

### Caching

For tools with expensive external calls, consider caching:

```typescript
// In handler
const cacheKey = `tool:${toolId}:${JSON.stringify(args)}`;
const cached = await env.IDEMPOTENCY_KV.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... execute handler ...

await env.IDEMPOTENCY_KV.put(cacheKey, JSON.stringify(result), {
  expirationTtl: 300, // 5 minutes
});
```

### Parallel Execution

Current implementation executes tools sequentially. For independent tools:

```typescript
// In ChatSessionDO streaming loop
await Promise.all(
  tools.map(tool => toolExecutor.execute(toolId, tool.args, send))
);
```

---

## Security & Validation

### Input Validation

Handlers should validate all inputs:

```typescript
export async function searchFlights(
  args: Record<string, unknown>,
  env: Env
): Promise<unknown> {
  const origin = args.origin as string;
  const destination = args.destination as string;
  const departureDate = args.departure_date as string;

  if (!origin || !/^[A-Z]{3}$/.test(origin)) {
    throw new Error('Invalid origin IATA code');
  }
  // ... validate other args ...
}
```

### Sensitive Data

Never log API keys or tokens:

```typescript
// ❌ DON'T
console.log('API Response:', result); // If includes secrets

// ✅ DO
console.log('API Response:', {
  status: result.status,
  count: result.data?.length,
  // Omit: api_key, token, auth, etc.
});
```

### Rate Limiting

Tools should respect rate limits:

```typescript
// Check rate limit before calling external API
const remaining = await checkRateLimit(env, toolId);
if (remaining <= 0) {
  throw new Error('Rate limit exceeded');
}
```

---

## References

- `edge-worker/src/tools.ts` - Registry implementation
- `edge-worker/src/tools/flights-handler.ts` - Flights handler
- `edge-worker/src/tools/calendar-handler.ts` - Calendar handler
- `.agent/tools/flights-mcp/` - Flights tool spec
- `.agent/tools/google-calendar-mcp/` - Calendar tool spec
