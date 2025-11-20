# Task Extraction Prompt

## Purpose

Extract actionable tasks from calendar events, emails, and user messages. Converts unstructured information into a structured task list with deadlines, priorities, and dependencies.

**When:** On schedule (e.g., daily), or triggered by new calendar events / email ingestion
**Model:** Llama 3.3
**Output:** Structured task array with title, deadline, priority, category, and related events

---

## Use Cases

1. **Calendar event processing:** "Quarterly planning meeting Apr 15" → Extract prep tasks (create agenda, gather data, schedule follow-ups)
2. **Email inbox:** "Can you review the proposal by Friday?" → Extract task with deadline
3. **Mention detection:** Message mentions "need to book flights" → Extract travel prep task
4. **Project kickoff:** Calendar event "Q2 Strategy Launch" → Extract sub-tasks (stakeholder alignment, resource planning, etc.)
5. **Recurring patterns:** Weekly standup scheduled → Extract recurring task (prepare update, gather metrics)

---

## Input Variables

- `calendar_events`: Array of upcoming calendar events
  - Type: Array of `{ id: string, start: ISO8601, end: ISO8601, title: string, description: string, attendees: string[] }`
  - Example: `[{ "id": "evt_123", "start": "2025-05-10T14:00:00Z", "title": "Q2 Planning Meeting", "description": "Discuss roadmap priorities" }]`

- `recent_messages`: Recent emails, Slack messages, or user notes
  - Type: Array of `{ source: string, timestamp: ISO8601, content: string, sender?: string }`
  - Example: `[{ "source": "email", "timestamp": "2025-05-08T10:30:00Z", "content": "Need flight options to Denver by next week" }]`

- `user_preferences`: Task preferences (categories, priority thresholds, etc.)
  - Type: Object
  - Fields: preferred_categories, min_priority_level, include_recurring
  - Example: `{ "preferred_categories": ["work", "travel", "personal"], "min_priority_level": "medium" }`

- `existing_tasks`: Tasks already in system (to avoid duplicates)
  - Type: Array of `{ id: string, title: string, deadline: ISO8601 }`
  - Example: `[]` (empty if first run)

---

## Expected Output

```json
{
  "tasks": [
    {
      "id": "task_00001",
      "title": "Prepare Q2 planning agenda",
      "description": "Compile roadmap priorities and growth metrics for May 10 meeting",
      "deadline": "2025-05-10T13:00:00Z",
      "priority": "high",
      "category": "work",
      "status": "todo",
      "related_events": ["evt_123"],
      "estimated_duration_minutes": 45,
      "dependencies": [],
      "owner": "user_id_here"
    },
    {
      "id": "task_00002",
      "title": "Book flights to Denver",
      "description": "Search and compare flight options, check user preferences (non-stop, cabin class)",
      "deadline": "2025-05-14T17:00:00Z",
      "priority": "high",
      "category": "travel",
      "status": "todo",
      "related_events": [],
      "estimated_duration_minutes": 30,
      "dependencies": [],
      "owner": "user_id_here"
    },
    {
      "id": "task_00003",
      "title": "Gather Q2 metrics",
      "description": "Compile growth, engagement, and product metrics for planning meeting",
      "deadline": "2025-05-09T17:00:00Z",
      "priority": "medium",
      "category": "work",
      "status": "todo",
      "related_events": ["evt_123"],
      "estimated_duration_minutes": 60,
      "dependencies": [],
      "owner": "user_id_here"
    }
  ],
  "extraction_quality": {
    "events_processed": 5,
    "messages_processed": 12,
    "tasks_extracted": 3,
    "duplicates_found": 0,
    "low_confidence_extractions": []
  }
}
```

---

## Prompt Template

```
You are a task extraction assistant. Analyze calendar events and messages to identify actionable tasks.

---USER CONTEXT---
User ID: {user_id}
Name: {user_name}
Timezone: {timezone}
Current time: {current_timestamp}

---PREFERENCES---
Preferred task categories: {preferred_categories}
Minimum priority level to include: {min_priority_level}
Include recurring tasks: {include_recurring}

---CALENDAR EVENTS (Next 30 days)---
{calendar_events_json}

---RECENT MESSAGES (Past 7 days)---
{recent_messages_json}

---EXISTING TASKS (For deduplication)---
{existing_tasks_json}

---TASK EXTRACTION RULES---
1. **Extract from calendar:** Meeting title + description → identify prep tasks, follow-up tasks
2. **Extract from messages:** Keywords like "need to", "can you", "remind me", "schedule", "book", "review"
3. **Avoid duplicates:** Compare against existing_tasks by title similarity and deadline proximity
4. **Set deadlines:** For calendar events, extract _subtasks_ due before the event. For messages, use stated deadline or infer from context.
5. **Prioritize:** 
   - HIGH: Time-sensitive (within 48h), critical for events, blocking other work
   - MEDIUM: Due within 1 week, important but not blocking
   - LOW: Nice-to-have, flexible deadline
6. **Estimate duration:** Time to complete the task (realistic, in minutes)
7. **Link relationships:** Mark dependencies (e.g., "gather metrics" blocks "prepare agenda")

---TASK ATTRIBUTES---
For each extracted task, include:
- title: Short, actionable phrase (max 50 chars)
- description: 1-2 sentences of context
- deadline: ISO8601 timestamp (inferred if not explicit)
- priority: high, medium, low
- category: Choose from {preferred_categories} or infer (work, personal, travel, etc.)
- related_events: Array of event IDs referenced by this task
- estimated_duration_minutes: How long to complete
- dependencies: Task IDs this task depends on (empty array if none)

---OUTPUT---
Return a JSON object with:
- tasks: Array of extracted tasks (may be empty if no clear tasks found)
- extraction_quality: Object with { events_processed, messages_processed, tasks_extracted, duplicates_found, low_confidence_extractions }

Return ONLY valid JSON, no markdown, no extra text.
```

---

## Error Handling

| Scenario | Handling |
| --- | --- |
| Invalid calendar event format | Skip event, log warning, continue processing |
| Message is incomplete/garbled | Skip message, do not extract |
| Task deadline can't be inferred | Use current_time + 7 days as default |
| Duplicate task detected | Skip extraction, increment duplicates_found counter |
| Low-confidence extraction (ambiguous) | Add to low_confidence_extractions array for manual review |
| LLM returns invalid JSON | Return empty tasks array, log error |
| Empty inputs (no events/messages) | Return empty tasks array (not an error) |

---

## Examples

### Example 1: Calendar Event with Prep Tasks

**Input:**
```json
{
  "calendar_events": [
    {
      "id": "evt_001",
      "start": "2025-05-10T14:00:00Z",
      "title": "Q2 Planning Meeting",
      "description": "Review roadmap, discuss priorities and resource allocation"
    }
  ],
  "recent_messages": [],
  "user_preferences": { "preferred_categories": ["work", "travel"], "min_priority_level": "medium" },
  "existing_tasks": []
}
```

**Expected Output:**
```json
{
  "tasks": [
    {
      "id": "task_0001",
      "title": "Prepare Q2 planning agenda",
      "description": "Compile roadmap priorities and metrics. Share draft with team.",
      "deadline": "2025-05-10T12:00:00Z",
      "priority": "high",
      "category": "work",
      "status": "todo",
      "related_events": ["evt_001"],
      "estimated_duration_minutes": 60,
      "dependencies": ["task_0002"]
    },
    {
      "id": "task_0002",
      "title": "Gather Q2 metrics",
      "description": "Compile growth, engagement, and product metrics.",
      "deadline": "2025-05-09T17:00:00Z",
      "priority": "high",
      "category": "work",
      "status": "todo",
      "related_events": ["evt_001"],
      "estimated_duration_minutes": 90,
      "dependencies": []
    }
  ],
  "extraction_quality": {
    "events_processed": 1,
    "messages_processed": 0,
    "tasks_extracted": 2,
    "duplicates_found": 0,
    "low_confidence_extractions": []
  }
}
```

### Example 2: Message-Based Task Extraction

**Input:**
```json
{
  "calendar_events": [],
  "recent_messages": [
    {
      "source": "email",
      "timestamp": "2025-05-08T09:15:00Z",
      "content": "Hey, can you review the proposal draft by Friday? Also, we need flight options to Denver for the team offsite next week."
    }
  ],
  "user_preferences": { "preferred_categories": ["work", "travel"], "min_priority_level": "medium" },
  "existing_tasks": []
}
```

**Expected Output:**
```json
{
  "tasks": [
    {
      "id": "task_0010",
      "title": "Review proposal draft",
      "description": "Review and provide feedback on proposal draft",
      "deadline": "2025-05-09T17:00:00Z",
      "priority": "high",
      "category": "work",
      "status": "todo",
      "related_events": [],
      "estimated_duration_minutes": 45,
      "dependencies": []
    },
    {
      "id": "task_0011",
      "title": "Search flights to Denver for team offsite",
      "description": "Find flight options for team offsite next week. Check user preferences.",
      "deadline": "2025-05-12T17:00:00Z",
      "priority": "high",
      "category": "travel",
      "status": "todo",
      "related_events": [],
      "estimated_duration_minutes": 30,
      "dependencies": []
    }
  ],
  "extraction_quality": {
    "events_processed": 0,
    "messages_processed": 1,
    "tasks_extracted": 2,
    "duplicates_found": 0,
    "low_confidence_extractions": []
  }
}
```

---

## Performance Notes

- **Token count:** ~600-1000 tokens (varies with input size)
- **Latency:** ~1-2s (Llama 3.3 on Workers AI)
- **Success rate:** ~94% (most failures from ambiguous input)
- **Cost:** ~$0.0008-0.0015 per call

---

## Integration Points

1. **Input source:** Calendar sync (Google Calendar MCP), Email ingestion, Durable Object message log
2. **Caller:** `TaskManagementDO.extractTasks()` (triggered on schedule or after calendar sync)
3. **Output consumed by:** `DailyPlannerDO` (for prioritization), `TaskListUI` (for display)
4. **Fallback:** If LLM fails, return empty tasks array (no extraction rather than bad extraction)

---

## Future Improvements

- [ ] Support recurring task templates (weekly standup → extract every Monday)
- [ ] Extract meeting prep checklists automatically
- [ ] Detect urgency keywords (asap, urgent, critical) for priority override
- [ ] Link tasks to Slack/Email source messages for context
- [ ] Auto-suggest task durations based on category and user history

---
