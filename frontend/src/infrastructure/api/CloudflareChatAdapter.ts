import type { IChatService } from '@/domain/ports/IChatService';

export class CloudflareChatAdapter implements IChatService {
	constructor(private readonly baseUrl: string) {}

	async sendMessage(
		conversationId: string,
		message: string,
		onToken: (token: string) => void,
	): Promise<void> {
		const url = `${this.baseUrl}/api/chat`;
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Test-Bypass-Auth': 'true',
			},
			body: JSON.stringify({
				messages: [{ role: 'user', content: message }],
				stream: true,
				conversation_id: conversationId,
			}),
		});

		if (!response.ok || !response.body) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (!value) continue;

			buffer += decoder.decode(value, { stream: true });

			let separatorIndex: number;
			while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
				const rawEvent = buffer.slice(0, separatorIndex).trim();
				buffer = buffer.slice(separatorIndex + 2);

				const lines = rawEvent.split('\n');
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed.startsWith('data:')) continue;

					const json = trimmed.slice('data:'.length).trim();
					if (!json || json === '[DONE]') continue;

					try {
						const event = JSON.parse(json);
						if (event.type === 'token' && typeof event.token === 'string') {
							onToken(event.token);
						}
					} catch {
						continue;
					}
				}
			}
		}
	}
}
