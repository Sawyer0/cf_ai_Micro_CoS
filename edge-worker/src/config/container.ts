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
import { DuffelApiClient } from '../adapters/mcp/clients/duffel-api.client';
import { DuffelFlightMapper } from '../adapters/mcp/mappers/duffel-flight.mapper';
import { FlightSearchValidator } from '../adapters/mcp/validators/flight-search.validator';
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

import { validateBindings } from './bindings.validator';
import { WorkerEnv } from '../env';

export function createContainer(env: WorkerEnv, config: AppConfig): Container {
	const logger = new Logger('edge-worker');

	// Validate all bindings at startup
	validateBindings(env, logger);

	const metrics = new AnalyticsEngineMetrics(env.ANALYTICS_ENGINE);

	// Adapters
	const llmAdapter = new WorkersAIAdapter(env.AI as any, logger);

	// Flight Adapter Dependencies
	const duffelClient = new DuffelApiClient(config.duffelApiKey || '', logger);
	const duffelMapper = new DuffelFlightMapper(logger);
	const flightValidator = new FlightSearchValidator();

	const flightAdapter = new DuffelFlightAdapter(duffelClient, duffelMapper, flightValidator, logger, config.duffelApiKey || '');

	const calendarAdapter = new GoogleCalendarAdapter(config.googleCalendarMcpUrl || 'http://localhost:3000', logger);

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
		rateLimiter: new RateLimiter(env.RATE_LIMIT_KV as any, {
			requestsPerMinute: config.rateLimitPerMinute,
			requestsPerHour: config.rateLimitPerHour,
		}),
		idempotency: new IdempotencyService(env.IDEMPOTENCY_KV as any),

		// Adapters
		llmAdapter,
		flightAdapter,
		calendarAdapter,
		chatRepository,
		taskRepository,
		eventLog,

		// Durable Objects
		chatSessions: env.CHAT_SESSIONS as any,

		// Services
		chatService,
		taskService,
		travelService,
	};
}
