# Daily Planner Prompt

## Purpose

Create a prioritized daily plan by analyzing tasks, calendar events, and user preferences. Produces an actionable schedule with time blocks, priorities, and recommendations.

**When:** Daily (morning briefing), on-demand, or after major calendar/task changes
**Model:** Llama 3.3
**Output:** Prioritized task list with time blocks, focus suggestions, and scheduling recommendations

---

## Use Cases

1. **Morning briefing:** "Here's your day" with top priorities, calendar summary, time blocks for deep work
2. **Schedule optimization:** Identify gaps for task completion, suggest time blocks
3. **Conflict detection:** Warn if too many high-priority tasks for available time
4. **Travel day planning:** Integrate flight departures, commute time, meeting delays into plan
5. **Context switching:** Suggest task batching (e.g., group all emails together, deep work block)
6. **Energy management:** Place cognitively demanding tasks during peak hours, routine tasks during low energy

---

## Input Variables

- `tasks`: Array of extracted tasks for today and near-term

  - Type: Array of `{ id: string, title: string, deadline: ISO8601, priority: string, estimated_duration_minutes: number, category: string }`
  - Example: 5-15 tasks

- `calendar_events`: Today's and upcoming calendar events

  - Type: Array of `{ id: string, start: ISO8601, end: ISO8601, title: string, duration_minutes: number }`
  - Example: 3-8 events

- `user_preferences`: Daily planning preferences

  - Type: Object
  - Fields: start_time, end_time, focus_hours, break_frequency_minutes, commute_time_minutes, peak_hours
  - Example: `{ "start_time": "08:00", "end_time": "18:00", "focus_hours": ["09:00-11:00", "14:00-16:00"], "peak_hours": ["09:00-12:00"] }`

- `energy_profile`: User's energy pattern (optional)

  - Type: Object
  - Fields: peak_period (morning/afternoon), dips, focus_capacity_minutes
  - Example: `{ "peak_period": "morning", "dips": ["14:00-15:00"], "focus_capacity_minutes": 120 }`

- `current_timestamp`: Current time
  - Type: ISO8601
  - Example: `2025-05-10T08:15:00Z`

---

## Expected Output

```json
{
  "date": "2025-05-10",
  "summary": {
    "tasks_today": 6,
    "high_priority_count": 2,
    "meeting_count": 3,
    "free_time_minutes": 150,
    "recommended_focus_blocks": 2,
    "confidence": 0.87
  },
  "time_blocks": [
    {
      "start": "2025-05-10T08:00:00Z",
      "end": "2025-05-10T08:30:00Z",
      "type": "preparation",
      "title": "Morning prep & email triage",
      "description": "Check urgent emails, review calendar, prepare for first meeting",
      "suggested_tasks": [],
      "focus_level": "low"
    },
    {
      "start": "2025-05-10T08:30:00Z",
      "end": "2025-05-10T09:00:00Z",
      "type": "meeting",
      "title": "Team standup",
      "calendar_event_id": "evt_001",
      "focus_level": "medium"
    },
    {
      "start": "2025-05-10T09:00:00Z",
      "end": "2025-05-10T11:00:00Z",
      "type": "focus",
      "title": "Deep work: Q2 planning",
      "suggested_tasks": ["task_001", "task_002"],
      "description": "Prepare agenda and gather metrics (dependencies for 2pm meeting)",
      "focus_level": "high"
    },
    {
      "start": "2025-05-10T11:00:00Z",
      "end": "2025-05-10T11:15:00Z",
      "type": "break",
      "title": "Break & movement",
      "description": "Walk, stretch, hydrate",
      "focus_level": "none"
    },
    {
      "start": "2025-05-10T11:15:00Z",
      "end": "2025-05-10T12:00:00Z",
      "type": "work",
      "title": "Admin & emails",
      "suggested_tasks": [],
      "description": "Process messages, respond to non-urgent items",
      "focus_level": "low"
    },
    {
      "start": "2025-05-10T12:00:00Z",
      "end": "2025-05-10T13:00:00Z",
      "type": "break",
      "title": "Lunch",
      "focus_level": "none"
    },
    {
      "start": "2025-05-10T13:00:00Z",
      "end": "2025-05-10T14:00:00Z",
      "type": "focus",
      "title": "Deep work: Proposal review",
      "suggested_tasks": ["task_003"],
      "description": "High-priority review task (due Friday)",
      "focus_level": "high"
    },
    {
      "start": "2025-05-10T14:00:00Z",
      "end": "2025-05-10T15:00:00Z",
      "type": "meeting",
      "title": "Q2 Planning Meeting",
      "calendar_event_id": "evt_002",
      "focus_level": "high"
    },
    {
      "start": "2025-05-10T15:00:00Z",
      "end": "2025-05-10T15:30:00Z",
      "type": "break",
      "title": "Break & transition",
      "focus_level": "none"
    },
    {
      "start": "2025-05-10T15:30:00Z",
      "end": "2025-05-10T17:00:00Z",
      "type": "work",
      "title": "Follow-ups & task close-out",
      "suggested_tasks": ["task_004", "task_005"],
      "description": "Action items from planning meeting, wrap-up medium-priority tasks",
      "focus_level": "medium"
    }
  ],
  "priorities": {
    "must_do": [
      {
        "task_id": "task_001",
        "title": "Prepare Q2 planning agenda",
        "deadline": "2025-05-10T14:00:00Z"
      },
      {
        "task_id": "task_003",
        "title": "Review proposal draft",
        "deadline": "2025-05-09T17:00:00Z"
      }
    ],
    "should_do": [
      {
        "task_id": "task_004",
        "title": "Follow up with team",
        "deadline": "2025-05-10T17:00:00Z"
      },
      {
        "task_id": "task_005",
        "title": "Update project status",
        "deadline": "2025-05-11T09:00:00Z"
      }
    ],
    "nice_to_do": [
      {
        "task_id": "task_006",
        "title": "Research new tools",
        "deadline": "2025-05-15T17:00:00Z"
      }
    ]
  },
  "recommendations": [
    {
      "type": "action",
      "priority": "high",
      "message": "Proposal review is due Friday but only 45 min scheduled today. Consider extending focus block 13:00-14:00 by 15 min to complete it.",
      "suggested_adjustment": "Extend 'Proposal review' to 14:30, shorten break before planning meeting to 15 min"
    },
    {
      "type": "conflict",
      "priority": "medium",
      "message": "Travel booking task (30 min) not yet scheduled. Recommend adding to tomorrow or Friday if not urgent.",
      "task_id": "task_travel_001"
    },
    {
      "type": "focus",
      "priority": "medium",
      "message": "You have 2 high-focus blocks scheduled (3h total). This aligns with your peak morning hours. Good distribution.",
      "suggestion": "Protect 09:00-11:00 focus time—difficult meetings will disrupt momentum"
    },
    {
      "type": "energy",
      "priority": "low",
      "message": "14:00 planning meeting coincides with typical afternoon dip. Consider a short walk at 15:00 break.",
      "suggestion": null
    }
  ],
  "scheduling_opportunities": [
    {
      "type": "travel_booking",
      "task_id": "task_travel_001",
      "estimated_duration_minutes": 30,
      "available_slots": [
        { "start": "2025-05-10T12:00:00Z", "end": "2025-05-10T13:00:00Z" },
        { "start": "2025-05-11T08:30:00Z", "end": "2025-05-11T09:00:00Z" }
      ],
      "recommendation": "Friday morning before meetings starts. If urgent, move lunch today to 12:30-13:00 and book 12:00-12:30."
    }
  ]
}
```

---

## Message Format (Llama chat)

When calling Llama 3.3 via Workers AI, construct the chat messages as:

- `system`: Stable Micro CoS persona and safety/behavior instructions (see system prompt docs).
- `user`: The rendered prompt template below, with all `{...}` placeholders filled in from the current context.
- Optional few-shot: Additional `user` / `assistant` turns that show example inputs and ideal JSON outputs (taken from the Examples section) when reliability for a particular pattern needs to be increased.

## Prompt Template

```
You are the Micro Chief of Staff (Micro CoS) daily planning skill. Create an optimized daily schedule that balances meetings, high-priority tasks, deep work, and breaks.

Think through your planning steps internally, but **do not** include your reasoning or chain-of-thought in the output. Return only the final JSON that matches the requested schema.

---USER CONTEXT---
Name: {user_name}
Timezone: {timezone}
Current time: {current_timestamp}

---TODAY---
Date: {date}

---WORK PREFERENCES---
Working hours: {start_time} to {end_time}
Preferred focus blocks: {focus_hours} (e.g., 09:00-11:00)
Break frequency: every {break_frequency_minutes} minutes
Commute time: {commute_time_minutes} minutes
Peak energy hours: {peak_hours}
Focus capacity: {focus_capacity_minutes} minutes (how long you can sustain deep work)

---ENERGY PROFILE---
Peak period: {peak_period}
Energy dips: {dips}

---TODAY'S CALENDAR EVENTS---
{calendar_events_json}

---TODAY'S TASKS (All statuses)---
{tasks_json}

---PLANNING RULES---
1. **Calendar first:** Block all meetings, no negotiation
2. **High-priority tasks:** Schedule before medium/low (use earliest available time)
3. **Focus blocks:** Group tasks requiring deep work (min 60-90 min blocks without interruption)
4. **Breaks:** Insert 5-15 min breaks every {break_frequency_minutes} minutes
5. **Buffer time:** Leave 10-15 min before meetings for prep
6. **Energy alignment:** Place cognitively demanding work during peak hours
7. **Task batching:** Group similar tasks (emails, admin, follow-ups)
8. **Realism:** If total task time > available time, flag overallocation and recommend deferral

---TIME BLOCK TYPES---
- "meeting": Calendar events
- "focus": Deep work with high concentration (min 60 min)
- "work": Regular work (email, admin, task completion)
- "break": Rest, food, movement
- "preparation": Buffer time before important events

---OUTPUT STRUCTURE---
Return JSON with:
- date: Today's date (ISO8601, date only)
- summary: Overview stats (task count, priority distribution, free time, confidence)
- time_blocks: Ordered array of time blocks from start_time to end_time
- priorities: Grouped tasks (must_do, should_do, nice_to_do)
- recommendations: Array of planning suggestions, conflicts, optimizations
- scheduling_opportunities: Unscheduled tasks with available time slots

Follow a conservative planning strategy:
- Prefer **leaving slack time** rather than overfilling the day when there is ambiguity about duration or capacity.
- Do not invent calendar events, tasks, or deadlines that do not appear in the input or derived rules.

Return ONLY valid JSON, no markdown, no commentary, no extra text.
```

---

## Error Handling

| Scenario                           | Handling                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------- |
| More tasks than time available     | Rank by priority, flag overallocation in recommendations, suggest deferral |
| Task deadline in past              | Mark as overdue in priorities, urgent                                      |
| Invalid time format in preferences | Use defaults (8am-6pm, 90-min focus blocks)                                |
| Overlapping calendar events        | Treat as accurate (user's calendar owns conflicts)                         |
| Missing energy profile             | Assume balanced energy, no specific peak hours                             |
| Empty task list                    | Return calendar-only schedule with available focus blocks                  |
| LLM returns invalid JSON           | Return empty time_blocks array, log error                                  |

---

## Examples

### Example 1: Busy Day with High-Priority Prep

**Input:**

```json
{
  "current_timestamp": "2025-05-10T08:00:00Z",
  "user_preferences": {
    "start_time": "08:00",
    "end_time": "18:00",
    "focus_hours": ["09:00-12:00"],
    "break_frequency_minutes": 90,
    "peak_hours": ["09:00-12:00"]
  },
  "tasks": [
    {
      "id": "t1",
      "title": "Prepare Q2 planning agenda",
      "deadline": "2025-05-10T14:00:00Z",
      "priority": "high",
      "estimated_duration_minutes": 60
    },
    {
      "id": "t2",
      "title": "Review proposal draft",
      "deadline": "2025-05-09T17:00:00Z",
      "priority": "high",
      "estimated_duration_minutes": 45
    },
    {
      "id": "t3",
      "title": "Update status report",
      "deadline": "2025-05-10T17:00:00Z",
      "priority": "medium",
      "estimated_duration_minutes": 30
    }
  ],
  "calendar_events": [
    {
      "id": "e1",
      "start": "2025-05-10T09:00:00Z",
      "end": "2025-05-10T09:30:00Z",
      "title": "Team standup",
      "duration_minutes": 30
    },
    {
      "id": "e2",
      "start": "2025-05-10T14:00:00Z",
      "end": "2025-05-10T15:00:00Z",
      "title": "Q2 Planning Meeting",
      "duration_minutes": 60
    }
  ]
}
```

**Expected Output:** (See Expected Output section above)

### Example 2: Light Day with Focus Time

**Input:**

```json
{
  "current_timestamp": "2025-05-12T08:00:00Z",
  "user_preferences": {
    "start_time": "08:00",
    "end_time": "17:00",
    "focus_hours": ["09:00-12:00", "14:00-16:00"],
    "break_frequency_minutes": 90,
    "peak_hours": ["09:00-12:00"]
  },
  "tasks": [
    {
      "id": "t1",
      "title": "Research new tools",
      "deadline": "2025-05-15T17:00:00Z",
      "priority": "low",
      "estimated_duration_minutes": 120
    },
    {
      "id": "t2",
      "title": "Write blog post",
      "deadline": "2025-05-16T17:00:00Z",
      "priority": "medium",
      "estimated_duration_minutes": 90
    }
  ],
  "calendar_events": [
    {
      "id": "e1",
      "start": "2025-05-12T10:00:00Z",
      "end": "2025-05-12T10:30:00Z",
      "title": "1-on-1 with manager",
      "duration_minutes": 30
    }
  ]
}
```

**Expected Output:**

```json
{
  "date": "2025-05-12",
  "summary": {
    "tasks_today": 2,
    "high_priority_count": 0,
    "meeting_count": 1,
    "free_time_minutes": 360,
    "recommended_focus_blocks": 2,
    "confidence": 0.92
  },
  "time_blocks": [
    {
      "start": "2025-05-12T08:00:00Z",
      "end": "2025-05-12T09:00:00Z",
      "type": "focus",
      "title": "Deep work: Blog post research",
      "suggested_tasks": ["t2"],
      "focus_level": "high"
    },
    {
      "start": "2025-05-12T09:00:00Z",
      "end": "2025-05-12T10:00:00Z",
      "type": "focus",
      "title": "Deep work: Blog post writing",
      "suggested_tasks": ["t2"],
      "focus_level": "high"
    },
    {
      "start": "2025-05-12T10:00:00Z",
      "end": "2025-05-12T10:30:00Z",
      "type": "meeting",
      "title": "1-on-1 with manager",
      "calendar_event_id": "e1"
    },
    {
      "start": "2025-05-12T10:30:00Z",
      "end": "2025-05-12T12:00:00Z",
      "type": "focus",
      "title": "Deep work: Tool research",
      "suggested_tasks": ["t1"],
      "focus_level": "high"
    },
    {
      "start": "2025-05-12T12:00:00Z",
      "end": "2025-05-12T13:00:00Z",
      "type": "break",
      "title": "Lunch"
    },
    {
      "start": "2025-05-12T13:00:00Z",
      "end": "2025-05-12T17:00:00Z",
      "type": "work",
      "title": "Admin, catch-up, deep work if energized",
      "suggested_tasks": [],
      "description": "Flexible afternoon. All high-priority work is done. Available for overflow or personal projects."
    }
  ],
  "priorities": {
    "must_do": [],
    "should_do": [
      {
        "task_id": "t2",
        "title": "Write blog post",
        "deadline": "2025-05-16T17:00:00Z"
      }
    ],
    "nice_to_do": [
      {
        "task_id": "t1",
        "title": "Research new tools",
        "deadline": "2025-05-15T17:00:00Z"
      }
    ]
  },
  "recommendations": [
    {
      "type": "focus",
      "priority": "high",
      "message": "Light calendar day—excellent opportunity for deep work. Blog post (90 min) fits perfectly in morning focus block.",
      "suggestion": "All critical work can be completed before lunch. Afternoon is yours."
    }
  ],
  "scheduling_opportunities": []
}
```

---

## Performance Notes

- **Token count:** ~1000-1500 tokens (including full schedule)
- **Latency:** ~1.5-2.5s (Llama 3.3 on Workers AI)
- **Success rate:** ~93% (failures mostly from edge case time conflicts)
- **Cost:** ~$0.0012-0.002 per call

---

## Integration Points

1. **Input source:** `TaskManagementDO.extractTasks()` output, Google Calendar MCP, user preferences
2. **Caller:** `DailyPlannerDO.generatePlan()` (triggered on user request or 7-8am daily)
3. **Output consumed by:** Frontend "Daily Plan" view, push notifications, mobile briefing
4. **Fallback:** If LLM fails, return calendar + task list unsorted

---

## Future Improvements

- [ ] Learn optimal focus block length from user's task completion history
- [ ] Integrate team calendar to suggest collaboration windows
- [ ] Suggest context switching penalties when jumping between task types
- [ ] Auto-defer low-priority tasks if overallocated
- [ ] Support "time boxing" for open-ended tasks
- [ ] Integration with travel bookings (auto-block commute time on travel days)

---
