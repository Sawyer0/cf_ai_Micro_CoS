# Flights-MCP Response Schema

## Overview

The flights-MCP tool wraps the Duffel API for flight searches. Understanding the response structure is critical for:
1. Normalizing data in `FlightToolClient`
2. Designing the internal `FlightOption` model
3. Building LLM ranking prompts
4. Displaying results in the frontend

---

## Duffel API Offer Response (Full Schema)

The Duffel API returns offers when you create an offer request. Each offer represents a complete flight itinerary.

### Top-Level Offer Fields

```json
{
  "id": "off_00009htYpSCXrwaB9DnUm0",
  "created_at": "2020-01-17T10:12:14.545Z",
  "updated_at": "2020-01-17T10:12:14.545Z",
  "expires_at": "2020-01-17T10:42:14.545Z",
  "live_mode": true,
  "partial": false,
  
  // Pricing
  "base_amount": "30.20",
  "base_currency": "GBP",
  "tax_amount": "40.80",
  "tax_currency": "GBP",
  "total_amount": "45.00",
  "total_currency": "GBP",
  "total_emissions_kg": "460",
  
  // Airlines & Services
  "owner": {
    "id": "arl_00009UhD4ongolulWd9N1V",
    "name": "British Airways",
    "iata_code": "BA"
  },
  "supported_loyalty_programmes": ["AF", "KL", "DL"],
  "supported_passenger_identity_document_types": ["passport"],
  
  // Flight details
  "slices": [...],        // See below
  "passengers": [...],    // Array of passenger objects
  
  // Booking conditions
  "conditions": {
    "change_before_departure": {...},
    "refund_before_departure": {...}
  },
  
  // Payment & services
  "payment_requirements": {...},
  "available_services": [...],
  "intended_services": [...],
  "intended_payment_methods": [...]
}
```

---

## Slice (Route) Schema

Each slice represents one leg of the journey (e.g., outbound, return, or multi-city segment).

```json
{
  "id": "slic_00009UhD4ongolulWd9N1V",
  "origin": {
    "iata_code": "SFO",
    "icao_code": "KSFO",
    "name": "San Francisco International Airport"
  },
  "destination": {
    "iata_code": "CDG",
    "icao_code": "LFPG",
    "name": "Paris Charles de Gaulle Airport"
  },
  "departure_date": "2020-01-17",
  "arrival_date": "2020-01-18",
  "segments": [...],      // See below
  "duration": "PT10H30M"  // ISO 8601 duration
}
```

---

## Segment (Individual Flight) Schema

Each segment is an individual flight within a slice.

```json
{
  "id": "seg_00009UhD4ongolulWd9N1V",
  "operating_carrier": {
    "iata_code": "BA",
    "name": "British Airways"
  },
  "marketing_carrier": {
    "iata_code": "BA",
    "name": "British Airways"
  },
  "flight_number": "112",
  "aircraft": {
    "iata_code": "789",
    "name": "Boeing 787-9 Dreamliner"
  },
  
  // Departure
  "departing_at": "2020-01-17T10:30:00Z",
  "origin": {
    "iata_code": "SFO",
    "name": "San Francisco International Airport"
  },
  
  // Arrival
  "arriving_at": "2020-01-18T02:00:00Z",
  "destination": {
    "iata_code": "CDG",
    "name": "Paris Charles de Gaulle Airport"
  },
  
  // Stops
  "stops": [
    {
      "iata_code": "DUB",
      "arriving_at": "2020-01-17T16:45:00Z",
      "departing_at": "2020-01-17T17:30:00Z"
    }
  ],
  
  // Duration
  "duration": "PT15H30M",
  
  // Baggage
  "baggage": {
    "checked_baggage": {
      "included": true,
      "weight": 23,
      "unit": "kg"
    },
    "cabin_baggage": {
      "included": true,
      "weight": 7,
      "unit": "kg"
    }
  }
}
```

---

## Normalized Internal Model (FlightOption)

For the Micro CoS system, we normalize Duffel responses into a simpler internal model:

```typescript
interface FlightOption {
  // Identification
  id: string;                    // Duffel offer ID
  offer_id: string;              // Same as id, for clarity
  
  // Airline info
  airline: string;               // Airline IATA code (e.g., "BA")
  airline_name: string;          // Full name (e.g., "British Airways")
  flight_number: string;         // Flight number
  
  // Routing
  origin: {
    code: string;                // IATA code
    name: string;                // Airport name
  };
  destination: {
    code: string;
    name: string;
  };
  
  // Key times
  departure: {
    date: string;                // YYYY-MM-DD
    time: string;                // HH:MM (local time of departure)
    datetime: string;             // ISO 8601 for calculations
  };
  arrival: {
    date: string;
    time: string;
    datetime: string;
  };
  
  // Flight characteristics
  duration_minutes: number;       // Total flight time
  stops: number;                 // Number of stops (0 = direct)
  stop_details?: {                // Optional: array of stops
    airport_code: string;
    arrival_time: string;
    departure_time: string;
  }[];
  
  // Aircraft
  aircraft_type?: string;         // e.g., "Boeing 787"
  
  // Baggage
  baggage: {
    checked: {
      included: boolean;
      weight_kg?: number;
    };
    cabin: {
      included: boolean;
      weight_kg?: number;
    };
  };
  
  // Pricing
  price: {
    amount: number;
    currency: string;             // ISO 4217 (e.g., "USD")
  };
  
  // Taxes & fees
  tax: {
    amount: number;
    currency: string;
  };
  
  // Total
  total: {
    amount: number;
    currency: string;
  };
  
  // Sustainability
  emissions_kg?: number;          // CO2 emissions estimate
  
  // Validity & booking
  expires_at: string;             // ISO 8601 datetime
  cabin_class?: string;           // "economy", "business", etc.
  direct?: boolean;               // Convenience flag
  
  // For ranking context
  is_early_arrival?: boolean;     // Set by LLM ranking logic
  meets_preferences?: boolean;    // Set by LLM ranking logic
}
```

---

## Multi-Flight Offer (Round-trip / Multi-city)

For round-trip or multi-city offers, the response contains multiple slices:

```json
{
  "slices": [
    {
      "id": "slic_outbound",
      "origin": { "iata_code": "SFO" },
      "destination": { "iata_code": "CDG" },
      "segments": [...]
    },
    {
      "id": "slic_return",
      "origin": { "iata_code": "CDG" },
      "destination": { "iata_code": "SFO" },
      "segments": [...]
    }
  ],
  "total_amount": "1200.00"
}
```

**Important:** A round-trip offer is a single offer with `total_amount` covering both legs. When normalizing:
- Extract outbound slice → create FlightOption 1
- Extract return slice → create FlightOption 2
- OR combine both into a single FlightOption with both legs (depending on UX requirements)
- Total price applies to the entire round-trip

---

## Passenger Object Schema

Each offer includes passengers:

```json
{
  "id": "pas_00009UhD4ongolulWd9N1V",
  "type": "adult",  // or "child", "infant_without_seat", "infant_with_seat"
  "given_name": "Tony",
  "family_name": "Stark",
  "email": "tony@example.com",
  "phone_number": "+1-555-0123"
}
```

---

## Conditions & Change Policy Schema

```json
{
  "conditions": {
    "change_before_departure": {
      "allowed": true,
      "penalty_amount": "50.00",
      "penalty_currency": "GBP"
    },
    "refund_before_departure": {
      "allowed": true,
      "penalty_amount": "0.00",
      "penalty_currency": "GBP"
    }
  }
}
```

---

## Available Services Schema

Optional add-ons (baggage, seat selection, etc.):

```json
{
  "available_services": [
    {
      "id": "ser_00009UhD4ongolulWd9N1V",
      "name": "Extra checked baggage",
      "type": "checked_baggage",
      "metadata": {
        "weight_kg": 23
      },
      "total_amount": "50.00",
      "total_currency": "GBP",
      "passenger_ids": ["pas_00009UhD4ongolulWd9N1V"]
    }
  ]
}
```

---

## Sample Complete Offer Response

```json
{
  "data": {
    "id": "off_00009htYpSCXrwaB9DnUm0",
    "created_at": "2025-01-17T10:12:14.545Z",
    "expires_at": "2025-01-17T10:42:14.545Z",
    "base_amount": "800.00",
    "base_currency": "USD",
    "tax_amount": "120.00",
    "tax_currency": "USD",
    "total_amount": "920.00",
    "total_currency": "USD",
    "total_emissions_kg": "150",
    "owner": {
      "id": "arl_BA",
      "name": "British Airways",
      "iata_code": "BA"
    },
    "slices": [
      {
        "id": "slic_outbound_001",
        "origin": {
          "iata_code": "SFO",
          "icao_code": "KSFO",
          "name": "San Francisco International"
        },
        "destination": {
          "iata_code": "CDG",
          "icao_code": "LFPG",
          "name": "Paris Charles de Gaulle"
        },
        "departure_date": "2025-05-10",
        "arrival_date": "2025-05-11",
        "duration": "PT10H30M",
        "segments": [
          {
            "id": "seg_001",
            "operating_carrier": {
              "iata_code": "BA",
              "name": "British Airways"
            },
            "flight_number": "112",
            "departing_at": "2025-05-10T08:00:00Z",
            "origin": {
              "iata_code": "SFO",
              "name": "San Francisco International"
            },
            "arriving_at": "2025-05-11T08:30:00Z",
            "destination": {
              "iata_code": "CDG",
              "name": "Paris Charles de Gaulle"
            },
            "stops": [],
            "duration": "PT10H30M",
            "aircraft": {
              "iata_code": "789",
              "name": "Boeing 787-9"
            },
            "baggage": {
              "checked_baggage": {
                "included": true,
                "weight": 23,
                "unit": "kg"
              },
              "cabin_baggage": {
                "included": true,
                "weight": 7,
                "unit": "kg"
              }
            }
          }
        ]
      }
    ],
    "passengers": [
      {
        "id": "pas_001",
        "type": "adult",
        "given_name": "John",
        "family_name": "Doe"
      }
    ],
    "conditions": {
      "change_before_departure": {
        "allowed": true,
        "penalty_amount": "50.00",
        "penalty_currency": "USD"
      },
      "refund_before_departure": {
        "allowed": true,
        "penalty_amount": "0.00",
        "penalty_currency": "USD"
      }
    },
    "available_services": []
  }
}
```

---

## FlightToolClient Normalization Logic

When `FlightToolClient.searchFlights()` receives a response from Duffel:

1. **Extract slices** from the offer
2. **Flatten multiple slices** (round-trip) into separate `FlightOption` objects or combine into single object
3. **Map fields** to internal `FlightOption` model:
   - `total_amount` → `total.amount`
   - `base_currency` → all currency fields
   - `departing_at` from first segment → departure times
   - `arriving_at` from last segment → arrival times
   - Count segments in slice → `stops` (segments - 1)
   - Calculate duration from first segment departure to last segment arrival → `duration_minutes`
4. **Handle edge cases:**
   - Multi-stop itineraries: preserve all stop info
   - Round-trip offers: return array of 2 FlightOptions (outbound + return) with combined total
   - Currency conversion: if needed, apply here
5. **Validate** all required fields are present
6. **Return** normalized `FlightOption[]`

---

## Important Notes for LLM Ranking

When passing normalized flights to LLM for ranking, include:

- **Departure & arrival times** (with timezone info if available)
- **Stops count** (0 = direct, 1+ = connections)
- **Duration** (in minutes or "X hours Y minutes")
- **Airline** (code + name)
- **Price** (total amount + currency)
- **Baggage policy** (checked + cabin)
- **Cabin class** (if specified in search)
- **Emissions** (if available, for sustainability ranking)

Example LLM input excerpt:

```json
{
  "flights": [
    {
      "id": "off_001",
      "airline": "BA",
      "departure": "2025-05-10 08:00",
      "arrival": "2025-05-11 08:30",
      "duration_hours": 10.5,
      "stops": 0,
      "price": 920,
      "currency": "USD",
      "baggage_checked": true,
      "emissions_kg": 150
    }
  ],
  "user_preferences": {
    "non_stop_preferred": true,
    "max_price": 1500,
    "preferred_airlines": ["BA", "AF"],
    "cabin_class": "business"
  }
}
```

---

## Error Handling

Duffel may return errors:

```json
{
  "errors": [
    {
      "type": "validation_error",
      "code": "invalid_airport_code",
      "title": "Invalid Airport Code",
      "message": "The airport code 'XXX' is not valid",
      "documentation_url": "https://duffel.com/docs/..."
    }
  ]
}
```

FlightToolClient should:
- Log error with correlation_id
- Return empty array if no flights found
- Throw exception if API error (rate limit, timeout, auth failure)
- Set tool_status = "error" in observability logs

---
