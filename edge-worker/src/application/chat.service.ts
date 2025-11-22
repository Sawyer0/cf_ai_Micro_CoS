/**
 * ChatService - Application service for chat use cases
 *
 * Orchestrates chat workflows using domain aggregates and adapters
 */

import { Conversation } from '../domain/chat/aggregates/conversation.aggregate';
import { Message } from '../domain/chat/entities/message.entity';
import { IChatRepository } from '../domain/chat/ports/chat-repository.port';
import { ILLMPort } from '../domain/chat/ports/llm.port';
import { Principal } from '../domain/shared/value-objects/principal.vo';
import { CorrelationId } from '../domain/shared/value-objects/correlation-id.vo';
import { Logger } from '../observability/logger';

export class ChatService {
	constructor(
		private readonly chatRepo: IChatRepository,
		private readonly llm: ILLMPort,
		private readonly logger: Logger,
	) {}

	async sendMessage(
		conversationId: string | null,
		messageContent: string,
		principal: Principal,
		correlationId: CorrelationId,
	): Promise<{ conversation: Conversation; assistantMessage: Message }> {
		// Load or create conversation
		let conversation: Conversation;

		if (conversationId) {
			const existing = await this.chatRepo.getConversation(conversationId, principal.id);
			if (!existing) {
				throw new Error('Conversation not found');
			}
			conversation = existing;
		} else {
			// Create new conversation with initial user message
			const userMessage = Message.create('user', messageContent);
			conversation = Conversation.create(userMessage);
			await this.chatRepo.saveConversation(conversation);
			await this.chatRepo.saveMessage(userMessage, conversation.id.toString());
		}

		// If conversation already exists, add user message
		if (conversationId) {
			const userMessage = Message.create('user', messageContent);
			conversation.addMessage(userMessage);
			await this.chatRepo.saveMessage(userMessage, conversation.id.toString());
		}

		// Generate LLM response
		const messages = conversation.getMessages().map((m) => ({
			role: m.role,
			content: m.content,
		}));

		const response = await this.llm.generateCompletion({ messages }, correlationId.toString());

		// Add assistant message
		const assistantMessage = Message.create('assistant', response.content);
		conversation.addMessage(assistantMessage);
		await this.chatRepo.saveMessage(assistantMessage, conversation.id.toString());
		await this.chatRepo.saveConversation(conversation);

		this.logger.info('Chat message processed', {
			correlationId: correlationId.toString(),
			metadata: {
				conversationId: conversation.id.toString(),
				messageCount: conversation.getMessages().length,
			},
		});

		return { conversation, assistantMessage };
	}
}
