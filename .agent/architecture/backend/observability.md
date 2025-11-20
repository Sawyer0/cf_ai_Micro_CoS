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
* “exactly once” semantics

### Format:

`evt_` + UUIDv7

---

## **3. `operation_id` (per workflow execution or LLM call)**

Any multi-step operation — LLM run, workflow chain, assistant planner — gets a long-running ID.

Examples:

* “create daily plan”
* “generate summary”
* “respond to user message”
* “extract tasks from text”

### Format:

`op_` + UUIDv7

---

# 🔗 **How correlation works**

These IDs are nested:

```
request_id → may create multiple events
event_id → may spawn an operation (LLM call)
operation_id → may emit many outbound realtime messages
```

### Log like this:

```
{
  request_id,
  event_id,
  operation_id,
  user_id,
  session_id,
  type: "task.created",
  success: true,
  duration_ms: 118
}
```

This gives the **perfect correlation** across all layers.

---

# **Observability: The 4 Core Pillars Needed**

---

# 1. **Structured Logging (JSON)**

Don’t console.log strings.

Every Worker and DO logs JSON objects:

```ts
log.info("event_received", {
  request_id,
  event_id,
  event_type,
  payload_size: JSON.stringify(payload).length,
  user: state.user_id
})
```

These logs flow into:

* Cloudflare Logs
* Hyperdrive
* BetterStack 

---

# 2. **Tracing**

Cloudflare Workers don’t have built-in tracing 
So it's simulated it with:

* `request_id`
* `operation_id`
* timestamps

Every log line inherits its parent correlation IDs.

This produces a **virtual trace tree**, which is enough.

---

# 3. **Distributed Metrics**

Minimal metrics needed:

### **Latency**

* worker_latency
* durable_object_lock_wait
* llm_time_to_first_token
* llm_total_tokens
* daily_plan_execution_time

### **Counts**

* events_written
* events_replayed
* user_actions
* realtime_messages_sent
* duplicate_events_dropped

### **Failures**

* llm_failures
* workflow_failures
* realtime_disconnects
* do_restarts

Output them as log lines that a dashboard picks up.

---

# 4. **Event Sourcing Diagnostics**

Durable Object stores:

* `last_event_id`
* `last_operation_id`
* `event_log_length`
* `last_snapshot_ts`

Expose a debug endpoint:

```
GET /internal/state
GET /internal/events?limit=50
GET /internal/operations?since=...
```
---

