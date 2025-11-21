# API Adapter Component Diagram

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Domain Ports (Public Interfaces)                  │
│                                                                      │
│  ┌──────────────────────────┐   ┌──────────────────────────────┐  │
│  │   IFlightPort            │   │   ICalendarPort              │  │
│  │  ┌────────────────────┐  │   │  ┌──────────────────────────┐│  │
│  │  │searchFlights()     │  │   │  │syncEvents()              ││  │
│  │  │getFlightDetails()  │  │   │  │createEvent()             ││  │
│  │  └────────────────────┘  │   │  │searchEvents()            ││  │
│  └──────────────────────────┘   │  └──────────────────────────┘│  │
│                                  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────┴─────────────────────────────────────┐
│                      Adapter Layer (Orchestrators)                │
│                                                                   │
│  ┌─────────────────────────────────┐   ┌──────────────────────┐ │
│  │  DuffelFlightAdapter            │   │ GoogleCalendarAdapter│ │
│  │ (flights.adapter.ts ~120 lines) │   │ (calendar.adapter.ts)│ │
│  │                                 │   │ (~150 lines)         │ │
│  │ • Orchestrates validator        │   │                      │ │
│  │ • Orchestrates client           │   │ • Orchestrates client│ │
│  │ • Orchestrates mapper           │   │ • Orchestrates mapper│ │
│  │ • Correlation IDs               │   │ • Correlation IDs    │ │
│  │ • Error handling                │   │ • Error handling     │ │
│  │ • Return domain entities        │   │ • Return domain      │ │
│  └─────────────────────────────────┘   │   entities           │ │
│                                        └──────────────────────┘ │
└──────┬──────────────────────┬──────────────────────┬─────────────┘
       │                      │                      │
       │                      │              ┌───────┴────────┐
       │         ┌────────────┴──────────┐   │                │
       │         │                      │   │                │
       ▼         ▼                      ▼   ▼                ▼
    ┌─────────────────────────────────────────────────────────────┐
    │           Validation Layer (Input Validation)               │
    │                                                             │
    │  ┌──────────────────────────────────────────────────────┐  │
    │  │ FlightSearchValidator                               │  │
    │  │ (validators/flight-search.validator.ts ~70 lines)   │  │
    │  │                                                      │  │
    │  │ • validateSearchRequest()     [Entry point]         │  │
    │  │ • validateAirportCode()       [Check IATA format]   │  │
    │  │ • validateDate()              [Check ISO format]    │  │
    │  │ • formatDateForApi()          [Convert to YYYY-MM]  │  │
    │  │ • Throws on invalid input                           │  │
    │  └──────────────────────────────────────────────────────┘  │
    │                                                             │
    │  Note: No validator for Calendar (uses adapter directly)  │
    └─────────────────────────────────────────────────────────────┘
       │                                           │
       │ (validated request)                       │ (params)
       ▼                                           ▼
    ┌──────────────────────────────────────────────────────────────┐
    │           Client Layer (HTTP/RPC Communication)              │
    │                                                              │
    │  ┌─────────────────────────────────┐  ┌──────────────────┐ │
    │  │ DuffelApiClient                 │  │ GoogleCalendar   │ │
    │  │ (clients/duffel-api.client.ts   │  │ McpClient        │ │
    │  │  ~150 lines)                    │  │ (clients/google- │ │
    │  │                                 │  │  calendar-mcp    │ │
    │  │ • get(endpoint, correlationId)  │  │  .client.ts      │ │
    │  │ • post(endpoint, body, corrId)  │  │  ~110 lines)     │ │
    │  │                                 │  │                  │ │
    │  │ Features:                       │  │ • call(method,   │ │
    │  │ ✓ Retry 3x                     │  │   params, corrId)│ │
    │  │ ✓ Exponential backoff           │  │                  │ │
    │  │ ✓ Rate limit handling (429)     │  │ Features:        │ │
    │  │ ✓ Request timeout (30s)         │  │ ✓ Retry 3x       │ │
    │  │ ✓ Correlation IDs               │  │ ✓ Exponential    │ │
    │  │ ✓ Latency tracking              │  │   backoff        │ │
    │  │ ✓ Error classification          │  │ ✓ JSON-RPC 2.0   │ │
    │  └─────────────────────────────────┘  │ ✓ Correlation    │ │
    │                                        │   IDs            │ │
    │                                        │ ✓ Latency        │ │
    │                                        │   tracking       │ │
    │                                        └──────────────────┘ │
    │                                                              │
    │  Retry Logic (Both Adapters):                              │
    │  ┌──────────────────────────────────────────────────────┐  │
    │  │ Attempt 1: Immediate                                │  │
    │  │ Attempt 2: Wait 1s + exponential backoff            │  │
    │  │ Attempt 3: Wait 2s + exponential backoff            │  │
    │  │ Fail: Return error after 3 attempts                 │  │
    │  │                                                      │  │
    │  │ Rate Limit (429): Respects Retry-After header       │  │
    │  │ Timeout (>30s): Abort and retry                     │  │
    │  │ Transient (503): Retry with backoff                 │  │
    │  │ Permanent (401): Fail immediately                   │  │
    │  └──────────────────────────────────────────────────────┘  │
    └──────┬────────────────────────────────────────────┬─────────┘
           │ (API response JSON)                        │
           ▼                                            ▼
    ┌──────────────────────────────────────────────────────────────┐
    │          Mapper Layer (Data Translation / ACL)               │
    │                                                              │
    │  ┌────────────────────────────────┐  ┌──────────────────┐  │
    │  │ DuffelFlightMapper             │  │ GoogleCalendar   │  │
    │  │ (mappers/duffel-flight.mapper  │  │ Mapper           │  │
    │  │  .ts ~100 lines)               │  │ (mappers/google- │  │
    │  │                                │  │  calendar.mapper │  │
    │  │ • translateOffers()            │  │  .ts ~120 lines) │  │
    │  │ • isValidOffer()               │  │                  │  │
    │  │ • translateOffer() [private]   │  │ • translateEvents│  │
    │  │                                │  │   ()             │  │
    │  │ Features:                      │  │ • translateEvent │  │
    │  │ ✓ Filters invalid offers       │  │   ()             │  │
    │  │ ✓ Converts Duffel → FlightOpt  │  │ • isValidEvent() │  │
    │  │ ✓ Parses datetime strings      │  │                  │  │
    │  │ ✓ Calculates price/currency    │  │ Features:        │  │
    │  │ ✓ Maps segments correctly      │  │ ✓ Filters invalid│  │
    │  │ ✓ Debug logging                │  │   events         │  │
    │  │                                │  │ ✓ Converts Google│  │
    │  │ Data Flow:                     │  │   → CalendarEvent│  │
    │  │ Duffel JSON                    │  │ ✓ Date parsing   │  │
    │  │   ↓ validate & filter          │  │ ✓ Handles all-   │  │
    │  │ Valid offers                   │  │   day events     │  │
    │  │   ↓ translate to domain        │  │ ✓ Debug logging  │  │
    │  │ FlightOption[]                 │  │                  │  │
    │  │   ↓ return to adapter          │  │ Data Flow:       │  │
    │  └────────────────────────────────┘  │ Google JSON      │  │
    │                                       │   ↓ validate     │  │
    │                                       │ Valid events     │  │
    │                                       │   ↓ translate    │  │
    │                                       │ CalendarEvent[]  │  │
    │                                       │   ↓ return       │  │
    │                                       └──────────────────┘  │
    └─────────────────────────────────────────────────────────────┘
       │ (FlightOption[])                   │ (CalendarEvent[])
       │                                    │
       └────────────────────────┬───────────┘
                                │
       ┌────────────────────────▼───────────────────────┐
       │    Adapter Layer (Return to Caller)            │
       │                                                │
       │ ┌──────────────────┐  ┌──────────────────────┐│
       │ │ searchFlights()  │  │ syncEvents()         ││
       │ │ returns:         │  │ returns:             ││
       │ │ FlightOption[]   │  │ CalendarEvent[]      ││
       │ └──────────────────┘  └──────────────────────┘│
       └────────────────────────┬───────────────────────┘
                                │
       ┌────────────────────────▼───────────────────────┐
       │          Domain Model (Return Type)            │
       │                                                │
       │ ┌──────────────────┐  ┌──────────────────────┐│
       │ │ FlightOption     │  │ CalendarEvent        ││
       │ │ • id             │  │ • id                 ││
       │ │ • segments[]     │  │ • title              ││
       │ │ • totalPrice     │  │ • description        ││
       │ │ • currency       │  │ • startTime          ││
       │ │                  │  │ • endTime            ││
       │ │ FlightSegment    │  │ • attendees[]        ││
       │ │ • origin         │  │ • location           ││
       │ │ • destination    │  │ • visibility         ││
       │ │ • departureTime  │  │ • status             ││
       │ │ • arrivalTime    │  │                      ││
       │ │ • airline        │  │ AirportCode (VO)     ││
       │ │ • flightNumber   │  │ • code: string       ││
       │ └──────────────────┘  └──────────────────────┘│
       └────────────────────────────────────────────────┘
```

---

## Detailed Component Interactions

### Flight Search Flow

```
User Request
    │
    ├─ new FlightSearchRequest {
    │     origin: 'SFO',
    │     destination: 'CDG',
    │     departureDate: '2025-05-10'
    │   }
    │
    ▼
┌─────────────────────────────────────────────────┐
│ DuffelFlightAdapter.searchFlights()             │
│ ├─ generateCorrelationId()                      │
│ │   → "flight-1734684912345-abc123"             │
│ │                                                │
│ ├─ validator.validateSearchRequest(request)     │
│ │   └─ Throws if origin/destination invalid     │
│ │                                                │
│ ├─ buildSearchRequest(request)                  │
│ │   → Duffel API payload format                 │
│ │                                                │
│ ├─ apiClient.post('/offer_requests', payload)   │
│ │   ├─ Retry loop (3 attempts)                 │
│ │   │   ├─ Exponential backoff                 │
│ │   │   ├─ Rate limit handling                 │
│ │   │   └─ Timeout management                  │
│ │   └─ Return DuffelOfferResponse               │
│ │                                                │
│ ├─ mapper.translateOffers(offers)               │
│ │   ├─ Filter invalid offers                   │
│ │   └─ Convert to FlightOption[]                │
│ │                                                │
│ └─ Return FlightOption[]                        │
└─────────────────────────────────────────────────┘
```

### Calendar Sync Flow

```
User Request
    │
    ├─ syncEvents('user@example.com', since?)
    │
    ▼
┌────────────────────────────────────────────────┐
│ GoogleCalendarAdapter.syncEvents()             │
│ ├─ generateCorrelationId()                     │
│ │   → "cal-1734684912345-abc123"               │
│ │                                               │
│ ├─ Calculate date range                        │
│ │   ├─ timeMin: since || 30 days ago           │
│ │   └─ timeMax: 90 days from now               │
│ │                                               │
│ ├─ mcpClient.call('list_events', params)       │
│ │   ├─ Build JSON-RPC request                  │
│ │   ├─ Retry loop (3 attempts)                 │
│ │   │   ├─ Exponential backoff                 │
│ │   │   └─ Timeout management                  │
│ │   └─ Return ListEventsResponse                │
│ │                                               │
│ ├─ mapper.translateEvents(events, userId)      │
│ │   ├─ Filter invalid events                   │
│ │   ├─ Parse Google date formats               │
│ │   └─ Convert to CalendarEvent[]              │
│ │                                               │
│ └─ Return CalendarEvent[]                      │
└────────────────────────────────────────────────┘
```

---

## Error Handling Flow

### Validation Error
```
User Request (invalid)
    │
    ▼
Validator.validateSearchRequest()
    ├─ Check required fields
    ├─ Check format
    └─ Throw Error (non-retryable)
        ↓
    Adapter catches
        ├─ Logs error
        └─ Returns [] (fail-safe)
```

### Transient Error (Retryable)
```
ApiClient.post()
    │
    ├─ Attempt 1: Network timeout
    │   └─ Wait 1s
    │
    ├─ Attempt 2: Timeout again
    │   └─ Wait 2s
    │
    ├─ Attempt 3: Success ✓
    │   └─ Return response
    │
    └─ (If all fail: Throw Error)
        ↓
    Adapter catches
        ├─ Logs error
        └─ Returns [] (fail-safe)
```

### Rate Limit Error
```
ApiClient.post()
    │
    ├─ Response: 429 Too Many Requests
    ├─ Header: Retry-After: 60
    │
    └─ Wait 60 seconds
        │
        ├─ Attempt N: Success ✓
        │   └─ Return response
        │
        └─ (If timeout: Throw Error)
```

---

## Correlation ID Propagation

```
Request Entry Point
    │
    ├─ Generate: "flight-1234567890-abc123"
    │
    ├─ Validator (no logging)
    │
    ├─ ApiClient.post(..., correlationId)
    │   ├─ HTTP Header: X-Correlation-ID
    │   ├─ Log: "latency_ms, attempt"
    │   └─ correlationId: "flight-1234567890-abc123"
    │
    ├─ Mapper.translateOffers(...)
    │   ├─ Debug logging
    │   └─ (Includes correlationId from context)
    │
    └─ Adapter logging
        └─ Log: "final result"
            └─ correlationId: "flight-1234567890-abc123"
```

---

## Message Sequence Diagram

### Flight Search Sequence

```
User Code
    │
    ├─ call: adapter.searchFlights(request)
    │
    └──────────────┬──────────────────────────────────────────────┐
                   │                                               │
                   ▼                                               │
            DuffelFlightAdapter                                    │
                   │                                               │
                   ├─ generateCorrelationId()                      │
                   │                                               │
                   ├─ call: validator.validateSearchRequest()      │
                   │   │                                           │
                   │   └──> FlightSearchValidator ✓                │
                   │                                               │
                   ├─ call: apiClient.post(...)                    │
                   │   │                                           │
                   │   └──────────────────────────────┐            │
                   │                                  │            │
                   │                                  ▼            │
                   │                          DuffelApiClient      │
                   │                                  │            │
                   │                      fetch() ──> Duffel API   │
                   │                                  │            │
                   │                          return response      │
                   │                                  │            │
                   │                                  ▼            │
                   │                          [retry logic]        │
                   │                                  │            │
                   │   ◄──────────────────────────────┘            │
                   │                                               │
                   ├─ call: mapper.translateOffers(offers)         │
                   │   │                                           │
                   │   └──> DuffelFlightMapper ✓                   │
                   │           ├─ Filter invalid                   │
                   │           └─ Translate to domain              │
                   │                                               │
                   ├─ return FlightOption[]                        │
                   │                                               │
                   └────────────────────────────────────────────> User
                                                                  Result
```

---

## Class Diagram

```
IFlightPort (interface)
    ▲
    │ implements
    │
    ├─ DuffelFlightAdapter
    │   │
    │   ├─ uses: FlightSearchValidator
    │   ├─ uses: DuffelApiClient
    │   └─ uses: DuffelFlightMapper
    │
    └─ (other flight adapters)

ICalendarPort (interface)
    ▲
    │ implements
    │
    ├─ GoogleCalendarAdapter
    │   │
    │   ├─ uses: GoogleCalendarMcpClient
    │   └─ uses: GoogleCalendarMapper
    │
    └─ (other calendar adapters)

FlightSearchValidator
    │
    ├─ validateSearchRequest()
    ├─ validateAirportCode()
    ├─ validateDate()
    └─ formatDateForApi()

DuffelApiClient
    │
    ├─ get()
    ├─ post()
    └─ request() [private]

DuffelFlightMapper
    │
    ├─ translateOffers()
    ├─ isValidOffer() [private]
    └─ translateOffer() [private]

GoogleCalendarMcpClient
    │
    └─ call()

GoogleCalendarMapper
    │
    ├─ translateEvents()
    ├─ translateEvent()
    ├─ isValidEvent() [private]
    └─ parseGoogleDate() [private]
```

---

## Data Structure Diagrams

### FlightOption Entity
```
FlightOption
├─ id: string                    (from Duffel)
├─ segments: FlightSegment[]     (1+ segments)
├─ totalPrice: number            (e.g., 123.45)
├─ currency: string              (e.g., "USD")
└─ bookingUrl?: string

    FlightSegment (nested)
    ├─ origin: AirportCode        (IATA code VO)
    ├─ destination: AirportCode   (IATA code VO)
    ├─ departureTime: Date
    ├─ arrivalTime: Date
    ├─ airline: string            (carrier name)
    ├─ flightNumber: string       (e.g., "AA100")
    ├─ stops: number              (0 = direct)
    └─ aircraft?: string          (e.g., "B787")
```

### CalendarEvent Entity
```
CalendarEvent
├─ id: string                    (from Google)
├─ userId: string
├─ title: string                 (summary)
├─ description?: string
├─ startTime: Date
├─ endTime: Date
├─ location?: string
├─ attendees: string[]           (email list)
├─ organizer?: string            (email)
├─ isAllDay: boolean
├─ status: string                (confirmed, etc.)
└─ visibility: string            (public, private, etc.)
```

---

This document provides a complete visual and logical understanding of how the API adapters are structured and interact.
