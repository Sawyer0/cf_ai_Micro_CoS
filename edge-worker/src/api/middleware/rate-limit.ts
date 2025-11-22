/**
 * Rate Limiting Middleware
 *
 * Simple rate limiting using KV (or Durable Objects for more sophisticated limiting)
 */

export interface RateLimitConfig {
	requestsPerMinute: number;
	requestsPerHour: number;
}

export class RateLimitError extends Error {
	constructor(
		message: string,
		public retryAfter: number,
	) {
		super(message);
		this.name = 'RateLimitError';
	}
}

export class RateLimiter {
	constructor(
		private readonly kv: KVNamespace,
		private readonly config: RateLimitConfig,
	) {}

	async checkLimit(principalId: string): Promise<void> {
		const minuteKey = `ratelimit:${principalId}:minute:${this.getCurrentMinute()}`;
		const hourKey = `ratelimit:${principalId}:hour:${this.getCurrentHour()}`;

		const [minuteCount, hourCount] = await Promise.all([this.getCount(minuteKey), this.getCount(hourKey)]);

		if (minuteCount >= this.config.requestsPerMinute) {
			throw new RateLimitError('Rate limit exceeded (per minute)', 60);
		}

		if (hourCount >= this.config.requestsPerHour) {
			throw new RateLimitError('Rate limit exceeded (per hour)', 3600);
		}

		// Increment counters
		await Promise.all([this.increment(minuteKey, 60), this.increment(hourKey, 3600)]);
	}

	private async getCount(key: string): Promise<number> {
		const value = await this.kv.get(key);
		return value ? parseInt(value, 10) : 0;
	}

	private async increment(key: string, ttl: number): Promise<void> {
		const current = await this.getCount(key);
		await this.kv.put(key, (current + 1).toString(), { expirationTtl: ttl });
	}

	private getCurrentMinute(): string {
		return Math.floor(Date.now() / 60000).toString();
	}

	private getCurrentHour(): string {
		return Math.floor(Date.now() / 3600000).toString();
	}
}
