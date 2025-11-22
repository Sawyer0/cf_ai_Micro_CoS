import type { IMessageRepository } from '@/domain/ports/IMessageRepository';
import type { IStorageAdapter } from '@/domain/ports/IStorageAdapter';
import { MessageEntity, type Message } from '@/domain/entities/Message';

const STORAGE_KEY_PREFIX = 'messages:';

export class MessageRepository implements IMessageRepository {
	constructor(private readonly storage: IStorageAdapter) {}

	private getStorageKey(conversationId: string): string {
		return `${STORAGE_KEY_PREFIX}${conversationId}`;
	}

	async findByConversationId(conversationId: string): Promise<MessageEntity[]> {
		const json = this.storage.getItem(this.getStorageKey(conversationId));
		if (!json) return [];

		try {
			const data = JSON.parse(json) as Message[];
			return data.map((m) => MessageEntity.reconstitute(m));
		} catch {
			return [];
		}
	}

	async save(message: MessageEntity): Promise<void> {
		const messages = await this.findByConversationId(message.conversationId);
		messages.push(message);
		this.storage.setItem(
			this.getStorageKey(message.conversationId),
			JSON.stringify(messages.map((m) => m.toJSON())),
		);
	}

	async deleteByConversationId(conversationId: string): Promise<void> {
		this.storage.removeItem(this.getStorageKey(conversationId));
	}
}
