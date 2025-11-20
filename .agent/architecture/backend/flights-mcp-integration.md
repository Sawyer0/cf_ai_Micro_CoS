# Flights-MCP Integration Architecture

## Overview

The flights-MCP integration transforms the Micro Chief of Staff from a passive chat assistant into an **agentic travel planning system**. When the user **asks in chat** (for example, "Find me flights to Paris May 10–15 based on my calendar"), the backend invokes the flights-MCP tool to fetch real flight options, applies LLM reasoning to rank recommendations, and surfaces actionable suggestions in the chat UI.

## Integration Goals

1. **Real-world extensibility** – Demonstrate how external MCP tools integrate into an agentic workflow.
2. **Chat-triggered assistance** – From a chat turn, detect travel intent (optionally using calendar context) and search for flights on-demand.
3. **Intelligent ranking** – Use LLM to reason over user preferences + flight options and recommend top 3 flights.
4. **Persistent travel state** – Store flight search requests, results, and user selections in Durable Objects.
5. **Observable & idempotent** – Track tool invocations with correlation IDs; handle eventual consistency.

---

## Architecture

### High-Level Flow (Chat-Triggered, Recommended)

```
User: "Find me flights to Paris May 10–15 and check my calendar for conflicts."
    ↓
Chat handler (/api/chat) detects travel intent and (optionally) fetches calendar context
    ↓
Travel workflow handler or DO builds a TravelEvent (origin, destination, dates, preferences)
    ↓
Flights-MCP Tool Invocation
    - Worker calls flights-MCP via HTTP/RPC
    - Request: origin, destination, dates, preferences
    - Response: [flight1, flight2, ..., flightN]
    ↓
LLM Ranking & Reasoning
    - Pass user preferences + flight options (+ optional calendar context) to Llama 3.3
    - LLM ranks flights and returns top options + rationale
    ↓
Persistent Storage & State Management
    - Store in Durable Object:
      * flight_search_request (id, origin, dest, dates, status)
      * flight_search_results (tool_response, ranking, timestamp)
      * user_travel_event (metadata)
    - Mark request as completed/failed for idempotency
    ↓
Frontend Notification & Interaction
    - Results streamed back via /api/chat (SSE) and/or Realtime
    - Display trip card with top options
    - User can: select flight, dismiss, refine search
    - Selection triggers booking workflow / task creation
```

### Optional Flow (Calendar-Triggered Automation)

The same components can also be wired to a **calendar-triggered** travel detection flow (for power users who opt in), where `travel_event_detected` hooks originate from calendar sync rather than directly from chat. See the Google Calendar MCP docs for background-sync details.

---

## Component Architecture

### 1. **Travel Event Detector (Durable Object)**

**Responsibility:** Extract travel metadata from events. In the chat-first MVP, this DO is called from chat workflows (after reading calendar via MCP). In the optional background-sync version, it can also monitor calendar events for travel patterns.

**Interface:**

```typescript
interface TravelEvent {
  event_id: string;
  user_id: string;
  title: string;
  description?: string;
  start_date: ISO8601;
  end_date: ISO8601;
  origin_city?: string;
  destination_city: string;
  travel_date?: ISO8601;
  // Extracted by LLM or calendar parsing
  confidence: number; // 0–1 (how confident this is a "travel event")
}

interface TravelEventDetectorDO {
  detectTravelEvents(calendarEvents: CalendarEvent[]): TravelEvent[];
  storeTravelEvent(event: TravelEvent): Promise<void>;
  getTravelEventById(id: string): Promise<TravelEvent | null>;
}
```

**Logic:**

- From chat workflows: given a set of candidate events (read via Google Calendar MCP), classify which represent travel and build `TravelEvent` objects for downstream workflows.
- Optional background mode: listen for calendar event updates (via webhook or polling) and apply the same classification logic.
- Use LLM or pattern matching to identify "travel" keywords (trip, meeting in X city, flight, hotel, etc.).
- Extract origin (user's home/work city) and destination (event location).
- Assign confidence score; only trigger workflow if confidence > threshold (e.g., 0.7).

---

### 2. **Flights Tool Client (Worker Service)**

**Responsibility:** Marshal requests to flights-MCP, handle responses, normalize data.

**Interface:**

```typescript
interface FlightSearchRequest {
  origin: string; // IATA code, e.g., "SFO"
  destination: string; // IATA code, e.g., "CDG"
  departure_date: ISO8601;
  return_date?: ISO8601;
  passengers?: number;
  cabin_class?: "economy" | "business" | "first";
  // Optional constraints
  max_stops?: number;
  preferred_airlines?: string[];
  max_price?: number;
}

interface FlightOption {
  id: string;
  airline: string;
  flight_number: string;
  departure: {
    time: ISO8601;
    airport: string; // IATA
  };
  arrival: {
    time: ISO8601;
    airport: string;
  };
  duration_minutes: number;
  stops: number;
  cabin_class: string;
  price: {
    amount: number;
    currency: string;
  };
  booking_url?: string;
}

interface FlightToolClient {
  searchFlights(req: FlightSearchRequest): Promise<FlightOption[]>;
}
```

**Implementation:**

- Call flights-MCP endpoint (HTTP or RPC, depending on integration method).
- Handle timeouts, rate limits, and errors gracefully.
- Normalize response to internal `FlightOption` format.
- Log: request_id, timestamp, latency, result count.

---

### 3. **Travel Workflow Orchestrator (Worker + Durable Object)**

**Responsibility:** Coordinate the end-to-end travel suggestion workflow.

**State Machine:**

```
┌────────────────┐
│ DETECTED       │ (travel event identified, queued)
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ FLIGHT_SEARCH  │ (calling flights-MCP)
└────────┬───────┘
         │
    ┌────┴────┐
    ▼         ▼
  FOUND      ERROR
    │         │
    ▼         ▼
┌────────┐ ┌──────┐
│RANKING │ │FAILED│
└────┬───┘ └──────┘
     │
     ▼
┌──────────────┐
│SUGGESTIONS   │ (ranked options stored, pushed to frontend)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ USER_ACTED   │ (selected flight, dismissed, or refined search)
└──────────────┘
```

**Durable Object Methods:**

```typescript
interface TravelWorkflowDO {
  // Initiate workflow
  startWorkflow(travelEvent: TravelEvent): Promise<string>; // returns workflow_id

  // Step: search flights
  searchFlights(): Promise<void>;

  // Step: rank flights via LLM
  rankFlights(userPreferences: UserTravelPreferences): Promise<FlightOption[]>;

  // Step: store results and notify frontend
  publishSuggestions(rankedFlights: FlightOption[]): Promise<void>;

  // Step: handle user selection
  selectFlight(flightId: string): Promise<void>; // triggers booking workflow

  // Query workflow state
  getWorkflowState(): Promise<WorkflowState>;

  // Idempotency check
  isWorkflowCompleted(travelEventId: string): Promise<boolean>;
}
```

---

### 4. **LLM Ranking Engine (Worker)**

**Responsibility:** Use Llama 3.3 to intelligently rank flight options based on user preferences and calendar context.

**Prompt Template:**

```
You are a travel advisor assistant. A user has an upcoming trip and you must rank 3 flight options.

**User Context:**
- Name: {user_name}
- Home city: {home_city}
- Preferred airlines: {preferences.preferred_airlines}
- Cabin class preference: {preferences.cabin_class}
- Budget: ${preferences.max_price}
- Non-stop preferred: {preferences.non_stop_only}
- Max layover time: {preferences.max_layover_minutes} minutes

**Travel Event:**
- Destination: {destination}
- Departure date: {departure_date}
- Return date: {return_date}
- Reason: {event_title} (calendar context)
- Calendar events on arrival/departure dates: {calendar_summary}

**Flight Options:**
{flight_options_json}

**Task:**
Rank these flights from best to worst for this user. Consider:
1. Alignment with user preferences (airline, cabin, non-stop).
2. Arrival/departure timing relative to calendar events.
3. Price-to-convenience tradeoff.
4. Total travel time (including layovers).

**Output JSON:**
{
  "ranked_flights": [
    {
      "rank": 1,
      "flight_id": "...",
      "score": 0.95,
      "reasoning": "Arrives 9:00 AM (early for meeting), non-stop, preferred airline, within budget."
    },
    {
      "rank": 2,
      "flight_id": "...",
      "score": 0.80,
      "reasoning": "Slightly cheaper, 1-stop, arrives in time."
    },
    {
      "rank": 3,
      "flight_id": "...",
      "score": 0.60,
      "reasoning": "Budget option, 2 stops, 5-hour delay."
    }
  ]
}
```

**Implementation:**

- Call Llama 3.3 Workers AI with structured prompt.
- Parse LLM response (validate JSON).
- Return ranked `FlightOption[]` with scores and reasoning.

---

### 5. **Travel Preferences & History (Durable Object)**

**Responsibility:** Store user travel preferences, past bookings, and airline memberships.

**Data Model:**

```typescript
interface UserTravelProfile {
  user_id: string;

  // Preferences
  preferences: {
    home_city: string; // IATA code
    preferred_airlines: string[];
    cabin_class_default: "economy" | "business" | "first";
    max_price_per_flight?: number;
    non_stop_only: boolean;
    max_layover_minutes: number;
    notification_preferences: {
      notify_on_price_drops: boolean;
      notify_on_flight_found: boolean;
    };
  };

  // Loyalty programs
  loyalty: {
    airline: string;
    membership_number: string;
    status_level: "bronze" | "silver" | "gold" | "platinum";
  }[];

  // Past travel events & selections
  travel_history: {
    travel_event_id: string;
    destination: string;
    selected_flight_id: string;
    booking_confirmation?: string;
    completed_date: ISO8601;
  }[];
}

interface TravelProfileDO {
  getProfile(): Promise<UserTravelProfile>;
  updatePreferences(
    prefs: Partial<UserTravelProfile["preferences"]>
  ): Promise<void>;
  recordTravelSelection(selection: TravelSelection): Promise<void>;
}
```

---

### 6. **Observability & Correlation (Logs & Events)**

**Responsibility:** Track tool invocations, measure latency, detect failures.

**Logged Events:**

```typescript
interface ToolInvocationEvent {
  correlation_id: string; // UUID, propagated across all steps
  event_type:
    | "travel_event_detected"
    | "flight_search_requested"
    | "flight_search_completed"
    | "flight_ranking_started"
    | "flight_ranking_completed"
    | "suggestions_published"
    | "user_selection_made"
    | "workflow_error";
  timestamp: ISO8601;
  user_id: string;
  travel_event_id: string;

  // Tool-specific
  tool_name: "flights-mcp";
  tool_request?: object; // Anonymized
  tool_response_count?: number;
  tool_latency_ms?: number;
  tool_status: "success" | "timeout" | "error" | "rate_limited";
  error_message?: string;

  // Workflow state
  workflow_id: string;
  workflow_step: string;

  // Metrics
  ranked_flight_count?: number;
  selected_flight_rank?: number; // 1, 2, or 3
}
```

**Logging Strategy:**

- Emit event at each step (start, success, error).
- Use correlation_id to trace end-to-end workflow.
- Store events in structured log system (e.g., Durable Object event log, external logging service).
- Dashboard: filter by correlation_id to see full workflow timeline.

---

## Data Flow & Integration Points

### Chat → Travel Workflow (Recommended)

```
User sends chat message ("Find flights to Paris May 10–15")
        │
        ▼
Chat handler (/api/chat) detects travel intent
        │
        ▼
Optionally: read calendar via CalendarToolClient to build context
        │
        ▼
Build TravelEvent (origin, destination, dates, preferences)
        │
        ▼
TravelWorkflow DO starts workflow for this TravelEvent
        │
        ▼
Call FlightToolClient.searchFlights(
  origin: user.home_city,
  destination: event.destination_city,
  departure_date: event.travel_date,
  ...preferences
)
        │
        ▼
flights-MCP responds with [FlightOption]
        │
        ▼
Call LLM RankingEngine.rankFlights(
  flights: [FlightOption],
  userPreferences: user.travel_profile
)
        │
        ▼
LLM returns [RankedFlight]
        │
        ▼
Store in TravelProfileDO / TravelWorkflowDO state
        │
        ▼
Publish event: "suggestions_published"
        │
        ▼
Results streamed back via /api/chat and/or Realtime
        │
        ▼
Display "Trip suggestions" card with top flights in chat UI
```

### Optional: Calendar → Travel Event Detection

For users who opt into background automation, you can still wire a calendar-triggered flow that emits `travel_event_detected` hooks and starts the same `TravelWorkflow` path as above. This is an advanced mode layered on top of the chat-first design.

### User Selection → Booking Workflow

```
User clicks "Book Flight" on ranked option
        │
        ▼
Frontend POST /api/travel/{workflow_id}/select/{flight_id}
        │
        ▼
TravelWorkflow DO:
  - Record selection in travel_history
  - Emit hook: "flight_booked" or "booking_initiated"
        │
        ▼
(Optional) Booking workflow:
  - Create task: "Complete flight booking (link: ...)"
  - Create task: "Book hotel in {destination}"
  - Create task: "Check passport expiration"
  - Create reminder: "Pack 2 days before"
        │
        ▼
Frontend displays confirmation + auto-generated tasks
```

---

## LLM Prompt Design

### Ranking Prompt (Refined)

**Input Variables:**

- User preferences (airlines, cabin, budget, non-stop)
- Calendar context (arrival time, meeting schedule, return constraints)
- Flight options (full details)

**Prompt:**

```
You are a travel assistant. Rank these flights for the user based on preferences and calendar context.

User Profile:
- Preferred airlines: {{preferred_airlines}}
- Cabin class: {{cabin_class}}
- Budget: {{max_price}} USD
- Non-stop preferred: {{non_stop_only}}
- Max layover: {{max_layover_minutes}} min

Trip Context:
- Destination: {{destination}}
- Departure: {{departure_date}} ({{day_of_week}})
- Return: {{return_date}}
- Calendar events on travel dates: {{calendar_summary}}

Flight Options:
{{flight_options_json}}

Rank 1–3 by suitability. Consider timing alignment with meetings, price, airline preference, and travel time. Return JSON:
{"ranked": [{"flight_id": "...", "rank": 1, "score": 0.95, "reason": "..."}]}
```

### Travel Event Classification (Optional)

Use LLM to classify calendar events as "travel" if pattern matching is weak:

```
This calendar event is: "Paris business trip, May 10–15, Depart 8 AM, Return 10 PM"

Classify as travel-related: Yes/No
Destination: {{city}}
Travel date: {{date}}
Confidence: 0.9 (0–1)
```

---

## Error Handling & Resilience

### Flight Search Failures

| Scenario                   | Handling                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| flights-MCP timeout        | Retry with backoff; if persistent, surface error to user and suggest manual search. |
| No flights found           | Return empty suggestion; user can refine (dates, airlines, budget).                 |
| flights-MCP rate limit     | Queue request; retry later; emit observability event.                               |
| Destination not recognized | LLM extracts destination from calendar; if ambiguous, ask user in frontend.         |

### Ranking Failures

| Scenario                 | Handling                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| LLM timeout              | Return unranked flight list (sorted by price); let user see options. |
| LLM parse error          | Log error; surface raw flight data to user; emit alert.              |
| Missing user preferences | Use sensible defaults (economy, any airline, max $1000).             |

### State Consistency

- Use `travel_event_id` as idempotency key; check if workflow already ran.
- If workflow fails mid-step, store state and allow retry without duplication.
- Emit `workflow_error` event with correlation_id for debugging.

---

## Frontend Integration

### Components & Flows

**Trip Suggestion Card:**

```tsx
<TripSuggestionCard
  travelEvent={travelEvent}
  rankedFlights={rankedFlights}
  onSelectFlight={(flightId) => handleSelection(flightId)}
  onDismiss={() => dismissSuggestion(travelEvent.id)}
/>
```

**Trip Suggestions Panel:**

- Show upcoming travel events with detection confidence.
- Display "Flights found" badge when workflow completes.
- Top 3 flights with:
  - Departure/arrival times, airline, cabin, price.
  - Ranking score and LLM reasoning.
  - "Book" button.
  - "See more options" to refine search.

**Realtime Updates:**

- Realtime channel: `user:{user_id}:travel`
- Events: `travel_event_detected`, `flight_search_completed`, `suggestions_ready`, `flight_booked`

---

## Implementation Roadmap

### Phase 1: Core Integration

1. Implement `TravelEventDetector` DO.
2. Implement `FlightToolClient` (HTTP client to flights-MCP).
3. Implement `TravelWorkflow` orchestrator.
4. Add structured logging and correlation IDs.

### Phase 2: LLM Ranking & UX

1. Implement LLM ranking prompt in `RankingEngine`.
2. Store user travel profile and preferences in `TravelProfile` DO.
3. Build frontend trip suggestion card and Realtime integration.

### Phase 3: Extensibility

1. Handle booking confirmation and task auto-generation.
2. Add hotel, car rental MCP integrations (same pattern as flights).
3. Build observability dashboard (timeline, metrics).

### Phase 4: Production Hardening

1. Add rate limiting, caching, circuit breakers.
2. Implement comprehensive error handling and retries.
3. Add A/B testing for ranking strategies.
4. Performance optimization (parallel requests, batching).

---

## Success Metrics

1. **Detection Accuracy:** % of travel events correctly identified (confidence > 0.7).
2. **Tool Invocation Latency:** flights-MCP search + LLM ranking < 3 seconds.
3. **User Engagement:** % of trips with ≥1 flight suggestion shown, % of suggestions clicked, % conversion to booking.
4. **Error Rate:** Tool failures, ranking errors, workflow timeouts < 2%.
5. **Observability:** 100% of tool invocations tracked with correlation IDs; < 5min MTTD for failures.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (TanStack Start)                   │
│  - Calendar event input / display                                   │
│  - Trip suggestion card (top 3 flights + LLM reasoning)            │
│  - User selection / booking flow                                    │
│  - Realtime updates (Realtime channel)                             │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
                 ┌───────────┴────────────┐
                 │                        │
                 ▼                        ▼
          ┌──────────────────────────────────────┐
          │   Cloudflare Workers                  │
          │  ┌─────────────────────────────────┐ │
          │  │ Travel Event Handler (route)    │ │
          │  └──────────────┬──────────────────┘ │
          │                 │                     │
          │  ┌──────────────▼──────────────────┐ │
          │  │ TravelWorkflow Orchestrator     │ │
          │  └──────────────┬──────────────────┘ │
          │                 │                     │
          │    ┌────────────┼────────────┐       │
          │    ▼            ▼            ▼       │
          │  ┌───┐ ┌──────────────┐ ┌──────────┐│
          │  │LLM│ │FlightTool    │ │Realtime  ││
          │  │   │ │Client        │ │Publisher ││
          │  └───┘ └──────────────┘ └──────────┘│
          │         (calls flights-MCP)          │
          └──────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │Durable Obj:  │  │Durable Obj:  │  │Durable Obj:  │
    │TravelEvent   │  │TravelWorkflow│  │TravelProfile │
    │Detector      │  │              │  │(preferences) │
    │              │  │- State       │  │              │
    │- Events      │  │  machine     │  │- Booking     │
    │- Confidence  │  │- Results     │  │  history     │
    │  scoring     │  │  storage     │  │- Preferences │
    └──────────────┘  └──────────────┘  └──────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  flights-MCP     │
                    │  (external)      │
                    │  - Flight search │
                    │  - Real pricing  │
                    └──────────────────┘

    Correlation ID & Observability:
    ┌─────────────────────────────────────────────┐
    │ Structured Logs (per-step events)           │
    │ - travel_event_detected                     │
    │ - flight_search_requested                   │
    │ - flight_search_completed                   │
    │ - flight_ranking_started/completed          │
    │ - suggestions_published                     │
    │ - user_selection_made                       │
    │ - workflow_error                            │
    │                                             │
    │ Tracked: correlation_id, latency, tool     │
    │ status, result counts                       │
    └─────────────────────────────────────────────┘
```

---

## Notes

- **flights-MCP Integration Method:** Determine if flights-MCP is called directly (HTTP), via RPC, or if logic is cloned into Worker. Adjust `FlightToolClient` accordingly.
- **Rate Limiting:** flights-MCP may have rate limits; implement queuing and backoff in `FlightToolClient`.
- **Data Privacy:** Ensure user preferences, travel history, and flight searches are encrypted at rest in Durable Objects.
- **Extensibility:** Pattern for flights-MCP can be replicated for hotel-MCP, car-rental-MCP, etc. Design `ToolOrchestrator` abstraction early.
