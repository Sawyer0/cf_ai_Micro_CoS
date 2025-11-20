# Google Calendar MCP: Get FreeBusy Tool

## Overview

**MCP:** google-calendar-mcp (nspady)  
**Operation:** `get-freebusy`  
**Purpose:** Check availability across multiple calendars to find free/busy time slots  
**Caller:** `DailyPlannerWorker`, `CalendarToolClient`, meeting scheduling logic  
**Triggered by:** Finding meeting times, blocking focus time, detecting scheduling conflicts  

---

## API Specification

### Request

```typescript
interface GetFreeBusyRequest {
  timeMin: string;              // RFC3339, e.g., "2025-05-12T00:00:00Z"
  timeMax: string;              // RFC3339, e.g., "2025-05-14T23:59:59Z"
  items: {
    id: string;                 // Calendar ID or email
  }[];
  groupExpansionMax?: number;   // Max group members to expand (default 50)
  calendarExpansionMax?: number;// Max secondary calendars to check (default 50)
}
```

### Response

```typescript
interface GetFreeBusyResponse {
  kind: "calendar#freeBusy";
  timeMin: string;              // RFC3339
  timeMax: string;              // RFC3339
  calendars: {
    [calendarId: string]: {
      busy: TimeBlock[];        // Times when busy (opaque events)
      tentative?: TimeBlock[];  // Times when tentatively booked
      error?: {
        domain: string;
        reason: string;
        message: string;
      };
    };
  };
}

interface TimeBlock {
  start: string;                // RFC3339
  end: string;                  // RFC3339
}
```

---

## HTTP Call Details

### Endpoint

```
POST https://www.googleapis.com/calendar/v3/freeBusy
```

### Headers

```
Authorization: Bearer {GOOGLE_OAUTH_TOKEN}
Content-Type: application/json
Accept: application/json
```

### Request Body

```json
{
  "timeMin": "2025-05-12T00:00:00Z",
  "timeMax": "2025-05-14T23:59:59Z",
  "items": [
    { "id": "primary" },
    { "id": "alice@example.com" },
    { "id": "work@example.com" }
  ]
}
```

### Response Status Codes

| Code | Meaning | Handling |
|------|---------|----------|
| 200 | OK, availability returned | Parse busy/tentative blocks |
| 400 | Bad request (invalid time range) | Log error, validate dates |
| 401 | Unauthorized (invalid/expired token) | Refresh OAuth token, retry |
| 403 | Forbidden (no access to calendar) | Skip calendar, continue with others |
| 404 | Calendar not found | Mark as unavailable |
| 429 | Rate limited | Retry with exponential backoff |
| 500 | Server error | Retry with exponential backoff |

---

## Implementation in CalendarToolClient

```typescript
class CalendarToolClient {
  async getFreeBusy(
    request: GetFreeBusyRequest,
    options?: { timeout?: number; retries?: number }
  ): Promise<GetFreeBusyResponse> {
    const operationId = generateUUID();
    const toolInvocationId = generateUUID();
    
    try {
      // 1. Validate input
      this.validateFreeBusyRequest(request);
      
      // 2. Prepare request body
      const requestBody = {
        timeMin: request.timeMin,
        timeMax: request.timeMax,
        items: request.items,
        groupExpansionMax: request.groupExpansionMax || 50,
        calendarExpansionMax: request.calendarExpansionMax || 50
      };
      
      // 3. Call Google Calendar API
      const startTime = Date.now();
      const response = await this.callGoogleAPI(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await this.getOAuthToken()}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody),
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
        operation: 'get_freebusy',
        calendarCount: request.items.length,
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
        operation: 'get_freebusy',
        status: 'error',
        errorMessage: error.message,
        errorType: error.constructor.name
      });
      
      throw new ToolInvocationError('google-calendar-mcp', 'get_freebusy', error);
    }
  }
  
  private validateFreeBusyRequest(req: GetFreeBusyRequest): void {
    if (!req.timeMin || !this.isValidRFC3339(req.timeMin)) {
      throw new Error('timeMin is required and must be RFC3339 format');
    }
    
    if (!req.timeMax || !this.isValidRFC3339(req.timeMax)) {
      throw new Error('timeMax is required and must be RFC3339 format');
    }
    
    const minTime = new Date(req.timeMin);
    const maxTime = new Date(req.timeMax);
    if (minTime >= maxTime) {
      throw new Error('timeMin must be before timeMax');
    }
    
    if (!req.items || req.items.length === 0) {
      throw new Error('items array is required and must have at least 1 calendar');
    }
    
    if (req.items.length > 50) {
      throw new Error('Cannot check more than 50 calendars in one request');
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

## Finding Available Time Slots

**Helper function to extract free slots:**

```typescript
interface FreeSlot {
  start: string;
  end: string;
  duration_minutes: number;
}

function findFreeSlots(
  freeBusyResponse: GetFreeBusyResponse,
  requiredDuration: number = 30, // minutes
  userTimezone?: string
): FreeSlot[] {
  const freeSlots: FreeSlot[] = [];
  
  const timeMin = new Date(freeBusyResponse.timeMin);
  const timeMax = new Date(freeBusyResponse.timeMax);
  
  // Merge all busy times from all calendars
  const allBusyTimes: TimeBlock[] = [];
  for (const [calendarId, availability] of Object.entries(freeBusyResponse.calendars)) {
    if (availability.busy) {
      allBusyTimes.push(...availability.busy);
    }
    if (availability.tentative) {
      allBusyTimes.push(...availability.tentative);
    }
  }
  
  // Sort busy times by start
  allBusyTimes.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  
  // Merge overlapping busy times
  const mergedBusyTimes: TimeBlock[] = [];
  for (const busy of allBusyTimes) {
    if (mergedBusyTimes.length === 0) {
      mergedBusyTimes.push(busy);
    } else {
      const last = mergedBusyTimes[mergedBusyTimes.length - 1];
      const lastEnd = new Date(last.end).getTime();
      const currentStart = new Date(busy.start).getTime();
      
      if (currentStart <= lastEnd) {
        // Overlapping: merge
        last.end = new Date(Math.max(
          lastEnd,
          new Date(busy.end).getTime()
        )).toISOString();
      } else {
        // Gap found: add free slot
        const slotStart = new Date(lastEnd);
        const slotEnd = new Date(currentStart);
        const durationMs = slotEnd.getTime() - slotStart.getTime();
        const durationMinutes = durationMs / (1000 * 60);
        
        if (durationMinutes >= requiredDuration) {
          freeSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            duration_minutes: durationMinutes
          });
        }
        
        mergedBusyTimes.push(busy);
      }
    }
  }
  
  // Check gap after last busy time
  if (mergedBusyTimes.length > 0) {
    const lastBusy = mergedBusyTimes[mergedBusyTimes.length - 1];
    const slotStart = new Date(lastBusy.end);
    const slotEnd = timeMax;
    const durationMs = slotEnd.getTime() - slotStart.getTime();
    const durationMinutes = durationMs / (1000 * 60);
    
    if (durationMinutes >= requiredDuration && slotStart < slotEnd) {
      freeSlots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        duration_minutes: durationMinutes
      });
    }
  } else {
    // No busy times: entire range is free
    const durationMs = timeMax.getTime() - timeMin.getTime();
    const durationMinutes = durationMs / (1000 * 60);
    
    if (durationMinutes >= requiredDuration) {
      freeSlots.push({
        start: timeMin.toISOString(),
        end: timeMax.toISOString(),
        duration_minutes: durationMinutes
      });
    }
  }
  
  return freeSlots;
}
```

---

## Use Cases

### 1. Daily Planner: Find Focus Time

**Trigger:** Daily planner needs to find available focus blocks

**Request:**
```json
{
  "timeMin": "2025-05-12T08:00:00Z",
  "timeMax": "2025-05-12T18:00:00Z",
  "items": [
    { "id": "primary" }
  ]
}
```

**Response:**
```json
{
  "kind": "calendar#freeBusy",
  "timeMin": "2025-05-12T08:00:00Z",
  "timeMax": "2025-05-12T18:00:00Z",
  "calendars": {
    "primary": {
      "busy": [
        { "start": "2025-05-12T09:00:00Z", "end": "2025-05-12T10:00:00Z" },
        { "start": "2025-05-12T14:00:00Z", "end": "2025-05-12T15:00:00Z" }
      ]
    }
  }
}
```

**Interpretation:** Free blocks: 08:00–09:00, 10:00–14:00, 15:00–18:00

### 2. Schedule Meeting with Attendees

**Trigger:** Find time that works for multiple people

**Request:**
```json
{
  "timeMin": "2025-05-12T00:00:00Z",
  "timeMax": "2025-05-16T23:59:59Z",
  "items": [
    { "id": "primary" },
    { "id": "alice@example.com" },
    { "id": "bob@example.com" },
    { "id": "work@example.com" }
  ]
}
```

**Response:**
```json
{
  "calendars": {
    "primary": {
      "busy": [
        { "start": "2025-05-12T09:00:00Z", "end": "2025-05-12T10:00:00Z" },
        { "start": "2025-05-13T14:00:00Z", "end": "2025-05-13T15:00:00Z" }
      ]
    },
    "alice@example.com": {
      "busy": [
        { "start": "2025-05-12T08:30:00Z", "end": "2025-05-12T09:30:00Z" },
        { "start": "2025-05-13T10:00:00Z", "end": "2025-05-13T11:00:00Z" }
      ]
    },
    "bob@example.com": {
      "busy": [
        { "start": "2025-05-14T09:00:00Z", "end": "2025-05-14T10:30:00Z" }
      ]
    },
    "work@example.com": {
      "busy": [
        { "start": "2025-05-12T08:00:00Z", "end": "2025-05-12T17:00:00Z" }
      ]
    }
  }
}
```

**Common free slots:** May 13, 11:00–14:00, 15:00–17:00 (free on all)

### 3. Check Availability (Single Calendar)

**Trigger:** Check if user is free for focus work tomorrow

**Request:**
```json
{
  "timeMin": "2025-05-13T09:00:00Z",
  "timeMax": "2025-05-13T17:00:00Z",
  "items": [
    { "id": "primary" }
  ]
}
```

---

## Error Scenarios

### 1. Invalid Time Range

**Request:**
```json
{
  "timeMin": "2025-05-14T00:00:00Z",
  "timeMax": "2025-05-12T23:59:59Z"
}
```

**Error (400):**
```json
{
  "error": {
    "code": 400,
    "message": "Invalid time range: start time must be before end time"
  }
}
```

**Handling:**
```typescript
if (new Date(request.timeMin) >= new Date(request.timeMax)) {
  throw new ValidationError('Start time must be before end time');
}
```

### 2. Calendar Not Accessible

**Response (200, but with error in calendar entry):**
```json
{
  "calendars": {
    "private@example.com": {
      "error": {
        "domain": "calendar",
        "reason": "forbidden",
        "message": "Access denied"
      }
    }
  }
}
```

**Handling:**
```typescript
for (const [calendarId, data] of Object.entries(response.calendars)) {
  if (data.error) {
    this.log('Calendar access denied', {
      calendarId,
      reason: data.error.reason
    });
    // Continue with other calendars
  }
}
```

### 3. Expired OAuth Token

**Response (401):**
```json
{
  "error": {
    "code": 401,
    "message": "Invalid Credentials"
  }
}
```

**Handling:**
```typescript
catch (error) {
  if (error.response?.status === 401) {
    await this.refreshOAuthToken();
    return this.getFreeBusy(request, options); // Retry
  }
}
```

---

## Performance Notes

- **Latency:** 200–500ms (combines multiple calendars)
- **Time range limit:** Up to ~365 days in one request
- **Calendar limit:** 50 calendars per request
- **Timeout:** 10 seconds
- **Rate limits:** Google Calendar API ~1000 calls/day per user
- **Caching:** Safe to cache for 5–10 minutes (availability changes infrequently)

---

## Integration Points

1. **Input source:** Daily planner worker, meeting scheduling logic
2. **Caller:** `DailyPlannerWorker.generatePlan()`, scheduling recommendations
3. **Output consumed by:** Time block suggestion, focus time allocation, meeting time finder
4. **Fallback:** If availability check fails, assume all time is available (conservative)

---

## Caching Strategy

```typescript
// Cache key: freebusy:{calendars_hash}:{timeMin}:{timeMax}
const calendarIds = request.items.map(i => i.id).sort().join(',');
const cacheKey = `freebusy:${hashString(calendarIds)}:${request.timeMin}:${request.timeMax}`;

// Cache for 5–10 minutes (availability can change frequently)
const CACHE_TTL = 5 * 60; // seconds

// Invalidate on:
// - Explicit user refresh
// - New calendar event created
// - Time range no longer relevant (past dates)
```

---

## Examples

### Example 1: Find Free Time for 30-Min Meeting

**Request:**
```json
{
  "timeMin": "2025-05-12T08:00:00Z",
  "timeMax": "2025-05-12T18:00:00Z",
  "items": [
    { "id": "primary" },
    { "id": "alice@example.com" }
  ]
}
```

**Response:**
```json
{
  "calendars": {
    "primary": {
      "busy": [
        { "start": "2025-05-12T09:00:00Z", "end": "2025-05-12T10:00:00Z" },
        { "start": "2025-05-12T14:00:00Z", "end": "2025-05-12T15:00:00Z" }
      ]
    },
    "alice@example.com": {
      "busy": [
        { "start": "2025-05-12T10:00:00Z", "end": "2025-05-12T11:00:00Z" },
        { "start": "2025-05-12T15:30:00Z", "end": "2025-05-12T16:30:00Z" }
      ]
    }
  }
}
```

**Free Slots (30+ minutes):**
- 08:00–09:00 (60 min)
- 11:00–14:00 (180 min)
- 15:00–15:30 (insufficient)
- 16:30–18:00 (90 min)

**Best options:** 11:00–14:00 window, or 08:00–09:00, or 16:30–18:00

### Example 2: Check Availability for Focus Day

**Request:**
```json
{
  "timeMin": "2025-05-15T09:00:00Z",
  "timeMax": "2025-05-15T17:00:00Z",
  "items": [
    { "id": "primary" }
  ]
}
```

**Response (completely free):**
```json
{
  "calendars": {
    "primary": {
      "busy": []
    }
  }
}
```

**Interpretation:** Entire day is available for focus work.

---
