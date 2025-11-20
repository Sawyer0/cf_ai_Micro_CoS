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

* **chat message** (text), with metadata: intent, channel, language
* **voice message** (live stream) → S2T transcript
* **task update** (create / update / complete task)
* **preferences** (user settings, timezone, work hours, notification preferences)
* **attachments / context snippets** (text or small documents pasted)
* **explicit memory stores** (user-tags, short facts, pinned notes)
* **system events** (scheduled job triggers, calendar webhook if integrated)

## Outputs (to user / external systems)

* **LLM responses** (streamed tokens)
* **actionable items** (task objects, reminders, calendar suggestions)
* **daily plan / digest** (structured plan with prioritized items)
* **notifications** (Realtime push or email/push via integration)
* **voice responses** (TTS audio where requested)
* **state snapshots** (user memory view, last N messages)

# 2) High-level architecture

```
Client (TanStack Start)
  ↕ Realtime (bidirectional)  ←→  Worker API (Gateway)
  ↕ HTTP REST (TanStack Query) →  Worker API (Gateway)
  
Worker API (single entry) 
  ├─ Durable Object (UserBrainDO)  ← authoritative per-user state
  ├─ Workers AI Llama 3.3 (via Workers AI) ← LLM & S2T / TTS
  ├─ Workflows (Daily Planner / Reminders) ← scheduled orchestration
  └─ KV / D1 (optional): long-tail storage / analytics
```

* **Monolith idea**: the Worker API is the core: handles auth, routes, LLM calls, and talks to the Durable Object which stores state for each user.
* **Realtime**: Cloudflare Realtime (or WebSocket-like) used for streaming, presence, and push updates. HTTP endpoints handle transactional operations and TanStack Query caching.

# 3) API surface (HTTP endpoints + example JSON)

These are the minimal set needed.

### Auth

* `Authorization: Bearer <JWT>` on all endpoints. JWT issued by the auth flow (Clerk/Auth0/Cloudflare Access).

### POST /api/v1/message`  — send a chat message

Request:

```json
{
  "userId":"user_123",
  "channel":"chat",        // "chat" | "voice" | "command"
  "text":"Hey – what's on my agenda today?",
  "contextIds": ["note_1"],
  "conversationId":"conv_234" // optional
}
```

Response (immediate ack):

```json
{ "status":"accepted", "messageId":"m_789", "streamUrl":"wss://realtime/..." }
```

* The LLM response will stream to the client (via Realtime or SSE). The Worker returns an immediate ack so front-end can show optimistic UI.

### GET /api/v1/state`

* returns memory snapshot, tasks, preferences
  Response:

```json
{
  "tasks":[{"id":"t1","title":"Follow up with Jim","due":"2025-11-21","status":"open"}],
  "notes":[...],
  "preferences": {"workHours":"09:00-17:00","timezone":"America/New_York"}
}
```

### POST /api/v1/tasks` — create/update tasks

Request:

```json
{"action":"create","task":{"title":"Send budget", "due":"2025-11-21","tags":["finance"]}}
```

Response: full task object.

### POST /api/v1/voice-upload` — user uploads audio (or pass a presigned URL)

Request: multipart/form-data with file or pointer
Response: `{ "transcriptJobId": "tr_123" }`

### GET /api/v1/stream/:sessionId` — (optional) SSE endpoint if using SSE streaming

* Streams LLM tokens and progress events

### POST /api/v1/memory/pin`

* store a permanent memory piece
  Request:

```json
{"type":"preference","key":"favorite_airport","value":"JFK"}
```

### POST /api/v1/complete-llm` — internal: called by Worker when LLM completes (or used by workflows)

* used to store final outputs, create tasks, send notifications

# 4) Durable Object: UserBrainDO

One Durable Object instance per user (or per user-session group). It’s the single source of truth for short-to-mid term memory and conversation state.

## State shape (suggested)

```ts
type UserBrainState = {
  userId: string;
  createdAt: string;
  updatedAt: string;
  preferences: Record<string,string>;
  tasks: Task[]; // keep a capped list, index by id
  notes: Note[];
  recentMessages: Message[]; // ring buffer (last 50)
  pinnedMemories: Memory[]; // facts & preferences
  activeSessions: { sessionId:string, lastSeen:number }[];
  planCache: { date:string, plan: Plan }[]; // cached daily plan
}
```

## Methods to expose (RPC from Worker)

* `handleMessage(message)` — apply message to state, append to recentMessages, maybe create quick task
* `getState()` — return snapshot
* `setPreference(key,value)`
* `createTask(task)`
* `updateTask(taskId, patch)`
* `getPlan(date)` / `setPlan(date, plan)`
* `prune()` — keep state size bounded
* `applyLLMOutput(output)` — parse and integrate LLM results (tasks, summary)

Durable Object ensures **linearizable** operations per-user, avoiding race conditions with concurrent client sessions.

# 5) LLM streaming approach

LLM chat streaming. 

### Realtime 

* Client opens a Realtime connection.
* Client sends a `message` event.
* Worker receives event, forwards to LLM with streaming enabled.
* As LLM emits tokens, Worker forwards tokens as Realtime events to the client (`llm.token`).
* On completion, Worker calls `UserBrainDO.applyLLMOutput()` to persist structured results (tasks, summary).
  **Pros**: low-latency, reliable push, simpler for audio TTS.
  **Cons**: requires Realtime integration and client WebSocket handling.

**Implementation details**

* Use Workers AI streaming capability (Llama 3.3 stream mode) and relay tokens.
* Token events should include metadata: `{type:'token', token:'...', role:'assistant'}`, plus `event: 'done'` and structured actions like `event:'create_task', payload:{...}` so client can show "actionable" boxes mid-stream.
* Ensure final output is parsed by the DO and a CID (conversation ID) stored.

# 6) Workflows / scheduled jobs

**Daily Planner Workflow**

* Trigger: CRON-like at user-specified time (via Workflows or CRON Worker)
* Steps:

  1. For each active user (or users with planner enabled), call DO.getState()
  2. Build prompt + context: recent messages, pinned memories, uncompleted tasks, preferences
  3. Call Workers AI Llama to generate plan (stream not required)
  4. call DO.setPlan(date, plan)
  5. Notify user session via Realtime (`plan.available`)
  6. Log metrics

Workflows are ideal because they keep heavy orchestration off the request path.

# 7) Frontend integration (TanStack Start + TanStack Query)

### TanStack Query roles

* Fetch `/api/v1/state` on load (useQuery) — cache snapshot
* Mutations (`/api/v1/tasks`, `/api/v1/memory/pin`) via useMutation with optimistic updates
* Chat messages: send POST `/api/v1/message` (useMutation) then subscribe to Realtime for streaming response
* Use query invalidation when DO persists new state (`/api/v1/state` refetch) or listen to Realtime events to update cache directly.

### Realtime usage patterns

* On connect: identify session and subscribe to user channel
* Receive events:

  * `llm.token` → append token to streaming UI
  * `llm.action` → show action card (create task prompt)
  * `state.updated` → update TanStack cache with new state
* Implement reconnection & backfill: on reconnect, refetch `/api/v1/state` and reconcile with local cache.

### Optimistic UI

* When user creates a task, show optimistic task locally; the Worker will confirm by emitting a `task.created` event.

# 8) Nonfunctional considerations

## Auth & Security

* Use JWTs (Clerk/Auth0) or Cloudflare Access; validate tokens in Worker before any DO access.
* Per-user DO isolation prevents cross-user leakage.
* Sanitize user inputs before sending to LLM. Implement prompt redaction for PII per your privacy policy.
* For voice uploads, use presigned URLs or upload directly to a transient store; keep audio ephemeral (delete after processing).
* Rate-limit on Worker to avoid LLM runaway costs.

## Concurrency & Consistency

* Durable Objects serialize per-object calls for safe single-writer semantics.
* For cross-user operations (e.g., group summaries), use background workflows.

## Failure modes

* LLM timeout / cost spikes: fallback to a short canned reply (or degrade gracefully).
* DO storage grows beyond budget: implement pruning and archival to KV/D1.
* Client disconnects mid-stream: keep state but mark session inactive; allow replay.

## Observability & Logging

* Structured logs (Logfmt/JSON) from Workers → Logtail or Sentry.
* Metric events for LLM token counts, calls, average latency, DO sizes.
* Audit trail for actions generated by LLM (store original prompt + LLM output hash).

## Cost considerations

* LLM token usage is the main cost. Use summarization and context trimming to reduce prompt size (keep last N messages, pinned memories).
* Use Workers AI streaming to avoid repeated calls.
* Prune long histories; keep only what’s necessary for a daily plan.

# 9) Implementation / data flow examples (sequence)

### 1) User sends chat message (streaming)

1. Client `POST /api/v1/message` with JWT.
2. Worker authenticates, routes to UserBrainDO.handleMessage() — stores message.
3. Worker initiates LLM streaming call.
4. As tokens arrive, Worker emits `llm.token` events via Realtime to client.
5. On LLM completion, Worker parses output → `applyLLMOutput()` on DO (creates tasks) → emits `state.updated` and `action.created` events.

### 2) Daily Planner flow

1. Workflow timer triggers Worker.
2. Worker queries DO for users with planner enabled.
3. Worker calls Llama for each user (batch or parallel, throttled).
4. Results stored back into DO and `plan.available` pushed via Realtime.

# 10) Example prompt templates (brief)

* **Planner prompt**: “You are an assistant. Given the user’s tasks, preferences, and recent messages, produce a prioritized plan for {date} with 3 top priorities, 5 todo items, and 1 motivational note. Output JSON with keys: priorities[], todos[], notes[].”
* **Action extraction**: “From this transcript, extract tasks of the form {title, due_date, assignee}. Output JSON array.”

(Keep prompts minimal, instruct to output strict JSON for easy parsing.)

# 11) What to implement first

1. **Scaffold TanStack Start app** with login and Realtime connection UI.
2. **Create Worker API** with one route: `/api/v1/state` and JWT auth.
3. **Implement UserBrainDO** with in-memory schema & `getState()` and `handleMessage()`; unit test locally using Wrangler dev.
4. **Wire a simple LLM mock** (for dev) that replies deterministically; implement streaming proxy later.
5. **Add chat UI** that sends messages, receives `llm.token` events and renders stream.
6. **Add a simple Workflow**: run daily and call DO.getState() and save a “plan” string.
7. **Iterate**: replace mock LLM with Workers AI Llama 3.3; add S2T for voice.


