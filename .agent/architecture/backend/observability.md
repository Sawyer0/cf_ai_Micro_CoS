## OBSERVABILITY & CORRELATION ID'S (MICRO CoS)

Correlation IDs: what they are in the system

**Three layers of IDs**, each for a different purpose:

## **1. `request_id` (per inbound HTTP/WebSocket interaction)**

Generated on the edge Worker.
Tracks a single incoming user action:

* sending a chat message
* editing a task
* opening the app
* refreshing state
* adding a calendar event

This ties into logs and traces so entire request → response path can be reconstructed.

### Format:

`req_` + UUIDv7
(example: `req_018ef9e2-b3…`)

---

## **2. `event_id` (per event added to the Durable Object)**

Every event that enters the DO gets its own ID.

This is for:

* idempotency
* replay
* deterministic state reduction
* "exactly once" semantics

### Format:

`evt_` + UUIDv7

### Tool invocation events

Tool requests also get event_ids for traceability:

* `tool_request_id`: Unique ID for each tool invocation (e.g., flights-MCP call)
* `tool_name`: Name of the tool (e.g., "flights-mcp")
* Logged alongside `request_id`, `event_id`, `operation_id`
* Allows correlation across user action → tool call → tool response → DO state update

---

## **3. `operation_id` (per workflow execution, LLM call, or tool invocation)**

Any multi-step operation — LLM run, workflow chain, assistant planner, tool orchestration — gets a long-running ID.

Examples (LLM):

* "create daily plan"
* "generate summary"
* "respond to user message"
* "extract tasks from text"
* "rank flight options"

Examples (Tool invocation):

* "search flights for Paris trip"
* "detect travel event from calendar"
* "orchestrate travel workflow"

### Format:

`op_` + UUIDv7

### Tool-specific operation tracking

Tool invocations generate detailed metrics:

* `tool_invocation_id` (e.g., `tool_018ef9e2-...`) — unique ID for each tool call
* `tool_name` — e.g., "flights-mcp"
* `tool_request_id` — request sent to the tool
* `tool_response_id` — response received from the tool
* `tool_status` — "success", "timeout", "rate_limited", "error"
* `tool_latency_ms` — time to get response
* `tool_result_count` — number of results (e.g., flight options)
* `tool_error_message` — if failed

---

# 🔗 **How correlation works**

These IDs are nested:

```
request_id → may create multiple events
event_id → may spawn an operation (LLM call or tool invocation)
operation_id → may emit many outbound realtime messages
tool_invocation_id → nested within operation_id
```

### Log like this (standard event):

```json
{
  "request_id": "req_018ef9e2-...",
  "event_id": "evt_018ef9e2-...",
  "operation_id": "op_018ef9e2-...",
  "user_id": "user_123",
  "session_id": "sess_456",
  "type": "task.created",
  "success": true,
  "duration_ms": 118
}
```

### Log like this (tool invocation):

```json
{
  "request_id": "req_018ef9e2-...",
  "event_id": "evt_018ef9e2-...",
  "operation_id": "op_018ef9e2-...",
  "tool_invocation_id": "tool_018ef9e2-...",
  "user_id": "user_123",
  "type": "tool.invocation",
  "tool_name": "flights-mcp",
  "tool_status": "success",
  "tool_latency_ms": 450,
  "tool_result_count": 12,
  "success": true
}
```

This gives the **perfect correlation** across all layers: user action → travel workflow → tool call → ranking → frontend.

---

# **Observability: The 4 Core Pillars Needed**

---

# 1. **Structured Logging (JSON)**

Don't console.log strings.

Every Worker and DO logs JSON objects:

```ts
log.info("event_received", {
  request_id,
  event_id,
  event_type,
  payload_size: JSON.stringify(payload).length,
  user_id,
  correlation_id: operation_id
})

log.info("tool_invocation", {
  request_id,
  event_id,
  operation_id,
  tool_invocation_id,
  tool_name: "flights-mcp",
  tool_status: "in_progress",
  timestamp: Date.now()
})
```

These logs flow into:

* Cloudflare Logs
* Hyperdrive
* BetterStack

---

# 2. **Tracing**

Cloudflare Workers don't have built-in tracing.
Simulate it with:

* `request_id`
* `operation_id`
* `tool_invocation_id` (for tool calls)
* timestamps

Every log line inherits its parent correlation IDs.

This produces a **virtual trace tree**, which is enough.

Example trace timeline:

```
req_018ef9e2-...
├─ evt_018ef9e2-... (calendar_event_received)
├─ op_018ef9e2-... (travel_event_detection)
├─ op_018ef9e3-... (travel_workflow_orchestration)
│  ├─ tool_018ef9e4-... (flights-mcp search)
│  │  └─ tool_status: success, latency: 450ms
│  ├─ op_018ef9e5-... (flight_ranking)
│  │  └─ llm_status: success, latency: 320ms
│  └─ evt_018ef9e6-... (suggestions_published)
└─ Realtime event pushed to frontend
```

---

# 3. **Distributed Metrics**

Minimal metrics needed:

### **Latency**

* `worker_latency`
* `durable_object_lock_wait`
* `llm_time_to_first_token`
* `llm_total_tokens`
* `llm_ranking_latency` (flight ranking specific)
* `tool_latency` (per tool: flights-mcp, hotel-mcp, etc.)
* `travel_workflow_end_to_end_latency`
* `daily_plan_execution_time`

### **Counts**

* `events_written`
* `events_replayed`
* `user_actions`
* `realtime_messages_sent`
* `duplicate_events_dropped`
* `tool_invocations` (per tool)
* `tool_successes` / `tool_failures`
* `travel_events_detected`
* `flights_ranked`

### **Failures**

* `llm_failures`
* `tool_failures` (per tool)
* `workflow_failures`
* `realtime_disconnects`
* `do_restarts`
* `rate_limit_errors` (tool-specific)

Output them as log lines that a dashboard picks up.

---

# 4. **Event Sourcing Diagnostics**

Durable Object stores:

* `last_event_id`
* `last_operation_id`
* `last_tool_invocation_id`
* `event_log_length`
* `last_snapshot_ts`
* `travel_workflows_active` (count of in-flight travel workflows)

Expose debug endpoints:

```
GET /internal/state
GET /internal/events?limit=50
GET /internal/operations?since=...
GET /internal/tools?tool_name=flights-mcp
GET /internal/travel/workflows
```

---

# 5. **Tool-Specific Observability**

For tool integrations (flights-mcp and future tools), track:

### **Per-tool dashboard**

* Invocation count (today, last 7 days, last 30 days)
* Success rate (%)
* Average latency (ms)
* P95, P99 latencies
* Error distribution (timeouts, rate limits, malformed responses)
* Result cardinality (avg results per call)

### **Per-workflow dashboard**

* Travel event detection accuracy (confidence > threshold %)
* Ranking quality (user selects top 1, top 2, top 3)
* Booking conversion (% of suggestions → bookings)
* End-to-end latency from calendar event → suggestions shown

---


---

# **Chat History Observability**

Additional metrics and logs for chat history management:

## **Metrics**

* `message_history_size` (gauge, per user) — current count in `messages[]`
* `messages_created` (counter) — total user + assistant messages
* `messages_archived` (counter) — messages moved to D1
* `duplicate_messages_dropped` (counter) — idempotency catches
* `llm_context_messages` (histogram) — number of messages in LLM context window

## **Logs**

```ts
log.info("message_created", {
  request_id,
  event_id,
  user_id,
  role: "user" | "assistant",
  content_length,
  tokens: number  // for assistant messages
});

log.info("message_archived", {
  user_id,
  archived_count,
  oldest_message_ts,
  archive_reason: "retention_limit" | "age_limit"
});

log.warn("duplicate_message_dropped", {
  event_id,
  user_id,
  request_id
});
```

## **Debug Endpoints**

```
GET /internal/messages?user_id=<id>&limit=100
GET /internal/message-stats?user_id=<id>
```

See `chat-history-management.md` for complete observability details.

---
