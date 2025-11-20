# Tool Implementation Summary

**Date:** January 20, 2025  
**Status:** ✅ Phase 1-3 Complete | ⏳ Phase 4-6 In Progress

---

## What Was Delivered

### 1. Tool Registry & Definitions ✅

**File:** `edge-worker/src/tools.ts`

- `ToolDefinition` interface: Metadata + JSON schema for each tool
- `ToolRegistry` class: Register, lookup, list tools
- Pre-registered tools:
  - `flights-mcp::search-flights` – Search flights (Duffel API spec)
  - `google-calendar-mcp::list-events` – Query calendar events (Google Calendar spec)

**Features:**
- Tool definitions from `.agent/tools/` specs auto-registered
- All tool metadata available for LLM prompting
- Extensible registration pattern for future tools (hotel, weather, etc.)

### 2. Tool Executor with Event Emission ✅

**File:** `edge-worker/src/tools.ts`

- `ToolExecutor` class: Invokes tools and manages lifecycle
- Emits `tool_call` event before execution (LLM + args)
- Emits `tool_result` event after execution (result data)
- Full logging with correlation ID for observability
- Error handling with structured logs

**Flow:**
```
1. Tool invocation requested (toolId + args)
2. Validate args against schema
3. Emit { type: 'tool_call', name: 'search_flights', args: {...} }
4. Call handler (searchFlights or listEvents)
5. Emit { type: 'tool_result', result: {...} }
6. Log with correlationId for tracing
```

### 3. Tool Handlers with Stub Implementation ✅

**Files:**
- `edge-worker/src/tools/flights-handler.ts` – Flight search handler
- `edge-worker/src/tools/calendar-handler.ts` – Calendar events handler

**Implementation:**
- Request validation (IATA codes, date formats, required fields)
- Cache key generation (KV storage)
- Response normalization to internal models
- Mock data generation (stub, replaceable with real API)
- Error handling per spec

**Flights Handler:**
- Validates: origin, destination, departure_date (IATA + date format)
- Returns: Array of FlightOption (airline, price, stops, times, etc.)
- Caching: 30-minute TTL for flight searches

**Calendar Handler:**
- Validates: timeMin, timeMax (ISO 8601, min < max)
- Returns: Array of CalendarEvent (summary, location, attendees, etc.)
- Caching: 5-minute TTL for event queries

### 4. Stream Parser for Tool Call Detection ✅

**File:** `edge-worker/src/tool-parser.ts`

- `ToolCallParser` class: Extract tool_call markers from streaming text
- Format: `<tool_call name="search_flights" args={...}></tool_call>`
- Handles:
  - Single & multiple tool calls in response
  - Incomplete markers at chunk boundaries
  - Malformed JSON in args (graceful skip)
  - Text preservation between tool calls

**API:**
```typescript
const parser = new ToolCallParser();
const { text, tools, hasIncompleteToolCall } = parser.processChunk(chunk);
// text: remaining text without tool calls
// tools: Array<{name, args}>
// hasIncompleteToolCall: boolean (for buffering)
```

### 5. ChatSessionDO Integration ✅ (Partial)

**File:** `edge-worker/src/chat-session-do.ts` (modified)

- Import ToolRegistry + ToolExecutor
- Initialize registry in constructor
- Create executor in streaming loop (line 215)
- TODO comment for tool_call parsing integration

**Next step:** Wire ToolCallParser into stream chunk processing.

### 6. Comprehensive Tests ✅

**Files:**
- `edge-worker/tests/tool-parser.test.ts` – Unit tests (9 test cases)
- `edge-worker/tests/tools-integration.test.ts` – Integration tests (13 test cases)

**Test Coverage:**

**ToolCallParser:**
- ✅ Single tool call extraction
- ✅ Multiple tool calls in one response
- ✅ Incomplete markers at chunk boundaries
- ✅ Text preservation between tools
- ✅ Reset and flush operations
- ✅ Malformed JSON handling
- ✅ Nested JSON args

**ToolRegistry & ToolExecutor:**
- ✅ Tool registration on init
- ✅ Tool definition retrieval
- ✅ Handler retrieval
- ✅ Tool_call event emission
- ✅ Tool_result event emission
- ✅ Error handling (missing params, invalid args)
- ✅ Multi-tool execution in sequence
- ✅ Text preservation in multi-tool responses

---

## Architecture: Tool Integration Flow

```
User: "Search flights to Paris on May 10"
  ↓
/api/chat → ChatSessionDO
  ↓
LLM (Llama 3.3) with system prompt:
  "You have access to: search_flights, list_events, ..."
  ↓
LLM generates:
  "Let me search for flights. <tool_call name="search_flights" args={...}></tool_call> I found..."
  ↓
Streaming Loop (ChatSessionDO):
  1. ToolCallParser.processChunk(chunk) → detects tool_call
  2. Emit SSE event: { type: 'tool_call', name: 'search_flights', args: {...} }
  3. ToolExecutor.execute() → calls searchFlights handler
  4. Handler returns flight data
  5. Emit SSE event: { type: 'tool_result', result: { flights: [...] } }
  6. Continue streaming LLM text
  ↓
Client (chat UI) receives:
  { type: 'token', token: 'Let me search...' }
  { type: 'tool_call', name: 'search_flights', args: {...} }
  { type: 'tool_result', result: { flights: [...] } }
  { type: 'token', token: 'I found...' }
  { type: 'done', message_id: '...' }
  ↓
UI renders:
  - LLM text streaming
  - Tool invocation badge (what tool was called)
  - Tool result (flight data table, calendar events, etc.)
```

---

## Files Created

```
edge-worker/
├── src/
│   ├── tools.ts                          ✅ ToolRegistry, ToolExecutor
│   ├── tools/
│   │   ├── flights-handler.ts            ✅ Flight search handler (stub)
│   │   └── calendar-handler.ts           ✅ Calendar events handler (stub)
│   ├── tool-parser.ts                    ✅ ToolCallParser (stream parsing)
│   └── chat-session-do.ts                ✅ (modified: added imports + integration points)
└── tests/
    ├── tool-parser.test.ts               ✅ Parser unit tests (9 cases)
    └── tools-integration.test.ts         ✅ Integration tests (13 cases)

.agent/architecture/
├── TOOL_INTEGRATION_DESIGN.md            ✅ Full design document (sections 1-7)
└── TOOL_IMPLEMENTATION_SUMMARY.md        ✅ This file
```

---

## Files Modified

- ✅ `edge-worker/src/chat-session-do.ts`
  - Added ToolRegistry import
  - Added ToolExecutor import
  - Initialize registry in constructor
  - Create executor in streaming loop
  - TODO comment for parsing integration

---

## Event Schema (SSE Events)

```typescript
type SseEvent =
  | { type: 'token'; token: string }                                 // LLM text
  | { type: 'tool_call'; name: string; args: Record<string, unknown> } // Before tool exec
  | { type: 'tool_result'; result: Record<string, unknown> }         // After tool exec
  | { type: 'done'; message_id: string }                             // Stream end
  | { type: 'error'; error: string };                                // Stream error

// Example flow:
// [token] "Let me search for flights..."
// [tool_call] { name: 'search_flights', args: {origin: 'SFO', ...} }
// [tool_result] { data: [{id: 'off_001', airline: 'BA', ...}] }
// [token] "I found 5 flights. Here are the best options:"
// [done] { message_id: 'msg_123' }
```

---

## Stub Handlers → Real Implementation

### Flights Handler (flights-handler.ts)

**Current (Stub):**
```typescript
// Returns mock flight data
return {
  status: 'success',
  data: [
    {
      id: 'off_stub_001',
      airline: 'BA',
      flight_number: '112',
      ...
    }
  ]
};
```

**To Do (Real Implementation):**
```typescript
// 1. Call Duffel API
const duffelResponse = await fetch('https://api.duffel.com/air/offer_requests', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${env.DUFFEL_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    data: {
      slices: [{ origin, destination, departure_date }],
      passengers: [{ type: 'adult' }],
      cabin_class
    }
  })
});

// 2. Handle response/errors per .agent/tools/flights-mcp/search-flights.md
if (response.status === 401) { /* retry with new key */ }
if (response.status === 429) { /* exponential backoff */ }
if (response.status === 400) { /* validation error */ }

// 3. Normalize to internal model
// 4. Cache for 30 min in KV
// 5. Return
```

### Calendar Handler (calendar-handler.ts)

**Current (Stub):**
```typescript
// Returns mock calendar data
return {
  status: 'success',
  data: [{ id: 'evt_001', summary: 'Team Meeting', ... }]
};
```

**To Do (Real Implementation):**
```typescript
// 1. Ensure valid OAuth token (refresh if expired)
await ensureValidToken();

// 2. Call Google Calendar API
const calendarResponse = await fetch(
  `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      timeMin,
      timeMax,
      maxResults,
      singleEvents: 'true',
      orderBy: 'startTime'
    })
  }
);

// 3. Handle response/errors per spec
if (response.status === 401) { /* refresh OAuth token */ }
if (response.status === 403) { /* permission denied */ }
if (response.status === 404) { /* calendar not found */ }

// 4. Normalize to internal model
// 5. Cache for 5 min in KV
// 6. Return
```

---

## Next Steps (Not Yet Implemented)

### Phase 4: Stream Parser Integration ⏳

**File:** `edge-worker/src/chat-session-do.ts` (lines 229-232)

```typescript
// Current (TODO comment):
// TODO: Parse chunk for tool_call markers (e.g., <tool_call name="search_flights" args={...}>)
// and invoke toolExecutor.execute() to emit tool_call/tool_result events

// Required implementation:
const { text: tokenText, tools } = parser.processChunk(chunk);

// Emit token for non-tool text
send({ type: 'token', token: tokenText });

// Execute each tool
for (const tool of tools) {
  try {
    await toolExecutor.execute(
      `flights-mcp::${tool.name}`, // or google-calendar-mcp::${tool.name}
      tool.args,
      send
    );
  } catch (error) {
    send({ type: 'error', error: error.message });
  }
}
```

### Phase 5: LLM System Prompt ⏳

**File:** `edge-worker/src/chat-session-do.ts`

Update system prompt to include:
```typescript
const toolsList = this.toolRegistry.listTools()
  .map(tool => `- ${tool.name}: ${tool.description}`)
  .join('\n');

const systemPrompt = `
You are Micro Chief of Staff...

You have access to these tools:
${toolsList}

When you need to use a tool, emit:
<tool_call name="tool_name" args={...}></tool_call>

Then continue your response normally.

Do not make up tool results. Only use actual tool data in your responses.
`;
```

### Phase 6: Real API Clients ⏳

1. **FlightToolClient** – Replace stub with actual Duffel API calls
   - Use DUFFEL_API_KEY from env
   - Implement retries + exponential backoff (per spec)
   - Handle error codes (400, 401, 429, 500)
   - Normalize response to FlightOption[]
   - Cache results

2. **CalendarToolClient** – Replace stub with actual Google Calendar API calls
   - Use OAuth access token from env/KV storage
   - Implement token refresh on 401
   - Handle error codes (401, 403, 404, 500)
   - Normalize response to CalendarEvent[]
   - Cache results

### Phase 7: Testing & Manual Verification ⏳

1. **Unit tests:** Run existing test suites
   ```bash
   npm run test:unit
   ```

2. **Manual test:**
   ```bash
   npm run dev
   curl -X POST http://localhost:8787/api/chat \
     -H "Content-Type: application/json" \
     -H "CF-Access-JWT-Assertion: dummy-jwt" \
     -d '{
       "messages": [
         {"role": "user", "content": "Search flights from SFO to Paris on May 10"}
       ],
       "stream": true
     }' \
     | grep -o '"type":"tool_call"' | wc -l
   # Expected: Should see tool_call and tool_result events in SSE stream
   ```

3. **Integration test:**
   - Chat message triggers tool use
   - Tool events are emitted
   - Tool result is used in next LLM turn
   - Full chat flow works end-to-end

---

## Design Decisions

### 1. Tool Call Marker Format

**Chosen:** `<tool_call name="..." args={...}></tool_call>`

**Rationale:**
- XML-like format is unambiguous and easy to parse with regex
- JSON args inside curly braces are self-contained
- Separates from regular text without special characters

**Alternative considered:** JSON in a code block, but less clear.

### 2. Event Emission Timing

**Chosen:** Emit `tool_call` BEFORE execution, `tool_result` AFTER

**Rationale:**
- Client can show "calling tool" state while waiting
- Real result is sent back immediately when available
- Better UX for long-running tools (show progress)

### 3. Handler Architecture

**Chosen:** Separate handler files per MCP (flights-handler.ts, calendar-handler.ts)

**Rationale:**
- Clean separation of concerns
- Each handler can have its own dependencies (auth, caching, retries)
- Scales to many tools (hotel, weather, etc.)
- Easy to test in isolation

### 4. Cache Keys

**Flights:** `flights:{origin}:{dest}:{date}:{cabin}`  
**Calendar:** `calendar:{calendarId}:{timeMin}:{timeMax}`

**Rationale:**
- Includes all parameters that affect results
- Prevents cache collisions
- Easy to invalidate on explicit user refresh

---

## Observability & Logging

### Correlation ID Propagation

Every tool invocation is tagged with the user's `correlationId` for end-to-end tracing:

```json
{
  "correlationId": "user-request-123",
  "operationId": "tool-op-456",
  "toolInvocationId": "tool-inv-789",
  "event": "tool_invocation_started",
  "tool": "flights-mcp::search-flights",
  "args": {"origin": "SFO", "destination": "CDG", "departure_date": "2025-05-10"},
  "timestamp": "2025-01-20T14:30:00Z"
}
```

### Log Aggregation

All tool logs include:
- When tool was invoked (start/success/error)
- Which tool, what args
- Latency (for performance tracking)
- Error message (if failed)

**Use case:** Query logs by correlationId to see full request trace.

---

## API Reference for Tool Handlers

### FlightSearchRequest

```typescript
{
  origin: string;                // IATA code (e.g., "SFO")
  destination: string;           // IATA code (e.g., "CDG")
  departure_date: string;        // YYYY-MM-DD
  return_date?: string;          // YYYY-MM-DD (optional)
  adults?: number;               // Default: 1
  cabin_class?: string;          // economy | premium_economy | business | first
  max_connections?: number;      // Default: 2
}
```

### ListEventsRequest

```typescript
{
  calendarId?: string;           // Default: 'primary'
  timeMin: string;               // ISO 8601 (required)
  timeMax: string;               // ISO 8601 (required)
  maxResults?: number;           // Default: 25, max: 2500
  singleEvents?: boolean;        // Expand recurring (default: false)
  orderBy?: 'startTime' | 'updated';
}
```

---

## Summary

✅ **Complete:**
- Tool definitions & registry
- Tool executor with event emission
- Stream parser for tool_call detection
- Stub handlers (flights, calendar)
- Unit + integration tests
- Design documentation

⏳ **In Progress:**
- Stream parser integration in ChatSessionDO
- LLM system prompt with tool instructions
- Real API implementations (Duffel, Google Calendar)

---

## References

- `.agent/tools/flights-mcp/search-flights.md` – Duffel API spec
- `.agent/tools/google-calendar-mcp/list-events.md` – Google Calendar spec
- `.agent/architecture/TOOL_INTEGRATION_DESIGN.md` – Full design doc
- `AGENTS.md` – Build & test commands

---
