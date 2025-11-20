# Google Calendar MCP: Create Event Tool

## Overview

**MCP:** google-calendar-mcp (nspady)  
**Operation:** `create-event`  
**Purpose:** Create new calendar events (tasks, reminders, bookings, travel prep events)  
**Caller:** `TaskManagementDO`, `TravelWorkflowDO`, `DailyPlannerWorker`  
**Triggered by:** Task creation, flight booking, meeting scheduling, reminder generation  

---

## API Specification

### Request

```typescript
interface CreateEventRequest {
  calendarId: string;           // "primary" or email address
  summary: string;              // Event title (required)
  description?: string;         // Event description (can contain HTML)
  location?: string;            // Geographic location or room name
  start: {
    dateTime?: string;          // RFC3339, e.g., "2025-05-10T14:00:00-07:00"
    date?: string;              // "YYYY-MM-DD" for all-day events
    timeZone?: string;          // IANA timezone (e.g., "America/Los_Angeles")
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: {
    email: string;              // Required
    displayName?: string;
    optional?: boolean;
    comment?: string;
  }[];
  conferenceData?: {
    requestId?: string;         // UUID for idempotency
    conferenceSolution?: {
      key: {
        type: string;           // "hangoutsMeet", "addOn"
      };
    };
  };
  reminders?: {
    useDefault?: boolean;       // Use calendar defaults
    overrides?: {
      method: "email" | "popup";
      minutes: number;          // 0–40320 (4 weeks)
    }[];
  };
  transparency?: "opaque" | "transparent"; // "opaque"=busy, "transparent"=free
  visibility?: "public" | "private" | "confidential";
  colorId?: string;             // Color ID (1–24)
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeGuests?: boolean;
  recurrence?: string[];        // RRULE format for recurring events
}
```

### Response

```typescript
interface CreateEventResponse {
  id: string;                   // Unique event ID
  iCalUID: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
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
  created: string;              // RFC3339
  updated: string;              // RFC3339
  htmlLink: string;             // Google Calendar UI link
  conferenceData?: {
    entryPoints: {
      uri: string;
      label?: string;
      entryPointType: string;
    }[];
  };
  reminders?: {
    useDefault: boolean;
    overrides?: {
      method: "email" | "popup";
      minutes: number;
    }[];
  };
}
```

---

## HTTP Call Details

### Endpoint

```
POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?conferenceDataVersion=1
```

### Headers

```
Authorization: Bearer {GOOGLE_OAUTH_TOKEN}
Content-Type: application/json
Accept: application/json
```

### Request Body Example

```json
{
  "summary": "Book Paris flights",
  "description": "Search and compare flight options for Paris trip (May 15-20)",
  "start": {
    "dateTime": "2025-05-14T17:00:00-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2025-05-14T18:00:00-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "reminders": {
    "useDefault": true,
    "overrides": [
      { "method": "email", "minutes": 1440 },
      { "method": "popup", "minutes": 30 }
    ]
  },
  "transparency": "opaque"
}
```

### Response Status Codes

| Code | Meaning | Handling |
|------|---------|----------|
| 200 | OK, event created | Return created event |
| 201 | Created | Return created event |
| 400 | Bad request (invalid data) | Log error, return error to user |
| 401 | Unauthorized (invalid/expired token) | Refresh OAuth token, retry |
| 403 | Forbidden (no write access) | Check permissions, user alert |
| 404 | Calendar not found | Check calendarId, user alert |
| 409 | Conflict (duplicate requestId) | Return existing event |
| 429 | Rate limited | Retry with exponential backoff |
| 500 | Server error | Retry with exponential backoff |

---

## Implementation in CalendarToolClient

```typescript
class CalendarToolClient {
  async createEvent(
    request: CreateEventRequest,
    options?: { timeout?: number; retries?: number }
  ): Promise<CreateEventResponse> {
    const operationId = generateUUID();
    const toolInvocationId = generateUUID();
    const requestId = options?.idempotencyKey || generateUUID();
    
    try {
      // 1. Validate input
      this.validateCreateEventRequest(request);
      
      // 2. Prepare request body
      const eventBody = {
        summary: request.summary,
        ...(request.description && { description: request.description }),
        ...(request.location && { location: request.location }),
        start: request.start,
        end: request.end,
        ...(request.attendees && { attendees: request.attendees }),
        ...(request.conferenceData && {
          conferenceData: {
            ...request.conferenceData,
            requestId: request.conferenceData.requestId || requestId
          }
        }),
        ...(request.reminders && { reminders: request.reminders }),
        ...(request.transparency && { transparency: request.transparency }),
        ...(request.visibility && { visibility: request.visibility }),
        ...(request.colorId && { colorId: request.colorId }),
        ...(request.recurrence && { recurrence: request.recurrence }),
        guestsCanInviteOthers: request.guestsCanInviteOthers ?? true,
        guestsCanModify: request.guestsCanModify ?? false,
        guestsCanSeeGuests: request.guestsCanSeeGuests ?? true
      };
      
      // 3. Call Google Calendar API
      const startTime = Date.now();
      const response = await this.callGoogleAPI(
        `https://www.googleapis.com/calendar/v3/calendars/${request.calendarId}/events?conferenceDataVersion=1`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await this.getOAuthToken()}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(eventBody),
          timeout: options?.timeout || 10000,
          retries: options?.retries || 3
        }
      );
      const latency = Date.now() - startTime;
      
      // 4. Log success
      this.log('Tool invocation success', {
        operationId,
        toolInvocationId,
        tool: 'google-calendar-mcp',
        operation: 'create_event',
        eventId: response.id,
        summary: request.summary,
        latency,
        status: 'success'
      });
      
      return response;
      
    } catch (error) {
      // Error handling
      this.log('Tool invocation failed', {
        operationId,
        toolInvocationId,
        tool: 'google-calendar-mcp',
        operation: 'create_event',
        status: 'error',
        errorMessage: error.message,
        errorType: error.constructor.name
      });
      
      throw new ToolInvocationError('google-calendar-mcp', 'create_event', error);
    }
  }
  
  private validateCreateEventRequest(req: CreateEventRequest): void {
    if (!req.calendarId) {
      throw new Error('calendarId is required');
    }
    
    if (!req.summary || req.summary.trim().length === 0) {
      throw new Error('summary (event title) is required');
    }
    
    if (!req.start || (!req.start.dateTime && !req.start.date)) {
      throw new Error('start.dateTime or start.date is required');
    }
    
    if (!req.end || (!req.end.dateTime && !req.end.date)) {
      throw new Error('end.dateTime or end.date is required');
    }
    
    // Validate date/datetime format
    if (req.start.dateTime && !this.isValidRFC3339(req.start.dateTime)) {
      throw new Error(`Invalid start.dateTime format: ${req.start.dateTime}`);
    }
    
    if (req.end.dateTime && !this.isValidRFC3339(req.end.dateTime)) {
      throw new Error(`Invalid end.dateTime format: ${req.end.dateTime}`);
    }
    
    // Validate start < end
    const startTime = new Date(req.start.dateTime || req.start.date);
    const endTime = new Date(req.end.dateTime || req.end.date);
    if (startTime >= endTime) {
      throw new Error('Event start time must be before end time');
    }
    
    // Validate reminders
    if (req.reminders?.overrides) {
      for (const override of req.reminders.overrides) {
        if (override.minutes < 0 || override.minutes > 40320) {
          throw new Error('Reminder minutes must be between 0 and 40320');
        }
      }
    }
  }
  
  private isValidRFC3339(dateString: string): boolean {
    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime()) && dateString.includes('T');
    } catch {
      return false;
    }
  }
}
```

---

## Use Cases

### 1. Task Creation from Travel Booking

**Trigger:** User books a flight → create prep task

**Request:**
```json
{
  "calendarId": "primary",
  "summary": "Book Paris flights",
  "description": "Selected flight: BA112 departing 08:00 on May 10. Deadline: complete booking within 24 hours.",
  "start": { "dateTime": "2025-05-09T17:00:00-07:00" },
  "end": { "dateTime": "2025-05-09T18:00:00-07:00" },
  "reminders": {
    "overrides": [
      { "method": "email", "minutes": 1440 },
      { "method": "popup", "minutes": 30 }
    ]
  },
  "transparency": "opaque"
}
```

**Response:**
```json
{
  "id": "evt_booking_001",
  "summary": "Book Paris flights",
  "start": { "dateTime": "2025-05-09T17:00:00-07:00" },
  "end": { "dateTime": "2025-05-09T18:00:00-07:00" },
  "htmlLink": "https://www.google.com/calendar/event?eid=evt_booking_001",
  "created": "2025-05-08T14:30:00.000Z"
}
```

### 2. Create Meeting with Attendees

**Trigger:** Daily planner suggests scheduling a team sync

**Request:**
```json
{
  "calendarId": "primary",
  "summary": "Team sync: Q2 roadmap discussion",
  "location": "Conference Room A",
  "start": {
    "dateTime": "2025-05-13T10:00:00-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2025-05-13T11:00:00-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "attendees": [
    { "email": "alice@example.com", "displayName": "Alice Chen", "optional": false },
    { "email": "bob@example.com", "displayName": "Bob Smith", "optional": false }
  ],
  "conferenceData": {
    "conferenceSolution": { "key": { "type": "hangoutsMeet" } }
  },
  "reminders": {
    "overrides": [
      { "method": "popup", "minutes": 15 }
    ]
  }
}
```

### 3. All-Day Travel Event

**Trigger:** Flight booked → create travel event

**Request:**
```json
{
  "calendarId": "primary",
  "summary": "Paris trip (travel days)",
  "description": "Traveling to Paris for quarterly review. Depart May 15, return May 20.",
  "location": "Paris, France",
  "start": { "date": "2025-05-15" },
  "end": { "date": "2025-05-20" },
  "transparency": "transparent",
  "visibility": "public"
}
```

### 4. Recurring Meeting (Weekly Standup)

**Trigger:** Create repeating task extraction event

**Request:**
```json
{
  "calendarId": "primary",
  "summary": "Weekly team standup",
  "start": {
    "dateTime": "2025-05-12T09:00:00Z",
    "timeZone": "UTC"
  },
  "end": {
    "dateTime": "2025-05-12T09:30:00Z",
    "timeZone": "UTC"
  },
  "recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]
}
```

---

## Error Scenarios

### 1. Invalid Date Range

**Request:**
```json
{
  "calendarId": "primary",
  "summary": "Meeting",
  "start": { "dateTime": "2025-05-10T14:00:00Z" },
  "end": { "dateTime": "2025-05-10T13:00:00Z" }
}
```

**Error (400):**
```json
{
  "error": {
    "code": 400,
    "message": "The end time must be after the start time."
  }
}
```

**Handling:**
```typescript
catch (error) {
  if (error.response?.status === 400 && error.response?.data?.error?.message?.includes('end time')) {
    throw new ValidationError('Event end time must be after start time');
  }
}
```

### 2. Duplicate Event (Idempotency)

**Request (retried with same requestId):**
```json
{
  "summary": "Team meeting",
  "start": { "dateTime": "2025-05-13T10:00:00Z" },
  "end": { "dateTime": "2025-05-13T11:00:00Z" },
  "conferenceData": {
    "requestId": "same-uuid-as-before"
  }
}
```

**Response (409 or 200):** Google deduplicates by `requestId`; returns existing event if already created.

**Handling:**
```typescript
// Use requestId for idempotency
const requestId = generateUUID();
const conferenceData = {
  requestId: requestId,
  conferenceSolution: { key: { type: "hangoutsMeet" } }
};

// If retry with same requestId, API returns 200 with existing event
const response = await createEvent({ ...request, conferenceData });
// Safe to retry without creating duplicate
```

### 3. No Write Access

**Response (403):**
```json
{
  "error": {
    "code": 403,
    "message": "The caller does not have permission"
  }
}
```

**Handling:**
```typescript
catch (error) {
  if (error.response?.status === 403) {
    throw new PermissionError('You do not have write access to this calendar');
  }
}
```

### 4. Invalid Attendee Email

**Request:**
```json
{
  "attendees": [
    { "email": "not-an-email" }
  ]
}
```

**Error (400):**
```json
{
  "error": {
    "code": 400,
    "message": "Invalid email address"
  }
}
```

**Handling:**
```typescript
for (const attendee of request.attendees || []) {
  if (!isValidEmail(attendee.email)) {
    throw new ValidationError(`Invalid email: ${attendee.email}`);
  }
}
```

---

## Idempotency & Deduplication

Use `conferenceData.requestId` for idempotent event creation:

```typescript
// Always generate/use same requestId for same logical event
const eventSignature = `${request.summary}:${request.start.dateTime}`;
const requestId = hashString(eventSignature);

const response = await createEvent({
  ...request,
  conferenceData: {
    requestId: requestId,
    conferenceSolution: { key: { type: "hangoutsMeet" } }
  }
});

// Safe to retry: if event already exists, API returns 200 with existing event
```

---

## Performance Notes

- **Latency:** 300–600ms (includes Google Meet setup if `conferenceData` requested)
- **Timeout:** 10 seconds
- **Rate limits:** Google Calendar API ~1000 calls/day per user
- **Attendee limit:** Typical ~500 attendees per event

---

## Integration Points

1. **Input source:** `TaskManagementDO` (create prep tasks), `TravelWorkflowDO` (create travel events), `DailyPlannerWorker` (create blocked time)
2. **Caller:** `CalendarToolClient.createEvent()`
3. **Output consumed by:** Google Calendar UI, email notifications to attendees
4. **Fallback:** If creation fails, log error and alert user via Realtime

---

## Examples

### Example 1: Simple Task Reminder

**Request:**
```json
{
  "calendarId": "primary",
  "summary": "Review proposal draft",
  "description": "Deadline Friday 5pm. Focus areas: pricing, competitive analysis.",
  "start": { "dateTime": "2025-05-09T17:00:00-07:00" },
  "end": { "dateTime": "2025-05-09T18:00:00-07:00" },
  "reminders": { "useDefault": true }
}
```

**Response:**
```json
{
  "id": "evt_task_001",
  "summary": "Review proposal draft",
  "created": "2025-05-08T10:00:00Z",
  "htmlLink": "https://www.google.com/calendar/event?eid=evt_task_001"
}
```

### Example 2: Meeting with Google Meet

**Request:**
```json
{
  "calendarId": "primary",
  "summary": "Sprint planning",
  "start": { "dateTime": "2025-05-12T09:00:00Z" },
  "end": { "dateTime": "2025-05-12T10:30:00Z" },
  "attendees": [
    { "email": "team@example.com" }
  ],
  "conferenceData": {
    "conferenceSolution": { "key": { "type": "hangoutsMeet" } }
  }
}
```

**Response:**
```json
{
  "id": "evt_meeting_001",
  "conferenceData": {
    "entryPoints": [
      {
        "uri": "https://meet.google.com/abc-defg-hij",
        "entryPointType": "video",
        "label": "Google Meet"
      }
    ]
  },
  "htmlLink": "https://www.google.com/calendar/event?eid=evt_meeting_001"
}
```

---
