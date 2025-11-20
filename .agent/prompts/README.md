# LLM Prompts for Micro Chief of Staff

This directory contains all LLM prompt templates used throughout the Micro CoS system.

## Directory Structure

```
prompts/
├── README.md (this file)
├── task-extraction.md
├── flight-ranking.md
├── daily-planner.md
├── summarization.md
├── travel-event-classification.md
└── context-assembly.md
```

## Prompt Categories

### 1. **Task Extraction** (`task-extraction.md`)
Used when: User sends chat message with actionable items
Model: Llama 3.3
Output: JSON array of tasks
Frequency: Every user message

### 2. **Flight Ranking** (`flight-ranking.md`)
Used when: TravelWorkflow receives flight options from flights-MCP
Model: Llama 3.3
Output: Ranked flight options with scores and reasoning
Frequency: Per travel event detection

### 3. **Daily Planner** (`daily-planner.md`)
Used when: Scheduled daily planner workflow runs
Model: Llama 3.3
Output: Prioritized plan with top priorities, todos, notes
Frequency: Once per day (configurable)

### 4. **Summarization** (`summarization.md`)
Used when: User requests summary or workflow generates digest
Model: Llama 3.3
Output: Concise summary with key takeaways
Frequency: On-demand + periodic

### 5. **Travel Event Classification** (`travel-event-classification.md`)
Used when: TravelEventDetector encounters ambiguous calendar event
Model: Llama 3.3
Output: Travel classification, destination, confidence
Frequency: Per ambiguous calendar event

### 6. **Context Assembly** (`context-assembly.md`)
Used when: Building LLM context for any prompt
Pattern: How to include user memory, preferences, calendar context
Frequency: Every LLM call

---

## Best Practices

### Prompt Design
- ✅ Keep prompts concise but complete
- ✅ Use structured output (JSON when possible)
- ✅ Include context but trim unnecessary details
- ✅ Use examples for complex tasks
- ✅ Clearly separate instructions from user input

### Output Validation
- ✅ Always validate JSON output
- ✅ Handle parse errors gracefully
- ✅ Provide fallbacks for invalid responses
- ✅ Log prompt + response for debugging

### Token Management
- ✅ Trim context to essential data only
- ✅ Use summaries for long histories
- ✅ Cache user preferences in memory
- ✅ Avoid repeating same context across calls

### Observability
- ✅ Log prompt version/hash
- ✅ Track LLM latency per prompt
- ✅ Monitor output validity rate
- ✅ Correlate with operation_id

---

## Prompt Template Format

Each prompt file follows this structure:

```markdown
# {Prompt Name}

## Purpose
{Why and when this prompt is used}

## Use Cases
- Use case 1
- Use case 2

## Input Variables
- `variable_1`: {description, type, example}
- `variable_2`: {description, type, example}

## Expected Output
{Schema/structure, example}

## Prompt Template
{Actual prompt text with placeholders}

## Error Handling
{What to do if LLM fails or returns invalid output}

## Examples
### Example 1
Input: {...}
Output: {...}

### Example 2
Input: {...}
Output: {...}

## Performance Notes
- Token count: ~{X}
- Latency: ~{Y}ms
- Success rate: {Z}%
```

---

## Accessing Prompts Programmatically

Each prompt can be loaded and rendered:

```typescript
import { loadPrompt } from '@lib/prompts';

const prompt = await loadPrompt('flight-ranking', {
  flights: flightOptions,
  userPreferences: userProfile.preferences,
  calendarContext: upcomingEvents
});

const llmResponse = await callLlama(prompt);
```

---

## Versioning Prompts

If a prompt is updated, create a versioned copy:

```
flight-ranking.md          (current, v2)
flight-ranking.v1.md       (archived)
flight-ranking.v0.md       (archived)
```

Document changes in each file:

```markdown
## Changelog
### v2 (2025-01-20)
- Added emissions ranking factor
- Improved non-stop preference handling

### v1 (2025-01-10)
- Initial version
```

---

## Integration with Tools

Prompts often feed data from tool calls:

```
CalendarToolClient.getEvents() 
  → Calendar events (raw)
  → {context passed to task-extraction prompt}
  → LLM extracts tasks
  → TaskSkill creates tasks in DO
  
FlightToolClient.searchFlights()
  → Flight options (raw)
  → {context passed to flight-ranking prompt}
  → LLM ranks flights
  → TravelWorkflow stores ranked results
```

See `.agent/tools/` for tool specifications.

---

## Future Enhancements

- [ ] Prompt optimization with few-shot examples
- [ ] A/B testing prompts with different phrasings
- [ ] Dynamic prompt selection based on context
- [ ] Prompt caching for repeated patterns
- [ ] Cost tracking per prompt (token usage)

---
