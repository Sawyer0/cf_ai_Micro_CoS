# Google Calendar MCP: List Events Tool

## Overview

**MCP:** google-calendar-mcp (nspady)
**Operation:** `list-events`
**Purpose:** Fetch calendar events within a date range for travel detection
**Caller:** `CalendarToolClient` Worker
**Triggered by:** Periodic polling or on-demand by TravelEventDetector DO

---

## API Specification

### Request

```typescript
interface ListEventsRequest {
  calendarId?: string;               // Default: 'primary' (user's main calendar)
  timeMin?: string;                  // ISO 8601 (inclusive)
  timeMax?: string;                  // ISO 8601 (exclusive)
  maxResults?: number;               // Default: 25, max: 2500
  orderBy?: 'startTime' | 'updated'; // Default: 'updated'
  showDeleted?: boolean;             // Include deleted events
  singleEvents?: boolean;            // Expand recurring events
}
```

### Response

```typescript
interface ListEventsResponse {
  items: CalendarEvent[];
}

interface CalendarEvent {
  kind: 'calendar#event';
  etag: string;
  id: string;                        // Event ID
  status: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink: string;                  // Link to event in Google Calendar
  created: string;                   // ISO 8601
  updated: string;                   // ISO 8601
  summary: string;                   // Event title
  description?: string;
  location?: string;
  creator: {
    email: string;
    displayName?: string;
  };
  organizer: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  start: {
    dateTime?: string;               // ISO 8601 (all-day: date only)
    timeZone?: string;
    date?: string;                   // YYYY-MM-DD (all-day events)
  };
  end: {
    dateTime?: string;
    timeZone?: string;
    date?: string;
  };
  endTimeUnspecified?: boolean;
  recurrence?: string[];             // RRULE format
  recurringEventId?: string;         // If part of recurring series
  originalStartTime?: string;        // For modified instances
  transparency?: 'opaque' | 'transparent'; // Busy/free status
  visibility?: 'public' | 'private' | 'confidential';
  iCalUID?: string;
  sequence?: number;
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
    organizer?: boolean;
    self?: boolean;
    resource?: boolean;
  }[];
  hangoutLink?: string;
  conferenceData?: {
    entryPoints: {
      entryPointType: 'video' | 'phone' | 'more';
      uri: string;
      label?: string;
    }[];
    conferenceSolution: {
      key: { type: string };
      name: string;
      iconUri: string;
    };
    conferenceId?: string;
  };
  reminders?: {
    useDefault?: boolean;
    overrides?: {
      method: 'email' | 'notification' | 'popup';
      minutes: number;
    }[];
  };
  source?: {
    title: string;
    url: string;
  };
  attachments?: {
    fileUrl: string;
    title?: string;
    mimeType?: string;
    iconLink?: string;
    displayLink?: string;
    fileId?: string;
  }[];
}
```

---

## HTTP Call Details

### Endpoint

```
GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
```

### Headers

```
Authorization: Bearer {GOOGLE_ACCESS_TOKEN}
Accept: application/json
```

### Query Parameters

```
?timeMin=2025-05-01T00:00:00Z
&timeMax=2025-05-31T23:59:59Z
&maxResults=100
&singleEvents=true
&orderBy=startTime
```

### Response Status Codes

| Code | Meaning | Handling |
| --- | --- | --- |
| 200 | OK, events returned | Parse and normalize |
| 401 | Unauthorized | Refresh OAuth token, retry |
| 403 | Forbidden | User not authorized, skip |
| 404 | Not found | Calendar doesn't exist, skip |
| 410 | Gone | Calendar deleted, skip |
| 500 | Server error | Retry with backoff |

---

## Implementation in CalendarToolClient

```typescript
class CalendarToolClient {
  async listEvents(
    request: ListEventsRequest,
    options?: { timeout?: number; retries?: number }
  ): Promise<CalendarEvent[]> {
    const operationId = generateUUID();
    const toolInvocationId = generateUUID();
    
    try {
      // 1. Validate input
      this.validateRequest(request);
      
      // 2. Check cache
      const cacheKey = this.buildCacheKey(request);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.log('Tool cache hit', { operationId, tool: 'calendar-mcp', cacheKey });
        return cached;
      }
      
      // 3. Refresh token if needed
      await this.ensureValidToken();
      
      // 4. Call Google Calendar API
      const startTime = Date.now();
      const response = await this.callGoogleCalendarAPI(request, {
        timeout: options?.timeout || 5000,
        retries: options?.retries || 2
      });
      const latency = Date.now() - startTime;
      
      // 5. Normalize response
      const normalized = this.normalizeEvents(response.items || []);
      
      // 6. Cache for 5 minutes (events relatively static)
      await this.cache.set(cacheKey, normalized, 300);
      
      // 7. Log success
      this.log('Tool invocation success', {
        operationId,
        toolInvocationId,
        tool: 'calendar-mcp',
        operation: 'list_events',
        latency,
        resultCount: normalized.length,
        status: 'success'
      });
      
      return normalized;
      
    } catch (error) {
      // Error handling
      if (error.status === 401) {
        // Token expired, refresh and retry
        await this.refreshOAuthToken();
        return this.listEvents(request, options); // Recursive retry
      }
      
      this.log('Tool invocation failed', {
        operationId,
        toolInvocationId,
        tool: 'calendar-mcp',
        status: 'error',
        errorMessage: error.message
      });
      
      throw new ToolInvocationError('calendar-mcp', 'list_events', error);
    }
  }
  
  private validateRequest(req: ListEventsRequest): void {
    if (req.timeMin && !this.isValidISO8601(req.timeMin)) {
      throw new Error(`Invalid timeMin: ${req.timeMin}`);
    }
    
    if (req.timeMax && !this.isValidISO8601(req.timeMax)) {
      throw new Error(`Invalid timeMax: ${req.timeMax}`);
    }
    
    if (req.timeMin && req.timeMax && req.timeMin >= req.timeMax) {
      throw new Error('timeMin must be before timeMax');
    }
  }
  
  private normalizeEvents(items: CalendarEvent[]): CalendarEvent[] {
    return items
      .filter(item => item.status !== 'cancelled') // Skip cancelled events
      .map(item => ({
        id: item.id,
        summary: item.summary,
        description: item.description,
        location: item.location,
        start: item.start,
        end: item.end,
        startTime: this.getStartDateTime(item),
        endTime: this.getEndDateTime(item),
        created: item.created,
        updated: item.updated,
        recurrence: item.recurrence,
        transparency: item.transparency,
        attendees: item.attendees || []
      }));
  }
  
  private getStartDateTime(event: CalendarEvent): Date {
    const dateStr = event.start?.dateTime || event.start?.date;
    return dateStr ? new Date(dateStr) : null;
  }
  
  private getEndDateTime(event: CalendarEvent): Date {
    const dateStr = event.end?.dateTime || event.end?.date;
    return dateStr ? new Date(dateStr) : null;
  }
  
  private async ensureValidToken(): Promise<void> {
    const tokenData = await this.getStoredToken();
    
    if (!tokenData) {
      throw new Error('No OAuth token found');
    }
    
    const now = Date.now();
    const expiresAt = new Date(tokenData.expiry_date).getTime();
    const bufferMs = 5 * 60 * 1000; // 5 min buffer
    
    if (now + bufferMs >= expiresAt) {
      // Token expiring soon, refresh
      await this.refreshOAuthToken();
    }
  }
  
  private async refreshOAuthToken(): Promise<void> {
    // Use Google OAuth refresh endpoint
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      })
    });
    
    const data = await response.json();
    this.accessToken = data.access_token;
    
    // Store new token
    await this.storeToken({
      access_token: data.access_token,
      expiry_date: new Date(Date.now() + data.expires_in * 1000).toISOString()
    });
    
    this.log('OAuth token refreshed', {
      tool: 'calendar-mcp',
      timestamp: new Date().toISOString()
    });
  }
}
```

---

## Travel Event Detection from Calendar

```typescript
// In TravelEventDetectorDO
async detectTravelEventsFromCalendar(): Promise<TravelEvent[]> {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  // 1. Fetch calendar events
  const events = await this.calendarClient.listEvents({
    timeMin: now.toISOString(),
    timeMax: thirtyDaysFromNow.toISOString(),
    maxResults: 100,
    singleEvents: true
  });
  
  const travelEvents: TravelEvent[] = [];
  
  for (const event of events) {
    // 2. Detect travel keywords in title/description
    const destination = this.extractDestination(event.summary, event.description);
    
    if (destination && this.isTravelEvent(event)) {
      const confidence = this.calculateConfidence(event);
      
      if (confidence > 0.7) { // Only trigger if high confidence
        travelEvents.push({
          event_id: event.id,
          user_id: this.state.userId,
          title: event.summary,
          destination_city: destination,
          start_date: this.getStartDateTime(event),
          end_date: this.getEndDateTime(event),
          confidence: confidence,
          location: event.location,
          description: event.description
        });
      }
    }
  }
  
  return travelEvents;
}

private extractDestination(title: string, description: string): string | null {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  // List of major cities + common travel keywords
  const cityPatterns = [
    /paris|cdg|orly/gi,
    /london|lhr|gatwick|stansted/gi,
    /tokyo|narita|haneda/gi,
    /dubai|dxb/gi,
    // ... add more cities as needed
  ];
  
  for (const pattern of cityPatterns) {
    if (pattern.test(text)) {
      return this.mapToIATACode(pattern.source);
    }
  }
  
  return null;
}

private isTravelEvent(event: CalendarEvent): boolean {
  const keywords = ['trip', 'travel', 'flight', 'airport', 'hotel', 'conference', 'summit'];
  const text = `${event.summary} ${event.description || ''}`.toLowerCase();
  
  return keywords.some(keyword => text.includes(keyword));
}

private calculateConfidence(event: CalendarEvent): number {
  let confidence = 0.5;
  
  // Boost confidence based on:
  // - Event duration (multi-day = more likely travel)
  if (event.endTime && event.startTime) {
    const durationDays = (event.endTime.getTime() - event.startTime.getTime()) / (24 * 60 * 60 * 1000);
    if (durationDays > 1) confidence += 0.2;
  }
  
  // - Location specified
  if (event.location) confidence += 0.15;
  
  // - Description contains travel details
  if (event.description?.length > 100) confidence += 0.1;
  
  // Cap at 1.0
  return Math.min(confidence, 1.0);
}
```

---

## Error Scenarios

### 1. OAuth Token Expired

**Response (401):**
```json
{
  "error": {
    "code": 401,
    "message": "Invalid Credentials",
    "errors": [
      {
        "domain": "global",
        "reason": "authError",
        "message": "Invalid Credentials"
      }
    ]
  }
}
```

**Handling:**
```typescript
if (error.status === 401) {
  this.log('Token expired, refreshing', { tool: 'calendar-mcp' });
  await this.refreshOAuthToken();
  return this.listEvents(request, options); // Retry
}
```

### 2. Calendar Not Found

**Response (404):**
```json
{
  "error": {
    "code": 404,
    "message": "Not Found"
  }
}
```

**Handling:**
```typescript
if (error.status === 404) {
  this.log('Calendar not found, skipping', {
    calendarId: request.calendarId
  });
  return []; // Return empty array
}
```

### 3. Insufficient Permissions

**Response (403):**
```json
{
  "error": {
    "code": 403,
    "message": "The user has not granted the app permission to access Google Calendar"
  }
}
```

**Handling:**
```typescript
if (error.status === 403) {
  throw new UserError('Please re-authorize Google Calendar access in settings.');
}
```

---

## Caching Strategy

```typescript
// Cache key: calendar:{calendarId}:{dateRange}
const cacheKey = `calendar:${request.calendarId || 'primary'}:${request.timeMin}:${request.timeMax}`;

// Cache for 5 minutes (events are relatively static, but changes happen)
const CACHE_TTL = 5 * 60; // seconds

// Invalidate on:
// - User creates/updates/deletes event (webhook)
// - Explicit user refresh request
// - Cache.delete() by TravelEventDetectorDO
```

---

## Performance Notes

- **Latency:** 200-400ms (Google Calendar API)
- **Max results:** 2500 per page (pagination supported)
- **Timeout:** 5 seconds (Worker timeout)
- **Cost:** Free (Google Calendar API is free tier)

---

## Examples

### Example 1: Fetch Next 30 Days of Events

**Request:**
```json
{
  "timeMin": "2025-01-20T00:00:00Z",
  "timeMax": "2025-02-20T23:59:59Z",
  "maxResults": 100,
  "singleEvents": true,
  "orderBy": "startTime"
}
```

**Response (partial):**
```json
{
  "items": [
    {
      "id": "abc123",
      "summary": "Paris business trip",
      "description": "Meeting with Acme Corp in Paris, May 10-15",
      "location": "Paris, France",
      "start": {
        "dateTime": "2025-05-10T08:00:00Z",
        "timeZone": "Europe/Paris"
      },
      "end": {
        "dateTime": "2025-05-15T18:00:00Z",
        "timeZone": "Europe/Paris"
      }
    }
  ]
}
```

### Example 2: Detect Travel Event

**Event:**
```
Title: "Trip to Tokyo"
Date: May 20-25, 2025
Description: "Conference + sightseeing"
Location: "Tokyo, Japan"
```

**Detection:**
```
Destination extracted: "Tokyo" → IATA: "TYO"
Confidence: 0.95 (multi-day, location, keywords)
→ Triggers TravelWorkflow
→ FlightToolClient.searchFlights(SFO → NRT, May 20)
```

---
