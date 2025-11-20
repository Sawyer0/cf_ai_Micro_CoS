/**
 * Health Check Utilities
 * 
 * Checks status of dependencies for /api/health endpoint
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheck {
    name: string;
    status: HealthStatus;
    latencyMs?: number;
    error?: string;
}

export interface SystemHealth {
    status: HealthStatus;
    checks: HealthCheck[];
    timestamp: string;
}

export async function checkD1Health(db: any): Promise<HealthCheck> {
    const start = Date.now();
    try {
        await db.prepare('SELECT 1').first();
        return {
            name: 'd1',
            status: 'healthy',
            latencyMs: Date.now() - start
        };
    } catch (error) {
        return {
            name: 'd1',
            status: 'unhealthy',
            error: (error as Error).message
        };
    }
}

export async function checkWorkersAI(ai: any): Promise<HealthCheck> {
    try {
        // Simple ping check - just verify binding exists
        if (!ai) {
            return {
                name: 'workers_ai',
                status: 'unhealthy',
                error: 'AI binding not found'
            };
        }
        return {
            name: 'workers_ai',
            status: 'healthy'
        };
    } catch (error) {
        return {
            name: 'workers_ai',
            status: 'unhealthy',
            error: (error as Error).message
        };
    }
}

export async function getSystemHealth(
    d1: any,
    ai: any
): Promise<SystemHealth> {
    const checks = await Promise.all([
        checkD1Health(d1),
        checkWorkersAI(ai)
    ]);

    const allHealthy = checks.every(c => c.status === 'healthy');
    const anyUnhealthy = checks.some(c => c.status === 'unhealthy');

    return {
        status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
        checks,
        timestamp: new Date().toISO String()
    };
}
