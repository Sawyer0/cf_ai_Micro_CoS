import type { IChatService } from '@/domain/ports/IChatService';
import type { IMessageRepository } from '@/domain/ports/IMessageRepository';
import type { IConversationRepository } from '@/domain/ports/IConversationRepository';
import { MessageEntity } from '@/domain/entities/Message';
import { ConversationEntity } from '@/domain/entities/Conversation';

export class ChatService {
	constructor(
		private readonly chatAdapter: IChatService,
		private readonly messageRepo: IMessageRepository,
		private readonly conversationRepo: IConversationRepository,
	) { }

	async sendMessage(
		conversationId: string,
		content: string,
		onToken: (token: string) => void,
	): Promise<void> {
		// Save user message
		const userMessage = MessageEntity.create('user', content, conversationId);
		await this.messageRepo.save(userMessage);

		// Note: Conversation timestamp update removed because backend doesn't support GET /api/conversations/:id
		// The endpoint returns messages, not conversation metadata
		// TODO: Add backend endpoint to fetch/update individual conversation or update timestamp server-side

		// Stream assistant response
		let assistantContent = '';
		await this.chatAdapter.sendMessage(conversationId, content, (token) => {
			assistantContent += token;
			onToken(token);
		});

		// Save assistant message
		const assistantMessage = MessageEntity.create('assistant', assistantContent, conversationId);
		await this.messageRepo.save(assistantMessage);
	}

	async loadMessages(conversationId: string): Promise<MessageEntity[]> {
		return this.messageRepo.findByConversationId(conversationId);
	}

	async createConversation(title: string): Promise<ConversationEntity> {
		const conversation = ConversationEntity.create(title);
		await this.conversationRepo.save(conversation);
		return conversation;
	}

	async loadConversations(): Promise<ConversationEntity[]> {
		return this.conversationRepo.findAll();
	}

	async deleteConversation(conversationId: string): Promise<void> {
		await this.conversationRepo.delete(conversationId);
		await this.messageRepo.deleteByConversationId(conversationId);
	}

	async renameConversation(conversationId: string, newTitle: string): Promise<void> {
		const conversation = await this.conversationRepo.findById(conversationId);
		if (conversation) {
			await this.conversationRepo.save(conversation.rename(newTitle));
		}
	}
}
