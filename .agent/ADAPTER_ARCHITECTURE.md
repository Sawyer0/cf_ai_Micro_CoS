# Adapter Architecture - Separation of Concerns

## Overview

Both API adapters (GoogleCalendarAdapter and DuffelFlightAdapter) have been refactored to follow clean architecture principles with clear separation of concerns. Each adapter is composed of focused, testable components.

---

## Architecture Pattern

```
Adapter Layer (Public Interface)
    ↓
    ├─ Validator (Input validation)
    ├─ API Client (HTTP + Retries)
    └─ Mapper (Data translation)
```

### Layer Responsibilities

1. **Adapter** - Orchestration & public interface
   - Implements domain port interface (IFlightPort, ICalendarPort)
   - Coordinates validator, client, and mapper
   - Handles correlation IDs
   - High-level error handling

2. **Validator** - Input validation & formatting
   - Validates request parameters
   - Checks required fields
   - Formats data for API
   - Throws errors for invalid input

3. **API Client** - HTTP communication & resilience
   - Makes HTTP requests
   - Implements retry logic with exponential backoff
   - Handles rate limiting (429)
   - Timeout management
   - Low-level error handling

4. **Mapper** - Data translation (Anti-Corruption Layer)
   - Translates external API format → domain entities
   - Filters invalid records
   - Normalizes data
   - Preserves domain integrity

---

## DuffelFlightAdapter

### File Structure

```
edge-worker/src/adapters/mcp/
├── clients/
│   └── duffel-api.client.ts          # HTTP client with retries
├── mappers/
│   └── duffel-flight.mapper.ts       # Duffel → Domain translation
├── validators/
│   └── flight-search.validator.ts    # Input validation
└── flights.adapter.ts                # Orchestrator (public interface)
```

### Component Interactions

```
FlightSearchRequest
    │
    ▼
FlightSearchValidator
    ├─ validateSearchRequest()       # Check required fields
    ├─ validateAirportCode()         # Check IATA format
    ├─ validateDate()                # Check date format
    └─ formatDateForApi()            # Convert to YYYY-MM-DD
    │
    ▼
DuffelApiClient
    ├─ post('/offer_requests', payload)
    ├─ Retry 3x with exponential backoff
    ├─ Handle 429 rate limiting
    ├─ Timeout after 30s
    └─ Return JSON response
    │
    ▼
DuffelFlightMapper
    ├─ isValidOffer()                # Filter invalid offers
    ├─ translateOffer()              # Convert to FlightOption
    └─ translateSegments()           # Convert to FlightSegment
    │
    ▼
FlightOption[] (Domain entity)
```

### Example Usage

```typescript
// 1. Create adapter (validates credentials)
const adapter = new DuffelFlightAdapter(apiKey, logger);

// 2. Call search (orchestrates all layers)
const flights = await adapter.searchFlights({
    origin: 'SFO',
    destination: 'CDG',
    departureDate: '2025-05-10'
});

// Flow:
// 1. Validator checks inputs
// 2. Client makes HTTP request with retries
// 3. Mapper translates response to domain entities
// 4. Returns FlightOption[]
```

### Validator Details

**File:** `flight-search.validator.ts`

Methods:
- `validateSearchRequest(request)` - Main entry point
  - Checks origin (required, 2-4 chars, letters only)
  - Checks destination (required, 2-4 chars, letters only)
  - Checks departureDate (required, valid ISO date)
  - Checks returnDate (optional, valid ISO date)
  - Checks passengers (1-9)
- `formatDateForApi(date)` - Formats to YYYY-MM-DD

**Example:**
```typescript
const validator = new FlightSearchValidator();
validator.validateSearchRequest({
    origin: 'SFO',
    destination: 'CDG',
    departureDate: '2025-05-10'
});
// Throws if invalid
```

### API Client Details

**File:** `clients/duffel-api.client.ts`

Methods:
- `get<T>(endpoint, correlationId)` - GET request
- `post<T>(endpoint, body, correlationId)` - POST request
- Private: `request()` - Retry logic

Features:
- ✅ Automatic retries (3 attempts)
- ✅ Exponential backoff (1s → 2s → 4s)
- ✅ Rate limit handling (429 with Retry-After)
- ✅ Request timeout (30s)
- ✅ Correlation ID propagation
- ✅ Structured logging

**Example:**
```typescript
const client = new DuffelApiClient(apiKey, logger);
const response = await client.post<DuffelOfferResponse>(
    '/offer_requests',
    payload,
    'flight-1234567890-abc123'
);
```

### Mapper Details

**File:** `mappers/duffel-flight.mapper.ts`

Methods:
- `translateOffers(offers)` - Batch translation with filtering
- `isValidOffer(offer)` - Validation logic
- Private: `translateOffer()` - Single offer translation

Features:
- ✅ Filters invalid offers (missing fields, etc.)
- ✅ Converts Duffel format → FlightSegment[]
- ✅ Parses ISO 8601 datetime strings
- ✅ Calculates price and currency
- ✅ Includes stops and aircraft info
- ✅ Debug logging for filtered offers

**Example:**
```typescript
const mapper = new DuffelFlightMapper(logger);
const flightOptions = mapper.translateOffers([
    duffelOffer1,
    duffelOffer2
]);
// Returns: FlightOption[]
```

---

## GoogleCalendarAdapter

### File Structure

```
edge-worker/src/adapters/mcp/
├── clients/
│   └── google-calendar-mcp.client.ts  # MCP client with retries
├── mappers/
│   └── google-calendar.mapper.ts      # Google → Domain translation
└── calendar.adapter.ts                # Orchestrator (public interface)
```

### Component Interactions

```
CalendarEvent Request (sync/search/create)
    │
    ▼
GoogleCalendarMcpClient
    ├─ call(method, params)
    ├─ Retry 3x with exponential backoff
    ├─ Handle MCP errors
    └─ Return JSON response
    │
    ▼
GoogleCalendarMapper
    ├─ isValidEvent()              # Filter invalid events
    ├─ translateEvent()            # Convert to CalendarEvent
    ├─ parseGoogleDate()           # Handle date formats
    └─ translateEvents()           # Batch translation
    │
    ▼
CalendarEvent[] (Domain entity)
```

### Example Usage

```typescript
// 1. Create adapter
const adapter = new GoogleCalendarAdapter(
    'http://localhost:3000',
    logger
);

// 2. Sync events
const events = await adapter.syncEvents('user@example.com');

// 3. Search events
const results = await adapter.searchEvents(
    'user@example.com',
    'paris trip',
    { start: new Date('2025-05-01'), end: new Date('2025-05-31') }
);

// 4. Create event
const newEvent = await adapter.createEvent('user@example.com', {
    title: 'Meeting',
    startTime: new Date('2025-05-15T14:00:00Z'),
    endTime: new Date('2025-05-15T15:00:00Z')
});
```

### MCP Client Details

**File:** `clients/google-calendar-mcp.client.ts`

Methods:
- `call<T>(method, params, correlationId)` - RPC call

Features:
- ✅ JSON-RPC 2.0 format
- ✅ Automatic retries (3 attempts)
- ✅ Exponential backoff (1s → 2s → 4s)
- ✅ Error classification (HTTP vs MCP errors)
- ✅ Correlation ID propagation
- ✅ Structured logging

**Example:**
```typescript
const client = new GoogleCalendarMcpClient(
    'http://localhost:3000',
    logger
);
const response = await client.call<ListEventsResponse>(
    'list_events',
    {
        calendarId: 'primary',
        timeMin: '2025-04-20T00:00:00Z'
    },
    'cal-1234567890-abc123'
);
```

### Mapper Details

**File:** `mappers/google-calendar.mapper.ts`

Methods:
- `translateEvents(events, userId)` - Batch translation with filtering
- `translateEvent(event, userId)` - Single event translation
- `isValidEvent(event)` - Validation logic
- Private: `parseGoogleDate()` - Date parsing

Features:
- ✅ Filters invalid events (missing id/summary)
- ✅ Handles date-only (all-day) events
- ✅ Handles datetime events with timezone
- ✅ Parses attendee lists
- ✅ Preserves visibility and status
- ✅ Debug logging for filtered events

**Example:**
```typescript
const mapper = new GoogleCalendarMapper(logger);
const events = mapper.translateEvents(
    googleEvents,
    'user@example.com'
);
// Returns: CalendarEvent[]
```

---

## Testing Strategy

### Unit Test Examples

Each component can be tested independently:

```typescript
// Test validator
describe('FlightSearchValidator', () => {
    const validator = new FlightSearchValidator();

    it('validates required fields', () => {
        expect(() => validator.validateSearchRequest({})).toThrow();
    });

    it('validates airport code format', () => {
        expect(() => 
            validator.validateAirportCode('A', 'origin')
        ).toThrow();
    });
});

// Test API client
describe('DuffelApiClient', () => {
    it('retries on timeout', async () => {
        // Mock fetch to timeout first attempt
        // Verify client retries and succeeds
    });

    it('respects rate limit headers', async () => {
        // Mock 429 with Retry-After
        // Verify client waits and retries
    });
});

// Test mapper
describe('DuffelFlightMapper', () => {
    const mapper = new DuffelFlightMapper(logger);

    it('filters invalid offers', () => {
        const offers = [validOffer, invalidOffer];
        const result = mapper.translateOffers(offers);
        expect(result).toHaveLength(1);
    });

    it('translates offer format', () => {
        const offer = createTestOffer();
        const result = mapper.translateOffers([offer]);
        expect(result[0].totalPrice).toBe(123.45);
    });
});

// Test adapter (integration)
describe('DuffelFlightAdapter', () => {
    const adapter = new DuffelFlightAdapter(apiKey, logger);

    it('orchestrates full flow', async () => {
        const flights = await adapter.searchFlights({
            origin: 'SFO',
            destination: 'CDG',
            departureDate: '2025-05-10'
        });
        expect(flights).toHaveLength(> 0);
        expect(flights[0].segments).toBeDefined();
    });
});
```

---

## Error Handling

### Validator Errors

```typescript
try {
    validator.validateSearchRequest(request);
} catch (error) {
    // Throw: "Flight search requires origin airport code"
    // Throw: "Invalid origin airport code format: X"
    // Throw: "Invalid departureDate date format: 2025-13-01"
}
```

**Strategy:** Fail immediately with clear error messages

### API Client Errors

```
Error Type          | Behavior
─────────────────────────────────────────────
Timeout (> 30s)     | Retry with exponential backoff
Rate limit (429)    | Wait per Retry-After, then retry
Server error (503)  | Retry with exponential backoff
Auth error (401)    | Log and throw (non-retryable)
Network error       | Retry with exponential backoff
```

**Strategy:** Retry transient errors, fail immediately on permanent errors

### Mapper Errors

```typescript
// Invalid offer → Filtered out, debug logged
// Valid offer → Translated successfully
// Translation error → Logged, not returned
```

**Strategy:** Filter invalid records, never throw from mapper

---

## Observability

### Correlation ID Flow

```
User Request
    │
    ├─ Generate: "flight-1734684912345-abc123"
    │
    ├─ Validator → (no logging)
    │
    ├─ API Client
    │   └─ Log: method, endpoint, latency, attempt
    │
    ├─ Mapper
    │   └─ Debug: filtered count, validation reason
    │
    └─ Adapter
        └─ Log: operation, result count, correlation ID
```

### Log Entries

**Search Started:**
```json
{
  "event": "Searching flights via Duffel",
  "origin": "SFO",
  "destination": "CDG",
  "departureDate": "2025-05-10",
  "correlationId": "flight-1734684912345-abc123"
}
```

**API Call Succeeded:**
```json
{
  "event": "Duffel API call succeeded",
  "method": "POST",
  "endpoint": "/offer_requests",
  "latencyMs": 2150,
  "correlationId": "flight-1734684912345-abc123",
  "attempt": 0
}
```

**Search Completed:**
```json
{
  "event": "Flight search completed",
  "offerCount": 8,
  "correlationId": "flight-1734684912345-abc123",
  "requestId": "duffel-req-xyz"
}
```

---

## Benefits of This Architecture

1. **Testability** - Each component can be unit tested independently
2. **Maintainability** - Clear responsibilities, easy to understand
3. **Reusability** - Client and mapper can be used elsewhere
4. **Error Handling** - Distinct error strategies per layer
5. **Observability** - Correlation IDs flow through all layers
6. **Extensibility** - Add new validators, clients, mappers easily
7. **Debugging** - Logs pinpoint which layer has issues

---

## Future Enhancements

- [ ] Caching layer (cache recent searches)
- [ ] Circuit breaker pattern (fail fast when API down)
- [ ] Request deduplication (cache in-flight requests)
- [ ] Metrics aggregation (latency percentiles, error rates)
- [ ] Configuration object (retry counts, timeouts)
- [ ] Mock adapters (testing without real APIs)
