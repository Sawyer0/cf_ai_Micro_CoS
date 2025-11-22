/**
 * Daily Planning Prompt Template
 *
 * LLM prompt for generating daily summaries and identifying time gaps
 * following Llama 3.3 best practices:
 * - Clear, explicit instructions
 * - Few-shot examples
 * - JSON-only output format
 * - Structured summary fields
 */

import { Logger } from '../observability/logger';

export interface DailyPlanningContext {
	date: string; // ISO date string
	calendarEvents: EventSummary[];
	pendingTasks: TaskSummary[];
	userTimezone: string;
}

export interface EventSummary {
	title: string;
	startTime: string; // ISO datetime
	endTime: string; // ISO datetime
	location?: string;
}

export interface TaskSummary {
	title: string;
	priority: 'high' | 'medium' | 'low';
	dueDate?: string; // ISO datetime
}

export interface DailyPlan {
	summary: string; // 2-3 sentence overview of the day
	keyEvents: string[]; // List of most important events
	focusTime: TimeBlock[]; // Identified gaps for focused work
	recommendations: string[]; // Action recommendations
}

export interface TimeBlock {
	startTime: string;
	endTime: string;
	durationMinutes: number;
}

export function buildDailyPlanningPrompt(context: DailyPlanningContext): string {
	const { date, calendarEvents, pendingTasks, userTimezone } = context;

	// Format calendar events
	const eventsList =
		calendarEvents.length > 0
			? calendarEvents.map((e) => `- ${e.startTime} - ${e.endTime}: ${e.title}${e.location ? ` (${e.location})` : ''}`).join('\n')
			: '- No events scheduled';

	// Format pending tasks
	const tasksList =
		pendingTasks.length > 0
			? pendingTasks.map((t) => `- [${t.priority.toUpperCase()}] ${t.title}${t.dueDate ? ` (due: ${t.dueDate})` : ''}`).join('\n')
			: '- No pending tasks';

	// Few-shot example
	const fewShotExample = `
Example Input:
Date: 2024-12-10
Events:
- 09:00 - 10:00: Team Standup (Virtual)
- 10:30 - 11:30: Client Call - Q4 Review
- 14:00 - 15:30: Product Strategy Sync
Tasks:
- [HIGH] Finish Q4 presentation slides (due: today EOD)
- [HIGH] Review code for feature X (due: tomorrow)
- [MEDIUM] Schedule 1:1s for next week

Example Output:
{
  "summary": "Busy day with 3 key meetings focused on Q4 planning and product strategy. High-priority deliverable due EOD requires focused time.",
  "keyEvents": [
    "Client Call - Q4 Review (10:30-11:30)",
    "Product Strategy Sync (14:00-15:30)"
  ],
  "focusTime": [
    {
      "startTime": "08:00",
      "endTime": "09:00",
      "durationMinutes": 60
    },
    {
      "startTime": "11:30",
      "endTime": "14:00",
      "durationMinutes": 150
    }
  ],
  "recommendations": [
    "Block 11:30-13:00 for finishing Q4 presentation slides (high priority, due EOD)",
    "Use morning slot (08:00-09:00) for code review to avoid context switching",
    "Schedule 1:1s in the afternoon gap after Product Strategy Sync"
  ]
}`;

	return `You are a productivity assistant. Your task is to analyze the user's calendar and tasks for the day, identify time gaps, and generate actionable recommendations.

DATE: ${date} (Timezone: ${userTimezone})

CALENDAR EVENTS:
${eventsList}

PENDING TASKS:
${tasksList}

PLANNING GUIDELINES:
1. **Summary**: 2-3 sentences capturing the day's focus and key priorities
2. **Key Events**: Highlight 2-3 most important meetings/events (omit routine standups unless critical)
3. **Focus Time**: Identify unscheduled gaps of 30+ minutes that could be used for deep work
   - Prefer larger blocks (60+ min) over fragmented time
   - Avoid tiny gaps (\u003c30 min) between meetings
   - Consider realistic work hours (e.g., 08:00-18:00)
4. **Recommendations**: Suggest 2-4 specific actions:
   - Match high-priority tasks to best available time blocks
   - Warn about back-to-back meetings if \u003e3 consecutive hours
   - Suggest prep time before important meetings
   - Identify tasks that can be delegated or rescheduled if overloaded
${fewShotExample}

INSTRUCTIONS:
- Return ONLY a JSON object with the structure shown in the example
- NO explanatory text, NO markdown code fences, ONLY the JSON object
- Keep summary concise (2-3 sentences max)
- Limit keyEvents to 2-3 items
- Only include focus time blocks of 30+ minutes
- Provide 2-4 actionable recommendations

OUTPUT (JSON object only):`;
}

export function parseDailyPlan(llmResponse: string): DailyPlan | null {
	const logger = new Logger('daily-planning-prompt');
	try {
		// Clean response: remove markdown code fences
		let cleaned = llmResponse
			.trim()
			.replace(/```json\n?/g, '')
			.replace(/```\n?/g, '')
			.trim();

		// Extract JSON object
		const match = cleaned.match(/\{[\s\S]*\}/);
		if (!match) {
			logger.warn('Could not parse daily plan from LLM response', {
				metadata: { responsePreview: llmResponse.substring(0, 200) },
			});
			return null;
		}

		const plan: DailyPlan = JSON.parse(match[0]);

		// Validate structure
		if (!plan.summary || !plan.keyEvents || !plan.focusTime || !plan.recommendations) {
			logger.warn('Incomplete daily plan structure', {
				metadata: {
					hasSummary: !!plan.summary,
					hasKeyEvents: !!plan.keyEvents,
					hasFocusTime: !!plan.focusTime,
					hasRecommendations: !!plan.recommendations,
				},
			});
			return null;
		}

		return plan;
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		logger.error('Error parsing daily plan', err, {
			metadata: { responsePreview: llmResponse.substring(0, 200) },
		});
		return null;
	}
}
