## WORKERS (MICRO CoS)

There are **three kinds of Workers** (or Worker responsibilities) in the system:

---

# **1. HTTP/Edge Workers — request ingress and API gateway**

**Purpose:**
Handle client HTTP requests, validate inputs, and route them to the right backend components (Durable Objects, workflows, LLMs).

**Responsibilities:**

* Receive user actions:

  * Sending a chat message
  * Creating/updating a task
  * Requesting a daily plan or summary
* Validate and sanitize inputs
* Attach metadata:

  * `request_id`
  * `client_action_id`
  * `user/session_id`
* Forward events to:

  * **Durable Objects** (state machine)
  * **Workflows** (if background tasks are needed)
* Return initial HTTP response:

  * E.g., “message accepted” or snapshot of current state

**Key features to implement in this worker:**

* Input validation (Zod schemas)
* Event envelope creation (`event_id`, `timestamp`, `type`, `payload`)
* prefetch for frontend caching (optimistic UI updates)

---

# **2. Durable Object Workers — state, memory, and event reduction**

**Purpose:**
This is the **heart of the app** — the single source of truth.

**Responsibilities:**

* Maintain user or session state:

  * Messages (chat memory)
  * Tasks and workflows
  * Planner state
  * Assistant context / history
* Process incoming events sequentially (prevents race conditions)
* Reduce events into deterministic state:

  * `user.message` → append to memory → trigger LLM streaming
  * `workflow.daily_plan` → update tasks → emit Realtime updates
* Ensure idempotency:

  * Drop duplicate `event_id`s
  * Track recent `client_action_id`s
* Emit outbound events for clients:

  * Realtime pushes
  * HTTP snapshot responses

**Key features to implement:**

* Event log + state reducer
* Idempotency checks
* Correlation ID handling (`request_id`, `operation_id`, `event_id`)
* snapshotting (for fast client sync or reconnects)

---

# **3. LLM/AI Workers — Workers AI calls**

**Purpose:**
Handle all AI reasoning in a **streaming, event-driven fashion**.

**Responsibilities:**

* Receive event from DO or HTTP worker:

  * `user.message`
  * `workflow.generate_summary`
  * `task.extract`
* Call **Llama 3.3 on Workers AI**:

  * Stream tokens as they are generated
  * Push tokens back as events to the DO
  * Attach operation metadata (`operation_id`)
* Handle LLM errors and retries
* Optional post-processing:

  * Extract tasks
  * Generate reminders
  * Summarize context

**Key features to implement:**

* Streaming token support
* Token-level events (`llm.token`) for Realtime push
* Operation correlation (`operation_id`)
* Optional event enrichment (structured outputs for tasks, planner, or assistant actions)

---

# **4. Event flow overview**

A typical sequence:

1. **User sends a message** → HTTP Worker
2. HTTP Worker:

   * Creates event (`event_id`, `request_id`, payload)
   * Sends event to Durable Object
3. **Durable Object**:

   * Updates state
   * Appends event to log
   * Triggers LLM Worker for reasoning
   * Pushes Realtime events to subscribed clients
4. **LLM Worker**:

   * Streams tokens back to DO
   * DO forwards tokens to clients in real-time
Workflows can trigger additional events (e.g., daily planner) → DO → Realtime → Clients

---

# **5. Why this is implementation**

* Single-threaded DO = deterministic state = no race conditions
* Event-driven = every action is auditable and replayable
* Streaming LLM + token events = responsive UI
* Correlation IDs = full observability
* Idempotency = no duplicate actions
* Workers + DOs + Realtime = fully Cloudflare-native

---

