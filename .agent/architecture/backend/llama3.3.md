## LLAMA 3.3 (MICRO CoS)

# **1. What Llama 3.3 does**

**Primary functions:**

| Function                      | How Llama 3.3 handles it                                                         | Example                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Summarization**             | Takes a batch of messages, task updates, or notes and produces concise summaries | "Today, you have 3 meetings, 2 tasks overdue, and 1 action item for follow-up."                                                               |
| **Task extraction**           | Scans text input (chat, emails, voice transcription) for actionable items        | User types: "Call HR and send report by Friday" → LLM outputs: `[{ task: "Call HR", due: "Friday" }, { task: "Send report", due: "Friday" }]` |
| **Prioritization / planning** | Suggests order or grouping for tasks based on context                            | "Call HR before sending the report because it requires their approval."                                                                       |
| **Reminders / notifications** | Generates natural language reminders or suggested next steps                     | "Reminder: Follow up on report tomorrow morning before the team meeting."                                                                     |
| **Context-aware reasoning**   | Integrates memory / previous events from Durable Objects to provide continuity   | Knows that the "report" mentioned last week is the same "report" being referenced today.                                                      |
| **Flight ranking**            | Scores flight options based on user preferences, calendar context, constraints   | Given 10 flights for Paris trip: rank top 3 considering early arrival for meetings, non-stop preference, budget. Return ranked list with reasoning. |

---

# **2. Real-time interaction**

* **Token streaming:** Llama streams its output token-by-token to the app, so users **see responses live** instead of waiting for the full response.
* **Event-driven integration:** Each token is an event from the LLM → Durable Object → Realtime → frontend.
* **Incremental updates:** Show task suggestions or summaries as they are being generated, which makes the assistant feel fast and interactive.

---

# **3. Prompt Engineering**

## **General task / summarization prompts**

Feed the LLM structured prompts + context from the memory/state:

```text
You are a productivity assistant. User input: "Call HR and send report by Friday". 
Extract actionable tasks as JSON, include due dates and priority.

Recent conversation:
[last 20 messages from chat history]

Memory: [
  { "task": "Prepare report", "due": "Thursday" }
]
```

**Context window strategy:**
* Recent chat history (last 20 messages) provides conversational context
* Keeps token count manageable while maintaining continuity
* See `chat-history-management.md` for full context selection details

* LLM outputs structured JSON or text that the app can process.

---

## **Flight ranking prompt (tool output reasoning)**

When TravelWorkflowDO has flight options from flights-MCP, send to LLM for ranking:

```text
You are a travel advisor. A user has an upcoming trip and you must rank flight options.

User Context:
- Preferred airlines: {preferences.preferred_airlines}
- Cabin class preference: {preferences.cabin_class}
- Budget: ${preferences.max_price}
- Non-stop preferred: {preferences.non_stop_only}

Travel Event:
- Destination: {destination}
- Departure date: {departure_date}
- Calendar events on travel dates: {calendar_summary}

Flight Options:
{flight_options_json}

Rank flights 1-3 by suitability. Consider:
1. Alignment with user preferences (airline, cabin, non-stop)
2. Arrival/departure timing relative to calendar events
3. Price-to-convenience tradeoff
4. Total travel time

Output JSON: {"ranked": [{"flight_id": "...", "rank": 1, "score": 0.95, "reasoning": "..."}]}
```

LLM returns scored and ranked flights with reasoning. DO stores results and pushes to frontend.

---

# **4. How it all flows in the app**

## **Standard LLM flow (chat, task extraction)**

1. **User input:** Chat/voice → HTTP Worker → Durable Object → event (`user.message`)
2. **DO stores message:** Appends to event log and `messages[]` array
3. **DO triggers LLM Worker:** Sends structured prompt with user input + recent messages + memory/context
4. **LLM streams response:** Each token/event flows back to DO
5. **DO accumulates tokens:** Builds assistant message incrementally
6. **DO updates state & pushes to client:**

   * Assistant message finalized and appended to `messages[]`
   * New tasks added
   * Summaries generated
   * Reminders created
7. **Frontend updates in real-time** via Realtime events (`llm.token`, `message.completed`)

## **Tool output reasoning flow (flight ranking)**

1. **FlightToolClient Worker** calls flights-MCP → returns [FlightOption]
2. **TravelWorkflowDO** sends flights + user preferences to **LLM Ranking Worker**
3. **LLM streams ranking** token-by-token (JSON structured output)
4. **DO receives ranked flights**, stores in TravelProfileDO
5. **Realtime push** to frontend: "Flights found" card with top 3 options

Both flows are **fully serverless, real-time, and deterministic**, without training or heavy infrastructure.

---
