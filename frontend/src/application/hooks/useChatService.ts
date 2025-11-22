import { useMemo } from 'react';
import { ChatService } from '@/application/services/ChatService';
import { CloudflareChatAdapter } from '@/infrastructure/api/CloudflareChatAdapter';
import { ConversationApiAdapter } from '@/infrastructure/api/ConversationApiAdapter';
import { MessageApiAdapter } from '@/infrastructure/api/MessageApiAdapter';

export function useChatService(): ChatService {
	return useMemo(() => {
		const baseUrl = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
		const chatAdapter = new CloudflareChatAdapter(baseUrl);
		const conversationRepo = new ConversationApiAdapter(baseUrl);
		const messageRepo = new MessageApiAdapter(baseUrl);

		return new ChatService(chatAdapter, messageRepo, conversationRepo);
	}, []);
}
