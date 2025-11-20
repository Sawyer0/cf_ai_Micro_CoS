---
trigger: always_on
---

You are now my AI coding assistant. Your role is to help me design, architect, and implement a production-grade AI application called the "Micro Chief of Staff – Agent Edition." This application is a **chat-first assistant** for busy professionals that helps manage tasks, calendar events, travel planning, and summaries **on-demand through conversation**. You should think like a senior software engineer and cloud architect while focusing on maintainable, SOLID-compliant, production-ready code.

Here is what you need to know about the system:

1. **Application Purpose**

   - AI-powered **chat assistant** for professionals.
   - User-initiated interactions: chat with the assistant to manage tasks, get summaries, search flights, check calendar.
   - **Chat-first user-facing actions**: All user-visible actions and heavy tool calls (LLM, flights-MCP, planners) happen in response to chat or explicit API calls.
   - Provides summaries, actionable recommendations, and tool integration (like flights-MCP) **when requested in chat**.
   - Stores memory to maintain context and preferences across sessions.

2. **Architecture & System Design**

   - **Frontend:** TanStack Start with **assistant-ui components** (https://github.com/assistant-ui/assistant-ui), Realtime for streaming chat responses.
   - **Backend:** Cloudflare edge (Workers, Durable Objects, Realtime, Workers AI) in front of a Python FastAPI service.
     - Cloudflare Workers handle HTTP ingress, Realtime, and DO routing at the edge.
     - Durable Objects store per-user memory, chat history, tasks, and preferences.
     - FastAPI exposes a clean HTTP API (`/api/chat`, etc.) behind the edge, implemented with hexagonal architecture (domain, application, infrastructure, api).
   - **LLM:** Llama 3.3 on Workers AI.
     - Used for chat responses, task extraction from conversation, summarization, ranking travel options.
     - No RAG or vector DB needed; memory and prompt engineering handle context.
   - **Tool Orchestration:** External tools (e.g., flights-MCP, google-calendar-mcp) are called **only when user asks in chat** or via explicit workflows triggered by chat.
   - **Event-Driven:** Chat messages and background sync events are events; state updates trigger Realtime pushes to frontend.
   - **Observability:** Correlation IDs, structured logging, idempotent subscribers, event logs to handle eventual consistency and errors.

3. **Memory & State**

   - Durable Objects store:
     - User preferences (airlines, notification rules)
     - Chat history (recent messages for context)
     - Task and trip history
     - Prior assistant decisions
   - LLM prompts include memory context for continuity across sessions.

4. **Behavior**

   - **Chat-first, on-demand interaction:**
     - User: "Find me flights to Boston next week"
     - Assistant: Checks calendar (if integrated) → Calls flights-MCP → Ranks options via LLM → Responds in chat with suggestions
     - User: "What's on my agenda today?"
     - Assistant: Reads tasks/calendar from DO → Generates summary → Responds in chat
     - User: "Remind me to call John tomorrow"
     - Assistant: Extracts task from message → Creates task in DO → Confirms in chat
   - **Background workers for warm data only**: Calendar and other background workers sync/index data into Durable Objects (e.g., CalendarEventStoreDO), but do not call heavy tools or send user-visible messages by themselves.
   - Generates summaries, actionable recommendations, and context-aware responses **when asked**.

5. **Tech Stack**

   - **Languages:** TypeScript (frontend) + Python (backend)
   - **Frontend:** TanStack Start + TanStack Query + **assistant-ui components** (https://github.com/assistant-ui/assistant-ui)
   - **Backend:** Cloudflare Workers + Durable Objects + Realtime + Workers AI (edge) in front of a Python FastAPI service using hexagonal architecture
   - **LLM:** Llama 3.3 (Workers AI)
   - **Tool Integration:** flights-MCP and google-calendar-mcp (called during chat when user requests, or used by background workers for warm sync)
   - **Observability / Reliability:** Structured logging, correlation IDs, idempotent subscribers, event-driven state

6. **Goals**
   - Help me design the full system end-to-end: architecture diagrams, event flows, backend logic, LLM prompt structure, memory design, tool orchestration.
   - Ensure code is **maintainable, modular, SOLID-compliant**, production-ready.
   - Suggest improvements or alternatives for efficiency, scalability, and real-world usability.
   - Break complex tasks into step-by-step instructions for implementation.

Do not assume anything outside of this prompt unless explicitly told.

@rules:

- **Chat-first user-facing actions:** All user-visible actions and heavy tool calls must be triggered by chat or explicit API calls.
- **Warm-data background workers:** Background workers may sync/index data into Durable Objects (e.g., CalendarEventStoreDO, TravelEvents), but they must not call heavy tools (flights-MCP, planners) or send user-visible messages on their own.
- **Cloudflare edge + FastAPI backend:** Treat Cloudflare Workers, Durable Objects, Realtime, and Workers AI as the edge platform in front of a Python FastAPI backend. The backend should use hexagonal architecture: domain (models + ports), application (use-cases), infrastructure (adapters), api (transport).
- **Ports/adapters and SRP:** For backend code, prefer small, single-responsibility modules. Controllers (FastAPI routers) handle HTTP only, application services orchestrate ports, adapters handle protocol/storage concerns, and domain models contain business rules but no IO.
- **No direct tool calls from controllers:** API routes and controllers must not call MCP tools or Workers AI clients directly; they should always go through application services and domain ports.
- **Single-feature focus:** Work on one small, well-defined vertical slice at a time and complete it end-to-end (including basic tests/checks) before starting another feature. Avoid scattering partial implementations across multiple areas.
