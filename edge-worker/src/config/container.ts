/**
 * Dependency Injection Container
 * 
 * Factory functions for creating services with dependencies
 */

import { Logger } from '../observability/logger';
import { AnalyticsEngineMetrics } from '../observability/metrics';
import { WorkersAIAdapter } from '../adapters/llm/workers-ai.adapter';
import { DuffelFlightAdapter } from '../adapters/mcp/flights.adapter';
import { GoogleCalendarAdapter } from '../adapters/mcp/calendar.adapter';
import { D1ChatAdapter } from '../adapters/persistence/d1-chat.adapter';
import { D1TaskAdapter } from '../adapters/persistence/d1-task.adapter';
import { D1EventLogAdapter } from '../adapters/persistence/d1-event-log.adapter';
import { RateLimiter } from '../api/middleware/rate-limit';
import { IdempotencyService } from '../api/idempotency';
import { AppConfig } from './settings';
import { ChatService } from '../application/chat.service';
import { TaskService } from '../application/task.service';
import { TravelService } from '../application/travel.service';

export interface Container {
    logger: Logger;
    metrics: AnalyticsEngineMetrics;
    rateLimiter: RateLimiter;
    idempotency: IdempotencyService;

    // Adapters
    llmAdapter: WorkersAIAdapter;
    flightAdapter: DuffelFlightAdapter;
    calendarAdapter: GoogleCalendarAdapter;
    chatRepository: D1ChatAdapter;
    taskRepository: D1TaskAdapter;
    eventLog: D1EventLogAdapter;

    // Durable Objects
    chatSessions: DurableObjectNamespace;

    // Application Services
    chatService: ChatService;
    taskService: TaskService;
    travelService: TravelService;
}

export function createContainer(env: any, config: AppConfig): Container {
    const logger = new Logger('edge-worker');
    const metrics = new AnalyticsEngineMetrics(env.ANALYTICS_ENGINE);

    // Adapters
    const llmAdapter = new WorkersAIAdapter(env.AI, logger);
    const flightAdapter = new DuffelFlightAdapter(config.duffelApiKey || '', logger);
    const calendarAdapter = new GoogleCalendarAdapter(config.googleCalendarMcpUrl || 'http://localhost:3000', logger);

    if (!env.DB) {
        logger.error('D1 Database binding (DB) is missing in environment');
        throw new Error('D1 Database binding (DB) is missing');
    }

    const chatRepository = new D1ChatAdapter(env.DB, logger);
    const taskRepository = new D1TaskAdapter(env.DB, logger);
    const eventLog = new D1EventLogAdapter(env.DB, logger);

    // Application Services
    const chatService = new ChatService(chatRepository, llmAdapter, logger);
    const taskService = new TaskService(taskRepository, logger);
    const travelService = new TravelService(flightAdapter, logger);

    return {
        logger,
        metrics,
        rateLimiter: new RateLimiter(env.RATE_LIMIT_KV, {
            requestsPerMinute: config.rateLimitPerMinute,
            requestsPerHour: config.rateLimitPerHour
        }),
        idempotency: new IdempotencyService(env.IDEMPOTENCY_KV),

        // Adapters
        llmAdapter,
        flightAdapter,
        calendarAdapter,
        chatRepository,
        taskRepository,
        eventLog,

        // Durable Objects
        chatSessions: env.CHAT_SESSIONS,

        // Services
        chatService,
        taskService,
        travelService
    };
}
