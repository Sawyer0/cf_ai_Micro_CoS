/**
 * TaskExtractionWorkflow - Durable workflow for extracting prep tasks from calendar events
 * 
 * Analyzes calendar events and generates actionable prep tasks using LLM,
 * with deduplication and persistence.
 * 
 * Workflow Steps:
 * 1. LLM Analysis - Extract tasks from event title/description
 * 2. Deduplication - Check against existing tasks
 * 3. Persistence - Save unique tasks to D1
 * 4. Return Results - Extracted task list
 * 
 * Adheres to Cloudflare Workflows best practices:
 * - Granular steps (one operation per step)
 * - Idempotent operations (check before creating)
 * - State returned from steps (no external state)
 * - Deterministic step names
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { WorkerEnv } from '../env';
import { WorkersAIAdapter } from '../adapters/llm/workers-ai.adapter';
import { D1TaskAdapter } from '../adapters/persistence/d1-task.adapter';
import { Logger } from '../observability/logger';
import { buildTaskExtractionPrompt, parseExtractedTasks, TaskExtractionContext } from '../prompts/extract-tasks.prompt';
import { Task, TaskPriority } from '../domain/task/aggregates/task.aggregate';

export interface TaskExtractionRequest {
    userId: string;
    eventId: string;
    eventTitle: string;
    eventDescription?: string;
    eventStartTime: string;
    eventLocation?: string;
    eventAttendees?: string[];
    correlationId: string;
}

export class TaskExtractionWorkflow extends WorkflowEntrypoint<WorkerEnv, TaskExtractionRequest> {
    async run(event: WorkflowEvent<TaskExtractionRequest>, step: WorkflowStep) {
        const { userId, eventId, eventTitle, eventDescription, eventStartTime, eventLocation, eventAttendees, correlationId } = event.payload;

        // Initialize adapters
        const logger = new Logger('task-extraction-workflow');
        const llmAdapter = new WorkersAIAdapter(this.env.AI as any, logger);
        const taskRepository = new D1TaskAdapter(this.env.DB, logger);

        // Step 1: LLM analyzes event and generates prep tasks
        // Granular step - single LLM call
        const extractedTasks = await step.do('analyze-event-with-llm', async () => {
            logger.info('Extracting tasks from calendar event', {
                metadata: { eventId, eventTitle, correlationId }
            });

            const context: TaskExtractionContext = {
                eventTitle,
                eventDescription,
                eventStartTime,
                eventLocation,
                eventAttendees
            };

            const prompt = buildTaskExtractionPrompt(context);

            const llmResponse = await llmAdapter.generateCompletion(
                {
                    messages: [
                        { role: 'system', content: 'You are a productivity assistant specializing in extracting actionable tasks.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.4, // Slightly higher for creative task generation
                    maxTokens: 500
                },
                correlationId
            );

            // Parse LLM response into structured tasks
            const tasks = parseExtractedTasks(llmResponse.content);

            logger.info('Task extraction complete', {
                metadata: { tasksExtracted: tasks.length, correlationId }
            });

            return tasks;
        });

        // Early return if no tasks extracted
        if (extractedTasks.length === 0) {
            logger.info('No prep tasks needed for this event', {
                metadata: { eventId, correlationId }
            });
            return {
                success: true,
                tasksExtracted: 0,
                tasksCreated: 0,
                tasks: [],
                correlationId
            };
        }

        // Step 2: Deduplicate against existing tasks
        // Idempotent check - query before creating
        const uniqueTasks = await step.do('deduplicate-tasks', async () => {
            logger.info('Checking for duplicate tasks', {
                metadata: { candidateCount: extractedTasks.length, correlationId }
            });

            // Fetch recent tasks for the user to check for duplicates
            // Limit to last 100 tasks to keep it efficient
            const existingTasks = await taskRepository.findByUser(userId, 100);
            const existingTitles = new Set(existingTasks.map(t => t.getTitle().toLowerCase()));

            const unique = extractedTasks.filter(extracted => {
                const isDuplicate = existingTitles.has(extracted.title.toLowerCase());
                if (isDuplicate) {
                    logger.info('Skipping duplicate task', {
                        metadata: { title: extracted.title, correlationId }
                    });
                }
                return !isDuplicate;
            });

            return unique;
        });

        // Step 3: Persist unique tasks to D1
        // Idempotent - create Task aggregates and save
        const savedTasks = await step.do('persist-tasks', async () => {
            logger.info('Persisting tasks to database', {
                metadata: { taskCount: uniqueTasks.length, correlationId }
            });

            // Convert extracted tasks to Task aggregates
            const taskAggregates = uniqueTasks.map(extracted => {
                // Calculate absolute deadline from relative deadline
                const eventDate = new Date(eventStartTime);
                const deadline = calculateDeadline(eventDate, extracted.deadlineRelativeToEvent);

                // Map string priority to TaskPriority enum
                const priority: TaskPriority = extracted.priority as TaskPriority;

                return Task.create(
                    extracted.title,
                    userId,
                    priority,
                    { source: 'calendar', relatedEventId: eventId },
                    extracted.description,
                    deadline
                );
            });

            // Save all tasks (repository handles idempotency if needed)
            // Note: Batch save optimization planned for future release
            // For now, save individually
            for (const task of taskAggregates) {
                await taskRepository.save(task);
            }

            return taskAggregates;
        });

        // Return extraction results
        return {
            success: true,
            tasksExtracted: extractedTasks.length,
            tasksCreated: savedTasks.length,
            tasks: savedTasks.map(t => ({
                id: t.id,
                title: t.getTitle(),
                description: t.getDescription(),
                priority: t.getPriority(),
                dueDate: t.getDueDate()?.toISOString()
            })),
            correlationId
        };
    }
}

/**
 * Calculate absolute deadline from relative deadline string
 * Examples: "1 day before", "2 hours before", "3 weeks before"
 */
function calculateDeadline(eventDate: Date, relativeDeadline: string): Date {
    const match = relativeDeadline.match(/(\d+)\s+(week|day|hour)s?\s+before/i);

    if (!match) {
        // Default to 1 day before if can't parse
        return new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
    }

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const deadline = new Date(eventDate);

    switch (unit) {
        case 'week':
            deadline.setDate(deadline.getDate() - (amount * 7));
            break;
        case 'day':
            deadline.setDate(deadline.getDate() - amount);
            break;
        case 'hour':
            deadline.setHours(deadline.getHours() - amount);
            break;
    }

    return deadline;
}
