# Flight Ranking Prompt

## Purpose

Rank flight options based on user preferences, calendar context, and travel constraints. This prompt helps the assistant choose the best flights for a trip by considering multiple factors beyond just price.

**When:** After `FlightToolClient` returns search results (typically 10-50 flights)
**Model:** Llama 3.3
**Output:** Top 3 ranked flights with scores and reasoning

---

## Use Cases

1. **Business trip with early meeting:** Prefer early arrival flights, non-stop if possible
2. **Leisure travel with flexible schedule:** Optimize for price, accept connections
3. **Round-trip with multiple meetings:** Consider return flight timing, avoid back-to-back exhaustion
4. **Multi-city trip:** Rank based on layover duration and connection quality
5. **Budget-constrained:** Price is primary factor, but still avoid terrible connections

---

## Input Variables

- `flights`: Array of FlightOption objects (from flights-mcp normalization)
  - Type: `FlightOption[]`
  - Fields: id, airline, departure, arrival, duration_minutes, stops, price, baggage, emissions_kg
  - Example: 12-50 flights

- `user_preferences`: User's travel preferences
  - Type: `UserTravelProfile.preferences`
  - Fields: preferred_airlines, cabin_class, max_price, non_stop_only, max_layover_minutes
  - Example: `{ "preferred_airlines": ["BA", "AF"], "cabin_class": "business", "max_price": 1500, "non_stop_only": false, "max_layover_minutes": 180 }`

- `calendar_context`: Upcoming calendar events on travel dates
  - Type: Array of `{ start: ISO8601, title: string }`
  - Example: `[{ "start": "2025-05-10T08:00:00Z", "title": "Client meeting in Paris" }]`

- `trip_metadata`: Trip details
  - Type: Object
  - Fields: destination, departure_date, return_date (if round-trip), trip_reason
  - Example: `{ "destination": "Paris", "departure_date": "2025-05-10", "trip_reason": "Business meeting" }`

---

## Expected Output

```json
{
  "ranked_flights": [
    {
      "rank": 1,
      "flight_id": "off_00009htYpSCXrwaB9DnUm0",
      "airline": "BA",
      "score": 0.95,
      "reasoning": "Non-stop flight departing 08:00, arrives 17:30. Perfect for early client meeting on May 10. Within budget.",
      "key_factors": ["non-stop", "early-arrival", "preferred-airline"],
      "price": 920,
      "stops": 0
    },
    {
      "rank": 2,
      "flight_id": "off_00009htYpSCXrwaB9DnUm1",
      "airline": "AF",
      "score": 0.82,
      "reasoning": "1-stop via Dublin, departs 06:00. Arrives same day at 19:00. Slightly cheaper.",
      "key_factors": ["early-departure", "acceptable-layover"],
      "price": 780,
      "stops": 1
    },
    {
      "rank": 3,
      "flight_id": "off_00009htYpSCXrwaB9DnUm2",
      "airline": "LH",
      "score": 0.65,
      "reasoning": "2-stop budget option. Long layover in Frankfurt (3h). Arrives late evening. Only viable if cost is critical.",
      "key_factors": ["budget-friendly"],
      "price": 520,
      "stops": 2
    }
  ]
}
```

---

## Prompt Template

```
You are a travel advisor assistant. A user has an upcoming trip and you must rank flight options.

---USER CONTEXT---
Name: {user_name}
Home city: {home_city}
Preferred airlines: {preferred_airlines}
Cabin class preference: {cabin_class}
Budget: ${max_price}
Non-stop preferred: {non_stop_only}
Max layover tolerance: {max_layover_minutes} minutes

---TRIP DETAILS---
Destination: {destination}
Departure: {departure_date}
Return: {return_date || 'One-way'}
Reason: {trip_reason}

---CALENDAR CONTEXT---
Events on departure day:
{calendar_events_departure}

Events on arrival day:
{calendar_events_arrival}

Key constraint: {calendar_constraint}

---FLIGHT OPTIONS---
{flight_options_json}

---TASK---
Rank these flights from best (1) to worst (3) for this user's trip. Consider:

1. **Alignment with preferences:**
   - Does the airline match preferred carriers?
   - Does cabin class match preference?
   - Is the flight non-stop (if strongly preferred)?

2. **Timing relative to calendar:**
   - What time does the user arrive on {departure_date}?
   - Are there early morning meetings that require overnight flights or early arrivals?
   - On {return_date}, does the flight timing disrupt important meetings?

3. **Practical factors:**
   - Total duration (including layovers)
   - Number and length of stops
   - Baggage allowance (checked + cabin)

4. **Price vs. convenience tradeoff:**
   - Is it worth ${100-500} more for non-stop or earlier arrival?
   - Are budget options viable given the trip constraints?

5. **Sustainability (if known):**
   - CO2 emissions (lower is better, but secondary to other factors)

---OUTPUT---
Return a JSON array with top 3 flights, ranked by suitability. Each entry must have:
- rank: 1, 2, or 3
- flight_id: from input
- score: 0.0-1.0 (how well it matches the user's needs)
- reasoning: 1-2 sentences explaining the ranking
- key_factors: array of strings explaining primary reasons (e.g., ["non-stop", "preferred-airline", "early-arrival"])
- price: total price from input
- stops: number of stops from input

Return ONLY valid JSON, no markdown, no extra text.
```

---

## Error Handling

| Scenario | Handling |
| --- | --- |
| LLM returns invalid JSON | Parse error → return original flights sorted by price + log error |
| LLM returns fewer than 3 flights | Pad with lower-ranked flights to always return 3 |
| LLM assigns same score to multiple flights | Use price as tiebreaker (lower price = higher rank) |
| Score out of range (e.g., 1.5) | Clamp to [0.0, 1.0] → log as warning |
| Missing fields in response | Use defaults: score = 0.5, reasoning = empty string |

---

## Examples

### Example 1: Business Trip (Early Arrival Preferred)

**Input:**
```json
{
  "trip_metadata": {
    "destination": "Paris",
    "departure_date": "2025-05-10",
    "trip_reason": "Client meeting 09:00 on May 10"
  },
  "user_preferences": {
    "preferred_airlines": ["BA", "AF"],
    "cabin_class": "business",
    "max_price": 1500,
    "non_stop_only": false,
    "max_layover_minutes": 120
  },
  "calendar_context": [
    { "start": "2025-05-10T09:00:00Z", "title": "Client meeting in Paris" }
  ],
  "flights": [
    {
      "id": "off_001",
      "airline": "BA",
      "departure": "2025-05-09 18:00",
      "arrival": "2025-05-10 08:00",
      "duration_minutes": 660,
      "stops": 0,
      "price": 920,
      "cabin_class": "business"
    },
    {
      "id": "off_002",
      "airline": "LH",
      "departure": "2025-05-09 07:00",
      "arrival": "2025-05-09 19:00",
      "duration_minutes": 780,
      "stops": 1,
      "price": 680,
      "cabin_class": "economy"
    },
    {
      "id": "off_003",
      "airline": "AF",
      "departure": "2025-05-10 06:00",
      "arrival": "2025-05-10 15:00",
      "duration_minutes": 600,
      "stops": 0,
      "price": 1100,
      "cabin_class": "business"
    }
  ]
}
```

**Expected Output:**
```json
{
  "ranked_flights": [
    {
      "rank": 1,
      "flight_id": "off_001",
      "airline": "BA",
      "score": 0.95,
      "reasoning": "Non-stop BA flight arriving 08:00 (1 hour before 09:00 meeting). Business class, preferred airline. Perfect timing.",
      "key_factors": ["non-stop", "early-arrival", "preferred-airline", "business-class"],
      "price": 920,
      "stops": 0
    },
    {
      "rank": 2,
      "flight_id": "off_003",
      "airline": "AF",
      "score": 0.85,
      "reasoning": "Non-stop AF (preferred), arrives 15:00. Business class. Later arrival but solid backup.",
      "key_factors": ["non-stop", "preferred-airline", "business-class"],
      "price": 1100,
      "stops": 0
    },
    {
      "rank": 3,
      "flight_id": "off_002",
      "airline": "LH",
      "score": 0.50,
      "reasoning": "Arrives day before at 19:00. Economy class. Cheaper but not ideal for time-sensitive meeting.",
      "key_factors": ["budget-option", "early-arrival-day-before"],
      "price": 680,
      "stops": 1
    }
  ]
}
```

### Example 2: Leisure Trip (Budget Priority)

**Input:**
```json
{
  "trip_metadata": {
    "destination": "Barcelona",
    "departure_date": "2025-07-01",
    "return_date": "2025-07-08",
    "trip_reason": "Vacation"
  },
  "user_preferences": {
    "preferred_airlines": [],
    "cabin_class": "economy",
    "max_price": 600,
    "non_stop_only": false,
    "max_layover_minutes": 300
  },
  "calendar_context": [],
  "flights": [
    {
      "id": "off_101",
      "airline": "BA",
      "departure": "2025-07-01 08:00",
      "arrival": "2025-07-01 16:00",
      "duration_minutes": 720,
      "stops": 0,
      "price": 550,
      "cabin_class": "economy"
    },
    {
      "id": "off_102",
      "airline": "EasyJet",
      "departure": "2025-07-01 06:00",
      "arrival": "2025-07-01 19:00",
      "duration_minutes": 900,
      "stops": 1,
      "price": 220,
      "cabin_class": "economy"
    }
  ]
}
```

**Expected Output:**
```json
{
  "ranked_flights": [
    {
      "rank": 1,
      "flight_id": "off_101",
      "airline": "BA",
      "score": 0.88,
      "reasoning": "Non-stop flight, arrives 16:00 same day. Within budget at $550. Best balance of price and convenience.",
      "key_factors": ["non-stop", "within-budget", "reasonable-arrival"],
      "price": 550,
      "stops": 0
    },
    {
      "rank": 2,
      "flight_id": "off_102",
      "airline": "EasyJet",
      "score": 0.72,
      "reasoning": "Significantly cheaper ($220). 1-stop, 15h total. Good for flexible leisure traveler on tight budget.",
      "key_factors": ["budget-friendly", "acceptable-layover"],
      "price": 220,
      "stops": 1
    }
  ]
}
```

---

## Performance Notes

- **Token count:** ~800-1200 tokens (including context)
- **Latency:** ~1.5-2.5s (Llama 3.3 on Workers AI)
- **Success rate:** ~96% (most failures are JSON parse, not logic)
- **Cost:** ~$0.001-0.002 per call (negligible)

---

## Integration Points

1. **Input source:** `FlightToolClient.searchFlights()` response
2. **Caller:** `TravelWorkflowDO.rankFlights()`
3. **Output consumed by:** `TravelWorkflowDO.publishSuggestions()` → Frontend trip card
4. **Fallback:** If LLM fails, sort by price and return top 3

---

## Future Improvements

- [ ] Include seat map availability (SeatMaps API)
- [ ] Factor in airline reliability/on-time rates
- [ ] Consider environmental impact more prominently
- [ ] Support hotel/car rental recommendations alongside flights
- [ ] A/B test different ranking strategies (e.g., emphasize price vs. convenience)

---
