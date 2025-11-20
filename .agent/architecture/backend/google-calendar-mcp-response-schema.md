# Google Calendar MCP Response Schema

## Overview

This document defines the response schemas returned by the Google Calendar MCP when invoking tools. All responses follow the Google Calendar API v3 format, normalized through the MCP wrapper.

---

## Tool Response Schemas

### 1. list-events Response

**MCP Tool:** `list-events`  
**Google API:** `GET /calendar/v3/calendars/{calendarId}/events`  
**Description:** Returns a paginated list of events from a calendar.

#### Response Structure

```json
{
  "kind": "calendar",
  "etag": "p32gfjp8q8f4g8==",
  "summary": "Primary Calendar",
  "description": "Calendar for user@example.com",
  "updated": "2025-05-10T08:30:00.000Z",
  "timeZone": "America/Los_Angeles",
  "accessRole": "owner",
  "defaultReminders": [
    {
      "method": "popup",
      "minutes": 30
    }
  ],
  "nextPageToken": "abc123xyz456",
  "nextSyncToken": "sync_token_xyz",
  "items": [
    {
      "id": "evt_00001",
      "kind": "calendar#event",
      "etag": "3234234==",
      "iCalUID": "evt_00001@google.com",
      "summary": "Q2 Planning Meeting",
      "description": "Discuss roadmap priorities and Q2 deliverables",
      "location": "Conference Room A",
      "created": "2025-05-08T14:20:00.000Z",
      "updated": "2025-05-09T10:15:00.000Z",
      "creator": {
        "id": "user@example.com",
        "email": "user@example.com",
        "displayName": "John Doe",
        "self": true
      },
      "organizer": {
        "id": "user@example.com",
        "email": "user@example.com",
        "displayName": "John Doe",
        "self": true
      },
      "start": {
        "dateTime": "2025-05-10T14:00:00-07:00",
        "timeZone": "America/Los_Angeles"
      },
      "end": {
        "dateTime": "2025-05-10T15:00:00-07:00",
        "timeZone": "America/Los_Angeles"
      },
      "recurringEventId": null,
      "recurrence": null,
      "originalStartTime": null,
      "transparency": "opaque",
      "visibility": "public",
      "iCalUID": "evt_00001@google.com",
      "sequence": 0,
      "status": "confirmed",
      "htmlLink": "https://www.google.com/calendar/event?eid=evt_00001",
      "attendees": [
        {
          "id": "alice@example.com",
          "email": "alice@example.com",
          "displayName": "Alice Chen",
          "organizer": false,
          "self": false,
          "responseStatus": "accepted",
          "comment": "Looking forward to it",
          "additionalGuests": 0
        },
        {
          "id": "bob@example.com",
          "email": "bob@example.com",
          "displayName": "Bob Smith",
          "organizer": false,
          "self": false,
          "responseStatus": "tentative"
        }
      ],
      "attachments": [
        {
          "fileUrl": "https://drive.google.com/file/d/1abc123/view",
          "title": "Q2 Roadmap Draft",
          "mimeType": "application/vnd.google-apps.document",
          "fileId": "1abc123"
        }
      ],
      "eventType": "default",
      "reminders": {
        "useDefault": false,
        "overrides": [
          {
            "method": "email",
            "minutes": 1440
          },
          {
            "method": "popup",
            "minutes": 30
          }
        ]
      },
      "conferenceData": {
        "entryPoints": [
          {
            "entryPointType": "video",
            "uri": "https://meet.google.com/abc-defg-hij",
            "label": "meet.google.com/abc-defg-hij"
          }
        ],
        "conferenceSolution": {
          "key": {
            "type": "hangoutsMeet"
          },
          "name": "Google Meet"
        },
        "conferenceId": "abc-defg-hij"
      },
      "guestsCanInviteOthers": true,
      "guestsCanModify": false,
      "guestsCanSeeGuests": true,
      "anyoneCanAddSelf": false,
      "privateCopy": false,
      "locked": false,
      "source": {
        "title": "Imported Event",
        "url": "https://example.com/events/q2-planning"
      }
    },
    {
      "id": "evt_00002",
      "summary": "Paris trip",
      "description": "Quarterly review trip to Paris office",
      "location": "Paris, France",
      "start": {
        "dateTime": "2025-05-15T08:00:00+01:00",
        "timeZone": "Europe/Paris"
      },
      "end": {
        "dateTime": "2025-05-20T17:00:00+01:00",
        "timeZone": "Europe/Paris"
      },
      "status": "confirmed",
      "creator": {
        "email": "user@example.com",
        "displayName": "John Doe"
      },
      "organizer": {
        "email": "user@example.com",
        "displayName": "John Doe"
      },
      "transparency": "transparent",
      "visibility": "public",
      "eventType": "default"
    }
  ]
}
```

#### Key Fields

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `kind` | string | Always `"calendar"` | Yes |
| `etag` | string | Version identifier for this collection | Yes |
| `summary` | string | Calendar title | No |
| `description` | string | Calendar description | No |
| `updated` | RFC3339 datetime | Last modification time | No |
| `timeZone` | string | Calendar's time zone (IANA format) | No |
| `accessRole` | string | User's access level: owner, writer, reader, freeBusyReader, none | Yes |
| `defaultReminders` | array | Default reminder settings for events | No |
| `items` | array | List of Event resources | Yes |
| `nextPageToken` | string | Token for next page of results | No |
| `nextSyncToken` | string | Token for incremental sync (last page only) | No |

#### Event Item Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique event ID (within calendar) |
| `iCalUID` | string | iCalendar unique ID (global) |
| `summary` | string | Event title |
| `description` | string | Event description (can contain HTML) |
| `location` | string | Geographic location |
| `start` | object | Start time (see DateTime object below) |
| `end` | object | End time (see DateTime object below) |
| `creator` | object | Event creator (email, displayName) |
| `organizer` | object | Event organizer (email, displayName) |
| `attendees` | array | List of attendees with response status |
| `status` | string | "confirmed", "tentative", or "cancelled" |
| `transparency` | string | "opaque" (busy) or "transparent" (free) |
| `visibility` | string | "public", "private", or "confidential" |
| `eventType` | string | "default", "focusTime", "outOfOffice", "birthday", "workingLocation" |
| `recurrence` | array | RRULE strings for recurring events |
| `recurringEventId` | string | Parent recurring event ID (for instances) |
| `reminders` | object | Reminder settings (useDefault, overrides) |
| `conferenceData` | object | Video conference details (Google Meet, Zoom, etc.) |
| `attachments` | array | File attachments |
| `htmlLink` | string | Link to event in Google Calendar UI |
| `guestsCanInviteOthers` | boolean | Can attendees add guests |
| `guestsCanModify` | boolean | Can attendees modify event |
| `guestsCanSeeGuests` | boolean | Can attendees see other guests |
| `anyoneCanAddSelf` | boolean | Can anyone add themselves |

#### DateTime Object

Used for `start` and `end` fields:

```typescript
interface DateTime {
  // For all-day events:
  date?: "YYYY-MM-DD";
  
  // For timed events:
  dateTime?: "YYYY-MM-DDTHH:MM:SS[.sss]±HH:MM"; // RFC3339
  
  // Timezone (for timed events):
  timeZone?: "America/Los_Angeles" | "Europe/Paris" | etc;
}
```

#### Attendee Object

```typescript
interface Attendee {
  id: string;                    // Google ID (optional)
  email: string;
  displayName: string;           // Optional
  organizer: boolean;
  self: boolean;                 // true if this is the authenticated user
  responseStatus: "accepted" | "declined" | "tentative" | "needsAction";
  comment?: string;
  additionalGuests?: number;
}
```

#### Examples

**Full Meeting Event:**
```json
{
  "id": "evt_123",
  "summary": "Q2 Planning Meeting",
  "location": "Conference Room A",
  "start": { "dateTime": "2025-05-10T14:00:00-07:00" },
  "end": { "dateTime": "2025-05-10T15:00:00-07:00" },
  "attendees": [
    { "email": "alice@example.com", "responseStatus": "accepted" },
    { "email": "bob@example.com", "responseStatus": "tentative" }
  ],
  "conferenceData": {
    "entryPoints": [{ "uri": "https://meet.google.com/abc-defg-hij" }]
  }
}
```

**All-Day Event (Travel):**
```json
{
  "id": "evt_456",
  "summary": "Paris trip",
  "location": "Paris, France",
  "start": { "date": "2025-05-15" },
  "end": { "date": "2025-05-20" },
  "description": "Quarterly review meeting in Paris office"
}
```

**Recurring Event (Weekly Standup):**
```json
{
  "id": "evt_789",
  "summary": "Weekly team standup",
  "start": { "dateTime": "2025-05-12T09:00:00Z" },
  "end": { "dateTime": "2025-05-12T09:30:00Z" },
  "recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]
}
```

---

### 2. search-events Response

**MCP Tool:** `search-events`  
**Google API:** `GET /calendar/v3/calendars/{calendarId}/events?q={query}`  
**Description:** Searches events by free-text query. Same structure as `list-events` but filtered.

**Response:** Identical to `list-events` response (above). Filtered by query terms in: summary, description, location, attendee names/emails, organizer names/emails.

---

### 3. create-event Response

**MCP Tool:** `create-event`  
**Google API:** `POST /calendar/v3/calendars/{calendarId}/events`  
**Description:** Creates a new event and returns the created event resource.

#### Response Structure

```json
{
  "id": "evt_new_001",
  "kind": "calendar#event",
  "etag": "new_etag==",
  "iCalUID": "evt_new_001@google.com",
  "summary": "Team offsite planning",
  "description": "Plan Q3 team offsite",
  "location": "Main office",
  "created": "2025-05-10T09:00:00.000Z",
  "updated": "2025-05-10T09:00:00.000Z",
  "creator": {
    "email": "user@example.com",
    "displayName": "John Doe",
    "self": true
  },
  "organizer": {
    "email": "user@example.com",
    "displayName": "John Doe",
    "self": true
  },
  "start": {
    "dateTime": "2025-06-01T10:00:00-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2025-06-01T11:30:00-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "status": "confirmed",
  "transparency": "opaque",
  "visibility": "public",
  "htmlLink": "https://www.google.com/calendar/event?eid=evt_new_001",
  "sequence": 0,
  "reminders": {
    "useDefault": true
  }
}
```

**Response:** Single Event resource (same schema as items in `list-events`).

---

### 4. update-event Response

**MCP Tool:** `update-event`  
**Google API:** `PUT /calendar/v3/calendars/{calendarId}/events/{eventId}`  
**Description:** Updates an existing event and returns the updated event resource.

**Response:** Single Event resource (same schema as `create-event` response).

---

### 5. delete-event Response

**MCP Tool:** `delete-event`  
**Google API:** `DELETE /calendar/v3/calendars/{calendarId}/events/{eventId}`  
**Description:** Deletes an event. No response body (HTTP 204).

**Response:** Empty (HTTP 204 No Content)

---

### 6. get-freebusy Response

**MCP Tool:** `get-freebusy`  
**Google API:** `POST /calendar/v3/freeBusy`  
**Description:** Returns free/busy information for multiple calendars.

#### Response Structure

```json
{
  "kind": "calendar#freeBusy",
  "timeMin": "2025-05-12T00:00:00Z",
  "timeMax": "2025-05-14T23:59:59Z",
  "calendars": {
    "primary": {
      "busy": [
        {
          "start": "2025-05-12T09:00:00Z",
          "end": "2025-05-12T10:00:00Z"
        },
        {
          "start": "2025-05-12T14:00:00Z",
          "end": "2025-05-12T15:00:00Z"
        }
      ],
      "tentative": [
        {
          "start": "2025-05-13T10:00:00Z",
          "end": "2025-05-13T11:00:00Z"
        }
      ]
    },
    "work@example.com": {
      "busy": [
        {
          "start": "2025-05-12T08:30:00Z",
          "end": "2025-05-12T09:30:00Z"
        }
      ],
      "tentative": []
    }
  }
}
```

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Always `"calendar#freeBusy"` |
| `timeMin` | RFC3339 | Start of requested time range |
| `timeMax` | RFC3339 | End of requested time range |
| `calendars` | object | Keyed by calendar ID (e.g., "primary", "user@example.com") |
| `calendars[id].busy` | array | Array of {start, end} time blocks when busy |
| `calendars[id].tentative` | array | Array of {start, end} time blocks tentatively booked |

#### Time Block Object

```typescript
interface TimeBlock {
  start: RFC3339;  // "2025-05-12T09:00:00Z"
  end: RFC3339;    // "2025-05-12T10:00:00Z"
}
```

#### Example: Find Common Availability

Given the response above for "primary" and "work@example.com" calendars, available slots on May 12 would exclude:
- 08:30–09:30 (work calendar busy)
- 09:00–10:00 (primary calendar busy)
- 14:00–15:00 (primary calendar busy)

---

### 7. list-calendars Response

**MCP Tool:** `list-calendars`  
**Google API:** `GET /calendar/v3/users/me/calendarList`  
**Description:** Returns all calendars accessible to the user.

#### Response Structure

```json
{
  "kind": "calendar#calendarList",
  "etag": "p32o4io32==",
  "items": [
    {
      "kind": "calendar#calendarListEntry",
      "etag": "1234567==",
      "id": "primary",
      "summary": "John Doe",
      "description": "Primary calendar for John Doe",
      "timeZone": "America/Los_Angeles",
      "colorId": "1",
      "backgroundColor": "#a4bdfc",
      "foregroundColor": "#000000",
      "selected": true,
      "accessRole": "owner",
      "primary": true,
      "deleted": false,
      "summaryOverride": "My Calendar",
      "location": "San Francisco, CA",
      "conferenceProperties": {
        "allowedConferenceTypes": ["hangoutsMeet"]
      }
    },
    {
      "kind": "calendar#calendarListEntry",
      "id": "work@example.com",
      "summary": "Work Calendar",
      "timeZone": "America/New_York",
      "colorId": "2",
      "backgroundColor": "#b3e5fc",
      "selected": true,
      "accessRole": "owner",
      "primary": false,
      "deleted": false
    }
  ]
}
```

#### Calendar Item Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Calendar ID (email or "primary") |
| `summary` | string | Display name of calendar |
| `description` | string | Calendar description |
| `timeZone` | string | Calendar's time zone |
| `colorId` | string | Color ID (1-24, maps to backgroundColor) |
| `backgroundColor` | string | Hex color code |
| `foregroundColor` | string | Hex text color code |
| `selected` | boolean | Is calendar visible in UI |
| `accessRole` | string | owner, writer, reader, freeBusyReader |
| `primary` | boolean | Is this the user's primary calendar |
| `deleted` | boolean | Is this calendar deleted (soft-delete) |
| `summaryOverride` | string | User's custom name for this calendar |
| `location` | string | Calendar location (free text) |

---

### 8. list-colors Response

**MCP Tool:** `list-colors`  
**Google API:** `GET /calendar/v3/colors`  
**Description:** Returns all available colors for events and calendars.

#### Response Structure

```json
{
  "kind": "calendar#colors",
  "calendar": {
    "1": {
      "background": "#a4bdfc",
      "foreground": "#1d1d1d"
    },
    "2": {
      "background": "#7ae7bf",
      "foreground": "#1d1d1d"
    },
    "3": {
      "background": "#51b896",
      "foreground": "#ffffff"
    }
    // ... colors 4-24
  },
  "event": {
    "1": {
      "background": "#a4bdfc",
      "foreground": "#1d1d1d"
    },
    "2": {
      "background": "#d3d3d3",
      "foreground": "#1d1d1d"
    }
    // ... colors 2-24
  }
}
```

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `calendar` | object | Color palette for calendars (keys 1-24) |
| `event` | object | Color palette for events (keys 1-24) |
| `[id].background` | string | Hex color code |
| `[id].foreground` | string | Hex text color code |

---

## Common Response Patterns

### Error Responses

All errors follow standard HTTP error codes and include a JSON error body:

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

#### Common Error Codes

| Code | Meaning | Handling |
|------|---------|----------|
| 400 | Bad Request (invalid parameters) | Check query parameters and request body |
| 401 | Unauthorized (invalid/expired token) | Refresh OAuth token |
| 403 | Forbidden (insufficient permissions) | User doesn't have access to resource |
| 404 | Not Found (calendar or event doesn't exist) | Check IDs; event may be deleted |
| 409 | Conflict (etag mismatch on update) | Fetch fresh event and retry |
| 410 | Gone (sync token expired) | Perform full sync without syncToken |
| 429 | Rate Limit Exceeded | Implement exponential backoff |
| 500 | Internal Server Error (Google API error) | Retry with exponential backoff |

### Pagination

Large result sets are paginated:

```json
{
  "items": [/* 250 events */],
  "nextPageToken": "abc123xyz456",
  "nextSyncToken": null
}
```

- Use `nextPageToken` to fetch next page
- Last page includes `nextSyncToken` for incremental sync
- Never mix `nextSyncToken` with `nextPageToken`

### Incremental Sync

For efficient polling:

```typescript
// First sync
const response1 = await calendarMCP.list_events({
  timeMin: "2025-05-01T00:00:00Z",
  timeMax: "2025-06-01T00:00:00Z"
});
saveLastSyncToken(response1.nextSyncToken);

// Later, incremental sync
const response2 = await calendarMCP.list_events({
  syncToken: savedSyncToken
});
// response2 includes only changed/deleted events since last sync
```

---

## Integration Notes

### Normalizing Responses for Micro CoS

When consuming these responses in your Workers/DOs:

1. **DateTime Handling:** Always normalize to UTC ISO8601 for storage
   ```typescript
   const startUTC = new Date(event.start.dateTime).toISOString();
   ```

2. **All-Day Events:** Store with special marker
   ```typescript
   if (event.start.date) {
     event.is_all_day = true;
     event.start_date = event.start.date; // "2025-05-15"
   }
   ```

3. **Timezone Preservation:** Keep original timezone for display
   ```typescript
   const timezone = event.start.timeZone || "UTC";
   ```

4. **Attendee Status:** Map to internal enum
   ```typescript
   type AttendanceStatus = "accepted" | "declined" | "tentative" | "pending";
   ```

5. **Recurrence:** Parse RRULE for task extraction
   ```typescript
   const rrule = event.recurrence?.[0]; // e.g., "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"
   ```

---

## Performance Considerations

- **Pagination:** Default 250 events per page; max 2500 per request
- **Sync tokens:** Use for efficient polling every 30 minutes
- **Caching:** Store `etag` with events; use for conditional requests
- **Rate limits:** Google Calendar API: 1,000,000 quota units/day per project
- **Latency:** Typical 100–300ms per API call

---
