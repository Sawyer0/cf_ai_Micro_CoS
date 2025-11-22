/**
 * IChatRepository - Port for chat persistence
 *
 * Port in Chat Bounded Context
 * Defines what the domain needs from persistence layer
 */

import { Conversation } from '../aggregates/conversation.aggregate';
import { Message } from '../entities/message.entity';

export interface IChatRepository {
	saveConversation(conversation: Conversation): Promise<void>;

	getConversation(id: string, principalId: string): Promise<Conversation | null>;

	saveMessage(message: Message, conversationId: string): Promise<void>;

	getMessages(conversationId: string, limit: number, offset?: number): Promise<Message[]>;
}
