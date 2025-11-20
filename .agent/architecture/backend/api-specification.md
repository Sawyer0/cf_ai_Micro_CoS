# API Specification - Micro Chief of Staff

Production REST API for the chat-first AI assistant.

**Version:** 1.0 (no API versioning prefix)  
**Base URL:** `/api/`  
**Authentication:** Cloudflare Access

---

## Quick Reference

### Core Endpoints

| Endpoint                    | Method       | Purpose                                  |
| --------------------------- | ------------ | ---------------------------------------- |
| `/api/chat`                 | POST         | Send message, receive streaming response |
| `/api/chat/history`         | GET          | Retrieve chat history                    |
| `/api/state`                | GET          | Get user state snapshot                  |
| `/api/state/preferences`    | PATCH        | Update user preferences                  |
| `/api/tasks`                | GET/POST     | List/create tasks                        |
| `/api/tasks/{id}`           | PATCH/DELETE | Update/delete task                       |
| `/api/tools/search_flights` | POST         | Search flights via flights-MCP           |
| `/api/tools/rank_flights`   | POST         | Rank flights with LLM                    |
| `/api/memory`               | GET          | Retrieve user memories                   |
| `/api/memory/pin`           | POST         | Pin a memory                             |
| `/api/health`               | GET          | Health check                             |

---

## Authentication

**Cloudflare Access** - Zero Trust authentication

**Headers:**

```http
CF-Access-JWT-Assertion: <jwt_token>
X-Correlation-ID: <uuid>
```

**JWT Claims:**

```json
{
  "sub": "user_123",
  "email": "user@example.com",
  "exp": 1700000000
}
```

### Chat & Voice Entry Points

The primary user entry points are:

- **Cloudflare Pages (chat UI)**

  - Renders the chat interface assistant-ui close to the Worker.
  - Sends text messages to `/api/chat` with a stable `conversation_id` per tab or thread.
  - Listens to SSE from `/api/chat` for `token`, `tool_call`, `tool_result`, and `done` events.

- **Cloudflare Realtime (voice)**
  - Handles low-latency bi-directional audio and text events.
  - Transcribes audio on the client or at the edge and forwards text turns into `/api/chat` with the same `conversation_id` as the associated chat session.
  - May optionally send intermediate ASR hypotheses as separate messages (for example, `role: "user"` with `content` being incremental transcripts) if we want real-time partial responses.

Both chat and voice entry points **funnel into the same `/api/chat` contract**, ensuring that:

- Workflow coordination remains in Workers + DOs + D1.
- The backend (FastAPI) can stay focused on tools, MCP hosts, and admin APIs, not chat orchestration.

---

## Rate Limits

| Resource             | Limit   | Window     |
| -------------------- | ------- | ---------- |
| Chat messages        | 60      | per minute |
| LLM tokens           | 100,000 | per day    |
| Tool calls (flights) | 10      | per day    |
| DO writes            | 1,000   | per day    |

**Headers:**

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1700000060
```

---

## Data Retention

| Data Type             | Retention         | Storage        |
| --------------------- | ----------------- | -------------- |
| Chat history (active) | Last 100 messages | Durable Object |
| Archived messages     | 90 days           | D1 Database    |
| User preferences      | Indefinite        | DO + D1        |
| Completed tasks       | 1 year            | D1             |
| Event log             | 30 days           | DO             |

---

## Chat & Messaging

### `POST /api/chat`

Stream chat messages with LLM responses.

**Request:**

```json
{
  "messages": [
    { "role": "user", "content": "Find flights to Paris May 10-15" }
  ],
  "stream": true,
  "tool_choice": "auto",
  "conversation_id": "conv_abc123"
}
```

**Response (SSE):**

```
data: {"type":"token","token":"Here"}

data: {"type":"tool_call","name":"search_flights","args":{...}}

data: {"type":"tool_result","result":[...]}

data: {"type":"done","message_id":"msg_123"}
```

**Features:**

- ✅ Server-Sent Events (SSE) streaming
- ✅ Tool call detection and execution
- ✅ assistant-ui compatible
- ✅ Correlation ID tracking
- ✅ Conversation affinity via `conversation_id`

**Internal behavior:**

- `conversation_id` identifies a logical conversation thread for a given user. If the client does not provide one, the edge Worker generates a new UUID and returns it to the client (via SSE events or JSON metadata).
- Chat requests are coordinated through **Durable Objects + D1**:
  - A per-conversation Durable Object (for example, `ChatSessionDO`) persists chat events into D1, keyed by `(principal_id, conversation_id)`.
  - Events are stored in `chat_sessions` and `chat_events` tables in D1 and can be replayed for `/api/chat/history` or future workflows.
- Chat requests first read from **warm Durable Objects** (for example, `CalendarEventStoreDO` for calendar events and `TravelWorkflowDO` / stored `TravelEvent`s for travel context), which are kept up to date by background workers.
- Only when needed do they invoke external MCP-backed tools (such as flights-MCP or Google Calendar MCP) via tool clients; the system does **not** hit MCP on every chat request by default.

---

### `GET /api/chat/history`

Retrieve chat history with pagination.

**Query Parameters:**

- `limit` (default: 50, max: 200)
- `before` (cursor)
- `after` (cursor)

**Response:**

```json
{
  "messages": [
    {
      "id": "msg_123",
      "role": "user",
      "content": "Find flights to Paris",
      "timestamp": "2025-11-20T12:00:00Z"
    }
  ],
  "has_more": false,
  "cursor": "msg_124"
}
```

---

## State Management

### `GET /api/state`

Complete user state snapshot for initial load/reconnection.

**Query Parameters:**

- `since` (timestamp) - incremental updates only

**Response:**

```json
{
  "user_id": "user_123",
  "tasks": [...],
  "preferences": {...},
  "recent_messages": [...],
  "pinned_memories": [...],
  "last_updated": "2025-11-20T12:00:00Z"
}
```

---

### `PATCH /api/state/preferences`

Update user preferences.

**Request:**

```json
{
  "timezone": "America/New_York",
  "work_hours": "09:00-17:00",
  "preferred_airlines": ["United", "Delta"]
}
```

---

## Task Management

### `GET /api/tasks`

List tasks with filtering.

**Query Parameters:**

- `status` (open, in_progress, completed)
- `due_before` (ISO 8601)
- `due_after` (ISO 8601)
- `tags` (comma-separated)

**Response:**

```json
{
  "tasks": [
    {
      "id": "task_123",
      "title": "Follow up with Jim",
      "status": "open",
      "priority": "high",
      "due": "2025-11-21T17:00:00Z",
      "tags": ["work"]
    }
  ]
}
```

---

### `POST /api/tasks`

Create a task.

**Request:**

```json
{
  "title": "Send budget report",
  "due": "2025-11-25T17:00:00Z",
  "priority": "high",
  "tags": ["finance"]
}
```

---

### `PATCH /api/tasks/{task_id}`

Update a task.

**Request:**

```json
{
  "status": "completed",
  "completed_at": "2025-11-20T15:00:00Z"
}
```

---

### `DELETE /api/tasks/{task_id}`

Delete a task.

**Response:** `204 No Content`

---

## Tool Invocations

### `POST /api/tools/search_flights`

Search flights via flights-MCP.

**Request:**

```json
{
  "origin": "SFO",
  "destination": "CDG",
  "departure_date": "2025-05-10",
  "return_date": "2025-05-15",
  "passengers": 1,
  "cabin_class": "economy"
}
```

**Response:**

```json
{
  "tool_invocation_id": "tool_123",
  "flights": [
    {
      "id": "flight_abc",
      "airline": "Air France",
      "departure": {
        "airport": "SFO",
        "time": "2025-05-10T14:00:00Z"
      },
      "arrival": {
        "airport": "CDG",
        "time": "2025-05-11T09:00:00+01:00"
      },
      "stops": 0,
      "price": {
        "amount": 1200.0,
        "currency": "USD"
      }
    }
  ]
}
```

---

### `POST /api/tools/rank_flights`

Rank flights using LLM + preferences.

**Request:**

```json
{
  "flights": [...],
  "user_preferences": {
    "airlines": ["United"],
    "max_stops": 1,
    "price_weight": 0.6
  },
  "calendar_context": [...]
}
```

**Response:**

```json
{
  "ranked_flights": [
    {
      "flight_id": "flight_abc",
      "rank": 1,
      "score": 0.95,
      "reasoning": "Nonstop, early arrival, preferred airline"
    }
  ]
}
```

---

## Memory Management

### `GET /api/memory`

Retrieve pinned memories and context.

**Response:**

```json
{
  "pinned_memories": [
    {
      "id": "mem_123",
      "type": "preference",
      "key": "favorite_airport",
      "value": "JFK"
    }
  ]
}
```

---

### `POST /api/memory/pin`

Pin a memory or preference.

**Request:**

```json
{
  "type": "preference",
  "key": "favorite_airline",
  "value": "United Airlines",
  "category": "travel"
}
```

---

## Error Handling

### Standard Error Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {},
    "correlation_id": "corr_abc123",
    "timestamp": "2025-11-20T12:00:00Z"
  }
}
```

### Error Codes

| Code                  | HTTP Status | Description              |
| --------------------- | ----------- | ------------------------ |
| `UNAUTHORIZED`        | 401         | Invalid or expired auth  |
| `FORBIDDEN`           | 403         | Insufficient permissions |
| `NOT_FOUND`           | 404         | Resource not found       |
| `VALIDATION_ERROR`    | 400         | Invalid request payload  |
| `RATE_LIMIT_EXCEEDED` | 429         | Too many requests        |
| `LLM_ERROR`           | 500         | LLM service error        |
| `TOOL_ERROR`          | 500         | External tool failed     |
| `INTERNAL_ERROR`      | 500         | Unexpected error         |

### Correlation & Error Handling (Shared Behavior)

Both the **edge Worker** and the **FastAPI backend** MUST follow this shared behavior:

- **Correlation ID source-of-truth**

  - Read `X-Correlation-ID` from the incoming request headers if present.
  - If missing, generate a new UUID (e.g., `crypto.randomUUID()` at the edge, `uuid4()` in Python).
  - Always include `X-Correlation-ID` on every response (success and error).

- **Standard error envelope**

  - All error responses MUST use the `Standard Error Format` above.
  - `error.code` MUST be one of the values in the table; do not invent new codes without updating this spec first.
  - `error.details` is an object that can hold field-level validation errors or extra context, but it should be omitted or `{}` when not needed.

- **Mapping guidance**

  - Use `VALIDATION_ERROR` for:
    - Invalid payloads (missing/incorrect fields, wrong types, etc.).
    - Incorrect HTTP method usage for a known endpoint (for example, non-`POST` to `/api/chat` MAY return `405` with `VALIDATION_ERROR`).
  - Use `LLM_ERROR` when Workers AI / Llama 3.3 returns an error or the model call fails.
  - Use `TOOL_ERROR` when an external MCP-backed tool (e.g., flights-MCP, google-calendar-mcp) fails.
  - Use `INTERNAL_ERROR` for unexpected exceptions not covered by the above.

- **Helper functions (recommended pattern)**

Edge Worker and backend implementations SHOULD use small shared helpers instead of ad hoc responses. For example, at the edge:

```ts
function createJsonResponse(
  body: unknown,
  status: number,
  correlationId: string
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "X-Correlation-ID": correlationId,
    },
  });
}

function createErrorResponse(
  code: "VALIDATION_ERROR" | "LLM_ERROR" | "TOOL_ERROR" | "INTERNAL_ERROR",
  message: string,
  httpStatus: number,
  correlationId: string,
  details: Record<string, unknown> = {}
) {
  return createJsonResponse(
    {
      error: {
        code,
        message,
        details,
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      },
    },
    httpStatus,
    correlationId
  );
}
```

The backend SHOULD implement equivalent helpers (for example, using FastAPI + Pydantic) so that all layers share the same correlation and error semantics.

---

## Streaming Protocol (SSE)

### Event Types

```typescript
type SSEEvent =
  | { type: "token"; token: string }
  | { type: "tool_call"; name: string; args: object }
  | { type: "tool_result"; result: object }
  | { type: "done"; message_id: string }
  | { type: "error"; error: Error };
```

### Connection Headers

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Correlation-ID: corr_abc123
```

---

## Correlation IDs

Every request/response includes:

```http
X-Correlation-ID: corr_abc123
```

**Usage:**

- Track requests end-to-end
- Debug across Workers, DOs, tools
- Link chat → tool calls → LLM responses

---

## Idempotency

**Header:**

```http
Idempotency-Key: <client_uuid>
```

**Supported:**

- `POST /api/chat`
- `POST /api/tasks`
- `POST /api/tools/*`

**Behavior:**

- Duplicate requests return cached response
- Keys expire after 24 hours

---

## Health Check

### `GET /api/health`

**Response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "durable_objects": "healthy",
    "workers_ai": "healthy",
    "realtime": "healthy"
  }
}
```

---

## Integration with assistant-ui

The `/api/chat` endpoint is designed for seamless assistant-ui integration:

```typescript
// In useCloudflareRuntime
async onNew(messages) {
  const response = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages, stream: true, conversation_id }),
  });

  return response.body; // SSE stream
}
```

---

## Cost Estimate

**Per 1,000 active users:**

- LLM: ~$1,500/month
- D1: ~$37.50/month
- DO: ~$4.50/month
- **Total: ~$1.54/user/month**

---

## Next Steps

1. Implement Zod schemas for request/response validation
2. Set up Cloudflare Access authentication
3. Create Workers with routing logic
4. Implement Durable Objects for state management
5. Wire up Workers AI streaming
6. Connect flights-MCP tool client
7. Deploy to staging and test with frontend

---

**See also:**

- [Full Implementation Plan](../../../.gemini/antigravity/brain/e3c37236-c342-499c-b3fd-7002c1131363/implementation_plan.md)
- [assistant-ui Integration Guide](../frontend/assistant-ui-integration.md)
- [Backend Architecture Overview](architecture-overview.md)
