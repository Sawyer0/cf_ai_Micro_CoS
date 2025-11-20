# Tool Integration Quick Reference

## Using Tools in Chat

### As User
```
"Search for flights from SFO to Paris on May 10"
↓
LLM automatically invokes search_flights tool
↓
Client receives tool_call + tool_result events
↓
UI displays flights and LLM's analysis
```

### As Developer

#### 1. Import ToolRegistry & ToolExecutor
```typescript
import { ToolRegistry, ToolExecutor } from './tools';

const registry = new ToolRegistry();
const executor = new ToolExecutor(registry, env, correlationId);
```

#### 2. Execute a Tool
```typescript
try {
  const result = await executor.execute(
    'flights-mcp::search-flights',
    { origin: 'SFO', destination: 'CDG', departure_date: '2025-05-10' },
    (event) => send(event)  // SSE sender callback
  );
} catch (error) {
  console.error('Tool invocation failed:', error);
}
```

#### 3. Parse LLM Response for Tool Calls
```typescript
import { ToolCallParser } from './tool-parser';

const parser = new ToolCallParser();
const { text, tools, hasIncompleteToolCall } = parser.processChunk(llmChunk);

for (const tool of tools) {
  await executor.execute(`<mcp>::${tool.name}`, tool.args, send);
}
```

---

## Available Tools

### 1. Search Flights

**Name:** `search_flights`  
**MCP:** `flights-mcp`  
**Handler:** `src/tools/flights-handler.ts`

```typescript
// Request
{
  origin: 'SFO',              // IATA code (required)
  destination: 'CDG',         // IATA code (required)
  departure_date: '2025-05-10', // YYYY-MM-DD (required)
  return_date?: '2025-05-17',  // YYYY-MM-DD (optional)
  adults?: 1,                  // Number (default: 1)
  cabin_class?: 'business',    // Enum (default: economy)
  max_connections?: 2          // Number (default: 2)
}

// Response
{
  status: 'success',
  data: [
    {
      id: 'off_00009htYpSCXrwaB9DnUm0',
      airline: 'BA',
      flight_number: '112',
      origin: { code: 'SFO', name: 'San Francisco' },
      destination: { code: 'CDG', name: 'Paris Charles de Gaulle' },
      departure: { date: '2025-05-10', time: '08:00', datetime: '2025-05-10T08:00:00Z' },
      arrival: { date: '2025-05-11', time: '08:30', datetime: '2025-05-11T08:30:00Z' },
      duration_minutes: 630,
      stops: 0,
      direct: true,
      price: { amount: 920, currency: 'USD' },
      expires_at: '2025-01-21T14:30:00Z'
    }
  ]
}
```

**Cache:** 30 minutes per `{origin}:{dest}:{date}:{cabin}`

---

### 2. List Calendar Events

**Name:** `list_events`  
**MCP:** `google-calendar-mcp`  
**Handler:** `src/tools/calendar-handler.ts`

```typescript
// Request
{
  calendarId?: 'primary',       // String (default: 'primary')
  timeMin: '2025-05-10T00:00:00Z', // ISO 8601 (required)
  timeMax: '2025-05-15T23:59:59Z',  // ISO 8601 (required)
  maxResults?: 25,              // Number 1-2500 (default: 25)
  singleEvents?: false,         // Boolean (default: false)
  orderBy?: 'updated'           // 'startTime' | 'updated' (default: 'updated')
}

// Response
{
  status: 'success',
  data: [
    {
      id: 'abc123',
      summary: 'Paris business trip',
      description: 'Meeting with Acme Corp',
      location: 'Paris, France',
      start: { dateTime: '2025-05-10T08:00:00Z' },
      end: { dateTime: '2025-05-15T18:00:00Z' },
      created: '2025-01-15T10:00:00Z',
      updated: '2025-01-15T10:00:00Z',
      attendees: [
        { email: 'user@company.com', displayName: 'You', responseStatus: 'accepted' }
      ]
    }
  ]
}
```

**Cache:** 5 minutes per `{calendarId}:{timeMin}:{timeMax}`

---

## Tool Call Marker Format

LLM emits tools using this XML-like format:

```
<tool_call name="search_flights" args={"origin":"SFO","destination":"CDG","departure_date":"2025-05-10"}></tool_call>
```

**Parser detects & extracts:**
- Tool name: `search_flights`
- Args: JSON object as string

**ToolCallParser handles:**
- ✅ Single tool call
- ✅ Multiple tool calls in one response
- ✅ Text before, between, after tool calls
- ✅ Incomplete markers at chunk boundary

---

## Event Flow (SSE)

```
[token] "Let me search for flights..."
[tool_call] { name: 'search_flights', args: {origin: 'SFO', ...} }
[tool_result] { data: [{airline: 'BA', price: 920, ...}] }
[token] "I found 5 great options..."
[done] { message_id: 'msg_123' }
```

---

## Testing

### Unit Tests
```bash
npm run test -- tool-parser.test.ts
npm run test -- tools-integration.test.ts
```

### Manual Test
```bash
npm run dev
# In another terminal:
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Find flights SFO to Paris May 10"}],
    "stream": true
  }'
```

---

## Common Errors & Fixes

### "Tool not found: search_flights"
**Cause:** Using bare tool name instead of full ID  
**Fix:** Use `flights-mcp::search_flights` not `search_flights`

### Invalid IATA code
**Cause:** Airport code not 3 uppercase letters  
**Fix:** Use proper IATA codes (SFO, CDG, LAX, JFK, etc.)

### Invalid date format
**Cause:** Date not YYYY-MM-DD  
**Fix:** Use format `2025-05-10` not `May 10, 2025`

### timeMin >= timeMax
**Cause:** Start time >= end time in calendar query  
**Fix:** Ensure `timeMin` < `timeMax`

### Incomplete tool call in chunk
**Cause:** Tool marker spans chunks  
**Status:** ✅ Handled! Parser buffers incomplete markers

---

## Adding a New Tool

1. **Create handler file:** `src/tools/new-tool-handler.ts`
   ```typescript
   export async function newToolFunc(args: Record<string, unknown>, env: Env) {
     // Validate args
     // Call API
     // Normalize response
     // Cache
     // Return
   }
   ```

2. **Register in ToolRegistry:** `src/tools.ts`
   ```typescript
   this.register(
     'mcp-name::tool-name',
     {
       id: 'mcp-name::tool-name',
       name: 'tool_name',
       description: '...',
       parameters: { ... }
     },
     newToolFunc
   );
   ```

3. **Document:** `.agent/tools/mcp-name/tool-operation.md`
   - API spec
   - Request/response schemas
   - Implementation guide
   - Error handling
   - Examples

4. **Test:** Write unit + integration tests

---

## Performance Tips

### Caching
- Flights: 30 min (TTL configurable)
- Calendar: 5 min (TTL configurable)
- Adjust based on data freshness needs

### Latency Budgets
- Flights search: ~500ms (network + Duffel API)
- Calendar query: ~300ms (network + Google API)
- Tool overhead: ~50ms (parser + executor)
- Total per tool: ~600ms acceptable

### Optimization
- Batch calendar queries (merge overlapping time ranges)
- Implement fuzzy airport code matching
- Pre-fetch common flight routes
- Use persistent OAuth tokens (avoid refresh)

---

## Troubleshooting

### Tools not executing
- Check ChatSessionDO has ToolExecutor initialized
- Verify ToolCallParser wired into streaming loop
- Check LLM system prompt mentions tools
- Look for `tool_invocation_started` logs

### Tool results not appearing in chat
- Verify `tool_result` events are emitted
- Check client SSE handler processes tool_result events
- Ensure tool handler returns valid result object

### Slow tool execution
- Check KV cache hit rate
- Monitor Duffel/Google API latency
- Add retries for timeout scenarios
- Consider pre-fetching common data

---

## Architecture Files

- `src/tools.ts` – ToolRegistry, ToolExecutor, interfaces
- `src/tools/flights-handler.ts` – Flight search
- `src/tools/calendar-handler.ts` – Calendar events
- `src/tool-parser.ts` – LLM response parsing
- `src/chat-session-do.ts` – Integration point (ChatSessionDO)
- `.agent/tools/flights-mcp/` – Duffel API spec
- `.agent/tools/google-calendar-mcp/` – Google Calendar spec
- `.agent/architecture/TOOL_INTEGRATION_DESIGN.md` – Full design
- `.agent/architecture/TOOL_IMPLEMENTATION_SUMMARY.md` – What's done

---

## Next Steps

1. ⏳ Integrate ToolCallParser in ChatSessionDO stream loop
2. ⏳ Update LLM system prompt to mention tools
3. ⏳ Replace flight handler stub with real Duffel API calls
4. ⏳ Replace calendar handler stub with real Google Calendar API calls
5. ⏳ Manual testing: chat message → tool invocation → result
6. ⏳ Add integration tests with real (mocked) API responses
7. ⏳ Monitor and optimize performance

---
