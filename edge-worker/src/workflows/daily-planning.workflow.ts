/**
 * DailyPlanningWorkflow - Durable workflow for generating daily summaries and recommendations
 * 
 * Analyzes user's calendar and tasks for the day, identifies focus time gaps,
 * and generates actionable planning recommendations using LLM.
 * 
 * Workflow Steps:
 * 1. Fetch Calendar - Get today's events from CalendarAdapter
 * 2. Fetch Tasks - Get pending tasks from TaskRepository
 * 3. LLM Planning - Generate summary and gap analysis
 * 4. Return Plan - Structured daily plan
 * 
 * Adheres to Cloudflare Workflows best practices:
 * - Granular steps (one operation per step)
 * - Idempotent operations
 * - State returned from steps
 * - Deterministic step names
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { Env } from '../env';
import { WorkersAIAdapter } from '../adapters/llm/workers-ai.adapter';
import { D1TaskAdapter } from '../adapters/persistence/d1-task.adapter';
import { Logger } from '../observability/logger';
import { Task } from '../domain/task/aggregates/task.aggregate';
import {
    buildDailyPlanningPrompt,
    parseDailyPlan,
    DailyPlanningContext,
    EventSummary,
    TaskSummary,
    DailyPlan
} from '../prompts/daily-planning.prompt';

export interface DailyPlanningRequest {
    userId: string;
    date: string; // ISO date string (YYYY-MM-DD)
    timezone: string; // e.g., "America/New_York"
    correlationId: string;
}

export class DailyPlanningWorkflow extends WorkflowEntrypoint<Env, DailyPlanningRequest> {
    async run(event: WorkflowEvent<DailyPlanningRequest>, step: WorkflowStep) {
        const { userId, date, timezone, correlationId } = event.payload;

        // Initialize adapters
        const logger = new Logger('daily-planning-workflow');
        const llmAdapter = new WorkersAIAdapter(this.env.AI as any, logger);
        const taskRepository = new D1TaskAdapter(this.env.DB, logger);
        // TODO: Initialize GoogleCalendarAdapter when implemented
        // For now, calendar integration is a placeholder

        // Step 1: Fetch calendar events for the day
        // Idempotent - read-only query
        const calendarEvents = await step.do('fetch-calendar-events', async () => {
            logger.info('Fetching calendar events', {
                metadata: { userId, date, correlationId }
            });

            try {
                // TODO: Implement calendar integration
                // For now, return empty array as placeholder
                // When GoogleCalendarAdapter is ready, uncomment below:
                /*
                const startOfDay = new Date(`${date}T00:00:00`);
                const endOfDay = new Date(`${date}T23:59:59`);
                const events = await calendarAdapter.getEvents(userId, startOfDay, endOfDay);
                const summaries: EventSummary[] = events.map((e: any) => ({
                    title: e.title,
                    startTime: e.startTime.toISOString(),
                    endTime: e.endTime.toISOString(),
                    location: e.location
                }));
                */
                const summaries: EventSummary[] = [];
                logger.info('Calendar events fetched (placeholder)', {
                    metadata: { eventCount: 0, correlationId }
                });

                return summaries;
            } catch (error) {
                logger.error('Failed to fetch calendar events', error as Error, { correlationId });
                // Return empty array on error - workflow can still generate plan with tasks only
                return [];
            }
        });

        // Step 2: Fetch pending tasks due today or overdue
        // Idempotent - read-only query
        const pendingTasks = await step.do('fetch-pending-tasks', async () => {
            logger.info('Fetching pending tasks', {
                metadata: { userId, date, correlationId }
            });

            try {
                const tasks = await taskRepository.findByUser(userId);

                // Filter to pending/in-progress tasks that are due today or overdue
                const targetDate = new Date(`${date}T23:59:59`);
                const relevantTasks = tasks
                    .filter((t: Task) => {
                        const status = t.getStatus();
                        if (status === 'completed' || status === 'cancelled') {
                            return false;
                        }

                        const dueDate = t.getDueDate();
                        if (!dueDate) {
                            // Include tasks with no due date (user might want to fit them in)
                            return true;
                        }

                        // Include if due today or overdue
                        return dueDate <= targetDate;
                    });

                // Transform to TaskSummary format
                const summaries: TaskSummary[] = relevantTasks.map((t: Task) => ({
                    title: t.getTitle(),
                    priority: t.getPriority(),
                    dueDate: t.getDueDate()?.toISOString()
                }));

                logger.info('Tasks fetched', {
                    metadata: { taskCount: summaries.length, correlationId }
                });

                return summaries;
            } catch (error) {
                logger.error('Failed to fetch tasks', error as Error, { correlationId });
                // Return empty array on error - workflow can still generate plan with calendar only
                return [];
            }
        });

        // Step 3: LLM generates daily plan with gap analysis
        // Granular step - single LLM call
        const dailyPlan = await step.do('generate-daily-plan', async () => {
            logger.info('Generating daily plan', {
                metadata: { eventCount: calendarEvents.length, taskCount: pendingTasks.length, correlationId }
            });

            const context: DailyPlanningContext = {
                date,
                calendarEvents,
                pendingTasks,
                userTimezone: timezone
            };

            const prompt = buildDailyPlanningPrompt(context);

            const llmResponse = await llmAdapter.generateCompletion(
                {
                    messages: [
                        { role: 'system', content: 'You are a productivity assistant specializing in daily planning and time management.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.5, // Moderate creativity for recommendations
                    maxTokens: 600
                },
                correlationId
            );

            // Parse LLM response into structured plan
            const plan = parseDailyPlan(llmResponse.content);

            if (!plan) {
                // Fallback plan if LLM parsing fails
                logger.warn('LLM plan parsing failed, returning fallback plan', { correlationId });
                return {
                    summary: `You have ${calendarEvents.length} events and ${pendingTasks.length} pending tasks today.`,
                    keyEvents: calendarEvents.slice(0, 3).map(e => e.title),
                    focusTime: [],
                    recommendations: ['Review your calendar for potential focus time blocks.']
                };
            }

            logger.info('Daily plan generated', { correlationId });
            return plan;
        });

        // Return planning results
        return {
            success: true,
            date,
            plan: dailyPlan,
            eventCount: calendarEvents.length,
            taskCount: pendingTasks.length,
            correlationId
        };
    }
}
