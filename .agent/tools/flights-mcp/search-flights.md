# Flights-MCP: Search Flights Tool

## Overview

**MCP:** flights-mcp (Duffel API wrapper)
**Operation:** `searchFlights`
**Purpose:** Search for available flights between origin and destination
**Caller:** `FlightToolClient` Worker
**Triggered by:** `TravelWorkflowDO` when travel event detected

---

## API Specification

### Request

```typescript
interface FlightSearchRequest {
  origin: string;                    // IATA code, e.g., "SFO"
  destination: string;               // IATA code, e.g., "CDG"
  departure_date: string;            // YYYY-MM-DD
  return_date?: string;              // YYYY-MM-DD (for round-trip)
  adults?: number;                   // Default: 1
  children?: number;                 // Default: 0
  infants?: number;                  // Default: 0
  cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
  max_connections?: number;          // Default: 2
  departure_time?: { after: string; before: string }; // HH:MM format
  arrival_time?: { after: string; before: string };   // HH:MM format
}
```

### Response

```typescript
interface FlightSearchResponse {
  data: {
    offers: FlightOffer[];
  };
}

interface FlightOffer {
  id: string;                        // Duffel offer ID
  created_at: string;                // ISO 8601
  expires_at: string;                // ISO 8601 (validity deadline)
  owner: {
    id: string;
    name: string;
    iata_code: string;
  };
  base_amount: string;               // Base price (before tax)
  base_currency: string;             // ISO 4217 (e.g., "USD")
  tax_amount: string;
  tax_currency: string;
  total_amount: string;              // Total price (base + tax)
  total_currency: string;
  total_emissions_kg: string;        // CO2 estimate
  slices: FlightSlice[];
  passengers: FlightPassenger[];
  conditions: {
    change_before_departure: Condition;
    refund_before_departure: Condition;
  };
  available_services?: Service[];
}

interface FlightSlice {
  id: string;
  origin: { iata_code: string; icao_code: string; name: string };
  destination: { iata_code: string; icao_code: string; name: string };
  departure_date: string;            // YYYY-MM-DD
  arrival_date: string;              // YYYY-MM-DD
  segments: FlightSegment[];
  duration: string;                  // ISO 8601 duration
}

interface FlightSegment {
  id: string;
  operating_carrier: { iata_code: string; name: string };
  marketing_carrier: { iata_code: string; name: string };
  flight_number: string;
  departing_at: string;              // ISO 8601
  arriving_at: string;               // ISO 8601
  origin: { iata_code: string; name: string };
  destination: { iata_code: string; name: string };
  stops: StopInfo[];
  duration: string;                  // ISO 8601
  aircraft: { iata_code: string; name: string };
  baggage: {
    checked_baggage: { included: boolean; weight?: number; unit?: string };
    cabin_baggage: { included: boolean; weight?: number; unit?: string };
  };
}

interface StopInfo {
  iata_code: string;
  arriving_at: string;               // ISO 8601
  departing_at: string;              // ISO 8601
}
```

---

## HTTP Call Details

### Endpoint

```
POST https://api.duffel.com/air/offer_requests
```

### Headers

```
Authorization: Bearer {DUFFEL_API_KEY}
Content-Type: application/json
Duffel-Version: v2
Accept-Encoding: gzip
```

### Request Body

```json
{
  "data": {
    "slices": [
      {
        "origin": "SFO",
        "destination": "CDG",
        "departure_date": "2025-05-10"
      }
    ],
    "passengers": [
      { "type": "adult" }
    ],
    "cabin_class": "business"
  }
}
```

### Response Status Codes

| Code | Meaning | Handling |
| --- | --- | --- |
| 200 | OK, offers returned | Parse and normalize |
| 201 | Created, processing | Poll for results |
| 202 | Accepted, async | Poll for results |
| 400 | Bad request | Log error, return to user |
| 401 | Unauthorized | Check API key, retry |
| 429 | Rate limited | Retry with exponential backoff |
| 500 | Server error | Retry, fallback |

---

## Implementation in FlightToolClient

```typescript
class FlightToolClient {
  async searchFlights(
    request: FlightSearchRequest,
    options?: { timeout?: number; retries?: number }
  ): Promise<FlightOption[]> {
    const operationId = generateUUID();
    const toolInvocationId = generateUUID();
    
    try {
      // 1. Validate input
      this.validateRequest(request);
      
      // 2. Check cache
      const cacheKey = this.buildCacheKey(request);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.log('Tool cache hit', { operationId, tool: 'flights-mcp', cacheKey });
        return cached;
      }
      
      // 3. Call flights-MCP
      const startTime = Date.now();
      const response = await this.callDuffelAPI(request, {
        timeout: options?.timeout || 10000,
        retries: options?.retries || 3
      });
      const latency = Date.now() - startTime;
      
      // 4. Normalize response
      const normalized = this.normalizeOffers(response.data.offers);
      
      // 5. Cache for 30 minutes
      await this.cache.set(cacheKey, normalized, 1800);
      
      // 6. Log success
      this.log('Tool invocation success', {
        operationId,
        toolInvocationId,
        tool: 'flights-mcp',
        operation: 'search_flights',
        latency,
        resultCount: normalized.length,
        status: 'success'
      });
      
      return normalized;
      
    } catch (error) {
      // Error handling
      this.log('Tool invocation failed', {
        operationId,
        toolInvocationId,
        tool: 'flights-mcp',
        status: 'error',
        errorMessage: error.message,
        errorType: error.constructor.name
      });
      
      throw new ToolInvocationError('flights-mcp', 'search_flights', error);
    }
  }
  
  private validateRequest(req: FlightSearchRequest): void {
    if (!req.origin || !req.destination) {
      throw new Error('origin and destination required');
    }
    
    if (!this.isValidIATACode(req.origin)) {
      throw new Error(`Invalid origin IATA code: ${req.origin}`);
    }
    
    if (!this.isValidIATACode(req.destination)) {
      throw new Error(`Invalid destination IATA code: ${req.destination}`);
    }
    
    if (!this.isValidDate(req.departure_date)) {
      throw new Error(`Invalid departure date: ${req.departure_date}`);
    }
  }
  
  private normalizeOffers(offers: FlightOffer[]): FlightOption[] {
    return offers.map(offer => {
      const slice = offer.slices[0]; // Outbound slice
      const firstSegment = slice.segments[0];
      const lastSegment = slice.segments[slice.segments.length - 1];
      
      return {
        id: offer.id,
        offer_id: offer.id,
        airline: offer.owner.iata_code,
        airline_name: offer.owner.name,
        flight_number: firstSegment.flight_number,
        origin: {
          code: slice.origin.iata_code,
          name: slice.origin.name
        },
        destination: {
          code: slice.destination.iata_code,
          name: slice.destination.name
        },
        departure: {
          date: slice.departure_date,
          time: this.extractTime(firstSegment.departing_at),
          datetime: firstSegment.departing_at
        },
        arrival: {
          date: slice.arrival_date,
          time: this.extractTime(lastSegment.arriving_at),
          datetime: lastSegment.arriving_at
        },
        duration_minutes: this.calculateDuration(firstSegment.departing_at, lastSegment.arriving_at),
        stops: slice.segments.length - 1,
        stop_details: slice.segments.length > 1 ? slice.segments.slice(0, -1).map((seg, i) => ({
          airport_code: seg.destination.iata_code,
          arrival_time: this.extractTime(seg.arriving_at),
          departure_time: this.extractTime(slice.segments[i + 1].departing_at)
        })) : undefined,
        aircraft_type: firstSegment.aircraft.name,
        baggage: {
          checked: {
            included: firstSegment.baggage.checked_baggage.included,
            weight_kg: firstSegment.baggage.checked_baggage.weight
          },
          cabin: {
            included: firstSegment.baggage.cabin_baggage.included,
            weight_kg: firstSegment.baggage.cabin_baggage.weight
          }
        },
        price: {
          amount: parseFloat(offer.total_amount),
          currency: offer.total_currency
        },
        tax: {
          amount: parseFloat(offer.tax_amount),
          currency: offer.tax_currency
        },
        total: {
          amount: parseFloat(offer.total_amount),
          currency: offer.total_currency
        },
        emissions_kg: offer.total_emissions_kg ? parseFloat(offer.total_emissions_kg) : undefined,
        expires_at: offer.expires_at,
        direct: slice.segments.length === 1
      };
    });
  }
}
```

---

## Error Scenarios

### 1. Invalid Airport Code

**Request:**
```json
{
  "origin": "XXX",
  "destination": "CDG",
  "departure_date": "2025-05-10"
}
```

**Response (400):**
```json
{
  "errors": [
    {
      "type": "validation_error",
      "code": "invalid_airport_code",
      "title": "Invalid Airport Code",
      "message": "The airport code 'XXX' is not valid"
    }
  ]
}
```

**Handling:**
```typescript
catch (error) {
  if (error.response?.status === 400 && error.response?.data?.errors?.[0]?.code === 'invalid_airport_code') {
    const airport = error.response.data.errors[0].message.match(/'([A-Z]{3})'/)?.[1];
    throw new UserError(`Airport code ${airport} not found. Please check spelling.`);
  }
}
```

### 2. Rate Limited

**Response (429):**
```json
{
  "errors": [
    {
      "type": "rate_limit_exceeded",
      "title": "Rate Limit Exceeded",
      "message": "Too many requests"
    }
  ]
}
```

**Handling:**
```typescript
async callDuffelAPI(request, options) {
  let retries = 0;
  const maxRetries = options.retries || 3;
  
  while (retries < maxRetries) {
    try {
      return await fetch(DUFFEL_ENDPOINT, { ... });
    } catch (error) {
      if (error.response?.status === 429) {
        const waitTime = Math.pow(2, retries) * 1000; // Exponential backoff
        await sleep(waitTime);
        retries++;
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('Rate limit exceeded after retries');
}
```

### 3. No Flights Found

**Response (200):**
```json
{
  "data": {
    "offers": []
  }
}
```

**Handling:**
```typescript
if (response.data.offers.length === 0) {
  this.log('No flights found', {
    origin: request.origin,
    destination: request.destination,
    date: request.departure_date
  });
  
  return []; // Return empty array, don't throw
}
```

---

## Caching Strategy

```typescript
// Cache key: flights:{origin}:{destination}:{date}:{cabin}
const cacheKey = `flights:${request.origin}:${request.destination}:${request.departure_date}:${request.cabin_class || 'any'}`;

// Cache for 30 minutes (flights update hourly, safe to cache)
const CACHE_TTL = 30 * 60; // seconds

// Invalidate on:
// - User explicitly requests new search
// - cache.delete() called by TravelWorkflow if results rejected
```

---

## Performance Notes

- **Latency:** 400-800ms (Duffel API call + normalization)
- **Token limit:** 50 offers per search (Duffel limit)
- **Timeout:** 10 seconds (Worker timeout)
- **Cost:** ~$0.01 per search (Duffel pricing)

---

## Examples

### Example 1: Simple One-Way Flight

**Request:**
```json
{
  "origin": "SFO",
  "destination": "CDG",
  "departure_date": "2025-05-10",
  "adults": 1,
  "cabin_class": "business"
}
```

**Response (normalized):**
```json
[
  {
    "id": "off_00009htYpSCXrwaB9DnUm0",
    "airline": "BA",
    "flight_number": "112",
    "departure": { "date": "2025-05-10", "time": "08:00" },
    "arrival": { "date": "2025-05-11", "time": "08:30" },
    "duration_minutes": 630,
    "stops": 0,
    "price": { "amount": 920, "currency": "USD" }
  }
]
```

### Example 2: Round-Trip

**Request:**
```json
{
  "origin": "SFO",
  "destination": "CDG",
  "departure_date": "2025-05-10",
  "return_date": "2025-05-17",
  "adults": 1,
  "cabin_class": "economy"
}
```

**Note:** Duffel returns single offers with multiple slices. `FlightToolClient` should flatten for ranking.

---
