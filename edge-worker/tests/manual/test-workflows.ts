import { TravelPlanningWorkflow } from '../../src/workflows/travel-planning.workflow';
import { TaskExtractionWorkflow } from '../../src/workflows/task-extraction.workflow';
import { DailyPlanningWorkflow } from '../../src/workflows/daily-planning.workflow';
import { WorkflowEvent } from 'cloudflare:workers';

// Mock Env
const mockEnv = {
    AI: {
        run: async (model: string, input: any) => {
            console.log(`[MockAI] Running model ${model}`);
            if (input.messages) {
                const lastMsg = input.messages[input.messages.length - 1].content;
                if (lastMsg.includes('Rank the following flight options')) {
                    return { response: JSON.stringify([1, 2, 3]) };
                }
                if (lastMsg.includes('extract actionable preparation tasks')) {
                    return { response: JSON.stringify([{ title: 'Mock Task', priority: 'high' }]) };
                }
                if (lastMsg.includes('analyze the user\'s calendar and tasks')) {
                    return {
                        response: JSON.stringify({
                            summary: 'Mock Plan',
                            keyEvents: ['Event 1'],
                            focusTime: [],
                            recommendations: ['Rec 1']
                        })
                    };
                }
            }
            return { response: '{}' };
        }
    },
    DB: {
        prepare: () => ({
            bind: () => ({
                run: async () => ({ results: [] }),
                first: async () => null,
                all: async () => ({ results: [] })
            })
        })
    },
    DUFFEL_API_KEY: 'mock_key',
    GOOGLE_CALENDAR_CREDENTIALS: '{}'
};

// Mock Step
const mockStep: any = {
    do: async (name: string, arg2: any, arg3?: any) => {
        const callback = typeof arg2 === 'function' ? arg2 : arg3;
        console.log(`[MockStep] Executing step: ${name}`);
        const result = await callback();
        console.log(`[MockStep] Step ${name} result:`, JSON.stringify(result).slice(0, 100) + '...');
        return result;
    },
    sleep: async () => { },
};

// Mock Ctx
const mockCtx = {
    waitUntil: async (promise: Promise<any>) => await promise,
    passThroughOnException: () => { },
    abort: () => { }
};

async function testTravelWorkflow() {
    console.log('\n--- Testing TravelPlanningWorkflow ---');
    const workflow = new TravelPlanningWorkflow(mockCtx as any, mockEnv as any);
    const event: any = {
        payload: {
            userId: 'user123',
            origin: 'JFK',
            destination: 'LHR',
            departureDate: '2024-12-25',
            correlationId: 'test-corr-id'
        },
        id: 'test-id',
        timestamp: new Date(),
        instanceId: 'test-instance'
    };

    try {
        // Mock Flight Adapter search to avoid real API call
        globalThis.fetch = async () => ({
            ok: true,
            json: async () => ({ data: { offers: [] } }) // Mock Duffel response
        } as any);

        const result = await (workflow as any).run(event, mockStep);
        console.log('Travel Workflow Result:', result);
    } catch (error) {
        console.error('Travel Workflow Failed:', error);
    }
}

async function testTaskExtractionWorkflow() {
    console.log('\n--- Testing TaskExtractionWorkflow ---');
    const workflow = new TaskExtractionWorkflow(mockCtx as any, mockEnv as any);
    const event: any = {
        payload: {
            userId: 'user123',
            event: {
                id: 'evt1',
                title: 'Important Meeting',
                startTime: '2024-12-10T10:00:00Z',
                endTime: '2024-12-10T11:00:00Z'
            },
            correlationId: 'test-corr-id'
        },
        id: 'test-id',
        timestamp: new Date(),
        instanceId: 'test-instance'
    };

    try {
        const result = await (workflow as any).run(event, mockStep);
        console.log('Task Extraction Workflow Result:', result);
    } catch (error) {
        console.error('Task Extraction Workflow Failed:', error);
    }
}

async function testDailyPlanningWorkflow() {
    console.log('\n--- Testing DailyPlanningWorkflow ---');
    const workflow = new DailyPlanningWorkflow(mockCtx as any, mockEnv as any);
    const event: any = {
        payload: {
            userId: 'user123',
            date: '2024-12-10',
            timezone: 'UTC',
            correlationId: 'test-corr-id'
        },
        id: 'test-id',
        timestamp: new Date(),
        instanceId: 'test-instance'
    };

    try {
        const result = await (workflow as any).run(event, mockStep);
        console.log('Daily Planning Workflow Result:', result);
    } catch (error) {
        console.error('Daily Planning Workflow Failed:', error);
    }
}

async function runTests() {
    await testTravelWorkflow();
    await testTaskExtractionWorkflow();
    await testDailyPlanningWorkflow();
}

runTests();
