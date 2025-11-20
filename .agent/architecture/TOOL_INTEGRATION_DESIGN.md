# Tool Integration Design & Implementation

**Date:** January 2025  
**Status:** Design Phase → Implementation Phase  
**Objective:** Map `.agent/tools` specifications into executable tools with real-time SSE events (`tool_call` and `tool_result`)

---

## 1. Current State Analysis

### Existing Components

#### `.agent/tools/` Specifications
- **flights-mcp/search-flights.md** – Duffel API search spec (request/response, normalization, error handling, caching)
- **google-calendar-mcp/list-events.md** – Google Calendar API spec (OAuth, token refresh, event normalization)
- Both include detailed implementation pseudo-code and examples

#### Edge Worker Streaming
- **chat-session-do.ts** – Streaming chat responses via SSE with token emission
- **env.ts** – SSE event types: `{ type: 'token' | 'done' | 'error' | ... }`
- **http.ts** – Response helper functions for JSON, SSE, errors

### Gaps
1. **No tool definitions** – `.agent/tools` are docs; no TypeScript `ToolDefinition` objects
2. **No tool registry** – No way to enumerate available tools for LLM
3. **No tool_call/tool_result events** – Streaming doesn't emit tool invocations
4. **No tool executor** – No code to actually invoke tool handlers
5. **No LLM prompting** – No system prompt or logic to trigger tool use in chat

---

## 2. Design: Tool Integration Architecture

### High-Level Flow

```
User Message (via /api/chat)
    ↓
ChatSessionDO (Durable Object)
    ↓
LLM (Llama 3.3) with tool_choice enabled
    ↓
LLM Response (text + tool_call markers)
    ↓
Stream Processing:
  - Emit token events (text chunks)
  - Detect tool_call markers
  - Invoke ToolExecutor
    ↓
ToolExecutor:
  - Emit tool_call event (before execution)
  - Call handler (flights, calendar, etc.)
  - Emit tool_result event (after execution)
    ↓
Client (chat UI) receives:
  - token events: display LLM thinking
  - tool_call events: show tool invocation badge
  - tool_result events: use result in next LLM turn
  - done event: end stream
```

### Components to Build

#### 1. **ToolDefinition & ToolRegistry** (`src/tools.ts`)
- Define available tools with JSON schema
- Register handlers per tool
- List tools for system prompt / LLM awareness

#### 2. **ToolExecutor** (`src/tools.ts`)
- Takes tool_id + args
- Validates against schema
- Calls handler
- Emits tool_call/tool_result events
- Logs with correlation ID

#### 3. **Tool Handlers** (`src/tools/flights-handler.ts`, `src/tools/calendar-handler.ts`)
- Actual MCP client wrappers (stub → real)
- Request validation
- Response normalization
- Error handling per spec

#### 4. **LLM System Prompt Update** (`src/chat-session-do.ts` + `.agent/prompts`)
- Add tool definitions to system prompt
- Tell LLM to emit `<tool_call>` markers when needed
- Format: `<tool_call name="search_flights" args={"origin": "SFO", ...}></tool_call>`

#### 5. **Stream Processor** (`src/chat-session-do.ts`)
- Parse LLM response chunks for tool markers
- Buffer incomplete markers
- Invoke ToolExecutor on complete marker
- Continue streaming LLM response

---

## 3. Implementation Plan

### Phase 1: Tool Registry & Definitions ✅ DONE

**File:** `edge-worker/src/tools.ts`

```typescript
// 1. Define tool types
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: { type: 'object', properties: {...}, required: [...] }
}

// 2. Create registry
class ToolRegistry {
  register(id, definition, handler) { ... }
  getTool(id) { ... }
  listTools() { ... }
}

// 3. Register tools from .agent/tools specs
const registry = new ToolRegistry();
registry.register('flights-mcp::search-flights', flightsDefinition, searchFlightsHandler);
registry.register('google-calendar-mcp::list-events', calendarDefinition, listEventsHandler);
```

**Status:** ✅ Created in `src/tools.ts`

### Phase 2: Tool Executor

**File:** `edge-worker/src/tools.ts`

```typescript
class ToolExecutor {
  async execute(toolId, args, send) {
    // 1. Find tool definition
    // 2. Validate args against schema
    // 3. Emit tool_call event
    // 4. Call handler
    // 5. Emit tool_result event
    // 6. Log with correlation ID
  }
}
```

**Status:** ✅ Created in `src/tools.ts`

### Phase 3: LLM System Prompt with Tool Definitions

**Files:**
- `src/chat-session-do.ts` – Build system prompt with tool list
- `.agent/prompts/tools-instructions.md` – Prompt template

**Approach:**

```typescript
const systemPrompt = `
You are Micro Chief of Staff...

You have access to these tools:
${toolRegistry.listTools().map(t => `
- ${t.name}: ${t.description}
  Parameters: ${JSON.stringify(t.parameters)}
`).join('\n')}

When you need to use a tool, emit:
<tool_call name="search_flights" args={"origin": "SFO", ...}></tool_call>

Continue your response normally after the tool call.
`;
```

**Status:** ⏳ TODO

### Phase 4: Stream Parser & Tool Invocation

**File:** `src/chat-session-do.ts`

**Logic:**

```typescript
const toolCallRegex = /<tool_call name="([^"]+)" args=({[^}]+})><\/tool_call>/g;
let lastIndex = 0;

for (const chunk of transcriptChunks) {
  // Find tool_call markers in chunk
  const matches = [...chunk.matchAll(toolCallRegex)];
  
  if (matches.length > 0) {
    for (const match of matches) {
      const toolName = match[1];
      const args = JSON.parse(match[2]);
      
      // Invoke executor
      const result = await toolExecutor.execute(toolName, args, send);
      
      // Continue LLM processing with tool result
    }
  }
  
  // Emit token events for non-tool text
  send({ type: 'token', token: chunk });
}
```

**Status:** ⏳ TODO

### Phase 5: Stub Handlers → Real MCP Clients

**Files:**
- `src/tools/flights-handler.ts` – Call Duffel API
- `src/tools/calendar-handler.ts` – Call Google Calendar API

**Approach:**

Replace stub implementations with:
1. Validate input (per `.agent/tools` spec)
2. Fetch from MCP / external API
3. Normalize response to internal models
4. Handle errors per spec
5. Cache results (KV)
6. Log with correlation ID

**Status:** ⏳ TODO

### Phase 6: Tests

**Files:**
- `edge-worker/tests/tools.test.ts` – Unit tests for ToolRegistry, ToolExecutor
- `edge-worker/tests/chat-tools.integration.ts` – E2E: chat message → tool invocation → result

**Scenarios:**
1. Tool invocation emits correct events
2. Tool result is passed to next LLM turn
3. Tool error is handled gracefully
4. Multiple tool calls in one response
5. Tool with no results (e.g., calendar query returns empty)

**Status:** ⏳ TODO

---

## 4. Event Schema

### SseEvent Types (Updated)

```typescript
type SseEvent =
  | { type: 'token'; token: string }                         // LLM output chunk
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }  // Before tool execution
  | { type: 'tool_result'; result: Record<string, unknown> } // After tool execution
  | { type: 'done'; message_id: string }                     // Stream end
  | { type: 'error'; error: string };                        // Stream error

// Example flow:
// 1. { type: 'token', token: 'Let me search for flights...' }
// 2. { type: 'tool_call', name: 'search_flights', args: { origin: 'SFO', ... } }
// 3. { type: 'tool_result', result: { data: [...flights...] } }
// 4. { type: 'token', token: 'I found 5 flights...' }
// 5. { type: 'done', message_id: '...' }
```

### Logging Format

```json
{
  "correlationId": "uuid",
  "operationId": "uuid",
  "toolInvocationId": "uuid",
  "event": "tool_invocation_started" | "tool_invocation_success" | "tool_invocation_error",
  "tool": "flights-mcp::search-flights",
  "args": {...},
  "latency": 450,
  "resultSize": 4096,
  "error": "...",
  "timestamp": "2025-01-20T14:30:00Z"
}
```

---

## 5. Tool Specifications Mapping

### Flights MCP: search-flights

**From `.agent/tools/flights-mcp/search-flights.md`:**

```typescript
// Tool Definition
{
  id: 'flights-mcp::search-flights',
  name: 'search_flights',
  description: 'Search for available flights between origin and destination',
  parameters: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: 'IATA code (e.g., SFO)' },
      destination: { type: 'string', description: 'IATA code (e.g., CDG)' },
      departure_date: { type: 'string', description: 'YYYY-MM-DD' },
      return_date: { type: 'string', description: 'YYYY-MM-DD (optional)' },
      adults: { type: 'number', default: 1 },
      cabin_class: { type: 'string', enum: ['economy', 'premium_economy', 'business', 'first'] },
      max_connections: { type: 'number', default: 2 }
    },
    required: ['origin', 'destination', 'departure_date']
  }
}

// Handler Implementation
async function searchFlightsHandler(args, env) {
  // 1. Validate input (per spec validation section)
  // 2. Check KV cache: key = `flights:${origin}:${dest}:${date}:${cabin}`
  // 3. Call Duffel API (POST /air/offer_requests)
  // 4. Normalize response (FlightOffer → FlightOption)
  // 5. Cache for 30 minutes
  // 6. Return normalized array
  // On error: return empty array or throw ToolError
}

// Normalized Response
{
  id: 'off_00009htYpSCXrwaB9DnUm0',
  airline: 'BA',
  airline_name: 'British Airways',
  flight_number: '112',
  origin: { code: 'SFO', name: 'San Francisco' },
  destination: { code: 'CDG', name: 'Paris Charles de Gaulle' },
  departure: { date: '2025-05-10', time: '08:00', datetime: '2025-05-10T08:00:00Z' },
  arrival: { date: '2025-05-11', time: '08:30', datetime: '2025-05-11T08:30:00Z' },
  duration_minutes: 630,
  stops: 0,
  direct: true,
  price: { amount: 920, currency: 'USD' },
  tax: { amount: 120, currency: 'USD' },
  total: { amount: 1040, currency: 'USD' },
  expires_at: '2025-01-21T14:30:00Z'
}
```

### Google Calendar MCP: list-events

**From `.agent/tools/google-calendar-mcp/list-events.md`:**

```typescript
// Tool Definition
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
      maxResults: { type: 'number', description: 'Max results (default: 25, max: 2500)' },
      singleEvents: { type: 'boolean', description: 'Expand recurring (default: false)' }
    },
    required: ['timeMin', 'timeMax']
  }
}

// Handler Implementation
async function listEventsHandler(args, env) {
  // 1. Validate input (timeMin < timeMax, ISO 8601 format)
  // 2. Ensure valid OAuth token (refresh if needed)
  // 3. Check KV cache: key = `calendar:${calendarId}:${timeMin}:${timeMax}`
  // 4. Call Google Calendar API (GET /calendars/{calendarId}/events)
  // 5. Normalize response (filter cancelled, extract times)
  // 6. Cache for 5 minutes
  // 7. Return normalized array
  // On error: handle 401 (token refresh), 403/404 (permissions), etc.
}

// Normalized Response
[
  {
    id: 'abc123',
    summary: 'Paris business trip',
    description: 'Meeting with Acme Corp',
    location: 'Paris, France',
    start: { dateTime: '2025-05-10T08:00:00Z' },
    end: { dateTime: '2025-05-15T18:00:00Z' },
    created: '2025-01-15T10:00:00Z',
    updated: '2025-01-15T10:00:00Z',
    attendees: [{ email: 'user@company.com' }]
  }
]
```

---

## 6. Integration Checklist

- [ ] **Phase 1: ToolRegistry & ToolExecutor** (✅ DONE in `src/tools.ts`)
  - [x] Define ToolDefinition interface
  - [x] Create ToolRegistry class
  - [x] Register flights and calendar tools
  - [x] Create ToolExecutor class
  - [x] Stub handlers for testing

- [ ] **Phase 2: ChatSessionDO Integration**
  - [ ] Import ToolRegistry in ChatSessionDO
  - [ ] Initialize registry in constructor
  - [ ] Update system prompt to include tool definitions
  - [ ] Integrate ToolExecutor in streaming loop

- [ ] **Phase 3: Stream Parser**
  - [ ] Implement tool_call marker detection
  - [ ] Buffer incomplete markers
  - [ ] Parse tool args from markers
  - [ ] Route to ToolExecutor

- [ ] **Phase 4: Real Handlers**
  - [ ] Implement FlightToolClient (Duffel API)
  - [ ] Implement CalendarToolClient (Google Calendar API)
  - [ ] Add request validation per spec
  - [ ] Add response normalization per spec
  - [ ] Add error handling per spec
  - [ ] Add caching (KV)

- [ ] **Phase 5: Testing**
  - [ ] Unit tests for ToolRegistry
  - [ ] Unit tests for ToolExecutor
  - [ ] Integration tests for chat → tool → result flow
  - [ ] Mock Duffel API responses
  - [ ] Mock Google Calendar API responses
  - [ ] Error scenario tests

- [ ] **Phase 6: Documentation**
  - [ ] Add `.agent/prompts/tool-invocation.md`
  - [ ] Document tool event flow
  - [ ] Add examples of tool_call/tool_result in chat
  - [ ] Create tool troubleshooting guide

---

## 7. Files Created/Modified

### Created
- ✅ `edge-worker/src/tools.ts` – ToolRegistry, ToolExecutor, definitions

### To Create
- `edge-worker/src/tools/flights-handler.ts` – Duffel API client
- `edge-worker/src/tools/calendar-handler.ts` – Google Calendar API client
- `edge-worker/tests/tools.test.ts` – Unit tests
- `edge-worker/tests/chat-tools.integration.ts` – E2E tests
- `.agent/prompts/tool-invocation.md` – LLM prompting for tool use

### Modified
- `edge-worker/src/chat-session-do.ts` – Integrated ToolRegistry + ToolExecutor
- `edge-worker/src/env.ts` – SSE events already support tool_call/tool_result
- `AGENTS.md` – Document tool integration commands

---

## 8. Next Steps

1. **Implement Phase 2** – Update ChatSessionDO with system prompt that includes tool definitions
2. **Implement Phase 3** – Stream parser to detect and invoke tools
3. **Implement Phase 4** – Real handlers (FlightToolClient, CalendarToolClient)
4. **Test manually** – Call `/api/chat` with query that triggers tool use
5. **Add tests** – Unit + integration tests for each tool
6. **Document** – Add `.agent/prompts/tool-invocation.md` with examples

---
