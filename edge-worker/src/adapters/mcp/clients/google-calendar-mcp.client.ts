/**
 * GoogleCalendarMcpClient - Low-level HTTP client for google-calendar-mcp
 *
 * Handles:
 * - MCP RPC calls via HTTP
 * - Retries with exponential backoff
 * - Error handling
 * - Correlation IDs
 */

import { Logger } from '../../../observability/logger';

interface MCPCallRequest {
	method: string;
	jsonrpc: string;
	params: Record<string, unknown>;
	id: string;
}

interface MCPCallResponse<T = unknown> {
	result?: T;
	error?: {
		code: number;
		message: string;
	};
	id: string;
}

export class GoogleCalendarMcpClient {
	private readonly maxRetries = 3;
	private readonly retryDelayMs = 1000;

	constructor(
		private readonly mcpUrl: string,
		private readonly logger: Logger,
	) {}

	async call<T>(method: string, params: Record<string, unknown>, correlationId: string): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < this.maxRetries; attempt++) {
			try {
				const requestId = `${correlationId}-${attempt}`;
				const request: MCPCallRequest = {
					jsonrpc: '2.0',
					method,
					params,
					id: requestId,
				};

				const startTime = performance.now();

				const response = await fetch(`${this.mcpUrl}/call`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Correlation-ID': correlationId,
					},
					body: JSON.stringify(request),
				});

				const latencyMs = performance.now() - startTime;

				if (!response.ok) {
					throw new Error(`MCP HTTP ${response.status}: ${response.statusText}`);
				}

				const data: MCPCallResponse<T> = await response.json();

				if (data.error) {
					throw new Error(`MCP Error: ${data.error.message} (code: ${data.error.code})`);
				}

				this.logger.info('MCP call succeeded', {
					metadata: {
						correlationId,
						method,
						latencyMs: Math.round(latencyMs),
						attempt,
					},
				});

				return data.result as T;
			} catch (error) {
				lastError = error as Error;

				this.logger.warn('MCP call failed, retrying', {
					metadata: {
						correlationId,
						method,
						attempt,
						error: lastError.message,
						retryAfterMs: this.retryDelayMs * (attempt + 1),
					},
				});

				if (attempt < this.maxRetries - 1) {
					await this.sleep(this.retryDelayMs * (attempt + 1));
				}
			}
		}

		throw new Error(`MCP call failed after ${this.maxRetries} retries: ${lastError?.message}`);
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
