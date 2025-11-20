# Google Calendar MCP Integration Architecture

## Overview

The Google Calendar MCP integration enables the Micro Chief of Staff to **detect travel events, extract task context, and build calendar-aware reasoning** into all downstream workflows. When users add calendar events, the system detects patterns (travel, meetings, deadlines), extracts metadata, and triggers task extraction, daily planning, and flight searches.

## Integration Goals

1. **Calendar event reading** – List events from Google Calendar via open-source Google Calendar MCP.
2. **Travel event detection** – Identify travel-related events (trips, meetings in other cities, flights).
3. **Task context extraction** – Use calendar metadata (attendees, location, description) to inform task extraction.
4. **Calendar-aware reasoning** – Pass calendar context to LLM prompts (flight ranking, daily planner, summarization).
5. **Persistent state** – Store extracted calendar metadata in Durable Objects for correlation with tasks, flights, and workflows.
6. **Observable & idempotent** – Track calendar API calls with correlation IDs; deduplicate event processing.

---

## Architecture

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. User Adds Calendar Event                                      │
│    "Paris trip, May 10–15" or "Q2 Planning Meeting, May 10"     │
│    Event stored in Google Calendar                               │
└───────────────────┬──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Calendar Event Sync (Polling or Webhook)                      │
│    - Fetch events from Google Calendar MCP                       │
│    - Filter: last 30 days, next 90 days                         │
│    - Extract: title, description, dates, location, attendees   │
└───────────────────┬──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Travel Event Detection (TravelEventDetector DO)               │
│    - Pattern match: destination keywords, location extraction   │
│    - LLM classification (optional): "is this a travel event?"   │
│    - Extract: origin, destination, dates, confidence score     │
└───────────────────┬──────────────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
    TRAVEL EVENT          REGULAR EVENT
         │                     │
         ▼                     ▼
    ┌─────────────┐    ┌──────────────────┐
    │ Hook:       │    │ Hook:            │
    │travel_event │    │event_detected    │
    │_detected    │    │(for task extract)│
    └─────────────┘    └──────────────────┘
         │                     │
    ┌────┴─────────────────────┴────┐
    │                               │
    ▼                               ▼
┌──────────────────┐     ┌──────────────────────┐
│ Flight Search    │     │ Task Extraction      │
│ Workflow         │     │ (e.g., prep meeting) │
└──────────────────┘     └──────────────────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐     ┌──────────────────────┐
│ LLM Ranking      │     │ Daily Planner        │
│ (flight options) │     │ (task scheduling)    │
└──────────────────┘     └──────────────────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Calendar Context     │
          │ Loop (feedback to    │
          │ refinement)          │
          └──────────────────────┘
```

---

## Component Architecture

### 1. **Calendar Event Sync (Worker + Scheduled Job)**

**Responsibility:** Periodically fetch calendar events and emit hooks for downstream processing.

**Interface:**
```typescript
interface CalendarEvent {
  id: string;
  summary: string;           // Event title
  description?: string;      // Rich text or plain text
  start: {
    dateTime: ISO8601;
    timeZone?: string;
  };
  end: {
    dateTime: ISO8601;
    timeZone?: string;
  };
  location?: string;         // e.g., "Paris, France"
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  }[];
  organizer?: {
    email: string;
    displayName?: string;
  };
  recurringEventId?: string;
  recurrence?: string[];     // RRULE format
  status: 'confirmed' | 'tentative' | 'cancelled';
  transparency: 'opaque' | 'transparent';
  visibility: 'public' | 'private' | 'confidential';
}

interface CalendarSyncWorker {
  // Scheduled: run every 30 min (or on webhook)
  syncCalendarEvents(userId: string): Promise<void>;
  
  // Emit hooks for each event type
  emitEventHook(event: CalendarEvent, hookType: 'travel_detected' | 'event_detected'): Promise<void>;
}
```

**Implementation Notes:**
- Trigger: Scheduled cron (e.g., every 30 min) or Google Calendar webhook.
- Fetch events: Call Google Calendar MCP `list-events` tool for date range.
- Deduplicate: Compare event IDs against `CalendarEventStoreDO` to avoid re-processing.
- Emit hooks: For each event, call `TravelEventDetector.detectTravelEvents()` or `TaskExtraction.extractTasks()`.

---

### 2. **Calendar Tool Client (Worker Service)**

**Responsibility:** Wrap Google Calendar MCP calls, handle retries, normalize responses.

**Interface:**
```typescript
interface CalendarToolClient {
  // List events in date range
  getEvents(
    dateRange: { start: ISO8601; end: ISO8601 },
    filters?: { summary_contains?: string; location_contains?: string }
  ): Promise<CalendarEvent[]>;
  
  // Search events by text
  searchEvents(
    query: string,
    dateRange?: { start: ISO8601; end: ISO8601 }
  ): Promise<CalendarEvent[]>;
  
  // Check availability (free/busy)
  getFreeBusy(
    calendarIds: string[],
    timeMin: ISO8601,
    timeMax: ISO8601
  ): Promise<FreeBusyData>;
  
  // Create event (for task/reminder creation)
  createEvent(
    summary: string,
    startTime: ISO8601,
    endTime: ISO8601,
    options?: {
      description?: string;
      location?: string;
      attendees?: string[];
      reminders?: number[]; // minutes before
    }
  ): Promise<CalendarEvent>;
}

interface FreeBusyData {
  calendarId: string;
  busy: Array<{ start: ISO8601; end: ISO8601 }>;
  tentative?: Array<{ start: ISO8601; end: ISO8601 }>;
}
```

**Implementation:**
- Call Google Calendar MCP server via stdio (local) or HTTP (remote).
- Handle OAuth token refresh (cached in Durable Object or Cloudflare KV).
- Log: request_id, timestamp, latency, result count, error status.
- Retry logic: exponential backoff for rate limits; fail-fast for auth errors.

---

### 3. **Travel Event Detector (Durable Object)**

**Responsibility:** Identify travel-related calendar events, extract metadata, emit hooks.

**Interface:**
```typescript
interface TravelEvent {
  calendar_event_id: string;
  user_id: string;
  title: string;
  description?: string;
  start_date: ISO8601;
  end_date: ISO8601;
  origin_city?: string;        // User's home city (from profile)
  destination_city: string;    // Extracted from title/location
  travel_date?: ISO8601;       // Departure date (if explicit)
  return_date?: ISO8601;       // Return date (if round-trip)
  detection_method: 'pattern_match' | 'llm_classification';
  confidence: number;          // 0.0–1.0
  extracted_at: ISO8601;
}

interface TravelEventDetectorDO {
  // Detect travel events from calendar
  detectTravelEvents(calendarEvents: CalendarEvent[]): Promise<TravelEvent[]>;
  
  // Store detected event
  storeTravelEvent(event: TravelEvent): Promise<void>;
  
  // Get detected events
  getTravelEvents(dateRange?: { start: ISO8601; end: ISO8601 }): Promise<TravelEvent[]>;
  
  // Check if already processed
  isEventProcessed(calendar_event_id: string): Promise<boolean>;
}
```

**Logic:**

1. **Pattern Matching:**
   - Keywords in title: "trip", "flight", "travel", "visit", destination names
   - Location field: non-empty and appears to be a city/country
   - Description mentions: "depart", "arrive", "hotel", "flight"

2. **Destination Extraction:**
   - Parse location field (e.g., "Paris, France" → "Paris")
   - Extract from title (e.g., "Paris trip" → "Paris")
   - Geocode or fuzzy-match against known city names

3. **Confidence Scoring:**
   - High (0.9+): Explicit "trip to X" + location field
   - Medium (0.7–0.9): Destination mentioned in title but no location
   - Low (0.4–0.7): Meeting in another city + travel indicators
   - Very Low (< 0.4): Ambiguous; needs LLM classification

4. **LLM Classification (Optional):**
   - For confidence < 0.7, pass to Llama 3.3 with prompt:
     ```
     Is this a travel event? Title: "{title}", Description: "{description}"
     Output: {"is_travel": boolean, "destination": string, "confidence": 0.0-1.0}
     ```

5. **Hook Emission:**
   - If confidence >= 0.75, emit `travel_event_detected` hook
   - Emit to `TravelWorkflow` DO to trigger flight search

---

### 4. **Calendar Event Store (Durable Object)**

**Responsibility:** Persist calendar events and track processing state.

**Interface:**
```typescript
interface CalendarEventStoreDO {
  // Store synced events
  storeEvents(events: CalendarEvent[], lastSyncTime: ISO8601): Promise<void>;
  
  // Get events
  getEvents(dateRange: { start: ISO8601; end: ISO8601 }): Promise<CalendarEvent[]>;
  
  // Get sync state (for idempotency)
  getLastSyncTime(): Promise<ISO8601 | null>;
  
  // Track processing (avoid re-processing)
  markEventProcessed(event_id: string, hook_type: string): Promise<void>;
  isEventProcessed(event_id: string, hook_type: string): Promise<boolean>;
}
```

**Data Model:**
```typescript
interface CalendarEventRecord {
  event_id: string;
  user_id: string;
  calendar_event: CalendarEvent;
  synced_at: ISO8601;
  processed_hooks: {
    hook_type: string;   // e.g., "travel_detected", "task_extracted"
    processed_at: ISO8601;
    status: 'success' | 'failed';
  }[];
}
```

---

### 5. **Task Extraction Trigger (Worker + Hook)**

**Responsibility:** Process calendar events to extract tasks.

**Triggered by:** `event_detected` hook from `CalendarSyncWorker`.

**Workflow:**
```
CalendarSyncWorker emits event_detected hook
    │
    ▼
TaskExtractionWorker receives hook
    │
    ▼
Pass calendar event + message context to Llama 3.3 (task-extraction prompt)
    │
    ▼
LLM extracts tasks: prep meeting, gather data, etc.
    │
    ▼
Store in TaskManagementDO
    │
    ▼
Emit hook: tasks_extracted
```

**Example:**
- Calendar: "Q2 Planning Meeting, May 10, 14:00–15:00"
- Extracted Tasks:
  - "Prepare Q2 planning agenda" (deadline May 10, 13:00, high priority)
  - "Gather Q2 metrics" (deadline May 9, 17:00, high priority)

---

### 6. **Calendar Context for Prompts**

**Responsibility:** Inject calendar context into LLM prompts.

**Used by:**
- **Flight Ranking Prompt:** Calendar events on departure/arrival dates influence ranking
- **Daily Planner Prompt:** Calendar events define time blocks and constraints
- **Summarization Prompt:** Meeting notes reference calendar event context

**Calendar Context Block:**
```typescript
interface CalendarContext {
  events_today: CalendarEvent[];
  events_on_departure: CalendarEvent[];
  events_on_arrival: CalendarEvent[];
  earliest_meeting: ISO8601 | null;
  latest_meeting: ISO8601 | null;
  total_meeting_minutes: number;
  free_blocks: Array<{ start: ISO8601; end: ISO8601; duration_minutes: number }>;
}
```

**Example in Flight Ranking Prompt:**
```
---CALENDAR CONTEXT---
Events on departure (May 10):
- 09:00–09:30: Team standup
- 14:00–15:00: Q2 Planning Meeting

Constraint: Must arrive before 14:00 planning meeting (prefer 13:00 or earlier)

Free time today: 08:00–09:00, 09:30–14:00 (for final prep), 15:00–18:00
```

---

## Data Flow & Integration Points

### Calendar Sync → Event Detection

```
Google Calendar API
    │
    ▼
CalendarToolClient (Worker)
    │
    ├─→ getEvents(start: now, end: now + 90 days)
    │
    ▼
CalendarSyncWorker (scheduled every 30 min)
    │
    ├─→ Fetch events
    ├─→ Deduplicate vs. CalendarEventStoreDO
    ├─→ Store new events
    │
    ▼
Emit hooks for each event:
    ├─→ travel_event_detected (for travel events)
    ├─→ event_detected (for all events, triggers task extraction)
    │
    ▼
TravelEventDetector DO / TaskExtractionWorker
    │
    ├─→ Classify / extract metadata
    ├─→ Store results in respective DOs
```

### Travel Detection → Flight Search

```
travel_event_detected hook
    │
    ▼
TravelWorkflowDO.startWorkflow(travelEvent)
    │
    ├─→ Check: already processed? (idempotency)
    │
    ▼ NO (new event)
    │
    ├─→ Extract origin (user profile), destination (travelEvent)
    ├─→ Call FlightToolClient.searchFlights()
    │
    ▼
flights-MCP responds
    │
    ├─→ Normalize to FlightOption[]
    ├─→ Store in TravelWorkflowDO
    │
    ▼
    ├─→ Emit hook: flight_search_completed
    │
    ▼
LLM Ranking (flight-ranking prompt)
    │
    ├─→ Include calendar context (meetings on arrival)
    │
    ▼
Store ranked results
    │
    ├─→ Emit hook: suggestions_published
    │
    ▼
Realtime notification to frontend
```

### Event Detection → Task Extraction → Daily Planner

```
event_detected hook (for non-travel events)
    │
    ▼
TaskExtractionWorker
    │
    ├─→ Call Llama 3.3 (task-extraction prompt)
    ├─→ Input: calendar event + any referenced emails/messages
    │
    ▼
Extract tasks: title, deadline, priority, category
    │
    ├─→ Store in TaskManagementDO
    ├─→ Emit hook: tasks_extracted
    │
    ▼
DailyPlannerWorker (triggered on user request or 7 AM)
    │
    ├─→ Fetch: calendar events + extracted tasks
    ├─→ Call Llama 3.3 (daily-planner prompt)
    │
    ▼
Generate time-blocked schedule
    │
    ├─→ Emit hook: daily_plan_generated
    │
    ▼
Realtime notification to frontend
```

---

## LLM Prompts Integration

### 1. Flight Ranking (with Calendar Context)

**Input:**
- Flight options (from flights-MCP)
- User preferences (from profile)
- **Calendar context:** Events on departure/arrival dates

**Prompt Addition:**
```
---CALENDAR CONTEXT (Arrival Day)---
You arrive on May 10. Important events:
- 14:00–15:00: Q2 Planning Meeting (in Paris)

Preferred arrival time: Before 13:00 (1 hour buffer for meeting)

Consider: Does the flight allow time to arrive before the meeting?
```

### 2. Daily Planner (with Calendar Events)

**Input:**
- Extracted tasks for today
- **Calendar events** (from calendar sync)
- User preferences (work hours, focus blocks)
- Energy profile

**Prompt Addition:**
```
---TODAY'S CALENDAR---
- 09:00–09:30: Team standup (30 min, medium focus)
- 14:00–15:00: Q2 Planning Meeting (60 min, high focus)
- Available free blocks: 08:00–09:00, 09:30–14:00, 15:00–18:00

Schedule tasks around these meetings.
```

### 3. Task Extraction (with Calendar Event Details)

**Input:**
- Calendar event (title, description, attendees, location)
- Recent messages (emails/Slack)
- Existing tasks (to avoid duplicates)

**Prompt Addition:**
```
---CALENDAR EVENT---
Title: Q2 Planning Meeting
Attendees: Alice Chen, Bob Smith, Carol Lee
Description: "Discuss Q2 roadmap priorities, budget allocation"
Date: May 10, 14:00–15:00

Extract prep tasks needed before this meeting.
```

---

## Error Handling & Resilience

### Google Calendar API Failures

| Scenario | Handling |
|----------|----------|
| OAuth token expired | Refresh token; retry request; log token refresh event |
| Rate limit (429) | Queue request with exponential backoff; retry after 60s |
| Calendar API timeout | Retry up to 3 times; if persistent, use cached events; emit warning |
| Event not found (404) | Skip event; mark as deleted in store |
| Auth error (401/403) | Log auth failure; alert user; disable calendar sync until resolved |

### Travel Detection Failures

| Scenario | Handling |
|----------|----------|
| Destination ambiguous | Low confidence score; don't trigger flight search; mark for manual review |
| LLM classification fails | Treat as non-travel event; extract as regular task |
| Invalid date range | Use event duration (start–end) as travel period; infer departure date |
| No origin city (user home) | Use default or prompt user to set home city in profile |

### Task Extraction Failures

| Scenario | Handling |
|----------|----------|
| LLM returns invalid JSON | Log error; emit no tasks; calendar event treated as informational |
| Low-confidence extraction | Add to review queue for manual curation |
| Duplicate task detected | Skip extraction; increment duplicate counter |
| Missing fields (deadline/priority) | Use sensible defaults (deadline = event end date, priority = medium) |

### State Consistency

- Use `calendar_event_id` as idempotency key for all hooks.
- Track processed hooks in `CalendarEventStoreDO.processed_hooks[]`.
- Prevent re-triggering the same workflow twice for the same event.
- If hook processing fails, emit `event_processing_failed` event with correlation_id.

---

## Observability & Correlation

**Logged Events:**
```typescript
interface CalendarToolInvocationEvent {
  correlation_id: string;           // UUID, propagated across all steps
  event_type: 'calendar_sync_started' | 'calendar_sync_completed' | 
              'travel_event_detected' | 'event_processing_failed';
  timestamp: ISO8601;
  user_id: string;
  
  // Tool-specific
  tool_name: 'google-calendar-mcp';
  tool_operation: 'list-events' | 'search-events' | 'create-event';
  tool_latency_ms: number;
  tool_status: 'success' | 'timeout' | 'error' | 'rate_limited';
  error_message?: string;
  
  // Results
  events_synced?: number;
  events_processed?: number;
  hooks_emitted?: number;
  travel_events_detected?: number;
  
  // Identifiers
  calendar_event_ids?: string[];
  hook_type?: string;
}
```

**Logging Strategy:**
- Emit event at each step (sync start, sync complete, hook emit, failure).
- Use correlation_id to trace end-to-end (calendar sync → task extraction → daily plan → user notification).
- Store events in structured log system (Durable Object event log or external service).
- Dashboard: filter by `user_id` or `correlation_id` to debug workflows.

---

## Deployment & Setup

### Prerequisites

1. **Google Cloud Project:**
   - Create project at https://console.cloud.google.com
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials (Desktop app type)
   - Download `gcp-oauth.keys.json`
   - Add test user email as OAuth test user

2. **Google Calendar MCP:**
   ```bash
   npm install @nspady/google-calendar-mcp
   # Run locally for MVP
   npx @nspady/google-calendar-mcp server
   ```

3. **Cloudflare Workers:**
   - Create `CalendarSyncWorker` (scheduled job)
   - Create `CalendarToolClient` (wrapper for MCP)
   - Create `TaskExtractionWorker` (hook subscriber)

### Configuration

**Environment Variables:**
```
GOOGLE_CALENDAR_MCP_HOST=localhost:3000  # or remote URL
GOOGLE_OAUTH_KEYS_FILE=./gcp-oauth.keys.json
CALENDAR_SYNC_INTERVAL_MINUTES=30
CALENDAR_LOOKBACK_DAYS=7
CALENDAR_LOOKAHEAD_DAYS=90
TRAVEL_EVENT_CONFIDENCE_THRESHOLD=0.75
```

### Integration Steps

1. Implement `CalendarToolClient` Worker (wrap Google Calendar MCP calls)
2. Implement `CalendarSyncWorker` (scheduled job to fetch events every 30 min)
3. Implement `CalendarEventStoreDO` (store events, track processing)
4. Implement `TravelEventDetectorDO` (detect travel patterns)
5. Add calendar sync → `event_detected` hook emission
6. Implement `TaskExtractionWorker` (subscribe to `event_detected` hook)
7. Update flight-ranking, daily-planner, summarization prompts to include calendar context
8. Test: Add calendar event → Detect as travel/task → Trigger flight search or task extraction

---

## Frontend Integration

### Calendar Awareness

**Components:**
- Calendar event list (read-only, from sync)
- Travel event detection badge ("Trip to Paris detected")
- Task cards linked to calendar events
- Daily planner time blocks synchronized with calendar

**Realtime Updates:**
- Realtime channel: `user:{user_id}:calendar`
- Events: `calendar_synced`, `travel_event_detected`, `event_processed`, `task_extracted`

---

## Future Enhancements

- [ ] Multi-calendar support (personal + work + team calendars)
- [ ] Recurring event expansion (unroll recurring series for better task extraction)
- [ ] Attendee availability (check attendees' free/busy for meeting scheduling)
- [ ] Calendar-based reminders (send task reminders before related events)
- [ ] Reverse-link: Create calendar events from booked flights or completed tasks
- [ ] Travel logistics automation (extract meeting location → set timezone, travel time alerts)

---

## Success Metrics

1. **Sync Reliability:** Calendar events synced accurately, 99%+ uptime
2. **Detection Accuracy:** Travel events detected correctly (precision > 90%, recall > 85%)
3. **Latency:** Calendar sync + event processing < 5 seconds
4. **Task Extraction:** Accurate prep tasks extracted from calendar events, < 2% false positives
5. **User Engagement:** % of calendar events with generated tasks or flight suggestions
6. **Observability:** 100% of calendar tool calls tracked with correlation IDs

---

## Integration Checklist

- [ ] Create Google Cloud project & OAuth credentials
- [ ] Install Google Calendar MCP locally (MVP) or deploy to cloud
- [ ] Implement `CalendarToolClient` Worker
- [ ] Implement `CalendarSyncWorker` (scheduled job)
- [ ] Implement `CalendarEventStoreDO`
- [ ] Implement `TravelEventDetectorDO`
- [ ] Implement `TaskExtractionWorker` (hook subscriber)
- [ ] Update flight-ranking prompt with calendar context
- [ ] Update daily-planner prompt with calendar events
- [ ] Update summarization prompt with calendar references
- [ ] Add correlation IDs for all calendar tool invocations
- [ ] Test end-to-end: Calendar event → Travel/task detection → Flight/task creation
- [ ] Document OAuth setup for users
- [ ] Add calendar event schema to observability logging
- [ ] Set up Realtime channels for calendar events
- [ ] Performance test: 100 calendar events in 30-day range, latency < 2s

---
