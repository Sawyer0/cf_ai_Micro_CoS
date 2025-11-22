import { WorkerEnv } from '../env';
import { Logger } from '../observability/logger';

export function validateBindings(env: WorkerEnv, logger: Logger): void {
	const missingBindings: string[] = [];

	// Validate Durable Objects
	if (!env.CHAT_SESSIONS) missingBindings.push('CHAT_SESSIONS');

	// Validate Workflows
	if (!env.TRAVEL_PLANNING) missingBindings.push('TRAVEL_PLANNING');
	if (!env.TASK_EXTRACTION) missingBindings.push('TASK_EXTRACTION');
	if (!env.DAILY_PLANNING) missingBindings.push('DAILY_PLANNING');

	// Validate D1
	if (!env.DB) missingBindings.push('DB');

	// Validate KV
	if (!env.IDEMPOTENCY_KV) missingBindings.push('IDEMPOTENCY_KV');
	if (!env.RATE_LIMIT_KV) missingBindings.push('RATE_LIMIT_KV');

	// Validate AI
	if (!env.AI) missingBindings.push('AI');

	// Validate Environment Variables (Critical ones)
	if (env.ENVIRONMENT === 'production') {
		if (!env.DUFFEL_API_KEY) missingBindings.push('DUFFEL_API_KEY');
	}

	if (missingBindings.length > 0) {
		const errorMsg = `Missing required bindings: ${missingBindings.join(', ')}`;
		logger.error(errorMsg);
		throw new Error(errorMsg);
	}

	logger.info('All required bindings validated successfully');
}
