/**
 * Task Extraction Prompt Template
 *
 * LLM prompt for extracting actionable prep tasks from calendar events
 * following Llama 3.3 best practices:
 * - Clear, explicit instructions
 * - Few-shot examples
 * - JSON-only output format
 * - Structured task fields
 */

import { Logger } from '../observability/logger';

export interface TaskExtractionContext {
	eventTitle: string;
	eventDescription?: string;
	eventStartTime: string;
	eventLocation?: string;
	eventAttendees?: string[];
}

export interface ExtractedTask {
	title: string;
	description: string;
	priority: 'high' | 'medium' | 'low';
	deadlineRelativeToEvent: string; // e.g., "1 day before", "2 hours before"
}

export function buildTaskExtractionPrompt(context: TaskExtractionContext): string {
	const { eventTitle, eventDescription, eventStartTime, eventLocation, eventAttendees } = context;

	const eventDetails = `
Event: ${eventTitle}
Start Time: ${eventStartTime}
${eventDescription ? `Description: ${eventDescription}` : ''}
${eventLocation ? `Location: ${eventLocation}` : ''}
${eventAttendees && eventAttendees.length > 0 ? `Attendees: ${eventAttendees.join(', ')}` : ''}
`.trim();

	// Few-shot examples for consistency
	const fewShotExample = `
Example 1:
Event: Client Presentation - Q4 Strategy Review
Start Time: 2024-12-15 14:00
Description: Present Q4 strategy to executive team
Location: Conference Room A
Attendees: CEO, CFO, VP Sales

Output:
[
  {
    "title": "Prepare Q4 presentation slides",
    "description": "Create comprehensive deck covering Q4 strategy, metrics, and roadmap",
    "priority": "high",
    "deadlineRelativeToEvent": "2 days before"
  },
  {
    "title": "Review Q4 financial data with CFO",
    "description": "Sync with CFO on latest numbers to include in presentation",
    "priority": "high",
    "deadlineRelativeToEvent": "3 days before"
  },
  {
    "title": "Print handouts for attendees",
    "description": "Print 5 copies of presentation summary",
    "priority": "medium",
    "deadlineRelativeToEvent": "1 day before"
  },
  {
    "title": "Test presentation equipment",
    "description": "Arrive early to test projector and remote in Conference Room A",
    "priority": "medium",
    "deadlineRelativeToEvent": "1 hour before"
  }
]

Example 2:
Event: Team Offsite - Annual Planning
Start Time: 2024-11-30 09:00
Location: Mountain View Office
Attendees: Engineering Team

Output:
[
  {
    "title": "Book travel to Mountain View",
    "description": "Reserve flight and hotel for offsite trip",
    "priority": "high",
    "deadlineRelativeToEvent": "2 weeks before"
  },
  {
    "title": "Prepare team feedback summary",
    "description": "Compile feedback from team retrospectives for planning discussion",
    "priority": "high",
    "deadlineRelativeToEvent": "1 week before"
  },
  {
    "title": "Draft 2025 roadmap proposals",
    "description": "Create initial roadmap ideas to discuss at offsite",
    "priority": "medium",
    "deadlineRelativeToEvent": "3 days before"
  }
]`;

	return `You are a productivity assistant. Your task is to extract actionable preparation tasks from a calendar event.

CALENDAR EVENT:
${eventDetails}

TASK EXTRACTION GUIDELINES:
1. Think about what needs to be done BEFORE this event to prepare
2. Consider:
   - Materials to prepare (slides, documents, reports)
   - People to coordinate with (attendees, stakeholders)
   - Logistics (travel, equipment, venue setup)
   - Research or background reading
   - Follow-ups from related previous meetings
3. Assign priority based on:
   - High: Critical to event success, blocks other tasks
   - Medium: Important but not blocking
   - Low: Nice-to-have, can defer if needed
4. Set realistic deadlines relative to event start time
5. Skip tasks if event is routine/low-prep (e.g., "Daily Standup")
${fewShotExample}

INSTRUCTIONS:
- Return ONLY a JSON array of task objects
- Format: [{"title": "...", "description": "...", "priority": "high|medium|low", "deadlineRelativeToEvent": "..."}]
- NO explanatory text, NO markdown code fences, ONLY the JSON array
- Return empty array [] if no prep tasks needed
- Maximum 5 tasks per event (focus on highest priority)

OUTPUT (JSON array only):`;
}

export function parseExtractedTasks(llmResponse: string): ExtractedTask[] {
	const logger = new Logger('extract-tasks-prompt');
	try {
		// Clean response: remove markdown code fences, extra whitespace
		let cleaned = llmResponse
			.trim()
			.replace(/```json\n?/g, '')
			.replace(/```\n?/g, '')
			.trim();

		// Extract JSON array
		const match = cleaned.match(/\[[\s\S]*\]/);
		if (!match) {
			logger.warn('Could not parse tasks from LLM response', {
				metadata: { responsePreview: llmResponse.substring(0, 200) },
			});
			return [];
		}

		const tasks: ExtractedTask[] = JSON.parse(match[0]);

		// Validate structure
		if (!Array.isArray(tasks)) {
			logger.warn('LLM response is not an array', {
				metadata: { responseType: typeof tasks },
			});
			return [];
		}

		// Filter and validate each task
		return tasks
			.filter((task) => {
				return task.title && task.description && task.priority && task.deadlineRelativeToEvent;
			})
			.slice(0, 5); // Max 5 tasks as per guidelines
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		logger.error('Error parsing extracted tasks', err, {
			metadata: { responsePreview: llmResponse.substring(0, 200) },
		});
		return [];
	}
}
