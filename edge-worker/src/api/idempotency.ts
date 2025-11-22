/**
 * Idempotency Handling
 *
 * KV-backed idempotency for API requests (24h TTL)
 */

interface CachedResponse {
	status: number;
	headers: Record<string, string>;
	body: any;
}

export class IdempotencyService {
	constructor(private readonly kv: KVNamespace) {}

	async checkIdempotencyKey(key: string): Promise<Response | null> {
		const cached = (await this.kv.get(`idempotency:${key}`, 'json')) as CachedResponse | null;

		if (cached) {
			return new Response(JSON.stringify(cached.body), {
				status: cached.status,
				headers: cached.headers,
			});
		}

		return null;
	}

	async storeResponse(key: string, response: Response): Promise<void> {
		// Clone response to avoid consuming the body of the original response
		const clonedResponse = response.clone();
		const body = await clonedResponse.json();

		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key] = value;
		});

		await this.kv.put(
			`idempotency:${key}`,
			JSON.stringify({
				status: response.status,
				headers,
				body,
			}),
			{ expirationTtl: 86400 }, // 24 hours
		);
	}

	getIdempotencyKey(request: Request): string | null {
		return request.headers.get('Idempotency-Key');
	}
}
