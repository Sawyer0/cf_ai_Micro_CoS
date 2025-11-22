import { describe, it, expect } from 'vitest';
import {
    buildTaskExtractionPrompt,
    parseExtractedTasks,
    TaskExtractionContext
} from '../../src/prompts/extract-tasks.prompt';

describe('Task Extraction Prompt', () => {
    describe('buildTaskExtractionPrompt', () => {
        it('should build prompt with event details', () => {
            const context: TaskExtractionContext = {
                eventTitle: 'Client Presentation - Q4 Results',
                eventDescription: 'Present quarterly results to leadership team',
                eventStartTime: '2024-12-15T14:00:00Z',
                eventLocation: 'Conference Room A',
                eventAttendees: ['CEO', 'CFO', 'VP Sales']
            };

            const prompt = buildTaskExtractionPrompt(context);

            expect(prompt).toContain('You are a productivity assistant');
            expect(prompt).toContain('Client Presentation - Q4 Results');
            expect(prompt).toContain('Conference Room A');
            expect(prompt).toContain('CEO, CFO, VP Sales');
            expect(prompt).toContain('OUTPUT (JSON array only):');
        });

        it('should handle minimal event details', () => {
            const context: TaskExtractionContext = {
                eventTitle: 'Team Standup',
                eventStartTime: '2024-12-10T09:00:00Z'
            };

            const prompt = buildTaskExtractionPrompt(context);

            expect(prompt).toContain('Team Standup');
            expect(prompt).toContain('2024-12-10T09:00:00Z');
            expect(prompt).not.toContain('Description:');
            expect(prompt).not.toContain('Location:');
            expect(prompt).not.toContain('Attendees:');
        });

        it('should include few-shot examples', () => {
            const context: TaskExtractionContext = {
                eventTitle: 'Meeting',
                eventStartTime: '2024-12-10T10:00:00Z'
            };

            const prompt = buildTaskExtractionPrompt(context);

            expect(prompt).toContain('Example 1:');
            expect(prompt).toContain('Example 2:');
            expect(prompt).toContain('Prepare Q4 presentation slides');
            expect(prompt).toContain('Book travel to Mountain View');
        });

        it('should include task extraction guidelines', () => {
            const context: TaskExtractionContext = {
                eventTitle: 'Meeting',
                eventStartTime: '2024-12-10T10:00:00Z'
            };

            const prompt = buildTaskExtractionPrompt(context);

            expect(prompt).toContain('TASK EXTRACTION GUIDELINES');
            expect(prompt).toContain('Materials to prepare');
            expect(prompt).toContain('Logistics');
            expect(prompt).toContain('Maximum 5 tasks per event');
        });
    });

    describe('parseExtractedTasks', () => {
        it('should parse valid task array', () => {
            const llmResponse = JSON.stringify([
                {
                    title: 'Prepare slides',
                    description: 'Create presentation deck',
                    priority: 'high',
                    deadlineRelativeToEvent: '2 days before'
                },
                {
                    title: 'Book conference room',
                    description: 'Reserve room for meeting',
                    priority: 'medium',
                    deadlineRelativeToEvent: '1 week before'
                }
            ]);

            const tasks = parseExtractedTasks(llmResponse);

            expect(tasks).toHaveLength(2);
            expect(tasks[0].title).toBe('Prepare slides');
            expect(tasks[0].priority).toBe('high');
            expect(tasks[1].title).toBe('Book conference room');
            expect(tasks[1].priority).toBe('medium');
        });

        it('should parse task array with markdown wrapper', () => {
            const llmResponse = '```json\n' + JSON.stringify([
                {
                    title: 'Review materials',
                    description: 'Read background docs',
                    priority: 'low',
                    deadlineRelativeToEvent: '3 days before'
                }
            ]) + '\n```';

            const tasks = parseExtractedTasks(llmResponse);

            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('Review materials');
        });

        it('should return empty array for routine events', () => {
            const llmResponse = '[]';
            const tasks = parseExtractedTasks(llmResponse);

            expect(tasks).toHaveLength(0);
        });

        it('should filter invalid tasks', () => {
            const llmResponse = JSON.stringify([
                {
                    title: 'Valid task',
                    description: 'Complete description',
                    priority: 'high',
                    deadlineRelativeToEvent: '1 day before'
                },
                {
                    title: 'Invalid task',
                    // Missing required fields
                    priority: 'medium'
                }
            ]);

            const tasks = parseExtractedTasks(llmResponse);

            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('Valid task');
        });

        it('should limit to 5 tasks', () => {
            const llmResponse = JSON.stringify(
                Array.from({ length: 10 }, (_, i) => ({
                    title: `Task ${i + 1}`,
                    description: `Description ${i + 1}`,
                    priority: 'medium',
                    deadlineRelativeToEvent: '1 day before'
                }))
            );

            const tasks = parseExtractedTasks(llmResponse);

            expect(tasks).toHaveLength(5);
        });

        it('should return empty array if parsing fails', () => {
            const llmResponse = 'Not a valid JSON response';
            const tasks = parseExtractedTasks(llmResponse);

            expect(tasks).toHaveLength(0);
        });

        it('should handle tasks with extra text', () => {
            const llmResponse = 'Here are the tasks:\n' + JSON.stringify([
                {
                    title: 'Task 1',
                    description: 'Description 1',
                    priority: 'high',
                    deadlineRelativeToEvent: '2 days before'
                }
            ]) + '\nHope this helps!';

            const tasks = parseExtractedTasks(llmResponse);

            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('Task 1');
        });
    });
});
