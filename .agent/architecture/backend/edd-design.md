## **The backend style: “Event-Driven Mini Monolith”**

The backend has these traits:

### **1. Durable Object → single source of truth (state machine)**

The DO holds the:

* memory
* tasks
* previous messages
* assistant state
* “system log” or “event ledger”

Every update happens by sending an event into this DO.

### **2. Realtime events → push updates to all clients**

Any change inside the DO triggers outgoing notifications to clients:

* `task.created`
* `task.updated`
* `message.stream`
* `assistant.plan.generated`
* `state.synced`

### **3. LLM streaming → token events**

LLM responses aren’t just text. They’re *streams of events*:

```
llm.token
llm.completed
llm.interrupted
```

The backend pushes those directly to Realtime → UI.

### **4. Workflows → scheduled event producers**

Cloudflare Workflows generate internal “system events”:

* `daily_plan.start`
* `daily_plan.complete`
* `assistant.reminder`
* `assistant.digest_created`

These events go into the DO the same way user actions do.

### **5. HTTP requests → event inputs**

Even the chat request is just an input event:

```
user.message
user.request_plan
user.create_task
```

All roads lead to the DO.

---

# **The pattern being used**

This backend adheres to a very clear architectural model:

### **CQRS + Event Sourcing (lite version)**

* **Writes** = events appended into DO
* **State** = DO reduces these events into current memory
* **Reads** = frontend subscribes to Realtime or fetches snapshots via HTTP
* **Replay** = DO can rebuild state from event log 

---

# Why this matters for the architecture

Because in an event-driven system:

* every action is a discrete event
* every event is append-only
* everything is reproducible
* everything is auditable
* state never gets corrupted
* concurrency is solved (thanks to DO single-threading)
* UIs become reactive by default
* workflows and LLM calls become predictable

---

# Also important to add:

### Idempotent subscribers

### A lightweight cache layer

### Guards against duplicate events / double writes

### “Optimistic read” protection to avoid eventual-consistency hiccups

But the twist is:
**Cloudflare makes this way easier because Durable Objects are single-threaded and strongly consistent.**
So the design becomes *clean* and *minimal*, not enterprise-bloated.

---

# 1. Idempotent Subscribers

**But only in one place: the Durable Object.**

Anywhere else (Realtime, UI, scheduled workflows) is irrelevant because:

* DO is the single source of truth.
* DO processes events sequentially.
* DO can check and drop duplicates instantly.

### Do this inside the DO:

```ts
if (state.lastEventId === incoming.eventId) {
  return { status: "ignored_duplicate" }
}
state.lastEventId = incoming.eventId
```

Done.

**Every event has:**

* `event_id` (uuid v7)
* `timestamp`
* `type`
* `payload`

This makes the entire system idempotent with almost zero friction.

---

# 2. Cache Layer — Only Need *One* Cache

The cache sits on the **client**, not on multiple backend layers.

## The stack already ensures:

* DO = strongly consistent writes
* Realtime = delivers updates immediately
* TanStack Query = keeps frontend cache fresh

So the cache layer is:

### **TanStack Query + optimistic updates**

for:

* tasks
* memory
* messages
* conversation state

No Redis.
No Cloudflare KV guesswork.
No double caches.

Just clean:

```ts
queryClient.setQueryData(["tasks"], old => [...old, newTask])
```

When the DO sends the real event, Query merges and corrects discrepancies.

---

# 3. Protect user from duplicates

### **Client side**

Every action gets a deterministic `client_action_id`.

### **Server (Worker → DO)**

Pass this ID into the event.

### **DO**

Drops duplicates using a small LRU set:

```ts
if (state.recentActionIds.has(clientActionId)) return
state.recentActionIds.add(clientActionId)
```

Now users can never:

* double submit tasks
* resubmit messages if they click twice
* produce ghost updates
* break consistency

---

# 4. Prevent “eventually consistent” errors

Durable Objects provides **strict serialization**:

* Only one request runs at a time.
* Reads after writes are immediately up-to-date.
* Realtime syncs clients.

So the system is basically **strongly consistent by default**.

Still want two guards:

### **A. Snapshot fetch when page loads**

Because mobile clients could have stale in-memory cache.

### **B. Reconcile on reconnect**

If the WebSocket reconnects, request:

```
GET /state?since=last_event_id
```

And replay missing events.

This prevents the classic:

* “why didn’t my task appear?”
* “why did this disappear?”
* “why is the chat missing messages?”

---

# The Final Model 

### **A deterministic, event-driven, idempotent mini-monolith**

running inside a Durable Object, with:

* strict concurrency
* strict ordering
* no race conditions
* no ghost writes
* no duplicate events
* no stale data
* no eventual consistency traps


