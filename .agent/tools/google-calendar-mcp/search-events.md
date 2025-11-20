# Google Calendar MCP: Search Events Tool

## Overview

**MCP:** google-calendar-mcp (nspady)  
**Operation:** `search-events`  
**Purpose:** Search for events by free-text query (title, description, location, attendee names)  
**Caller:** `TaskExtractionWorker`, `TravelEventDetector` DO  
**Triggered by:** Task extraction workflow, manual search, or when detecting event patterns  

---

## API Specification

### Request

```typescript
interface SearchEventsRequest {
  calendarId: string;           // "primary" or email address
  query: string;                // Free-text search (50–500 chars)
  timeMin?: string;             // RFC3339, e.g., "2025-05-10T00:00:00Z"
  timeMax?: string;             // RFC3339, e.g., "2025-05-20T23:59:59Z"
  maxResults?: number;          // 1–2500, default 250
  orderBy?: 'startTime' | 'updated';
  pageToken?: string;           // For pagination
  eventTypes?: string[];        // Filter by type (e.g., "default", "focusTime", "outOfOffice")
}
```

### Response

```typescript
interface SearchEventsResponse {
  kind: "calendar";
  etag: string;
  summary: string;              // Calendar name
  updated: string;              // RFC3339
  timeZone: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  items: CalendarEvent[];       // Matching events
  nextPageToken?: string;       // For pagination
  nextSyncToken?: string;       // For incremental sync (last page only)
}

interface CalendarEvent {
  id: string;
  iCalUID: string;
  summary: string;              // Event title
  description?: string;
  location?: string;
  start: {
    dateTime?: string;          // RFC3339 for timed events
    date?: string;              // "YYYY-MM-DD" for all-day
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  creator: {
    email: string;
    displayName?: string;
  };
  organizer: {
    email: string;
    displayName?: string;
  };
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus: "accepted" | "declined" | "tentative" | "needsAction";
  }[];
  status: "confirmed" | "tentative" | "cancelled";
  transparency: "opaque" | "transparent";
  visibility: "public" | "private" | "confidential";
  eventType: string;            // "default", "focusTime", "outOfOffice", etc.
  recurrence?: string[];        // RRULE format for recurring events
  recurringEventId?: string;    // Parent recurring event ID
  conferenceData?: {
    entryPoints: {
      uri: string;
      label?: string;
      entryPointType: string;   // "video", "phone", "sip"
    }[];
    conferenceSolution: {
      key: { type: string };    // "hangoutsMeet", "addOn", etc.
      name: string;
    };
  };
  reminders?: {
    useDefault: boolean;
    overrides?: {
      method: "email" | "popup";
      minutes: number;
    }[];
  };
  htmlLink: string;             // Google Calendar UI link
}
```

---

## HTTP Call Details

### Endpoint

```
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?q={query}
```

### Headers

```
Authorization: Bearer {GOOGLE_OAUTH_TOKEN}
Accept: application/json
```

### Query Parameters

```
?q=<search_query>&timeMin=<start>&timeMax=<end>&maxResults=<count>&orderBy=<order>
```

### Response Status Codes

| Code | Meaning | Handling |
|------|---------|----------|
| 200 | OK, events returned | Parse and normalize |
| 400 | Bad request (invalid query, date format) | Log error, return empty |
| 401 | Unauthorized (invalid/expired token) | Refresh OAuth token, retry |
| 403 | Forbidden (no access to calendar) | Check permissions, user alert |
| 404 | Calendar not found | Check calendarId, user alert |
| 429 | Rate limited | Retry with exponential backoff |
| 500 | Server error | Retry with exponential backoff |

---

## Implementation in CalendarToolClient

```typescript
class CalendarToolClient {
  async searchEvents(
    request: SearchEventsRequest,
    options?: { timeout?: number; retries?: number }
  ): Promise<CalendarEvent[]> {
    const operationId = generateUUID();
    const toolInvocationId = generateUUID();
    
    try {
      // 1. Validate input
      this.validateSearchRequest(request);
      
      // 2. Build query parameters
      const params = new URLSearchParams({
        q: request.query,
        maxResults: String(request.maxResults || 250),
        ...(request.timeMin && { timeMin: request.timeMin }),
        ...(request.timeMax && { timeMax: request.timeMax }),
        ...(request.orderBy && { orderBy: request.orderBy }),
        ...(request.pageToken && { pageToken: request.pageToken })
      });
      
      // 3. Call Google Calendar API
      const startTime = Date.now();
      const response = await this.callGoogleAPI(
        `https://www.googleapis.com/calendar/v3/calendars/${request.calendarId}/events?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${await this.getOAuthToken()}`,
            'Accept': 'application/json'
          },
          timeout: options?.timeout || 10000,
          retries: options?.retries || 3
        }
      );
      const latency = Date.now() - startTime;
      
      // 4. Parse response
      const events = response.items || [];
      
      // 5. Log success
      this.log('Tool invocation success', {
        operationId,
        toolInvocationId,
        tool: 'google-calendar-mcp',
        operation: 'search_events',
        query: request.query,
        latency,
        resultCount: events.length,
        status: 'success'
      });
      
      return events;
      
    } catch (error) {
      // Error handling
      this.log('Tool invocation failed', {
        operationId,
        toolInvocationId,
        tool: 'google-calendar-mcp',
        operation: 'search_events',
        status: 'error',
        errorMessage: error.message,
        errorType: error.constructor.name
      });
      
      throw new ToolInvocationError('google-calendar-mcp', 'search_events', error);
    }
  }
  
  private validateSearchRequest(req: SearchEventsRequest): void {
    if (!req.calendarId) {
      throw new Error('calendarId is required');
    }
    
    if (!req.query || req.query.trim().length === 0) {
      throw new Error('query is required and cannot be empty');
    }
    
    if (req.query.length > 500) {
      throw new Error('query cannot exceed 500 characters');
    }
    
    if (req.timeMin && req.timeMax) {
      const minTime = new Date(req.timeMin);
      const maxTime = new Date(req.timeMax);
      if (minTime >= maxTime) {
        throw new Error('timeMin must be before timeMax');
      }
    }
    
    if (req.maxResults && (req.maxResults < 1 || req.maxResults > 2500)) {
      throw new Error('maxResults must be between 1 and 2500');
    }
  }
}
```

---

## Use Cases

### 1. Travel Event Detection

**Trigger:** Detect travel-related events for flight search

**Request:**
```typescript
{
  calendarId: "primary",
  query: "Paris trip OR flight OR travel",
  timeMin: "2025-05-01T00:00:00Z",
  timeMax: "2025-06-30T23:59:59Z",
  maxResults: 50
}
```

**Response:** Events matching travel keywords → `TravelEventDetector` extracts destination

### 2. Task Extraction from Events

**Trigger:** Find preparation tasks for upcoming meetings

**Request:**
```typescript
{
  calendarId: "primary",
  query: "planning OR review OR discussion",
  timeMin: "2025-05-10T00:00:00Z",
  timeMax: "2025-05-20T23:59:59Z",
  maxResults: 100
}
```

**Response:** Events with keywords → `TaskExtractionWorker` generates prep tasks

### 3. Attendee-Based Search

**Trigger:** Find all events with specific attendee

**Request:**
```typescript
{
  calendarId: "primary",
  query: "alice@example.com"
}
```

**Response:** All events where alice is an attendee

### 4. Location-Based Search

**Trigger:** Find all events at specific location

**Request:**
```typescript
{
  calendarId: "primary",
  query: "Conference Room A"
}
```

**Response:** All events at that location

---

## Error Scenarios

### 1. Empty Query

**Request:**
```json
{
  "calendarId": "primary",
  "query": ""
}
```

**Error (400):**
```json
{
  "error": {
    "code": 400,
    "message": "Invalid query parameter"
  }
}
```

**Handling:**
```typescript
catch (error) {
  if (error.response?.status === 400) {
    throw new UserError('Search query cannot be empty. Please provide keywords.');
  }
}
```

### 2. Invalid Date Range

**Request:**
```json
{
  "calendarId": "primary",
  "query": "trip",
  "timeMin": "2025-05-20T00:00:00Z",
  "timeMax": "2025-05-10T00:00:00Z"
}
```

**Error (400):**
```json
{
  "error": {
    "code": 400,
    "message": "Invalid time range: timeMin must be before timeMax"
  }
}
```

**Handling:**
```typescript
if (request.timeMin && request.timeMax) {
  const minTime = new Date(request.timeMin);
  const maxTime = new Date(request.timeMax);
  if (minTime >= maxTime) {
    throw new ValidationError('Start date must be before end date');
  }
}
```

### 3. Expired OAuth Token

**Response (401):**
```json
{
  "error": {
    "error": "invalid_grant",
    "error_description": "Token has been revoked."
  }
}
```

**Handling:**
```typescript
catch (error) {
  if (error.response?.status === 401) {
    await this.refreshOAuthToken();
    return this.searchEvents(request, options); // Retry
  }
}
```

### 4. No Results Found

**Request:**
```json
{
  "calendarId": "primary",
  "query": "nonexistent_event_xyz"
}
```

**Response (200):**
```json
{
  "kind": "calendar",
  "items": []
}
```

**Handling:**
```typescript
if (response.items.length === 0) {
  this.log('No events found', { query: request.query });
  return []; // Return empty array (not an error)
}
```

---

## Caching Strategy

```typescript
// Cache key: calendar_search:{calendarId}:{query_hash}:{timeMin}:{timeMax}
const queryHash = hashString(request.query); // md5 or SHA-256
const cacheKey = `calendar_search:${request.calendarId}:${queryHash}:${request.timeMin}:${request.timeMax}`;

// Cache for 10 minutes (calendar events can change frequently)
const CACHE_TTL = 10 * 60; // seconds

// Invalidate on:
// - Calendar sync completes (new/updated events)
// - User manually triggers new search
// - Time range changes
```

---

## Search Query Syntax

Google Calendar API supports free-text search in these fields:

| Field | Example |
|-------|---------|
| Event title (summary) | `"Q2 Planning"` |
| Description | `"roadmap priorities"` |
| Location | `"Paris"` or `"Conference Room A"` |
| Attendee name | `"alice"` or `"alice@example.com"` |
| Organizer name | `"john"` |

**Boolean operators:**
- AND (implicit): `"paris trip"` → events with both "paris" AND "trip"
- OR: `"flight OR travel"` → events with "flight" OR "travel"

**Exact phrase:** `"Paris trip"` (with quotes)

---

## Performance Notes

- **Latency:** 200–500ms (Google API call + parsing)
- **Max results per page:** 2500 events
- **Pagination:** Use `pageToken` for large result sets
- **Rate limits:** ~1000 API calls/day per user (Google Calendar API free quota)
- **Timeout:** 10 seconds

---

## Integration Points

1. **Input source:** User query, pattern matching from hooks
2. **Caller:** `TravelEventDetector.detectTravelEvents()`, `TaskExtractionWorker.extractTasks()`
3. **Output consumed by:** `TravelWorkflowDO` (for flight search), `TaskManagementDO` (for task extraction)
4. **Fallback:** If search fails, return empty list (graceful degradation)

---

## Examples

### Example 1: Search for Travel Events

**Request:**
```json
{
  "calendarId": "primary",
  "query": "trip",
  "timeMin": "2025-05-01T00:00:00Z",
  "timeMax": "2025-06-30T23:59:59Z",
  "maxResults": 50
}
```

**Response:**
```json
{
  "kind": "calendar",
  "items": [
    {
      "id": "evt_001",
      "summary": "Paris trip",
      "description": "Quarterly review meeting in Paris",
      "location": "Paris, France",
      "start": { "date": "2025-05-15" },
      "end": { "date": "2025-05-20" },
      "status": "confirmed"
    },
    {
      "id": "evt_002",
      "summary": "Denver business trip",
      "location": "Denver, CO",
      "start": { "dateTime": "2025-06-10T08:00:00Z" },
      "end": { "dateTime": "2025-06-12T17:00:00Z" }
    }
  ]
}
```

### Example 2: Search for Meetings with Attendee

**Request:**
```json
{
  "calendarId": "primary",
  "query": "alice@example.com",
  "maxResults": 25
}
```

**Response:**
```json
{
  "kind": "calendar",
  "items": [
    {
      "id": "evt_003",
      "summary": "Q2 Planning Meeting",
      "start": { "dateTime": "2025-05-10T14:00:00-07:00" },
      "attendees": [
        { "email": "alice@example.com", "responseStatus": "accepted" },
        { "email": "bob@example.com", "responseStatus": "tentative" }
      ]
    }
  ]
}
```

---
