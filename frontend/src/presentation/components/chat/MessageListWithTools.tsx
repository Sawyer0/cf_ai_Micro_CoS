import * as React from "react";
import { MessageEntity } from "@/domain/entities/Message";
import { Zap, CheckCircle, AlertCircle, Loader, Brain } from "lucide-react";

export interface ToolState {
	id: string;
	type: "thinking" | "tool_start" | "tool_result" | "tool_error";
	name?: string;
	content?: unknown;
}

interface MessageListWithToolsProps {
	messages: MessageEntity[];
	isStreaming: boolean;
	streamingContent: string;
	toolStates?: ToolState[];
}

function ThinkingIndicator({ message }: { message?: string }) {
	return (
		<div className="flex items-start gap-3 mb-4">
			<div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
				<Brain className="w-4 h-4 text-amber-400 animate-pulse" />
			</div>
			<div className="flex-1 bg-slate-800 rounded-lg p-3">
				<p className="text-xs font-medium text-amber-300 mb-1">Thinking…</p>
				<p className="text-sm text-slate-300">{message || "Processing your request..."}</p>
			</div>
		</div>
	);
}

function ToolExecutionCard({
	toolName,
	status,
	error,
	data,
}: {
	toolName: string;
	status: "executing" | "success" | "error";
	error?: string;
	data?: unknown;
}) {
	const toolLabels: Record<string, string> = {
		search_flights: "Flight Search",
		list_events: "Calendar Query",
	};

	const label = toolLabels[toolName] || toolName;

	return (
		<div className="flex items-start gap-3 mb-3">
			<div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
				{status === "executing" && <Loader className="w-4 h-4 text-blue-400 animate-spin" />}
				{status === "success" && <CheckCircle className="w-4 h-4 text-green-400" />}
				{status === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
			</div>
			<div className="flex-1">
				<div className="bg-slate-800 rounded-lg p-3">
					<div className="flex items-center gap-2 mb-2">
						<Zap className="w-4 h-4 text-blue-400" />
						<p className="text-xs font-medium text-blue-300">{label}</p>
						{status === "executing" && <span className="text-xs text-slate-400">Executing…</span>}
						{status === "success" && <span className="text-xs text-green-400">Complete</span>}
						{status === "error" && <span className="text-xs text-red-400">Failed</span>}
					</div>

					{status === "error" && error && (
						<p className="text-xs text-red-300 bg-red-950 rounded px-2 py-1">{error}</p>
					)}

					{status === "success" && data && (
						<div className="text-xs text-slate-300 bg-slate-700 rounded px-2 py-1 max-h-20 overflow-y-auto">
							<pre className="whitespace-pre-wrap break-words text-slate-400">
								{JSON.stringify(data, null, 2).substring(0, 200)}
								{JSON.stringify(data, null, 2).length > 200 && "…"}
							</pre>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export function MessageListWithTools({
	messages,
	isStreaming,
	streamingContent,
	toolStates = [],
}: MessageListWithToolsProps) {
	const messagesEndRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, streamingContent, toolStates]);

	const thinkingStates = toolStates.filter((s) => s.type === "thinking");
	const toolExecutionStates = toolStates.filter((s) =>
		["tool_start", "tool_result", "tool_error"].includes(s.type),
	);

	return (
		<div className="flex-1 overflow-y-auto space-y-3 p-4">
			{messages.map((message) => (
				<div key={message.id} className="flex gap-3">
					{message.role === "assistant" ? (
						<>
							<div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-xs font-semibold">
								A
							</div>
							<div className="flex-1 bg-slate-800 rounded-lg p-3 text-sm text-slate-100 break-words">
								{message.content}
							</div>
						</>
					) : (
						<div className="flex-1 text-right">
							<div className="inline-block bg-cyan-600 rounded-lg p-3 text-sm text-white max-w-xs break-words">
								{message.content}
							</div>
						</div>
					)}
				</div>
			))}

			{thinkingStates.map((state, idx) => (
				<ThinkingIndicator key={`thinking-${idx}`} message={state.content as string} />
			))}

			{toolExecutionStates.length > 0 && (
				<div className="flex gap-3">
					<div className="flex-1">
						{toolExecutionStates.map((state, idx) => {
							if (state.type === "tool_start") {
								return (
									<ToolExecutionCard
										key={`tool-${idx}`}
										toolName={state.name || "unknown"}
										status="executing"
									/>
								);
							}

							if (state.type === "tool_result") {
								return (
									<ToolExecutionCard
										key={`tool-${idx}`}
										toolName={state.name || "unknown"}
										status="success"
										data={state.content}
									/>
								);
							}

							if (state.type === "tool_error") {
								return (
									<ToolExecutionCard
										key={`tool-${idx}`}
										toolName={state.name || "unknown"}
										status="error"
										error={state.content as string}
									/>
								);
							}

							return null;
						})}
					</div>
				</div>
			)}

			{isStreaming && streamingContent && (
				<div className="flex gap-3">
					<div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-xs font-semibold">
						A
					</div>
					<div className="flex-1 bg-slate-800 rounded-lg p-3 text-sm text-slate-100 break-words">
						{streamingContent}
						<span className="inline-block w-2 h-4 ml-1 bg-slate-400 animate-pulse" />
					</div>
				</div>
			)}

			{isStreaming && !streamingContent && toolExecutionStates.length === 0 && (
				<div className="px-4 pb-3 text-xs text-slate-400 flex items-center gap-2">
					<span className="inline-flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
					<span>Assistant is thinking…</span>
				</div>
			)}

			<div ref={messagesEndRef} />
		</div>
	);
}
