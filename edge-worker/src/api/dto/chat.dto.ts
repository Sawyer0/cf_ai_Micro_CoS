/**
 * Chat API DTOs
 *
 * Request/response types for chat endpoints
 */

export interface ChatRequest {
	message: string;
	conversationId?: string;
	stream?: boolean;
}

export interface ChatResponse {
	conversationId: string;
	messageId: string;
	content: string;
	role: 'assistant';
	timestamp: string;
}

export interface ChatHistoryResponse {
	conversationId: string;
	messages: Array<{
		id: string;
		role: 'user' | 'assistant' | 'system';
		content: string;
		timestamp: string;
	}>;
	hasMore: boolean;
}

export interface ChatConversationSummary {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
}

export interface ChatConversationsResponse {
	conversations: ChatConversationSummary[];
}

export interface SaveConversationRequest {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
}

export interface DeleteConversationRequest {
	id: string;
}

export function validateChatRequest(data: any): ChatRequest {
	if (!data.message || typeof data.message !== 'string') {
		throw new Error('Invalid chat request: message required');
	}

	return {
		message: data.message,
		conversationId: data.conversationId,
		stream: data.stream ?? false,
	};
}
