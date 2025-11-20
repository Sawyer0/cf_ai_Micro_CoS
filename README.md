# Micro Chief of Staff (Micro CoS)

An **AI-powered productivity assistant** for busy professionals, built on Cloudflare Workers and Durable Objects. Automatically detects events, extracts tasks, ranks travel options, and generates daily plans using agentic reasoning patterns.

**Status:** Early-stage development | **Tech Stack:** Python (FastAPI), TypeScript (TanStack Start), Cloudflare (Workers, Durable Objects, Realtime, Workers AI), Llama 3.3, MCP

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Core Concepts](#core-concepts)
- [Integration Patterns](#integration-patterns)
- [Development](#development)
- [Contributing](#contributing)

---

## Overview

**Micro Chief of Staff** transforms passive calendar and email into an **agentic workflow system** that you control via chat. When you ask in chat (for example, "Plan my Paris trip based on my calendar" or "Help me prep for the Q2 planning meeting"), the assistant:

1. **Detects intent** – "Paris trip" → travel planning, "Q2 Planning Meeting" → prep tasks
2. **Invokes tools** – Searches flights via flights-MCP, queries Google Calendar for conflicts (with your permission)
3. **Reasons with LLM** – Llama 3.3 ranks flights by preferences + calendar context, extracts tasks with deadlines
4. **Stores & notifies** – Persists results in Durable Objects, streams updates back to the chat UI in real time

**Example workflow (chat-triggered):**

```
User: "I'm going to Paris May 15–20. Find me flights and check for calendar conflicts."
    ↓
Chat API Worker receives /api/chat request and emits `chat_message_received`
    ↓
Travel workflow handler detects travel intent and, if needed, reads calendar via google-calendar-mcp
    ↓
FlightToolClient searches flights via flights-MCP
    ↓
LLM ranks flights based on user preferences + calendar context
    ↓
Top options stored in TravelWorkflowDO and an event like `suggestions_published` is emitted
    ↓
Results are streamed back to the user in the chat UI (TanStack Start + assistant-ui)
```

---

## Key Features

### 🌍 Travel Planning

- **Proactive flight search** – Detects travel events in calendar, automatically searches flights
- **Intelligent ranking** – LLM considers user preferences (airlines, cabin, budget), calendar conflicts (early arrivals for meetings), price vs. convenience tradeoffs
- **Real pricing** – Integrated with flights-MCP (Duffel API) for live flight options and pricing
- **Persistent state** – All searches, selections, and booking status stored in Durable Objects

### 📅 Calendar Intelligence

- **Event parsing** – Reads Google Calendar events, extracts metadata (location, attendees, times)
- **Travel detection** – Pattern matching + optional LLM classification for travel events
- **Conflict detection** – Considers existing meetings when ranking flights (avoid early arrivals for 8am calls)
- **Multi-timezone support** – Handles global scheduling with proper timezone conversions

### ✅ Task Extraction & Management

- **Automatic prep task generation** – "Q2 Planning Meeting" → "Prepare agenda", "Gather metrics"
- **Email-driven tasks** – Extract deadlines from emails ("review by Friday")
- **Priority & deadline inference** – LLM sets priority (high/medium/low) and realistic deadlines
- **Deduplication** – Avoids creating duplicate tasks from repeated calendar events

### 📊 Daily Planning

- **Time-blocked schedules** – Generates hour-by-hour plan with meeting slots, focus blocks, breaks
- **Smart prioritization** – Must-do, should-do, nice-to-do categorization
- **Energy-aware scheduling** – Places cognitively demanding tasks during peak energy hours
- **Scheduling gaps** – Identifies available slots for unscheduled tasks with recommendations

### 📝 Meeting Summarization

- **Automatic recaps** – Summarizes meetings, emails, work sessions with key decisions and action items
- **Decision tracking** – Extracts and stores decisions with rationale and impact
- **Risk/blocker identification** – Flags risks, blockers, and dependencies from discussions
- **Audience-aware tone** – Adjusts summary for self, team, leadership, or client audiences

### 🔍 Observability

- **Correlation IDs** – Every operation tracked end-to-end with unique `correlation_id` for debugging
- **Structured logging** – Events logged per step: tool invocation, LLM reasoning, state changes
- **Performance metrics** – Latency, success rates, error types captured for monitoring
- **Audit trail** – Full history of decisions, tool calls, and reasoning

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (TanStack Start + assistant-ui)                        │
│ - Chat interface with streaming (assistant-ui Thread component) │
│ - Trip suggestion cards + Task list                             │
│ - Daily planner view                                            │
│ (UI built with https://github.com/assistant-ui/assistant-ui)    │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┴────────────────┐
          │                               │
          ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│ Realtime                 │   │ Chat / HTTP API Worker   │
│ - Push notifications     │   │ - /api/chat (SSE)        │
│ - Live updates           │   │ - REST endpoints         │
└──────────────────────────┘   └────────┬─────────────────┘
                                        │
          ┌─────────────────────────────┤
          │                             │
          ▼                             ▼
┌──────────────────────────────────────────────────────┐
│ Cloudflare Workers                                    │
│ ┌────────────────────────────────────────────────┐  │
│ │ Orchestration Layer                            │  │
│ │ - Chat-driven workflow handlers                │  │
│ │ - Task workflows (event processors)           │  │
│ │ - Travel workflows (event processors)         │  │
│ └────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────┐  │
│ │ Tool Clients (MCP Wrappers)                    │  │
│ │ - FlightToolClient (flights-MCP)               │  │
│ │ - CalendarToolClient (google-calendar-mcp)     │  │
│ └────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────┐  │
│ │ LLM Reasoning                                  │  │
│ │ - Llama 3.3 (Workers AI)                       │  │
│ │ - Prompt templates & execution                 │  │
│ └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
          │
    ┌─────┴─────┬─────────────┐
    │           │             │
    ▼           ▼             ▼
┌────────┐ ┌────────────┐ ┌──────────┐
│ KV     │ │ Durable    │ │ DO Stubs │
│Store  │ │ Objects    │ │ (stubs)  │
│(cache)│ │ (state)    │ │          │
└────────┘ └────────────┘ └──────────┘
              │
    ┌─────────┼──────────┐
    ▼         ▼          ▼
┌─────────┐┌──────────┐┌──────────┐
│Travel   ││Calendar  ││Task      │
│Workflow ││Event     ││Management│
│DO       ││Store DO  ││DO        │
└─────────┘└──────────┘└──────────┘
    │
    └─────┬──────┬────────┐
          │      │        │
          ▼      ▼        ▼
      ┌────────────────────────────┐
      │ External APIs / Tools      │
      │ - flights-MCP (Duffel)     │
      │ - Google Calendar API      │
      │ - (future: Gmail, Maps)    │
      └────────────────────────────┘
```

### State Management (Durable Objects)

**TravelWorkflowDO:** Manages flight searches, ranking, user selections

- State machine: DETECTED → FLIGHT_SEARCH → RANKING → SUGGESTIONS → USER_ACTED
- Stores: travel events, flight search requests, results, user preferences

**CalendarEventStoreDO:** Persists synced events and tracks processing

- State: events by date range, last sync time, processed hooks per event
- Used for deduplication and correlation with tasks/travel events

**TaskManagementDO:** Owns task lifecycle

- State: extracted tasks, status (todo/in-progress/completed), deadlines
- Triggers: task extraction hooks, daily planner hooks

### Event Flow & Hooks

```
Chat message received via /api/chat
    ↓
emit: chat_message_received
    ↓
┌────────────────────────────────────────────┐
│ Intent detector analyzes chat + history    │
└────────────────────────────────────────────┘
    │
    ├─→ If travel intent: emit travel_event_detected
    │        ↓
    │   Travel workflow handler
    │        ↓
    │   FlightToolClient.searchFlights()
    │        ↓
    │   LLM ranking prompt
    │        ↓
    │   store results + emit: suggestions_published
    │        ↓
    │   Results streamed back over /api/chat (SSE)
    │
    └─→ If task/daily planning intent: emit event_detected
             ↓
        Task workflow handler
             ↓
        LLM task extraction or daily planning
             ↓
        TaskManagementDO.storeTasks()
             ↓
        emit: tasks_extracted or daily_plan_generated
             ↓
        Updates streamed back over /api/chat (SSE)
```

---

## Tech Stack

### Backend

- **API Runtime:** Python (FastAPI) – core REST + chat API implementation
- **Edge & Platform:** Cloudflare Workers – edge routing, Realtime, and integration glue
- **State & Persistence:** Cloudflare Durable Objects – strongly consistent per-user/domain state
- **Caching:** Cloudflare KV – global, low-latency key-value store
- **Real-time:** Cloudflare Realtime – WebSocket-based push notifications / streaming
- **LLM:** Llama 3.3 70B (via Cloudflare Workers AI)

### Tool Integrations

- **flights-MCP** – Search real flights via Duffel API (open-source MCP)
- **google-calendar-mcp** – Read/write Google Calendar events (nspady open-source MCP, 768⭐)
- **Future:** Gmail MCP, Maps/Geocoding, Timezone utilities

### Frontend

- **Framework:** TanStack Start (React-based full-stack framework)
- **UI Components:** assistant-ui (https://github.com/assistant-ui/assistant-ui) – Production-ready React components for AI chat interfaces with streaming, markdown, and tool call support
- **State Management:** TanStack Query + Zustand
- **Type Safety:** TypeScript
- **Real-time:** Cloudflare Realtime client

### Development & DevOps

- **Languages:**
  - TypeScript (TanStack Start frontend + client integrations)
  - Python (FastAPI backend services)
- **Package Managers:**
  - npm/yarn (frontend)
  - pip/uv/Poetry (backend – choice of Python environment manager)
- **Build:**
  - esbuild / Vite (frontend)
  - Standard Python build & packaging for FastAPI app
- **Testing:**
  - Jest / Vitest for frontend
  - pytest for backend
- **Deployment:**
  - Wrangler CLI for Cloudflare Workers (edge, Realtime, Workers AI, Durable Objects)
  - Standard container or service deployment for FastAPI backend (Cloudflare in front as proxy/edge cache)

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** or **yarn**
- **Cloudflare Account** (free tier OK for MVP)
- **Google Cloud Project** with Calendar API enabled + OAuth credentials
- **Duffel API key** (free tier available, sign up at https://duffel.com)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Sawyer0/cf_ai_Micro_CoS.git
   cd cf_ai_Micro_CoS
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create `.env.local`:

   ```
   DUFFEL_API_KEY=<your_duffel_key>
   GOOGLE_OAUTH_CREDENTIALS=<path_to_gcp-oauth.keys.json>
   CLOUDFLARE_ACCOUNT_ID=<your_account_id>
   CLOUDFLARE_API_TOKEN=<your_api_token>
   ```

4. **Set up Google Cloud:**

   - Create project at https://console.cloud.google.com
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials (Desktop app type)
   - Download `gcp-oauth.keys.json` and place in project root
   - Add your email as test user

5. **Deploy to Cloudflare:**

   ```bash
   npm run deploy
   ```

6. **Start local development:**
   ```bash
   npm run dev
   ```

---

## Project Structure

```
cf_ai_Micro_CoS/
├── .agent/                          # Agent documentation & configuration
│   ├── architecture/
│   │   ├── backend/
│   │   │   ├── api-specification.md # Complete REST API specification
│   │   │   ├── api-quickref.md    # API quick reference guide
│   │   │   ├── agentic-design.md   # Pattern: event-driven mini-monolith
│   │   │   ├── flights-mcp-integration.md
│   │   │   ├── flights-mcp-response-schema.md
│   │   │   ├── google-calendar-mcp-integration.md
│   │   │   ├── google-calendar-mcp-response-schema.md
│   │   │   ├── workers.md          # Worker architecture overview
│   │   │   ├── llama3.3.md         # LLM setup & usage
│   │   │   └── observability.md    # Correlation IDs, logging
│   │   ├── frontend/
│   │   │   ├── assistant-ui-integration.md  # assistant-ui setup guide
│   │   │   ├── assistant-ui-quickstart.md   # Quick reference
│   │   │   └── frontend-arch-overview.md    # Frontend architecture
│   │   └── README.md
│   ├── prompts/
│   │   ├── README.md               # Prompt execution pattern
│   │   ├── flight-ranking.md       # Rank flight options
│   │   ├── task-extraction.md      # Extract tasks from events/emails
│   │   ├── daily-planner.md        # Generate time-blocked schedule
│   │   └── summarization.md        # Summarize meetings & discussions
│   ├── tools/
│   │   ├── README.md               # Tool invocation pattern
│   │   ├── flights-mcp/
│   │   │   └── search-flights.md   # Request/response specs, examples
│   │   └── google-calendar-mcp/
│   │       ├── search-events.md
│   │       ├── create-event.md
│   │       └── get-freebusy.md
│   └── README.md
├── src/
│   ├── workers/
│   │   ├── api.ts                  # Main HTTP entry point
│   │   ├── calendar-sync.ts        # Scheduled calendar sync (30 min)
│   │   ├── task-extraction.ts      # Hook subscriber for task extraction
│   │   ├── travel-orchestrator.ts  # Travel workflow orchestration
│   │   └── middleware/
│   │       ├── auth.ts             # OAuth token validation
│   │       └── logging.ts          # Correlation ID logging
│   ├── durable-objects/
│   │   ├── TravelWorkflowDO.ts     # Flight search state machine
│   │   ├── CalendarEventStoreDO.ts # Event persistence & dedup
│   │   ├── TaskManagementDO.ts     # Task lifecycle
│   │   └── UserProfileDO.ts        # User preferences, travel history
│   ├── tool-clients/
│   │   ├── FlightToolClient.ts     # flights-MCP HTTP client wrapper
│   │   ├── CalendarToolClient.ts   # google-calendar-mcp wrapper
│   │   └── base-tool-client.ts     # Shared: logging, retries, caching
│   ├── llm/
│   │   ├── PromptExecutor.ts       # Llama 3.3 prompt executor
│   │   ├── prompts/
│   │   │   ├── flight-ranking.ts
│   │   │   ├── task-extraction.ts
│   │   │   ├── daily-planner.ts
│   │   │   └── summarization.ts
│   │   └── ResponseValidator.ts    # JSON parsing & fallbacks
│   ├── models/
│   │   ├── CalendarEvent.ts        # Normalized calendar event
│   │   ├── FlightOption.ts         # Normalized flight data
│   │   ├── Task.ts                 # Task model
│   │   ├── TravelEvent.ts          # Detected travel event
│   │   └── types.ts                # Shared interfaces
│   ├── utils/
│   │   ├── correlation-id.ts       # UUID generation & middleware
│   │   ├── logger.ts               # Structured logging
│   │   ├── error-handling.ts       # Custom error classes
│   │   ├── retry.ts                # Exponential backoff
│   │   └── cache.ts                # KV abstraction
│   └── index.ts                    # Worker entry point
├── tests/
│   ├── unit/
│   │   ├── tool-clients.test.ts
│   │   ├── llm-prompts.test.ts
│   │   └── models.test.ts
│   ├── integration/
│   │   ├── travel-workflow.test.ts
│   │   ├── calendar-sync.test.ts
│   │   └── e2e.test.ts
│   └── fixtures/
│       ├── sample-calendar-events.json
│       ├── sample-flights.json
│       └── sample-llm-outputs.json
├── wrangler.toml               # Cloudflare Workers config
├── tsconfig.json
├── package.json
└── README.md (this file)
```

---

## Core Concepts

### 1. Event-Driven Mini-Monolith

Instead of many microservices, **Durable Objects + Workers = single source of truth per domain**:

- **CalendarEventStoreDO** owns all calendar state (events, last sync, hooks)
- **TravelWorkflowDO** owns all travel state (detected events, flight searches, selections)
- **TaskManagementDO** owns all task state (extracted tasks, status, deadlines)

Workers are **stateless orchestrators** that call DOs, tool clients, and LLM, then write results back to DOs.

**Benefit:** Strong consistency, no eventual-consistency bugs, clear ownership.

### 2. Hook-Based Reactivity

Rather than polling or hard-coded if/then logic, **hooks emit events** at key points inside chat-triggered workflows:

```typescript
// When a chat message is received at /api/chat:
await chatWorkflow.emit({
  type: "chat_message_received",
  message,
  correlationId: uuid(),
});

// Subscriber (e.g., task or travel workflow handler) receives hook:
env.TravelEventDetector.stub().detectAndEmitFromChat(message);

// Which triggers LLM reasoning:
const tasks = await llm.extractTasksFromMessage(message);
await taskMgmt.storeTasks(tasks);
```

**Benefit:** Loose coupling, no circular dependencies, easy to add new workflows while keeping the user-facing trigger as chat.

### 3. Agentic Reasoning Loop

Each workflow follows: **Detect → Tool Call → LLM → Store → Notify**, but is initiated from chat:

```
User asks in chat: "Plan my Paris trip May 15–20 based on my calendar."
    ↓
[Detect] Chat workflow identifies travel intent and relevant context
    ↓
[Tool] FlightToolClient.searchFlights(origin, dest, dates)
    ↓
[LLM] Llama 3.3 ranks flights with flight-ranking prompt
    ↓
[Store] TravelWorkflowDO.publishSuggestions(rankedFlights)
    ↓
[Notify] Results streamed back via /api/chat and rendered in the chat UI
    ↓
User sees ranked options and can continue the conversation
```

**Benefit:** Reduces hallucination (grounded in tool outputs), makes each step observable/debuggable.

### 4. Correlation IDs for Observability

Every request/operation gets a **unique correlation ID**:

```typescript
const correlationId = generateUUID();

// Logged at every step:
logger.info("flight_search_requested", {
  correlationId,
  origin: "SFO",
  destination: "CDG",
  timestamp: now(),
});

logger.info("flight_search_completed", {
  correlationId,
  resultCount: 10,
  latency: 450,
});

// Later, query all logs with same correlationId to see full trace
```

**Benefit:** Trace entire workflow end-to-end, debug failures, measure performance.

---

## Integration Patterns

### Tool Invocation Pattern

Every external tool follows this flow:

```typescript
// 1. Tool Client (stateless Worker) wraps the MCP
class FlightToolClient {
  async searchFlights(request, options) {
    const toolInvocationId = uuid();

    // 2. Call external tool
    const response = await callDuffelAPI(request);

    // 3. Normalize to internal model
    const normalized = this.normalize(response);

    // 4. Log with correlation ID
    logger.info("tool_invocation_success", {
      correlationId: options.correlationId,
      toolInvocationId,
      tool: "flights-mcp",
      resultCount: normalized.length,
    });

    return normalized;
  }
}

// 2. Caller (Durable Object or Worker) invokes tool
const flightOptions = await flightToolClient.searchFlights(
  { origin: "SFO", destination: "CDG", departure_date: "2025-05-10" },
  { correlationId }
);

// 3. Store result in DO
await travelWorkflow.storeFlightResults(flightOptions);

// 4. Emit hook for downstream
await travelWorkflow.emit("flight_search_completed", { flightOptions });
```

### Prompt Execution Pattern

LLM prompts are **modular templates** with structured inputs/outputs:

```typescript
// In .agent/prompts/flight-ranking.md:
// Purpose, inputs, expected output format, error handling, examples

// In code:
class FlightRankingPrompt {
  template = `
    You are a travel advisor...
    User: {user_preferences}
    Flights: {flights_json}
    Calendar: {calendar_context}
    
    Rank these flights 1-3...
    Return JSON: { "ranked_flights": [...] }
  `;

  async execute(inputs) {
    const prompt = this.template
      .replace("{user_preferences}", JSON.stringify(inputs.preferences))
      .replace("{flights_json}", JSON.stringify(inputs.flights))
      .replace("{calendar_context}", inputs.calendarContext);

    const response = await llm.generate(prompt);

    // Validate JSON output
    const parsed = JSON.parse(response);
    if (!this.isValidRanking(parsed)) {
      // Fallback: sort by price
      return inputs.flights.sort((a, b) => a.price - b.price);
    }

    return parsed.ranked_flights;
  }
}
```

### Response Normalization Pattern

Tool responses are **normalized to internal models** immediately:

```typescript
// flights-MCP response → internal FlightOption
function normalizeFlightOffer(offer) {
  return {
    id: offer.id,
    airline: offer.owner.iata_code,
    departure: {
      datetime: offer.slices[0].segments[0].departing_at,
      airport: offer.slices[0].origin.iata_code,
    },
    arrival: {
      datetime: offer.slices[0].segments[-1].arriving_at,
      airport: offer.slices[0].destination.iata_code,
    },
    stops: offer.slices[0].segments.length - 1,
    price: parseFloat(offer.total_amount),
    currency: offer.total_currency,
    // ... other fields
  };
}

// google-calendar-mcp response → internal CalendarEvent
function normalizeGoogleCalendarEvent(googleEvent) {
  return {
    id: googleEvent.id,
    title: googleEvent.summary,
    description: googleEvent.description,
    start: new Date(googleEvent.start.dateTime || googleEvent.start.date),
    end: new Date(googleEvent.end.dateTime || googleEvent.end.date),
    location: googleEvent.location,
    attendees: googleEvent.attendees?.map((a) => ({
      email: a.email,
      status: a.responseStatus,
    })),
    // ...
  };
}
```

---

## Development

### Local Development

```bash
# Start local Wrangler server (emulates Workers + Durable Objects)
npm run dev

# Server runs on http://localhost:8787
```

### Testing

```bash
# Unit tests
npm run test:unit

# Integration tests (requires local Wrangler)
npm run test:integration

# Full e2e (mocked external APIs)
npm run test:e2e

# Watch mode
npm run test:watch
```

### Linting & Formatting

```bash
# Lint
npm run lint

# Format (Prettier)
npm run format
```

### Deployment

```bash
# Deploy to Cloudflare (requires account + API token)
npm run deploy

# Deploy with custom environment
npm run deploy -- --env production

# Monitor logs
wrangler tail
```

### Debugging

1. **Local breakpoints:**

   ```bash
   npm run dev:debug
   # Open chrome://inspect
   ```

2. **Realtime logs:**

   ```bash
   wrangler tail --service api --format pretty
   ```

3. **Correlation ID lookup:**
   ```typescript
   // Query all logs with specific correlationId
   const logs = await logging.query({ correlationId: "abc-123" });
   logs.forEach((log) => console.log(log));
   ```

---

## Contributing

### Code Style

- **TypeScript strict mode** enabled
- **SOLID principles:** Single responsibility, open/closed, dependency injection
- **Error handling:** Custom error classes, structured error logging
- **Testing:** ≥80% coverage for critical paths

### Branching Strategy

- `main` – Production-ready code
- `develop` – Integration branch
- `feature/*` – Feature branches
- `fix/*` – Bug fix branches

### Commit Convention

```
feat: add task extraction from emails
fix: correct timezone handling in daily planner
docs: update README with architecture diagram
refactor: extract FlightToolClient to base class
test: add test cases for freebusy merging logic
```

### Pull Request Process

1. Create feature branch: `git checkout -b feature/cool-feature`
2. Make changes & commit with conventional messages
3. Write tests (≥80% coverage for new code)
4. Submit PR with description of changes
5. Address code review feedback
6. Merge to `develop`

### Documentation

- Architecture decisions → `.agent/architecture/`
- Prompt templates → `.agent/prompts/{name}.md` with purpose, inputs, outputs, examples
- Tool specifications → `.agent/tools/{mcp}/{tool}.md` with request/response, use cases, error handling
- Code comments for complex logic, not obvious code

---

## Roadmap

### Phase 1: Core (Current)

- [x] Calendar sync & event parsing
- [x] Travel event detection
- [x] Flight search & ranking
- [x] Task extraction
- [x] Daily planner
- [x] Observability framework

### Phase 2: Expansion (Q2 2025)

- [ ] Email (Gmail MCP) integration
- [ ] Meeting summarization with decision tracking
- [ ] Slack context integration
- [ ] Hotel/accommodation booking alongside flights
- [ ] Multi-user support (team calendars, shared tasks)

### Phase 3: Intelligence (Q3 2025)

- [ ] Learn user preferences from past decisions
- [ ] Predict optimal meeting times
- [ ] Suggest task decomposition with subtasks
- [ ] Context-aware reminders based on location/time

### Phase 4: Extensibility (Q4 2025)

- [ ] Plugin system for custom tools
- [ ] Workflow builder UI
- [ ] Integration marketplace
- [ ] Open-source community contributions

---

## License

MIT License – See LICENSE file for details.

---

## Support & Questions

- **Issues:** GitHub Issues (bug reports, feature requests)
- **Discussions:** GitHub Discussions (questions, ideas)
- **Documentation:** See `.agent/` directory for architecture & tool specs
- **Contact:** Open an issue with `[question]` prefix

---

## Acknowledgments

- **Cloudflare** – Workers, Durable Objects, Realtime, Workers AI
- **Duffel** – flights-MCP / flight search API
- **nspady** – google-calendar-mcp (open-source implementation)
- **Llama 3.3** – Reasoning backbone
- Inspired by Claude Code Infrastructure patterns: event-driven hooks, modular skills, correlation-based observability

---

**Built with ❤️ for busy professionals. Transforming calendar + email into intelligent action.**
