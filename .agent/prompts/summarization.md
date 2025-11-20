# Summarization Prompt

## Purpose

Generate concise summaries of meetings, emails, threads, and work sessions. Extracts key decisions, action items, and context for future reference.

**When:** Post-meeting, after email threads, end-of-day/week
**Model:** Llama 3.3
**Output:** Structured summary with key points, decisions, action items, and participants

---

## Use Cases

1. **Meeting recap:** Calendar event + transcript/notes → Summary with decisions and action items
2. **Email thread:** Long chain of emails → Extract consensus and next steps
3. **Work session summary:** Day's completed tasks → Weekly progress note
4. **Discussion resolution:** Slack thread or chat → Decision + rationale
5. **Weekly review:** All meetings + emails → High-level summary for stakeholders
6. **Onboarding context:** Past meeting summaries → Context for new team member

---

## Input Variables

- `content`: Source material to summarize

  - Type: Object with `source_type` (meeting, email, thread, work_session), `text`, `timestamp`, `participants` (optional)
  - Example: `{ "source_type": "meeting", "text": "transcript here...", "timestamp": "2025-05-10T14:00:00Z", "participants": ["Alice", "Bob"] }`

- `context_type`: What kind of summary is needed

  - Type: String enum (quick, detailed, actionable, strategic)
  - Examples: "quick" (2-3 bullet points), "detailed" (structured with sections), "actionable" (focus on tasks)

- `audience`: Who will read this

  - Type: String (self, team, leadership, client)
  - Affects tone and detail level

- `previous_context`: Any prior summaries or context
  - Type: Array of `{ id: string, title: string, date: ISO8601 }`
  - Example: `[]` (empty if first summary)

---

## Expected Output

```json
{
  "summary": {
    "title": "Q2 Planning Meeting - May 10",
    "date": "2025-05-10",
    "duration_minutes": 60,
    "participants": ["Alice Chen", "Bob Smith", "Carol Lee"],
    "type": "meeting",
    "source_type": "meeting"
  },
  "overview": "Team finalized Q2 roadmap with focus on 3 key initiatives: AI features, performance optimization, and infrastructure scaling. Budget approved at $500k. Next review June 1.",
  "key_points": [
    {
      "category": "decisions",
      "points": [
        "Prioritize AI feature development (40% team allocation)",
        "Defer mobile app redesign to Q3 (blocked by infrastructure)",
        "Budget approved: $500k for Q2 initiatives",
        "Hiring: 2 engineers for AI team by June 1"
      ]
    },
    {
      "category": "discussions",
      "points": [
        "Performance targets: 50% faster query times by end of Q2",
        "Risk: Infra scaling could delay feature work by 2 weeks",
        "Team expressed concern about aggressive timeline"
      ]
    },
    {
      "category": "blockers",
      "points": [
        "Infrastructure team needs clarification on API requirements by May 12"
      ]
    }
  ],
  "action_items": [
    {
      "id": "ai_0001",
      "task": "Finalize AI feature spec and acceptance criteria",
      "owner": "Alice Chen",
      "deadline": "2025-05-14",
      "priority": "high",
      "depends_on": [],
      "status": "assigned"
    },
    {
      "id": "ai_0002",
      "task": "Submit API requirements doc to infrastructure team",
      "owner": "Bob Smith",
      "deadline": "2025-05-12",
      "priority": "high",
      "depends_on": [],
      "status": "assigned"
    },
    {
      "id": "ai_0003",
      "task": "Schedule hiring interviews for AI engineers",
      "owner": "Carol Lee",
      "deadline": "2025-05-20",
      "priority": "medium",
      "depends_on": [],
      "status": "assigned"
    }
  ],
  "decisions": [
    {
      "decision": "Prioritize AI feature development at 40% team capacity",
      "rationale": "Market opportunity for AI differentiates us. Performance work is foundation.",
      "impact": "Mobile redesign deferred to Q3",
      "reversible": true,
      "review_date": "2025-06-01"
    },
    {
      "decision": "Allocate $500k budget for Q2 initiatives",
      "rationale": "Requested amount approved by finance. Allows for hiring and infrastructure investment.",
      "impact": "Resources available for aggressive roadmap",
      "reversible": false
    }
  ],
  "risks": [
    {
      "risk": "Infrastructure scaling could delay feature delivery",
      "probability": "medium",
      "impact": "high",
      "mitigation": "Parallel work stream; use existing API in interim",
      "owner": "Bob Smith"
    },
    {
      "risk": "Aggressive timeline may cause burnout",
      "probability": "medium",
      "impact": "medium",
      "mitigation": "Monitor team capacity; be ready to adjust scope",
      "owner": "Alice Chen"
    }
  ],
  "next_steps": [
    "Alice: Finalize AI feature spec (due May 14)",
    "Bob: Submit API requirements (due May 12)",
    "Carol: Post job descriptions and schedule interviews (start May 12)",
    "All: Schedule mid-Q2 review for June 1"
  ],
  "follow_up_meetings": [
    {
      "type": "follow-up",
      "title": "Q2 Roadmap Review",
      "suggested_date": "2025-06-01",
      "attendees": ["Alice Chen", "Bob Smith", "Carol Lee"],
      "purpose": "Review progress, address risks, adjust scope if needed"
    }
  ],
  "tags": ["q2-planning", "roadmap", "hiring", "budget"],
  "summary_quality": {
    "completeness": 0.92,
    "actionability": 0.88,
    "clarity": 0.9
  }
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
You are the Chief of Staff (Micro CoS) summarization skill. Create a clear, actionable summary of the provided content.

Think through your analysis internally, but **do not** include your reasoning or chain-of-thought in the output. Return only the final JSON that matches the requested schema.

---CONTEXT---
Summary type: {context_type} (quick, detailed, actionable, strategic)
Audience: {audience} (self, team, leadership, client)
Source: {source_type} (meeting, email, thread, work_session)
Date: {timestamp}
Participants: {participants}

---CONTENT TO SUMMARIZE---
{content_text}

---PREVIOUS CONTEXT---
{previous_context_json}

---SUMMARIZATION RULES---
1. **Extraction accuracy:** Extract exact decisions, not interpretations
2. **Actionable items:** Identify _specific_ next steps with owner and deadline
3. **Audience tone:** Adjust language (technical for team, executive summary for leadership)
4. **Decisions vs. discussions:** Clearly distinguish what was decided vs. what was discussed
5. **Risks & blockers:** Highlight any concerns or dependencies raised
6. **Completeness:** Include all participants, key points, action items; no significant details omitted
7. **Brevity:** For "quick" summaries, max 200 words. For "detailed", full structure.
8. **Future-ready:** Summaries should be useful for: (a) attendees to recall context, (b) absent team members to catch up, (c) tracking decisions over time

---OUTPUT STRUCTURE---
Return JSON with:
- summary: Metadata (title, date, duration, participants, type)
- overview: 2-3 sentence high-level summary
- key_points: Grouped by category (decisions, discussions, blockers, wins)
- action_items: Array with task, owner, deadline, priority, status
- decisions: Major decisions with rationale and impact
- risks: Identified risks or concerns
- next_steps: Bulleted list of immediate next steps
- follow_up_meetings: Suggested follow-up meetings with attendees/purpose
- tags: Keywords for categorization
- summary_quality: Scores for completeness, actionability, clarity (0.0-1.0)

For "quick" summaries, return simplified structure:
- overview, key_points (max 3), action_items (max 3), next_steps

Follow a conservative summarization strategy:
- Prefer **omitting** speculative details or decisions that are not clearly supported by the source content.
- Do not invent participants, dates, or commitments that do not appear in the input.

Return ONLY valid JSON, no markdown, no commentary, no extra text.
```

---

## Error Handling

| Scenario                         | Handling                                                       |
| -------------------------------- | -------------------------------------------------------------- |
| Content is too short/unclear     | Return overview only, flag summary_quality.completeness < 0.5  |
| No clear action items identified | Return empty action_items array (not all summaries have tasks) |
| Participant list incomplete      | Use available names, note in summary_quality                   |
| Conflicting decisions mentioned  | Extract both, note contradiction in key_points                 |
| LLM returns invalid JSON         | Return overview text only, log error                           |
| Missing timestamp                | Use current_timestamp as fallback                              |
| Ambiguous task ownership         | Flag as "TBD" and note in action_items                         |

---

## Examples

### Example 1: Meeting Summary (Detailed)

**Input:**

```json
{
  "source_type": "meeting",
  "content_type": "detailed",
  "audience": "team",
  "text": "Started at 2pm. Discussed Q2 roadmap priorities. Alice presented AI feature proposal—took 30 min. Team asked questions about timeline and resource needs. Bob raised concern about infra scaling. Carol mentioned hiring timeline. Approved $500k budget. Defer mobile redesign to Q3. Next review June 1. Everyone needs to finalize specs by May 14.",
  "timestamp": "2025-05-10T14:00:00Z",
  "participants": ["Alice Chen", "Bob Smith", "Carol Lee", "David Wong"]
}
```

**Expected Output:** (See Expected Output section above)

### Example 2: Email Thread Summary (Quick)

**Input:**

```json
{
  "source_type": "email",
  "context_type": "quick",
  "audience": "self",
  "text": "From: Manager\nSubject: Proposal Review Needed\n\nHi, can you review the attached proposal draft by Friday? We need to present to stakeholders on Monday. It's about our Q2 pricing strategy. Let me know if you have questions.\n\nFrom: Me\nI'll have feedback by Thursday EOD. Any specific areas to focus on?\n\nFrom: Manager\nPrice points, competitive analysis, and implementation timeline. The competitive section needs the most work.",
  "timestamp": "2025-05-10T10:15:00Z",
  "participants": ["Manager", "Self"]
}
```

**Expected Output:**

```json
{
  "summary": {
    "title": "Proposal Review Request - Q2 Pricing Strategy",
    "date": "2025-05-10",
    "participants": ["Manager"],
    "type": "email"
  },
  "overview": "Manager requested proposal review by Friday (May 9) for Monday stakeholder presentation. Focus areas: price points, competitive analysis, implementation timeline.",
  "key_points": [
    {
      "category": "requests",
      "points": ["Review pricing strategy proposal by Friday EOD"]
    },
    {
      "category": "focus_areas",
      "points": [
        "Price points",
        "Competitive analysis (needs most work)",
        "Implementation timeline"
      ]
    }
  ],
  "action_items": [
    {
      "id": "prop_0001",
      "task": "Review proposal: focus on price points, competitive analysis, implementation timeline",
      "owner": "Self",
      "deadline": "2025-05-09T17:00:00Z",
      "priority": "high",
      "status": "assigned"
    }
  ],
  "next_steps": [
    "Provide feedback to manager by Thursday EOD",
    "Manager presents to stakeholders Monday"
  ],
  "tags": ["q2-pricing", "proposal"],
  "summary_quality": {
    "completeness": 0.95,
    "actionability": 0.98,
    "clarity": 0.96
  }
}
```

### Example 3: Work Session Summary (Actionable)

**Input:**

```json
{
  "source_type": "work_session",
  "context_type": "actionable",
  "audience": "self",
  "text": "Today completed: Task extraction prompt design, reviewed design patterns. Started: Daily planner prompt. Blocked: Need example calendar data. Learned: Durable Objects patterns for state management. Tomorrow: Finish daily planner, start summarization prompt.",
  "timestamp": "2025-05-10T17:00:00Z",
  "participants": ["Self"]
}
```

**Expected Output:**

```json
{
  "summary": {
    "title": "Work Session - May 10 (Prompts & Patterns)",
    "date": "2025-05-10",
    "type": "work_session"
  },
  "overview": "Completed task extraction prompt design. Advanced on daily planner prompt. Identified blocker on example calendar data.",
  "key_points": [
    {
      "category": "completed",
      "points": [
        "Task extraction prompt design (complete)",
        "Reviewed state management patterns"
      ]
    },
    {
      "category": "in_progress",
      "points": ["Daily planner prompt (50% complete)"]
    },
    {
      "category": "blockers",
      "points": ["Need example calendar event format for testing"]
    },
    {
      "category": "learnings",
      "points": [
        "Durable Objects pattern for single source of truth state management"
      ]
    }
  ],
  "action_items": [
    {
      "id": "work_0001",
      "task": "Finish daily planner prompt (error handling section)",
      "owner": "Self",
      "deadline": "2025-05-11T11:00:00Z",
      "priority": "high"
    },
    {
      "id": "work_0002",
      "task": "Get example calendar data from product team",
      "owner": "Self",
      "deadline": "2025-05-11T10:00:00Z",
      "priority": "high"
    },
    {
      "id": "work_0003",
      "task": "Start summarization prompt",
      "owner": "Self",
      "deadline": "2025-05-11T14:00:00Z",
      "priority": "medium"
    }
  ],
  "next_steps": [
    "Unblock: Request calendar data from product team",
    "Complete daily planner prompt tomorrow morning",
    "Start summarization prompt after daily planner is done"
  ],
  "tags": ["prompts", "agentic-design", "development"],
  "summary_quality": {
    "completeness": 0.9,
    "actionability": 0.92,
    "clarity": 0.93
  }
}
```

---

## Performance Notes

- **Token count:** ~500-1200 tokens (varies with content length)
- **Latency:** ~1-2s (Llama 3.3 on Workers AI)
- **Success rate:** ~96% (highly consistent output format)
- **Cost:** ~$0.0008-0.0015 per call

---

## Integration Points

1. **Input source:** Google Calendar (meeting notes/transcripts), email ingestion, work session logs
2. **Caller:** `SummarizationWorker.summarize()` (triggered post-meeting, on-demand, or scheduled)
3. **Output consumed by:** Task Management DO (extract action items), knowledge base (store for search), email reply, Slack notification
4. **Fallback:** If LLM fails, return basic overview (participants + timestamps + first few sentences)

---

## Future Improvements

- [ ] Support audio/video transcription (auto-convert meeting recordings to summary)
- [ ] Track decision outcomes over time (link decisions to future summary results)
- [ ] Extract sentiment/tone (team morale, tension, consensus level)
- [ ] Automatic follow-up meeting scheduling based on identified risks
- [ ] Integration with CRM for client-facing summaries
- [ ] Multi-language support (summarize cross-functional teams)
- [ ] Decision versioning (track when/how decisions change)

---
