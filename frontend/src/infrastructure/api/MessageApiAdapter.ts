import type { IMessageRepository } from '@/domain/ports/IMessageRepository';
import { MessageEntity, type Message } from '@/domain/entities/Message';

/**
 * Fetches messages from the backend API instead of localStorage
 */
export class MessageApiAdapter implements IMessageRepository {
	constructor(private readonly baseUrl: string) { }

	async findByConversationId(conversationId: string): Promise<MessageEntity[]> {
		const response = await fetch(`${this.baseUrl}/api/conversations/${conversationId}`, {
			headers: {
				'X-Test-Bypass-Auth': 'true', // TODO: Replace with real auth
			},
		});

		// Return empty array if conversation not found (new conversation with no messages yet)
		if (response.status === 404) {
			return [];
		}

		if (!response.ok) {
			throw new Error(`Failed to fetch messages: ${response.statusText}`);
		}

		const data = await response.json();

		// Backend returns { conversationId, messages, hasMore }
		if (!data.messages || !Array.isArray(data.messages)) {
			return [];
		}

		return data.messages.map((m: any) =>
			MessageEntity.reconstitute({
				id: m.id,
				role: m.role,
				content: m.content,
				timestamp: new Date(m.timestamp),
				conversationId,
			}),
		);
	}

	async save(message: MessageEntity): Promise<void> {
		// Messages are saved automatically when sent via /api/chat
		// This method is a no-op for the API adapter
		// The backend handles message persistence
		return Promise.resolve();
	}

	async deleteByConversationId(conversationId: string): Promise<void> {
		// Messages are deleted when conversation is deleted
		// This is handled by the DELETE /api/conversations/:id endpoint
		return Promise.resolve();
	}
}
