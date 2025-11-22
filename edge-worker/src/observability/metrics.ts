/**
 * Metrics Collection for Cloudflare Analytics Engine
 *
 * Records time-series metrics for observability
 */

export interface Metric {
	endpoint: string;
	status: string;
	latencyMs: number;
	tokenCount?: number;
	correlationId?: string;
}

export interface MetricsCollector {
	recordRequest(metric: Metric): void;
	recordLLMCall(latencyMs: number, tokenCount: number, model: string): void;
	recordMCPCall(service: string, operation: string, success: boolean, latencyMs: number): void;
	recordD1Query(operation: string, latencyMs: number): void;
}

export class AnalyticsEngineMetrics implements MetricsCollector {
	constructor(private readonly analyticsEngine: any) {}

	recordRequest(metric: Metric): void {
		this.analyticsEngine?.writeDataPoint({
			blobs: [metric.endpoint, metric.status],
			doubles: [metric.latencyMs, metric.tokenCount || 0],
			indexes: [metric.correlationId || ''],
		});
	}

	recordLLMCall(latencyMs: number, tokenCount: number, model: string): void {
		this.analyticsEngine?.writeDataPoint({
			blobs: ['llm_call', model],
			doubles: [latencyMs, tokenCount],
		});
	}

	recordMCPCall(service: string, operation: string, success: boolean, latencyMs: number): void {
		this.analyticsEngine?.writeDataPoint({
			blobs: ['mcp_call', service, operation, success ? 'success' : 'failure'],
			doubles: [latencyMs],
		});
	}

	recordD1Query(operation: string, latencyMs: number): void {
		this.analyticsEngine?.writeDataPoint({
			blobs: ['d1_query', operation],
			doubles: [latencyMs],
		});
	}
}
