# Calendar Integration Options for Micro CoS

## Recommendation Summary

For the Micro Chief of Staff, we recommend integrating with **Google Calendar via the open-source Google Calendar MCP** (by nspady) rather than building a custom MCP.

**Why:**
- ✅ Production-ready, open-source, 768+ GitHub stars
- ✅ Supports all needed operations: read events, detect travel, create tasks
- ✅ TypeScript (matches our stack)
- ✅ MIT licensed
- ✅ Active community, maintained, documented

---

## Option 1: Google Calendar MCP (Recommended)

### Overview

**Repository:** https://github.com/nspady/google-calendar-mcp
**Language:** TypeScript / Node.js
**License:** MIT
**Stars:** 768 | **Forks:** 233
**Status:** Active, well-maintained

The most mature and feature-complete open-source calendar MCP. Created by developer `nspady`, it provides a standardized MCP interface to Google Calendar.

### Capabilities

| Tool                | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `list-calendars`    | List all available calendars                          |
| `list-events`       | List events with date filtering                       |
| `search-events`     | Search events by text query                           |
| `create-event`      | Create new calendar events                            |
| `update-event`      | Update existing events                                |
| `delete-event`      | Delete events                                         |
| `get-freebusy`      | Check availability across calendars                  |
| `list-colors`       | List available event colors                          |

### Response Schema (Events)

```typescript
interface CalendarEvent {
  id: string;
  summary: string;           // Event title
  description?: string;
  start: {
    dateTime: string;        // ISO 8601
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  }[];
  organizer?: {
    email: string;
    displayName?: string;
  };
  recurringEventId?: string;  // If part of recurring series
  recurrence?: string[];      // RRULE format
  status: 'confirmed' | 'tentative' | 'cancelled';
  transparency: 'opaque' | 'transparent';
  visibility: 'public' | 'private' | 'confidential';
}
```

### How It Fits Micro CoS

1. **Travel Event Detection:**
   ```
   TravelEventDetector DO → Call Google Calendar MCP (via CalendarToolClient)
   → list-events(dateRange: next 30 days)
   → Filter by keywords: "trip", "flight", destination city
   → Extract travel metadata
   ```

2. **Conflict Checking (for flight ranking):**
   ```
   LLM prompt includes calendar events on departure/arrival dates
   → Consider early arrival preferences vs. morning meetings
   ```

3. **Task Creation:**
   ```
   After user books flight
   → Create events: "Book flight", "Pack", "Airport transfer"
   → Use create-event tool via MCP
   ```

### Setup Requirements

1. **Google Cloud Project:**
   - Create project at https://console.cloud.google.com
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials (Desktop app type)
   - Add test users (your email)

2. **Installation:**
   ```bash
   npm install @nspady/google-calendar-mcp
   # or use npx directly
   npx @nspady/google-calendar-mcp server
   ```

3. **Authentication:**
   - Place `gcp-oauth.keys.json` in project root
   - Server auto-opens browser for OAuth consent on first run
   - Tokens stored in `.gcp-saved-tokens.json` (gitignore)

4. **Integration with Micro CoS:**
   - Wrap in `CalendarToolClient` worker (similar to `FlightToolClient`)
   - Call from `TravelEventDetector` DO
   - Handle responses and emit hooks

### Pros & Cons

**Pros:**
- ✅ Open-source, MIT licensed
- ✅ Production-ready, actively maintained
- ✅ TypeScript (matches stack)
- ✅ OAuth 2.0 (secure)
- ✅ Comprehensive event search/filtering
- ✅ Recurring event support
- ✅ Free/busy queries (useful for meeting scheduling)
- ✅ Docker-deployable

**Cons:**
- ⚠️ Requires Google Cloud setup (OAuth can be complex for enterprises)
- ⚠️ Depends on Google Calendar availability (third-party SLA)
- ⚠️ OAuth tokens expire (requires refresh logic)
- ⚠️ Test mode tokens expire after 7 days (need to move to production mode for prod)

---

## Option 2: Alternative MCPs

### Microsoft Outlook Calendar MCP

**Status:** Community-maintained, less mature than Google Calendar
**Considerations:** If users prefer Outlook/Microsoft ecosystem

**Not recommended unless:**
- Your user base is primarily Microsoft-based
- Can't use Google Calendar for privacy/policy reasons

---

### CalDAV-based Calendar MCP

**Concept:** Open standard for calendar data
**Examples:** NextCloud, Fruux, Apple iCloud via CalDAV

**Considerations:**
- More portable (works with many providers)
- More complex setup
- Less feature-complete in MCP ecosystem

**Not recommended:** Too much setup burden, Google Calendar MCP is simpler

---

## Integration Architecture

### CalendarToolClient Worker (New)

Similar to `FlightToolClient`, create a Worker service that:

```typescript
interface CalendarToolClient {
  // Get events in date range
  getEvents(
    calendarId: string,
    startDate: string,
    endDate: string
  ): Promise<CalendarEvent[]>;
  
  // Search for travel-related events
  searchTravelEvents(
    keywords: string[],
    dateRange: { start: string; end: string }
  ): Promise<CalendarEvent[]>;
  
  // Create event (for task workflow)
  createEvent(
    calendarId: string,
    event: {
      summary: string;
      start: { dateTime: string };
      end: { dateTime: string };
      description?: string;
      location?: string;
    }
  ): Promise<CalendarEvent>;
  
  // Get free/busy availability
  getFreeBusy(
    calendarIds: string[],
    startTime: string,
    endTime: string
  ): Promise<FreeBusyData>;
}
```

### TravelEventDetector DO Integration

```typescript
async detectTravelEvents(calendarEvents: CalendarEvent[]): Promise<TravelEvent[]> {
  const travelEvents: TravelEvent[] = [];
  
  for (const event of calendarEvents) {
    // Extract destination from event title/description
    const destination = this.extractDestination(event.summary, event.description);
    
    if (destination && this.isTravelEvent(event)) {
      const travelEvent: TravelEvent = {
        event_id: event.id,
        title: event.summary,
        destination_city: destination,
        start_date: event.start.dateTime,
        end_date: event.end.dateTime,
        confidence: 0.85 // High confidence for explicit destination
      };
      
      travelEvents.push(travelEvent);
    }
  }
  
  return travelEvents;
}
```

### LLM Classification (Optional Enhancement)

For ambiguous events, pass to Llama 3.3:

```typescript
const classificationPrompt = `
Given this calendar event, determine if it's a travel event and extract destination.

Event: "${event.summary}"
Description: "${event.description || ''}"
Date: ${event.start.dateTime}

Is this a travel event? (yes/no)
If yes, what is the destination city?
Confidence: 0.0-1.0

Output JSON: {"is_travel": boolean, "destination": string, "confidence": number}
`;
```

---

## Deployment Models

### Option A: Local MCP (Recommended for MVP)

**Setup:**
1. User installs Google Calendar MCP locally
2. Micro CoS Worker calls it via stdio
3. Simple, no remote infrastructure

**Security:** ✅ OAuth tokens stay local
**Complexity:** ⚠️ User must set up Google Cloud
**Latency:** ✅ Minimal (local)

### Option B: Remote MCP (Cloud)

**Setup:**
1. Deploy Google Calendar MCP to cloud (e.g., Vercel, Railway, Fly.io)
2. Micro CoS Worker calls it via HTTPS
3. Central OAuth credentials (organization-managed)

**Security:** ⚠️ Tokens pass through remote server
**Complexity:** ✅ Easier for users
**Latency:** ⚠️ Network roundtrip

**Recommendation:** Start with Option A (local), move to Option B if scaling beyond 1 user.

---

## Alternatives: Build Custom

**Should we build a custom calendar integration instead of using MCP?**

**Answer: No.** Here's why:

| Aspect         | Custom Build | Google Calendar MCP |
| -------------- | ------------ | ------------------- |
| Dev time       | 80–120 hrs   | 4–8 hrs (wrapper)   |
| Maintenance    | Ongoing      | Community-maintained |
| Features       | Limited      | Full calendar API   |
| Auth handling  | Complex      | Pre-built OAuth     |
| Testing        | From scratch | Already tested      |
| Extensibility  | Monolithic   | Modular, reusable   |

---

## Implementation Checklist

- [ ] Create Google Cloud project & enable Calendar API
- [ ] Create OAuth 2.0 credentials (Desktop app)
- [ ] Add test email as OAuth test user
- [ ] Install `@nspady/google-calendar-mcp` locally
- [ ] Create `CalendarToolClient` Worker wrapper
- [ ] Implement `TravelEventDetector` DO with calendar event detection
- [ ] Add travel event hook → `TravelWorkflow` DO trigger
- [ ] Add correlation IDs for calendar tool invocations
- [ ] Test: create calendar event → detect as travel → trigger flight search
- [ ] Document OAuth setup for users
- [ ] Add calendar event schema to observability logs

---

## Cost Considerations

| Component     | Cost          | Notes                                   |
| ------------- | ------------- | --------------------------------------- |
| Google Cloud  | Free tier     | 1M API calls/month for Calendar API    |
| Micro CoS     | Worker time   | ~10-50ms per calendar event fetch      |
| OAuth tokens  | Included      | No additional cost for token refresh   |

**Total:** Essentially free for typical usage (< 1M calendar API calls/month).

---

## Security Notes

1. **OAuth Credentials:**
   - Store `gcp-oauth.keys.json` in `.gitignore`
   - For production, use secrets management (e.g., Cloudflare Secrets, Vault)

2. **Scopes:**
   - Request minimal scopes: `calendar.events` (read) + `calendar` (write for tasks)
   - Avoid broad permissions like full Drive or Mail

3. **Token Refresh:**
   - Implement automatic refresh of expired tokens
   - Log token refresh attempts and failures
   - Alert if refresh token expires

4. **User Consent:**
   - Display OAuth consent clearly to users
   - Explain what data is accessed (calendar events, free/busy)

---

## Next Steps

1. **Immediate:** Set up Google Cloud project and test Google Calendar MCP locally
2. **Short-term:** Implement `CalendarToolClient` wrapper and integrate with `TravelEventDetector` DO
3. **Medium-term:** Test full workflow: Calendar event → Travel detection → Flight search → Suggestions
4. **Long-term:** Evaluate multi-user deployment (remote MCP vs. distributed OAuth)

---
