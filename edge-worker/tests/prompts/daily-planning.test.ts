import { describe, it, expect } from 'vitest';
import {
    buildDailyPlanningPrompt,
    parseDailyPlan,
    DailyPlanningContext
} from '../../src/prompts/daily-planning.prompt';

describe('Daily Planning Prompt', () => {
    describe('buildDailyPlanningPrompt', () => {
        it('should build prompt with events and tasks', () => {
            const context: DailyPlanningContext = {
                date: '2024-12-10',
                calendarEvents: [
                    {
                        title: 'Team Standup',
                        startTime: '2024-12-10T09:00:00Z',
                        endTime: '2024-12-10T09:30:00Z'
                    },
                    {
                        title: 'Client Call',
                        startTime: '2024-12-10T14:00:00Z',
                        endTime: '2024-12-10T15:00:00Z',
                        location: 'Zoom'
                    }
                ],
                pendingTasks: [
                    {
                        title: 'Finish presentation',
                        priority: 'high',
                        dueDate: '2024-12-10T17:00:00Z'
                    }
                ],
                userTimezone: 'America/New_York'
            };

            const prompt = buildDailyPlanningPrompt(context);

            expect(prompt).toContain('You are a productivity assistant');
            expect(prompt).toContain('2024-12-10');
            expect(prompt).toContain('America/New_York');
            expect(prompt).toContain('Team Standup');
            expect(prompt).toContain('Client Call');
            expect(prompt).toContain('[HIGH] Finish presentation');
            expect(prompt).toContain('OUTPUT (JSON object only):');
        });

        it('should handle day with no events', () => {
            const context: DailyPlanningContext = {
                date: '2024-12-10',
                calendarEvents: [],
                pendingTasks: [
                    {
                        title: 'Task 1',
                        priority: 'medium'
                    }
                ],
                userTimezone: 'UTC'
            };

            const prompt = buildDailyPlanningPrompt(context);

            expect(prompt).toContain('No events scheduled');
            expect(prompt).toContain('[MEDIUM] Task 1');
        });

        it('should handle day with no tasks', () => {
            const context: DailyPlanningContext = {
                date: '2024-12-10',
                calendarEvents: [
                    {
                        title: 'Meeting',
                        startTime: '2024-12-10T10:00:00Z',
                        endTime: '2024-12-10T11:00:00Z'
                    }
                ],
                pendingTasks: [],
                userTimezone: 'UTC'
            };

            const prompt = buildDailyPlanningPrompt(context);

            expect(prompt).toContain('Meeting');
            expect(prompt).toContain('No pending tasks');
        });

        it('should include few-shot example', () => {
            const context: DailyPlanningContext = {
                date: '2024-12-10',
                calendarEvents: [],
                pendingTasks: [],
                userTimezone: 'UTC'
            };

            const prompt = buildDailyPlanningPrompt(context);

            expect(prompt).toContain('Example Input:');
            expect(prompt).toContain('Example Output:');
            expect(prompt).toContain('"summary":');
            expect(prompt).toContain('"keyEvents":');
            expect(prompt).toContain('"focusTime":');
            expect(prompt).toContain('"recommendations":');
        });

        it('should include planning guidelines', () => {
            const context: DailyPlanningContext = {
                date: '2024-12-10',
                calendarEvents: [],
                pendingTasks: [],
                userTimezone: 'UTC'
            };

            const prompt = buildDailyPlanningPrompt(context);

            expect(prompt).toContain('PLANNING GUIDELINES');
            expect(prompt).toContain('Summary');
            expect(prompt).toContain('Focus Time');
            expect(prompt).toContain('30+ minutes');
        });
    });

    describe('parseDailyPlan', () => {
        it('should parse valid daily plan', () => {
            const llmResponse = JSON.stringify({
                summary: 'Busy day with 3 meetings and high-priority deadline.',
                keyEvents: [
                    'Client Call (10:30-11:30)',
                    'Team Sync (14:00-15:00)'
                ],
                focusTime: [
                    {
                        startTime: '08:00',
                        endTime: '10:00',
                        durationMinutes: 120
                    }
                ],
                recommendations: [
                    'Block morning for high-priority work',
                    'Prepare for client call'
                ]
            });

            const plan = parseDailyPlan(llmResponse);

            expect(plan).not.toBeNull();
            expect(plan!.summary).toContain('Busy day');
            expect(plan!.keyEvents).toHaveLength(2);
            expect(plan!.focusTime).toHaveLength(1);
            expect(plan!.focusTime[0].durationMinutes).toBe(120);
            expect(plan!.recommendations).toHaveLength(2);
        });

        it('should parse plan with markdown wrapper', () => {
            const llmResponse = '```json\n' + JSON.stringify({
                summary: 'Light day ahead.',
                keyEvents: [],
                focusTime: [],
                recommendations: ['Use day for deep work']
            }) + '\n```';

            const plan = parseDailyPlan(llmResponse);

            expect(plan).not.toBeNull();
            expect(plan!.summary).toBe('Light day ahead.');
        });

        it('should return null for incomplete plan', () => {
            const llmResponse = JSON.stringify({
                summary: 'Missing other fields'
                // Missing keyEvents, focusTime, recommendations
            });

            const plan = parseDailyPlan(llmResponse);

            expect(plan).toBeNull();
        });

        it('should return null if parsing fails', () => {
            const llmResponse = 'Not a valid JSON response';
            const plan = parseDailyPlan(llmResponse);

            expect(plan).toBeNull();
        });

        it('should handle plan with extra text', () => {
            const llmResponse = 'Here is your daily plan:\n' + JSON.stringify({
                summary: 'Moderate day.',
                keyEvents: ['Meeting at 2pm'],
                focusTime: [],
                recommendations: ['Review tasks']
            }) + '\nHave a productive day!';

            const plan = parseDailyPlan(llmResponse);

            expect(plan).not.toBeNull();
            expect(plan!.summary).toBe('Moderate day.');
        });

        it('should parse plan with empty arrays', () => {
            const llmResponse = JSON.stringify({
                summary: 'Clear schedule today.',
                keyEvents: [],
                focusTime: [],
                recommendations: []
            });

            const plan = parseDailyPlan(llmResponse);

            expect(plan).not.toBeNull();
            expect(plan!.keyEvents).toHaveLength(0);
            expect(plan!.focusTime).toHaveLength(0);
            expect(plan!.recommendations).toHaveLength(0);
        });
    });
});
