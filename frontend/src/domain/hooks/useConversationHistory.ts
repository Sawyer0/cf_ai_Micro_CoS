import * as React from "react";
import { ConversationEntity } from "@/domain/entities/Conversation";

const STORAGE_KEY = "micro-cos:conversations";

export function useConversationHistory() {
	const [conversations, setConversations] = React.useState<ConversationEntity[]>([]);
	const [loading, setLoading] = React.useState(true);

	// Load from localStorage on mount
	React.useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				const entities = parsed.map((c: any) => ConversationEntity.reconstitute(c));
				setConversations(entities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
			}
		} catch (error) {
			console.error("Failed to load conversation history:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	const addConversation = React.useCallback((conversation: ConversationEntity) => {
		setConversations((prev) => {
			const updated = [conversation, ...prev.filter((c) => c.id !== conversation.id)];
			localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.map((c) => c.toJSON())));
			return updated;
		});
	}, []);

	const updateConversation = React.useCallback((conversation: ConversationEntity) => {
		setConversations((prev) => {
			const updated = prev
				.map((c) => (c.id === conversation.id ? conversation : c))
				.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
			localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.map((c) => c.toJSON())));
			return updated;
		});
	}, []);

	const renameConversation = React.useCallback((id: string, newTitle: string) => {
		setConversations((prev) => {
			const conversation = prev.find((c) => c.id === id);
			if (!conversation) return prev;

			const renamed = conversation.rename(newTitle).updateTimestamp();
			const updated = prev
				.map((c) => (c.id === id ? renamed : c))
				.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
			localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.map((c) => c.toJSON())));
			return updated;
		});
	}, []);

	const deleteConversation = React.useCallback((id: string) => {
		setConversations((prev) => {
			const updated = prev.filter((c) => c.id !== id);
			localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.map((c) => c.toJSON())));
			return updated;
		});
	}, []);

	return {
		conversations,
		loading,
		addConversation,
		updateConversation,
		renameConversation,
		deleteConversation,
	};
}
