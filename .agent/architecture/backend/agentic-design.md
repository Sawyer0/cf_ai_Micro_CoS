## CLAUDE CODE INFRASTRUCTURE SHOWCASE ADAPTION (MICRO CoS)

## _Most relevant patterns extracted from Claude Code Infrastructure Showcase_

# **1. Modular skills / small resource files**

**Pattern in Claude Code:**

- Each skill is small (<500 lines), with resources separated, so the agent doesn’t load everything at once.

**Micro Chief of Staff adaptation:**

- Split the agent functions into **separate modules/skills** (language-agnostic):

  - Travel skill module → handles trips, flight suggestions
  - Summary skill module → generates daily/weekly summaries
  - Task skill module → extracts tasks, creates reminders

- LLM prompts are modularized: each skill has its own template, instructions, and expected output format
- Only load/execute the needed module based on context

**Benefit:** Scales better, easier to maintain, clear separation of concerns, supports SOLID principles.

---

# **2. Hooks / event triggers**

**Pattern in Claude Code:**

- Hooks fire at key points: after user input, after tool invocation, on state change.

**Micro Chief of Staff adaptation:**

- Worker + DO system implements event-driven patterns:

  - `onUserMessage` → LLM processes message → extracts tasks if mentioned
  - `onToolResult` → LLM reasons over tool output (e.g., flight options) → responds in chat
  - All events tied to **correlation IDs** for observability

**Benefit:** Makes the system reactive and auditable, without messy polling or hard-coded flows.

**Note:** This is **chat-first, on-demand** for user-facing actions. Background workers may sync/index data (e.g., calendar events, travel events), but they only update state; user-visible actions still begin from chat.

---

# **3. Context persistence / dev-docs pattern**

**Pattern in Claude Code:**

- Context is persisted across agent resets, decisions, and skills using “dev-docs” system.

**Micro Chief of Staff adaptation:**

- Durable Objects store:

  - User preferences (travel, preferred airlines, notification rules)
  - Task and trip history
  - Chat history (messages with retention policies, see `chat-history-management.md`)
  - Decisions made by the assistant (why a flight was suggested, which task was prioritized)

- LLM prompt includes memory context, so recommendations are consistent across sessions

**Benefit:** Memory-driven reasoning = continuity, fewer mistakes, stronger real-world utility.

---

# **4. Tool orchestration / skill outputs**

**Pattern in Claude Code:**

- Skills can call external tools and feed their outputs back into the reasoning engine.

**Micro Chief of Staff adaptation:**

- Flight MCP tool → called by Travel Planner skill
- Calendar API → called to detect trips or meeting conflicts
- Task DB / Reminder service → receives LLM outputs to schedule actions
- LLM Worker interprets tool output → generates next action → pushes to DO → Realtime client

**Benefit:** The assistant becomes **truly agentic**, not just reactive chat. Tools extend capabilities while maintaining single responsibility.

---

# **5. Model configuration**

- **Primary provider & model:** Cloudflare Workers AI, model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
- **Standard prompt shape:**
  - `system`: single, stable instruction describing "Micro Chief of Staff" behavior and guardrails.
  - `user`: latest user utterance.
  - `assistant`: limited recent turns and key summaries, not full unbounded history.
  - Optional tool context snippets (flight options, tasks, calendar state) embedded as JSON or clearly marked sections.
- **Default parameters (per call, unless overridden):**
  - `temperature`: 0.4 (balanced between determinism and creativity).
  - `top_p`: 0.9.
  - `max_tokens`: ~1024 for assistant replies (shorter for tools-only reasoning calls).
  - `stream`: `true` for chat endpoints; `false` for purely structured/background reasoning where streaming is unnecessary.
- **Config-driven selection:**
  - Model id and core parameters are read from configuration (for example, a `WORKERS_AI_MODEL_ID` env var or Worker bindings).
  - Application code should not hard-code specific model names; swapping to a different Workers AI model should be a config change, not a code change.

### Prompting guidelines with Workers AI / Llama 3.3

- The model is **helpful and verbose by default**; without constraints it tends to return long, coach-like answers.
- Instructions ("one short sentence", "be brief") are **soft constraints**. For strict behavior you must:
  - Combine clear instructions with parameter controls like `max_tokens`.
  - Validate outputs (JSON schema checks, length checks) and optionally retry or truncate.
- Always set `max_tokens` deliberately per skill:
  - Short UI messages / confirmations: `32–64` tokens.
  - Structured reasoning / planners: `256–1024` tokens.
  - Extraction / JSON-only tools: just enough to cover the schema plus some slack.
- Separate concerns in prompts:
  - Use `system` for stable persona + guardrails ("Micro CoS" behavior).
  - Use `user` for the latest request.
  - Pass context (calendar, flights, tasks) as clearly marked blocks or JSON, not mixed into narrative instructions.
- For **strict formats** (JSON, single-sentence, etc.), treat LLM output as an attempt, not ground truth:
  - Parse and validate.
  - On failure, either run a "fixup" call or surface a friendly error rather than trusting malformed output.

**Reference docs:**

- Llama prompting guide: https://www.llama.com/docs/how-to-guides/prompting/
- Llama 3.3 model card & prompt formats: https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_3/

---

# **Summary Mapping**

| Claude Pattern        | Micro Chief of Staff Adaptation                       | Benefit                                  |
| --------------------- | ----------------------------------------------------- | ---------------------------------------- |
| Chat-activated skills | Travel Search, Task Extraction, Summaries (on-demand) | User-controlled, predictable behavior    |
| Modular skills        | Separate skill modules + prompt templates             | Maintainable, scalable, SOLID            |
| Event-driven state    | Worker + DO event hooks for user messages             | Reactive, auditable, clean architecture  |
| Context persistence   | DO memory for user data, task/trip/chat history       | Continuity, consistent recommendations   |
| Tool orchestration    | flights-MCP (when user asks), Calendar API            | Extensible, user-initiated functionality |

---

## **Flights-MCP Integration (Concrete Example)**

The **Travel Search skill** demonstrates chat-initiated tool orchestration:

1. **User asks in chat**: "Find me flights to Paris for May 10-15"
2. **LLM detects intent** → extracts: destination=Paris, dates=May 10-15
3. **Worker calls flights-MCP** → "SFO to CDG, May 10-15" → returns [flight1, flight2, ...]
4. **LLM Ranking** → Llama 3.3 scores flights against user preferences + context → top 3 ranked options
5. **Results stored** → UserBrainDO persists flight results in chat history
6. **LLM streams response** → "Here are the best flights for your Paris trip..." → frontend displays in chat
7. **User can ask follow-up** → "Book the first one" → creates task, confirms in chat

This showcases:

- **Chat-initiated workflows** (user asks → tool called → response in chat)
- **Tool extensibility** (flights-MCP can be swapped or extended to hotel-MCP, car-MCP)
- **LLM reasoning over tool outputs** (ranking flights with context)
- **Persistence & observability** (correlation IDs track entire conversation)

---
