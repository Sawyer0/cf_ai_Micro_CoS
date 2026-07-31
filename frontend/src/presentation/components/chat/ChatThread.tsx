import * as React from "react";
import { ThreadPrimitive } from "@assistant-ui/react";

interface ChatThreadProps {
	conversationId: string;
}

export function ChatThread({ conversationId }: ChatThreadProps) {
	return (
		<ThreadPrimitive.Root className="flex flex-col h-full bg-slate-900">
			<ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-6">
				<ThreadPrimitive.Messages
					components={{
						UserMessage: ({ message }) => (
							<div className="mb-4 flex justify-end">
								<div className="max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-lg bg-cyan-600 text-white">
									<p className="text-sm">{message.content[0]?.text || ""}</p>
								</div>
							</div>
						),
						AssistantMessage: ({ message }) => (
							<div className="mb-4 flex justify-start">
								<div className="max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-lg bg-slate-800 text-slate-100">
									<p className="text-sm">{message.content[0]?.text || ""}</p>
								</div>
							</div>
						),
					}}
				/>
				<ThreadPrimitive.If empty>
					<div className="flex items-center justify-center h-full text-slate-400">
						<p>No messages yet. Start a conversation!</p>
					</div>
				</ThreadPrimitive.If>
				<ThreadPrimitive.ScrollToBottom className="mt-4" />
			</ThreadPrimitive.Viewport>
		</ThreadPrimitive.Root>
	);
}
