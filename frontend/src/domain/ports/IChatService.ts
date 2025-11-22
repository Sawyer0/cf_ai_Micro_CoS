export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface IChatService {
	sendMessage(
		conversationId: string,
		message: string,
		onToken: (token: string) => void,
	): Promise<void>;
}
