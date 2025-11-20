# Tool Calls & External Integrations

This directory documents all external tools and MCP integrations, their APIs, request/response schemas, and usage patterns.

## Directory Structure

```
tools/
├── README.md (this file)
├── flights-mcp/
│   ├── search-flights.md
│   └── examples.md
├── google-calendar-mcp/
│   ├── list-events.md
│   ├── create-event.md
│   └── examples.md
├── workers-ai/
│   ├── llama-3.3-stream.md
│   └── examples.md
└── internal-services/
    ├── durable-object-api.md
    └── realtime-pubsub.md
```

## Tool Categories

### 1. **External MCPs**

Tools that run as Model Context Protocol servers:

#### Flights MCP
- **Tool:** `flights-mcp` from Duffel API
- **Operations:** Search flights (one-way, round-trip, multi-city)
- **See:** `flights-mcp/search-flights.md`

#### Google Calendar MCP
- **Tool:** `google-calendar-mcp` (nspady)
- **Operations:** List events, search, create, update, delete, free/busy
- **See:** `google-calendar-mcp/list-events.md`

### 2. **Cloudflare Workers AI**

Built-in LLM and foundation models:

#### Llama 3.3
- **Tool:** `@cf/meta/llama-3.3-70b-instruct`
- **Operations:** Text generation, streaming
- **See:** `workers-ai/llama-3.3-stream.md`

### 3. **Internal Services**

APIs within Micro CoS system:

#### Durable Objects RPC
- **Tool:** UserBrainDO, TravelWorkflowDO, TravelProfileDO
- **Operations:** Event handling, state queries, persistence
- **See:** `internal-services/durable-object-api.md`

#### Realtime Pub/Sub
- **Tool:** Cloudflare Realtime
- **Operations:** Publish events, subscribe to channels
- **See:** Internal docs (not exposed in `.agent/`)

---

## Tool Call Pattern

All tool calls follow this pattern:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. HTTP/Worker initiates tool call                          │
│    - Create event envelope (request_id, event_id)           │
│    - Attach user context (user_id, preferences)             │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Tool Client (wrapper) invokes external tool              │
│    - Normalize request to tool's expected format            │
│    - Add timeout, retry logic                               │
│    - Track operation_id and tool_invocation_id              │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. External tool responds                                   │
│    - Parse response into internal data model                │
│    - Validate required fields                               │
│    - Handle errors and edge cases                           │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. DO updates state and emits hook                          │
│    - Store results in persistent state                      │
│    - Create event for downstream subscribers                │
│    - Log with correlation_id for traceability               │
└─────────────────────────────────────────────────────────────┘
```

---

## Request/Response Envelope

All tool calls are logged with this envelope:

```json
{
  "request_id": "req_018ef9e2-...",
  "event_id": "evt_018ef9e2-...",
  "operation_id": "op_018ef9e2-...",
  "tool_invocation_id": "tool_018ef9e2-...",
  "user_id": "user_123",
  "tool_name": "flights-mcp",
  "tool_operation": "search_flights",
  "timestamp": "2025-01-20T14:30:00Z",
  "request": {
    "origin": "SFO",
    "destination": "CDG",
    "departure_date": "2025-05-10"
  },
  "response": {
    "status": "success",
    "latency_ms": 450,
    "result_count": 12,
    "data": [...]
  },
  "error": null
}
```

---

## Error Handling by Tool

### Flights MCP

| Error | HTTP Code | Handling |
| --- | --- | --- |
| Invalid airport code | 422 | Return empty results + user hint |
| Rate limited | 429 | Retry with exponential backoff |
| Timeout | 504 | Fallback to cached results if available |
| No flights found | 200 + empty | Return empty array, allow user to refine |

### Google Calendar MCP

| Error | Handling |
| --- | --- |
| OAuth token expired | Auto-refresh using refresh_token |
| Event not found | Return null, don't throw |
| Permission denied | Log warning, skip event |
| Network timeout | Retry 3x with exponential backoff |

### Llama 3.3

| Error | Handling |
| --- | --- |
| Token limit exceeded | Trim context, retry with smaller prompt |
| Timeout | Return cached response if available |
| Invalid JSON output | Attempt parse recovery, fallback to string |
| Rate limited | Queue and retry after delay |

---

## Tool Invocation Metrics

Track for each tool call:

```json
{
  "tool_name": "flights-mcp",
  "operation": "search_flights",
  "latency_ms": 450,
  "status": "success",
  "result_count": 12,
  "retry_count": 0,
  "cached": false,
  "timestamp": "2025-01-20T14:30:00Z"
}
```

Used for:
- Performance dashboard (latency per tool)
- Availability tracking (success rate)
- Cost analysis (calls per day)
- SLA monitoring (p50, p95, p99 latency)

---

## Security & Rate Limiting

### Rate Limits

| Tool | Limit | Window | Action on Exceed |
| --- | --- | --- | --- |
| Flights MCP | 10 calls | Per minute | Queue, retry |
| Calendar MCP | 100 calls | Per minute | Queue, retry |
| Llama 3.3 | 20 concurrent | Per account | Queue, fail if > 30s wait |

### Secrets Management

- OAuth credentials (Google Cloud, Duffel) stored in Cloudflare Secrets
- API keys never logged
- Tool requests/responses sanitized before logging (remove sensitive data)

---

## Caching Strategy

### Flights Search
- Cache results for 30 minutes (flights change hourly)
- Key: `flights:{origin}:{dest}:{date}:{cabin}`
- Invalidate on explicit user refresh

### Calendar Events
- Cache for 5 minutes (events relatively static)
- Key: `calendar:{calendar_id}:{date_range}`
- Invalidate on event creation/update

### LLM Responses
- Cache for 1 hour (cost optimization)
- Key: `llm:{prompt_hash}:{context_hash}`
- Bypass cache if user explicitly requests new ranking

---

## Future Tool Integrations

Planned MCPs following same pattern:

- [ ] Hotel MCP (hotel-search, price comparison)
- [ ] Car Rental MCP (vehicle search, rates)
- [ ] Weather MCP (weather forecast for trip destination)
- [ ] Currency Exchange MCP (real-time FX rates)
- [ ] Flight Status MCP (real-time delays, cancellations)

---

## Monitoring & Observability

Dashboard should track:

1. **Per-tool health:**
   - Success rate (%)
   - Average latency (ms)
   - Error count + types
   - Availability (uptime)

2. **Cost by tool:**
   - API calls per day
   - Estimated cost (if applicable)
   - Cost per operation

3. **User-level insights:**
   - Tools invoked per user session
   - Most common tool combinations
   - Tool failure impact on user experience

---

## Implementation Checklist

- [ ] Create tool client wrapper for each MCP
- [ ] Implement retry logic with exponential backoff
- [ ] Add request/response logging with correlation IDs
- [ ] Set up error handling per tool type
- [ ] Implement caching layer (KV or memory)
- [ ] Add monitoring/observability metrics
- [ ] Set up rate limiting
- [ ] Test failure scenarios (timeout, rate limit, network error)
- [ ] Document tool-specific configurations
- [ ] Create tool integration tests

---
