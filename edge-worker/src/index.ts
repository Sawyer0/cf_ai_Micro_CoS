/**
 * Main Worker Entry Point
 *
 * Cloudflare Worker handler with full middleware pipeline
 * Integrates: Router, DI Container, Middleware, Services, Workflows
 */

import { handleRequest } from './api/router';
import { Logger } from './observability/logger';
import { createContainer } from './config/container';
import { loadConfig } from './config/settings';
import { ChatSessionDO } from './durable-objects/chat-session/chat-session.do';
import { TravelPlanningWorkflow } from './workflows/travel-planning.workflow';
import { TaskExtractionWorkflow } from './workflows/task-extraction.workflow';
import { DailyPlanningWorkflow } from './workflows/daily-planning.workflow';
import { WorkerEnv } from './env';

// Export Durable Objects
export { ChatSessionDO };

// Export Workflows
export { TravelPlanningWorkflow, TaskExtractionWorkflow, DailyPlanningWorkflow };

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
		// Derive correlation ID once at the top for all paths
		const correlationId = request.headers.get('X-Correlation-ID') || crypto.randomUUID();
		const logger = new Logger('edge-worker');
		logger.info('Worker handling request', {
			correlationId,
			metadata: {
				method: request.method,
				url: request.url,
				userAgent: request.headers.get('user-agent'),
			},
		});

		try {
			// 1. Load Configuration
			const config = loadConfig(env);

			// 2. Initialize Dependency Injection Container
			const container = createContainer(env, config);

			// 3. Create Router Context
			const context = {
				env,
				ctx,
				container,
				correlationId,
			};

			// 4. Handle Request via Router
			return await handleRequest(request, context);
		} catch (error) {
			// Fallback error handling if container/config fails
			logger.error('Fatal Worker Error', error as Error, { correlationId });

			return new Response(
				JSON.stringify({
					error: 'Internal Server Error',
					message: 'A fatal error occurred during request processing',
					correlation_id: correlationId,
				}),
				{
					status: 500,
					headers: {
						'Content-Type': 'application/json',
						'X-Correlation-ID': correlationId,
					},
				},
			);
		}
	},
};
