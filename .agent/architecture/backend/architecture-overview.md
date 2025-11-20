## MICRO CoS ARCHITECTURE OVERVIEW

Treat this like a small **stateful monolith** built on Cloudflare primitives with a TanStack Start frontend. Below I’ll map:

1. **Inputs & outputs** (what the system accepts and returns)
2. **High-level architecture** (components and responsibilities)
3. **Concrete API surface** (HTTP endpoints + payloads)
4. **Durable Object memory schema & methods**
5. **LLM streaming approach** (how streaming will work end-to-end)
6. **Workflows / scheduled jobs** (daily planner example)
7. **Frontend integration notes** (TanStack Query + Realtime patterns)
8. **Nonfunctional considerations** (auth, concurrency, failure modes, observability, costs)

# 1) Inputs & outputs

## Inputs (from user / external systems)

- **chat message** (text), with metadata: intent, channel, language
- **voice message** (live stream) → S2T transcript
- **task update** (create / update / complete task via chat or UI)
- **preferences** (user settings, timezone, work hours, notification preferences)
- **attachments / context snippets** (text or small documents pasted in chat)
- **explicit memory stores** (user-tags, short facts, pinned notes)

## Outputs (to user / external systems)

- **LLM responses** (streamed tokens in chat)
- **actionable items** (task objects, reminders, calendar suggestions - created when user asks)
- **summaries** (when user asks "What's on my agenda?" or "Summarize my week")
- **voice responses** (TTS audio where requested)
- **state snapshots** (user memory view, chat history, last N messages)
- **travel suggestions** (ranked flight options when user asks "Find flights to X")

# 2) High-level architecture

```
Client (TanStack Start + assistant-ui)
  ↕ Realtime (bidirectional)  ←→  Worker API (Gateway)
  ↕ HTTP REST (TanStack Query) →  Worker API (Gateway)

Worker API (single entry)
   ├─ Durable Object: UserBrainDO  ← authoritative per-user state
   ├─ Workers AI Llama 3.3 (via Workers AI) ← LLM & S2T / TTS
   ├─ Tool Clients (FlightToolClient) ← external MCP integrations (flights-MCP)
   └─ D1 (optional): message archival / analytics
```

- **Monolith idea**: the Worker API is the core: handles auth, routes, LLM calls, tool invocations, and talks to the Durable Object which stores state for each user.
- **Chat-first**: Everything happens in response to user chat messages. No automatic background processing.
- **Tool Orchestration**: External MCP tools (flights-MCP) are called **only when user asks in chat** (e.g., "Find flights to Paris").
- **Realtime**: Cloudflare Realtime used for streaming LLM responses token-by-token. HTTP endpoints handle transactional operations and TanStack Query caching.
- **assistant-ui**: Frontend uses assistant-ui components (https://github.com/assistant-ui/assistant-ui) for the chat interface.

## LLM Provider

Primary model: cf/meta/llama-3.3-70b-instruct-fp8-fast on Cloudflare Workers AI.

The Worker API does not call the model directly from arbitrary environments. Instead, it calls a Cloudflare Worker that has a Workers AI binding configured for this model; that Worker is responsible for constructing prompts, applying our default parameters, and relaying streamed tokens back to the client and the Durable Object.

# 3) API surface (HTTP endpoints + example JSON)

These are the minimal set needed.

### Auth

- `Authorization: Bearer <JWT>` on all endpoints. JWT issued by the auth flow (Clerk/Auth0/Cloudflare Access).

### POST /api/v1/message` — send a chat message

Request:

```json
{
  "userId": "user_123",
  "channel": "chat", // "chat" | "voice" | "command"
  "text": "Hey – what's on my agenda today?",
  "contextIds": ["note_1"],
  "conversationId": "conv_234" // optional
}
```

Response (immediate ack):

```json
{
  "status": "accepted",
  "messageId": "m_789",
  "streamUrl": "wss://realtime/..."
}
```

- The LLM response will stream to the client (via Realtime or SSE). The Worker returns an immediate ack so front-end can show optimistic UI.

### GET /api/v1/state`

- returns memory snapshot, tasks, preferences, chat history
- Optional query params:
  - `since=<timestamp>` — return only updates after this timestamp (for reconnection)
  - `limit=<number>` — limit number of messages returned (default: 50)

Response:

```json
{
  "userId":"user_123",
  "tasks":[{"id":"t1","title":"Follow up with Jim","due":"2025-11-21","status":"open"}],
  "notes":[...],
  "messages":[...],  // last N messages
  "preferences": {"workHours":"09:00-17:00","timezone":"America/New_York"},
  "lastSnapshotTs":1700000000
}
```

### POST /api/v1/tasks` — create/update tasks

Request:

```json
{
  "action": "create",
  "task": { "title": "Send budget", "due": "2025-11-21", "tags": ["finance"] }
}
```

Response: full task object.

### POST /api/v1/voice-upload` — user uploads audio (or pass a presigned URL)

Request: multipart/form-data with file or pointer
Response: `{ "transcriptJobId": "tr_123" }`

### GET /api/v1/stream/:sessionId` — (optional) SSE endpoint if using SSE streaming

- Streams LLM tokens and progress events

### POST /api/v1/memory/pin`

- store a permanent memory piece
  Request:

```json
{ "type": "preference", "key": "favorite_airport", "value": "JFK" }
```

### POST /api/v1/complete-llm` — internal: called by Worker when LLM completes (or used by workflows)

- used to store final outputs, create tasks, send notifications

### POST /api/v1/calendar/event` — user adds/updates calendar event

Request:

```json
{
  "title": "Paris trip",
  "start": "2025-05-10T08:00:00Z",
  "end": "2025-05-15T22:00:00Z",
  "description": "Business trip to Paris"
}
```

Response: event stored, travel event detection triggered if applicable.

### POST /api/v1/travel/{workflow_id}/select/{flight_id}` — user selects a flight

Request:

```json
{}
```

Response: selection recorded, booking workflow initiated, tasks auto-generated.

### GET /api/v1/travel/suggestions` — fetch current travel suggestions

Response:

```json
{
  "upcoming_trips": [
    {
      "travel_event_id": "evt_123",
      "destination": "Paris",
      "departure_date": "2025-05-10",
      "workflow_id": "wf_456",
      "ranked_flights": [
        {
          "rank": 1,
          "flight_id": "f1",
          "airline": "Air France",
          "departure": "08:00",
          "arrival": "17:00",
          "price": { "amount": 1200, "currency": "USD" },
          "score": 0.95,
          "reasoning": "Non-stop, early arrival for morning meeting"
        }
      ]
    }
  ]
}
```

# 4) Durable Object: UserBrainDO

One Durable Object instance per user (or per user-session group). It’s the single source of truth for short-to-mid term memory and conversation state.

## State shape (suggested)

```ts
type UserBrainState = {
  userId: string;
  createdAt: string;
  updatedAt: string;
  preferences: Record<string, string>;
  tasks: Task[]; // keep a capped list, index by id
  notes: Note[];
  messages: Message[]; // in-memory chat history (last 100, see chat-history-management.md)
  pinnedMemories: Memory[]; // facts & preferences
  activeSessions: { sessionId: string; lastSeen: number }[];
  planCache: { date: string; plan: Plan }[]; // cached daily plan
  event_log: Event[]; // append-only event log for replay
  last_snapshot_ts: number;
};
```

**Note:** Chat history is managed with retention policies and archival strategies. See `chat-history-management.md` for full details on message lifecycle, idempotency, and LLM context selection.

## Methods to expose (RPC from Worker)

- `handleMessage(message)` — apply message to state, append to recentMessages, maybe create quick task
- `getState()` — return snapshot
- `setPreference(key,value)`
- `createTask(task)`
- `updateTask(taskId, patch)`
- `getPlan(date)` / `setPlan(date, plan)`
- `prune()` — keep state size bounded
- `applyLLMOutput(output)` — parse and integrate LLM results (tasks, summary)

Durable Object ensures **linearizable** operations per-user, avoiding race conditions with concurrent client sessions.

# 5) LLM streaming approach

LLM chat streaming.

### Realtime

- Client opens a Realtime connection.
- Client sends a `message` event.
- Worker receives event, forwards to LLM with streaming enabled.
- As LLM emits tokens, Worker forwards tokens as Realtime events to the client (`llm.token`).
- On completion, Worker calls `UserBrainDO.applyLLMOutput()` to persist structured results (tasks, summary).
  **Pros**: low-latency, reliable push, simpler for audio TTS.
  **Cons**: requires Realtime integration and client WebSocket handling.

**Implementation details**

- Use Workers AI streaming capability (Llama 3.3 stream mode) and relay tokens.
- Token events should include metadata: `{type:'token', token:'...', role:'assistant'}`, plus `event: 'done'` and structured actions like `event:'create_task', payload:{...}` so client can show "actionable" boxes mid-stream.
- Ensure final output is parsed by the DO and a CID (conversation ID) stored.
- DO accumulates tokens into assistant message and appends to `messages[]` on completion.
- See `chat-history-management.md` for message lifecycle and event handling.

# 6) Background Sync vs Chat-Triggered Actions

**This is a chat-first, on-demand assistant**, but the backend can still run background workers to keep data warm.

### Background sync (warm data only)

Background Workers/Workflows that can run from day one:

- **Calendar sync:** Periodically sync calendar events via Google Calendar MCP into `CalendarEventStoreDO`.
- **Travel detection (lightweight):** Optionally precompute `TravelEvent`s from calendar so they are ready when chat asks.
- **Indexing/archival:** Move old messages/tasks into cheaper storage, maintain indexes.

These background jobs:

- **Do not** call heavy tools like flights-MCP on their own.
- **Do not** send messages or surface UI to the user by themselves.
- Only update internal state so that chat-triggered workflows have fast, rich context.

### Chat-triggered actions (user-facing)

All user-visible actions and heavy tool calls still happen **only when the user asks in chat**:

- User: "What's my plan for today?" → Read warm calendar/task state → LLM generates summary → Responds in chat.
- User: "Find flights to Paris" → Use warm `TravelEvent` if available → Call flights-MCP → LLM ranks options → Responds in chat.
- User: "Remind me to call John" → Extract task → Create/update in DO → Confirm in chat.

**Optional future enhancement:** User can opt in to more proactive behavior (e.g., "Send me a daily summary at 8am"), which would still be built on the same background-warm-data + chat/notification pattern.

# 7) Frontend integration (TanStack Start + TanStack Query)

### TanStack Query roles

- Fetch `/api/v1/state` on load (useQuery) — cache snapshot
- Mutations (`/api/v1/tasks`, `/api/v1/memory/pin`) via useMutation with optimistic updates
- Chat messages: send POST `/api/v1/message` (useMutation) then subscribe to Realtime for streaming response
- Use query invalidation when DO persists new state (`/api/v1/state` refetch) or listen to Realtime events to update cache directly.

### Realtime usage patterns

- On connect: identify session and subscribe to user channel
- Receive events:

  - `message.created` → new user or assistant message
  - `llm.token` → append token to streaming UI
  - `message.completed` → assistant message finalized
  - `llm.action` → show action card (create task prompt)
  - `state.updated` → update TanStack cache with new state

- Implement reconnection & backfill: on reconnect, refetch `/api/v1/state` and reconcile with local cache.

### Optimistic UI

- When user creates a task, show optimistic task locally; the Worker will confirm by emitting a `task.created` event.

# 8) Nonfunctional considerations

## Auth & Security

- Use JWTs (Clerk/Auth0) or Cloudflare Access; validate tokens in Worker before any DO access.
- Per-user DO isolation prevents cross-user leakage.
- Sanitize user inputs before sending to LLM. Implement prompt redaction for PII per your privacy policy.
- For voice uploads, use presigned URLs or upload directly to a transient store; keep audio ephemeral (delete after processing).
- Rate-limit on Worker to avoid LLM runaway costs.

## Concurrency & Consistency

- Durable Objects serialize per-object calls for safe single-writer semantics.
- For cross-user operations (e.g., group summaries), use background workflows.

## Failure modes

- LLM timeout / cost spikes: fallback to a short canned reply (or degrade gracefully).
- DO storage grows beyond budget: implement pruning and archival to KV/D1.
- Client disconnects mid-stream: keep state but mark session inactive; allow replay.

## Observability & Logging

- Structured logs (Logfmt/JSON) from Workers → Logtail or Sentry.
- Metric events for LLM token counts, calls, average latency, DO sizes.
- Audit trail for actions generated by LLM (store original prompt + LLM output hash).

## Cost considerations

- LLM token usage is the main cost. Use summarization and context trimming to reduce prompt size (keep last N messages, pinned memories).
- Use Workers AI streaming to avoid repeated calls.
- Prune long histories; keep only what’s necessary for a daily plan.

# 9) Implementation / data flow examples (sequence)

### 1) User sends chat message (streaming)

1. Client `POST /api/v1/message` with JWT.
2. Worker authenticates, creates event with `event_id` and `request_id`.
3. Worker routes to UserBrainDO.handleMessage() — appends event to log, adds message to `messages[]`.
4. Worker initiates LLM streaming call with recent message context.
5. As tokens arrive, Worker emits `llm.token` events via Realtime to client.
6. DO accumulates tokens into assistant message.
7. On LLM completion, Worker parses output → `applyLLMOutput()` on DO (creates tasks, finalizes message) → emits `message.completed`, `state.updated`, and `action.created` events.

### 2) User requests flight search

1. User sends chat message: "Find me flights to Boston next week"
2. Worker authenticates, creates event with `event_id` and `request_id`.
3. Worker routes to UserBrainDO.handleMessage() — stores message.
4. Worker detects intent (flight search) → calls flights-MCP tool with parameters.
5. flights-MCP returns flight options.
6. Worker calls LLM to rank flights based on user preferences + context.
7. LLM streams response with ranked flight suggestions.
8. DO stores flight results and finalizes assistant message.
9. Realtime pushes `message.completed` with flight suggestions to client.

# 10) Example prompt templates (brief)

- **Planner prompt**: “You are an assistant. Given the user’s tasks, preferences, and recent messages, produce a prioritized plan for {date} with 3 top priorities, 5 todo items, and 1 motivational note. Output JSON with keys: priorities[], todos[], notes[].”
- **Action extraction**: “From this transcript, extract tasks of the form {title, due_date, assignee}. Output JSON array.”

(Keep prompts minimal, instruct to output strict JSON for easy parsing.)

# 11) What to implement first

1. **Scaffold TanStack Start app** with login and Realtime connection UI.
2. **Create Worker API** with one route: `/api/v1/state` and JWT auth.
3. **Implement UserBrainDO** with in-memory schema & `getState()` and `handleMessage()`; unit test locally using Wrangler dev.
4. **Wire a simple LLM mock** (for dev) that replies deterministically; implement streaming proxy later.
5. **Add chat UI** that sends messages, receives `llm.token` events and renders stream (using assistant-ui components).
6. **Optional future**: add a scheduled Workflow that runs daily and calls `DO.getState()` to precompute a “plan” string (see **No Background Workflows** section — not part of the initial chat-only version).
7. **Iterate**: replace mock LLM with Workers AI Llama 3.3; add S2T for voice.

---

# IMPORTANT CLARIFICATIONS

## This is a Chat-First, On-Demand Assistant

**NOT a "do things for you without asking" background agent.**

- Background Workers can run to **sync and index data** (calendar, travel events, history), but:
  - They **do not** call heavy tools like flights-MCP on their own.
  - They **do not** proactively send user-visible messages.
- All user-facing actions still happen **in response to chat**:
  - User: "Find flights to Boston" → Assistant uses warm travel/calendar state → Calls flights-MCP → Ranks options → Responds in chat.
  - User: "What's on my agenda?" → Assistant reads warm tasks/calendar state → Generates summary → Responds in chat.
  - User: "Remind me to call John" → Assistant extracts task → Creates in DO → Confirms in chat.

You get the benefits of background workers (fast, rich context) **without** the assistant taking actions unprompted.

## Frontend: assistant-ui Components

Use **assistant-ui** (https://github.com/assistant-ui/assistant-ui) for the chat interface:

- Chat message components
- Streaming message display
- Action cards for tasks/flights
- Modern, clean UI components

## Simplified Architecture

```
User types in chat → Worker API → UserBrainDO → LLM (+ optional tool calls) → Stream response → User sees in chat
```

That's it. Simple, clean, chat-first.

---
