/**
 * Health Check Route
 *
 * GET /api/health - System health status
 */

import { getSystemHealth } from '../../observability/health';

export async function handleHealthCheck(env: any): Promise<Response> {
	try {
		const health = await getSystemHealth(env.DB, env.AI);

		return new Response(JSON.stringify(health), {
			status: health.status === 'healthy' ? 200 : 503,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				status: 'unhealthy',
				error: (error as Error).message,
				timestamp: new Date().toISOString(),
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	}
}
