import * as React from "react";
import { ThreadPrimitive, ComposerPrimitive } from "@assistant-ui/react";
import { AlertCircle, Send } from "lucide-react";
import { MessageListWithTools } from "./MessageListWithTools";

interface ChatThreadWithToolsProps {
	conversationId: string;
	apiBase?: string;
	error?: string;
	isStreaming?: boolean;
}

export function ChatThreadWithTools({
	conversationId,
	apiBase = "/api",
	error,
	isStreaming = false,
}: ChatThreadWithToolsProps) {
	return (
		<div className="flex flex-col h-full bg-slate-900">
			{/* Messages */}
			<ThreadPrimitive.Root className="flex-1 flex flex-col overflow-hidden">
				<ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-6">
					<MessageListWithTools />
					<ThreadPrimitive.ScrollToBottom className="mt-4" />
				</ThreadPrimitive.Viewport>
			</ThreadPrimitive.Root>

			{/* Error message */}
			{error && (
				<div className="mx-4 mb-4 p-3 bg-red-950 border border-red-700 rounded-lg flex items-start gap-3">
					<AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
					<div>
						<p className="text-sm font-medium text-red-200">Error</p>
						<p className="text-sm text-red-300">{error}</p>
					</div>
				</div>
			)}

			{/* Input area */}
			<div className="border-t border-slate-800 bg-slate-900 p-4">
				<ComposerPrimitive.Root className="space-y-3">
					<div className="flex gap-3">
						<ComposerPrimitive.Input
							placeholder="Ask me about flights, calendar, or anything else... (Ctrl+Enter to send)"
							disabled={isStreaming}
							rows={3}
							className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-600 disabled:opacity-50 resize-none"
						/>
						<ThreadPrimitive.If running={false}>
							<ComposerPrimitive.Send
								asChild
								className="self-end rounded-lg bg-cyan-600 px-4 py-3 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
							>
								<button type="button">
									<Send className="w-4 h-4" />
									Send
								</button>
							</ComposerPrimitive.Send>
						</ThreadPrimitive.If>
						<ThreadPrimitive.If running={true}>
							<button disabled className="self-end rounded-lg bg-slate-600 px-4 py-3 text-sm font-medium text-white opacity-50">
								Sending...
							</button>
						</ThreadPrimitive.If>
					</div>

					<p className="text-xs text-slate-500">
						Press <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">Ctrl+Enter</kbd> to send
					</p>
				</ComposerPrimitive.Root>
			</div>
		</div>
	);
}
