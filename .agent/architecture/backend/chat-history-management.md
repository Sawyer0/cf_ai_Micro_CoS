## CHAT HISTORY MANAGEMENT (MICRO CoS)

Chat history is a core part of the assistant's memory and context. It enables continuity across sessions, supports LLM reasoning, and provides users with a complete conversation view.

---

# **1. Storage Architecture**

Chat history lives in the **Durable Object** as part of the per-user state machine.

## **Message Schema**

```ts
interface Message {
  id: string;           // evt_<uuid> (event ID)
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;    // Unix timestamp
  tokens?: number;      // for assistant messages (LLM token count)
  metadata?: {
    request_id: string;
    operation_id?: string;
    client_action_id?: string;
  };
}
```

## **Durable Object State**

```ts
interface UserBrainState {
  user_id: string;
  messages: Message[];           // in-memory chat history
  event_log: Event[];            // append-only event log
  memory: UserMemory;            // preferences, facts, context
  tasks: Task[];
  last_snapshot_ts: number;
  // ... other state
}
```

---

# **2. Why Store in Durable Object?**

- **Single source of truth:** All user state lives in one place
- **Linearizable operations:** No race conditions with concurrent clients
- **Event sourcing:** Messages are events; entire conversation is replayable
- **Idempotency:** Duplicate messages are detected and dropped via `event_id`
- **Fast reads:** In-memory access for LLM context and client sync
- **Snapshots:** Quick reconnects without replaying entire history

---

# **3. Message Lifecycle**

## **User sends a message**

1. HTTP Worker receives message → creates event:
   ```ts
   {
     event_id: "evt_018ef9e2...",
     request_id: "req_018ef9e2...",
     type: "user.message",
     payload: { text: "What's on my agenda?" }
   }
   ```

2. DO receives event:
   - Checks idempotency (drop if `event_id` exists)
   - Appends to `event_log`
   - Reduces into `messages` array
   - Triggers LLM Worker

3. LLM streams response:
   - Each token is an event: `llm.token`
   - DO accumulates tokens into assistant message
   - On completion, appends full message to `messages`

4. Realtime pushes updates to clients:
   - `message.created` (user message)
   - `llm.token` (streaming assistant response)
   - `message.completed` (assistant message finalized)

---

# **4. Retention & Pagination**

To prevent unbounded memory growth:

## **In-Memory Limits**

```ts
const MAX_MESSAGES_IN_MEMORY = 100;  // keep last 100 messages
const MAX_HISTORY_DAYS = 30;         // archive messages older than 30 days

// On new message:
if (state.messages.length > MAX_MESSAGES_IN_MEMORY) {
  const archived = state.messages.shift();
  // optionally persist to D1 or KV
}
```

## **Archival Strategy**

For long-term storage or compliance:

```ts
// Daily Workflow or on threshold
if (state.messages.length > MAX_MESSAGES_IN_MEMORY) {
  const toArchive = state.messages.slice(0, -MAX_MESSAGES_IN_MEMORY);
  
  await D1.insert('message_archive', {
    user_id: state.user_id,
    messages: JSON.stringify(toArchive),
    archived_at: Date.now()
  });
  
  state.messages = state.messages.slice(-MAX_MESSAGES_IN_MEMORY);
}
```

**Archived messages:**
- Stored in D1 for analytics, compliance, or user export
- Not loaded into DO by default (keeps memory footprint small)
- Can be fetched on-demand via separate endpoint: `GET /api/v1/history/archive`

---

# **5. LLM Context Window**

The LLM doesn't need the entire chat history—just recent context.

## **Context Selection**

```ts
const CONTEXT_WINDOW_MESSAGES = 20;  // last 20 messages

function buildLLMPrompt(userInput: string, state: UserBrainState) {
  const recentMessages = state.messages.slice(-CONTEXT_WINDOW_MESSAGES);
  const memoryContext = state.memory;  // user preferences, facts
  
  return {
    system: "You are a productivity assistant...",
    context: {
      memory: memoryContext,
      recent_messages: recentMessages
    },
    user_input: userInput
  };
}
```

**Why limit context?**
- Keeps token count manageable
- Reduces LLM latency
- Focuses on relevant recent conversation
- Memory (preferences, facts) provides long-term continuity

---

# **6. Client Sync & Reconnection**

## **Initial Load**

When a client connects:

```
GET /api/v1/state
```

Response:
```json
{
  "user_id": "user_123",
  "messages": [...],  // last N messages
  "tasks": [...],
  "memory": {...},
  "last_snapshot_ts": 1700000000
}
```

TanStack Query caches this snapshot.

## **Realtime Updates**

Client subscribes to Realtime channel:

```ts
realtime.subscribe(`user:${userId}`, (event) => {
  switch (event.type) {
    case "message.created":
      // append to local messages
      break;
    case "llm.token":
      // stream token into current assistant message
      break;
    case "message.completed":
      // finalize assistant message
      break;
  }
});
```

## **Reconnection**

If client disconnects and reconnects:

1. Fetch latest snapshot: `GET /api/v1/state?since=<last_snapshot_ts>`
2. DO returns only messages created after `last_snapshot_ts`
3. Client merges with local cache
4. Resume Realtime subscription

---

# **7. Idempotency & Deduplication**

## **Duplicate Message Prevention**

DO tracks recent `event_id`s:

```ts
const recentEventIds = new Set<string>();  // last 1000 event IDs

function handleEvent(event: Event) {
  if (recentEventIds.has(event.event_id)) {
    log.warn("duplicate_event_dropped", { event_id: event.event_id });
    return;  // idempotent: drop duplicate
  }
  
  recentEventIds.add(event.event_id);
  // process event...
}
```

## **Client Action IDs**

Clients can attach `client_action_id` for optimistic UI updates:

```ts
// Client sends:
{
  client_action_id: "msg_local_123",
  text: "What's on my agenda?"
}

// DO responds with:
{
  event_id: "evt_018ef9e2...",
  client_action_id: "msg_local_123"  // echoed back
}
```

Client matches `client_action_id` to replace optimistic message with confirmed one.

---

# **8. Event Sourcing & Replay**

Every message is an immutable event in the event log.

## **Event Types**

```ts
type MessageEvent = 
  | { type: "user.message", payload: { text: string } }
  | { type: "assistant.message", payload: { text: string, tokens: number } }
  | { type: "system.message", payload: { text: string } };
```

## **State Reduction**

```ts
function reduceEvents(events: Event[]): UserBrainState {
  const state = initialState();
  
  for (const event of events) {
    switch (event.type) {
      case "user.message":
        state.messages.push({
          id: event.event_id,
          role: "user",
          content: event.payload.text,
          timestamp: event.timestamp,
          metadata: { request_id: event.request_id }
        });
        break;
      
      case "assistant.message":
        state.messages.push({
          id: event.event_id,
          role: "assistant",
          content: event.payload.text,
          timestamp: event.timestamp,
          tokens: event.payload.tokens,
          metadata: { operation_id: event.operation_id }
        });
        break;
      
      // ... other event types
    }
  }
  
  return state;
}
```

**Benefits:**
- Deterministic state reconstruction
- Audit trail for debugging
- Time-travel debugging (replay to any point)
- Easy to add new features (just replay with new reducer logic)

---

# **9. Observability**

## **Metrics to Track**

- `messages_created` (count)
- `messages_archived` (count)
- `message_history_size` (gauge, per user)
- `llm_context_tokens` (histogram)
- `duplicate_messages_dropped` (count)

## **Logs**

```ts
log.info("message_created", {
  request_id,
  event_id,
  user_id,
  role: "user",
  content_length: message.content.length
});

log.info("message_archived", {
  user_id,
  archived_count: toArchive.length,
  oldest_message_ts: toArchive[0].timestamp
});
```

---

# **10. Integration with Other Components**

## **Daily Planner**

Planner Workflow reads recent messages for context:

```ts
const recentMessages = state.messages.slice(-10);
const prompt = buildPlannerPrompt(state.tasks, recentMessages, state.memory);
```

## **Task Extraction**

Task Extraction skill scans recent messages:

```ts
const unprocessedMessages = state.messages.filter(m => 
  m.role === "user" && !m.metadata?.tasks_extracted
);
```

## **Summarization**

Summary skill generates digests from message history:

```ts
const todayMessages = state.messages.filter(m => 
  m.timestamp > startOfDay(Date.now())
);
const summary = await llm.summarize(todayMessages);
```

---

# **11. Implementation Checklist**

- [ ] Define `Message` interface in DO state schema
- [ ] Implement event handlers for `user.message` and `assistant.message`
- [ ] Add idempotency checks via `event_id` tracking
- [ ] Implement in-memory retention limits (MAX_MESSAGES_IN_MEMORY)
- [ ] Add archival logic (optional D1 integration)
- [ ] Build LLM context selection (last N messages)
- [ ] Expose snapshot endpoint: `GET /api/v1/state`
- [ ] Implement Realtime events: `message.created`, `llm.token`, `message.completed`
- [ ] Add client reconnection logic with `since` parameter
- [ ] Add observability: logs, metrics, correlation IDs
- [ ] Test idempotency, replay, and archival flows

---

# **12. Future Enhancements**

- **Search:** Full-text search over archived messages (D1 + FTS)
- **Export:** User-facing endpoint to download entire chat history
- **Summarization:** Auto-generate summaries of long conversations
- **Branching:** Support multiple conversation threads per user
- **Shared context:** Allow users to share specific conversations with team members

---
