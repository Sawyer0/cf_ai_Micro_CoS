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
}

export function createContainer(env: any, config: AppConfig): Container {
    const logger = new Logger('edge-worker');
    const metrics = new AnalyticsEngineMetrics(env.ANALYTICS_ENGINE);

    return {
        logger,
        metrics,
        rateLimiter: new RateLimiter(env.KV, {
            requestsPerMinute: config.rateLimitPerMinute,
            requestsPerHour: config.rateLimitPerHour
        }),
        idempotency: new IdempotencyService(env.KV),

        // Adapters
        llmAdapter: new WorkersAIAdapter(env.AI, logger),
        flightAdapter: new DuffelFlightAdapter(config.duffelApiKey || '', logger),
        calendarAdapter: new GoogleCalendarAdapter(logger),
        chatRepository: new D1ChatAdapter(env.D1, logger),
        taskRepository: new D1TaskAdapter(env.D1, logger),
        eventLog: new D1EventLogAdapter(env.D1, logger)
    };
}
