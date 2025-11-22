import type { MessageEntity } from '../entities/Message';

export interface IMessageRepository {
	findByConversationId(conversationId: string): Promise<MessageEntity[]>;
	save(message: MessageEntity): Promise<void>;
	deleteByConversationId(conversationId: string): Promise<void>;
}
