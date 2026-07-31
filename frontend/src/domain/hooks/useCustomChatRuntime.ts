import { useAssistantRuntime, useExternalStoreRuntime } from "@assistant-ui/react";
import * as React from "react";
import { useChatWithTools } from "./useChatWithTools";

export function useCustomChatRuntime(conversationId: string, apiBase: string = "/api") {
	const { messages, isStreaming, sendMessage, error } = useChatWithTools(conversationId, apiBase);

	const runtime = useExternalStoreRuntime({
		messages: messages.map((msg) => ({
			id: msg.id,
			role: msg.role as "user" | "assistant",
			content: [
				{
					type: "text" as const,
					text: msg.content,
				},
			],
		})),
		isRunning: isStreaming,
		onSendMessage: async (message) => {
			sendMessage(message.content[0].text);
		},
	});

	return runtime;
}
