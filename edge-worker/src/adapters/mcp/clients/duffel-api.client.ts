/**
 * DuffelApiClient - Low-level HTTP client for Duffel API
 *
 * Handles:
 * - HTTP requests/responses
 * - Retries with exponential backoff
 * - Rate limiting (429)
 * - Error classification
 * - Correlation IDs
 */

import { Logger } from '../../../observability/logger';

export interface DuffelApiError {
	code: string;
	message: string;
	status: number;
}

export interface DuffelErrorResponse {
	errors: DuffelApiError[];
}

export interface DuffelFlightOffer {
	id: string;
	total_amount: string;
	total_currency: string;
	slices: any[];
	passengers: any[];
	owner: {
		name: string;
	};
}

export interface DuffelOfferResponse {
	data: {
		offers: DuffelFlightOffer[];
		id: string;
	};
}

export class DuffelApiClient {
	private readonly apiBaseUrl = 'https://api.duffel.com/air';
	private readonly maxRetries = 3;
	private readonly retryDelayMs = 1000;
	private readonly requestTimeoutMs = 30000;

	constructor(
		private readonly apiKey: string,
		private readonly logger: Logger
	) { }

	async get<T>(
		endpoint: string,
		correlationId?: string
	): Promise<T> {
		return this.request<T>(endpoint, 'GET', undefined, correlationId);
	}

	async post<T>(
		endpoint: string,
		body: unknown,
		correlationId?: string
	): Promise<T> {
		return this.request<T>(endpoint, 'POST', body, correlationId);
	}

	private async request<T>(
		endpoint: string,
		method: 'GET' | 'POST',
		body?: unknown,
		correlationId?: string
	): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < this.maxRetries; attempt++) {
			try {
				const url = `${this.apiBaseUrl}${endpoint}`;
				const startTime = performance.now();

				const fetchOptions: RequestInit = {
					method,
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						'Content-Type': 'application/json',
						'Duffel-Version': 'v2',
						...(correlationId && { 'X-Correlation-ID': correlationId })
					},
					signal: AbortSignal.timeout(this.requestTimeoutMs)
				};

				if (body && method === 'POST') {
					fetchOptions.body = JSON.stringify(body);
				}

				const response = await fetch(url, fetchOptions);
				const latencyMs = performance.now() - startTime;

				// Handle rate limiting with exponential backoff
				if (response.status === 429) {
					const retryAfter = response.headers.get('retry-after');
					const waitMs = retryAfter
						? parseInt(retryAfter) * 1000
						: this.retryDelayMs * Math.pow(2, attempt);

					this.logger.warn('Rate limited by Duffel API', {
						metadata: { correlationId, waitMs, attempt }
					});

					if (attempt < this.maxRetries - 1) {
						await this.sleep(waitMs);
						continue;
					}
				}

				if (!response.ok) {
					const errorData = (await response.json()) as DuffelErrorResponse | undefined;
					const errorMsg = errorData?.errors?.[0]?.message || response.statusText;
					throw new Error(`Duffel API ${response.status}: ${errorMsg}`);
				}

				const data: T = await response.json();

				this.logger.info('Duffel API call succeeded', {
					metadata: {
						correlationId,
						method,
						endpoint,
						latencyMs: Math.round(latencyMs),
						attempt
					}
				});

				return data;
			} catch (error) {
				lastError = error as Error;

				const isRetryable =
					lastError.message.includes('429') ||
					lastError.message.includes('timeout') ||
					lastError.message.includes('503');

				if (isRetryable && attempt < this.maxRetries - 1) {
					const delayMs = this.retryDelayMs * Math.pow(2, attempt);
					this.logger.warn('Duffel API call failed, retrying', {
						metadata: {
							correlationId,
							method,
							endpoint,
							attempt,
							error: lastError.message,
							retryAfterMs: delayMs
						}
					});

					await this.sleep(delayMs);
				} else {
					this.logger.error('Duffel API call failed', lastError, {
						metadata: { correlationId, method, endpoint, attempt }
					});
					throw lastError;
				}
			}
		}

		throw new Error(
			`Duffel API call failed after ${this.maxRetries} retries: ${lastError?.message}`
		);
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
