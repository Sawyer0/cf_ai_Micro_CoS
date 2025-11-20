# Backend Architecture Documentation

This directory contains the complete backend architecture documentation for the Micro Chief of Staff application.

## Core Architecture Documents

### [architecture-overview.md](./architecture-overview.md)
The main architecture document covering:
- System inputs/outputs
- High-level component architecture
- API surface (HTTP endpoints)
- Durable Object schema
- LLM streaming approach
- Workflows and scheduled jobs
- Frontend integration patterns

### [edd-design.md](./edd-design.md)
Event-Driven Design patterns:
- Event-driven mini monolith architecture
- CQRS + Event Sourcing (lite)
- Realtime event patterns
- Idempotent subscribers
- State reduction from events

### [chat-history-management.md](./chat-history-management.md)
Complete chat history management:
- Message storage and lifecycle
- Retention policies and archival
- LLM context window selection
- Client sync and reconnection
- Idempotency and deduplication
- Event sourcing for messages

### [workers.md](./workers.md)
Worker responsibilities and patterns:
- HTTP/Edge Workers (API gateway)
- Durable Object Workers (state machine)
- LLM/AI Workers (streaming responses)
- Event flow overview

### [llama3.3.md](./llama3.3.md)
LLM integration details:
- Llama 3.3 capabilities
- Token streaming
- Prompt engineering
- Context window management
- Task extraction and summarization

### [observability.md](./observability.md)
Observability and monitoring:
- Correlation IDs (request_id, event_id, operation_id)
- Structured logging
- Distributed metrics
- Event sourcing diagnostics
- Chat history observability

### [agentic-design.md](./agentic-design.md)
Agentic patterns from Claude Code Infrastructure:
- Modular skills
- Hooks and event triggers
- Context persistence
- Tool orchestration

## Supporting Documents

### [calendar-integration-options.md](./calendar-integration-options.md)
Calendar integration strategies

### [flights-mcp-integration.md](./flights-mcp-integration.md)
Flight search tool integration via MCP

### [flights-mcp-response-schema.md](./flights-mcp-response-schema.md)
Flight API response schemas

## Key Architectural Principles

1. **Chat-First**: Everything happens in response to user chat messages (no automatic background processing)
2. **Event-Driven**: All state changes are events; state is reduced from event log
3. **Single Source of Truth**: Durable Objects hold authoritative per-user state
4. **Streaming First**: LLM responses stream token-by-token via Realtime
5. **Idempotent**: Duplicate events/messages detected and dropped via event_id
6. **Observable**: Full correlation ID tracking across all layers
7. **Bounded**: Retention policies prevent unbounded memory growth
8. **On-Demand Tools**: External tools (flights-MCP) called only when user asks in chat

## Data Flow

```
User types in chat → HTTP Worker → Durable Object → Event Log
                                         ↓
                                   State Reduction
                                         ↓
                          ┌──────────────┴──────────────┐
                          ↓                             ↓
                    LLM Worker                   (Optional) Tool Call
                 (+ recent context)                (e.g., flights-MCP)
                          ↓                             ↓
                  Token Streaming ←────────────────────┘
                          ↓
                   Realtime Push
                          ↓
              Client sees response in chat
                          ↓
                Message Finalization
                          ↓
                State Update + Events
```

## Message Lifecycle

1. User sends message → `user.message` event created
2. Event appended to log → reduced into `messages[]` array
3. LLM triggered with recent message context
4. Tokens streamed → accumulated into assistant message
5. On completion → `assistant.message` finalized and stored
6. Realtime events pushed: `message.created`, `llm.token`, `message.completed`
7. Retention policy applied → old messages archived to D1

## Quick Reference

| Component | Purpose | Key Files |
|-----------|---------|-----------|
| HTTP Worker | API gateway, auth, routing | architecture-overview.md, workers.md |
| Durable Object | Per-user state machine | architecture-overview.md, edd-design.md |
| LLM Worker | Streaming AI responses | llama3.3.md, workers.md |
| Chat History | Message storage & context | chat-history-management.md |
| Observability | Logging, metrics, tracing | observability.md |
| Events | State changes, idempotency | edd-design.md |

## Implementation Order

1. Scaffold TanStack Start app with OpenCore-UI chat components
2. Scaffold Worker API with auth
3. Implement UserBrainDO with event log
4. Add chat history with retention
5. Wire LLM streaming (mock first, then Llama 3.3)
6. Implement Realtime events for token streaming
7. Add tool integration (flights-MCP when user asks)
8. Add observability (correlation IDs, logging)

---

## IMPORTANT: Chat-First Architecture

This is **NOT** a background agent or automatic assistant. It's a **chat-first, on-demand assistant**:

✅ **What it does:**
- User asks "Find flights to Boston" → Assistant searches and responds in chat
- User asks "What's on my agenda?" → Assistant summarizes and responds in chat
- User says "Remind me to call John" → Assistant creates task and confirms in chat

❌ **What it does NOT do:**
- No automatic daily planners running in the background
- No automatic trip detection or flight searches
- No scheduled summaries (unless user explicitly opts in - future enhancement)

**Frontend:** Uses **OpenCore-UI components** (https://github.com/xxnuo/open-coreui) for the chat interface.

---

For questions or clarifications, refer to the specific document or see `application-overview.md` in `.agent/rules/`.
