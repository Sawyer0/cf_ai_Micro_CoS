import type { ConversationEntity } from '../entities/Conversation';

export interface IConversationRepository {
	findAll(): Promise<ConversationEntity[]>;
	findById(id: string): Promise<ConversationEntity | null>;
	save(conversation: ConversationEntity): Promise<void>;
	delete(id: string): Promise<void>;
}
