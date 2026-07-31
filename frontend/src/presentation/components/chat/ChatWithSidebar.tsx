import * as React from "react";
import { useConversationHistory } from "@/domain/hooks/useConversationHistory";
import { useChatWithTools } from "@/domain/hooks/useChatWithTools";
import { ConversationEntity } from "@/domain/entities/Conversation";
import { MessageListWithTools } from "./MessageListWithTools";
import { Menu, X, Plus, Send, AlertCircle } from "lucide-react";

export function ChatWithSidebar({ apiBase = "/api" }: { apiBase?: string }) {
	const [sidebarOpen, setSidebarOpen] = React.useState(true);
	const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
	const [renameId, setRenameId] = React.useState<string | null>(null);
	const [renameValue, setRenameValue] = React.useState("");
	const [input, setInput] = React.useState("");

	const { conversations, loading, addConversation, updateConversation, renameConversation, deleteConversation } =
		useConversationHistory();

	const { messages, isStreaming, streamingContent, toolStates, error, sendMessage } = useChatWithTools(
		activeConversationId || "",
		apiBase,
	);

	// Create new conversation
	const handleNewChat = React.useCallback(() => {
		const newConversation = ConversationEntity.create("New Chat");
		addConversation(newConversation);
		setActiveConversationId(newConversation.id);
		setInput("");
	}, [addConversation]);

	// Select conversation
	const handleSelectConversation = React.useCallback((id: string) => {
		setActiveConversationId(id);
		setInput("");
	}, []);

	// Rename conversation
	const handleRenameClick = (id: string) => {
		const conv = conversations.find((c) => c.id === id);
		if (conv) {
			setRenameId(id);
			setRenameValue(conv.title);
		}
	};

	const handleRenameConfirm = (id: string) => {
		if (renameValue.trim()) {
			renameConversation(id, renameValue.trim());
		}
		setRenameId(null);
		setRenameValue("");
	};

	const handleDelete = (id: string) => {
		deleteConversation(id);
		if (activeConversationId === id) {
			if (conversations.length > 1) {
				setActiveConversationId(conversations.find((c) => c.id !== id)?.id || null);
			} else {
				handleNewChat();
			}
		}
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || isStreaming || !activeConversationId) return;

		sendMessage(input);
		setInput("");

		// Update conversation timestamp
		const conversation = conversations.find((c) => c.id === activeConversationId);
		if (conversation) {
			updateConversation(conversation.updateTimestamp());
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && e.ctrlKey) {
			handleSubmit(e as unknown as React.FormEvent);
		}
	};

	// Initialize with first conversation if none exists
	React.useEffect(() => {
		if (!loading && conversations.length === 0) {
			handleNewChat();
		} else if (!loading && activeConversationId === null && conversations.length > 0) {
			setActiveConversationId(conversations[0].id);
		}
	}, [loading, conversations, activeConversationId, handleNewChat]);

	return (
		<div className="flex h-screen bg-slate-900 text-slate-50">
			{/* Sidebar */}
			<div
				className={`${
					sidebarOpen ? "w-64" : "w-0"
				} flex-shrink-0 transition-all duration-200 overflow-hidden border-r border-slate-800 bg-slate-900/50 flex flex-col`}
			>
				<div className="p-4 border-b border-slate-800 flex items-center justify-between">
					<h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Chats</h2>
					<button
						onClick={handleNewChat}
						className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
						title="New chat"
					>
						<Plus className="w-4 h-4" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto">
					{conversations.length === 0 ? (
						<div className="p-4 text-center text-sm text-slate-500">No conversations yet</div>
					) : (
						<div className="p-2 space-y-1">
							{conversations.map((conversation) => (
								<div
									key={conversation.id}
									className={`group relative rounded-lg px-3 py-2 cursor-pointer transition-colors ${
										activeConversationId === conversation.id
											? "bg-cyan-600/20 text-cyan-400"
											: "hover:bg-slate-800 text-slate-300"
									}`}
									onClick={() => handleSelectConversation(conversation.id)}
								>
									{renameId === conversation.id ? (
										<input
											autoFocus
											type="text"
											value={renameValue}
											onChange={(e) => setRenameValue(e.target.value)}
											onBlur={() => handleRenameConfirm(conversation.id)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													handleRenameConfirm(conversation.id);
												}
											}}
											className="w-full px-2 py-1 rounded bg-slate-700 border border-cyan-600 text-sm text-slate-100 focus:outline-none"
											onClick={(e) => e.stopPropagation()}
										/>
									) : (
										<div className="flex items-center justify-between gap-2">
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium truncate">{conversation.title}</p>
												<p className="text-xs text-slate-500 truncate">
													{conversation.updatedAt.toLocaleDateString()}
												</p>
											</div>
											<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleRenameClick(conversation.id);
													}}
													className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
													title="Rename"
												>
													<svg
														className="w-4 h-4"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
														/>
													</svg>
												</button>
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleDelete(conversation.id);
													}}
													className="p-1 rounded hover:bg-red-900/50 text-slate-400 hover:text-red-400"
													title="Delete"
												>
													<svg
														className="w-4 h-4"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
														/>
													</svg>
												</button>
											</div>
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Main content */}
			<div className="flex-1 flex flex-col">
				{/* Header */}
				<header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur-sm flex-shrink-0">
					<div className="px-4 py-4 flex items-center justify-between">
						<div className="flex items-center gap-4">
							<button
								onClick={() => setSidebarOpen(!sidebarOpen)}
								className="p-2 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
								title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
							>
								{sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
							</button>
							<div>
								<h1 className="text-2xl font-semibold">Micro Chief of Staff</h1>
								<p className="text-xs text-slate-400 mt-1">With Real-Time Tool Execution</p>
							</div>
						</div>
						{activeConversationId && (
							<div className="text-xs text-slate-500">ID: {activeConversationId.slice(0, 8)}</div>
						)}
					</div>
				</header>

				{/* Chat area */}
				{activeConversationId ? (
					<div className="flex-1 flex flex-col overflow-hidden">
						{/* Messages */}
						<MessageListWithTools
							messages={messages}
							isStreaming={isStreaming}
							streamingContent={streamingContent}
							toolStates={toolStates}
						/>

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
							<form onSubmit={handleSubmit} className="space-y-3">
								<div className="flex gap-3">
									<textarea
										value={input}
										onChange={(e) => setInput(e.target.value)}
										onKeyDown={handleKeyDown}
										placeholder="Ask me about flights, calendar, or anything else... (Ctrl+Enter to send)"
										disabled={isStreaming}
										rows={3}
										className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-600 disabled:opacity-50 resize-none"
									/>
									<button
										type="submit"
										disabled={!input.trim() || isStreaming}
										className="self-end rounded-lg bg-cyan-600 px-4 py-3 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 whitespace-nowrap"
									>
										<Send className="w-4 h-4" />
										{isStreaming ? "Sending..." : "Send"}
									</button>
								</div>

								<p className="text-xs text-slate-500">
									Press <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">Ctrl+Enter</kbd> to send
								</p>
							</form>
						</div>
					</div>
				) : (
					<div className="flex-1 flex items-center justify-center">
						<button
							onClick={handleNewChat}
							className="px-6 py-3 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors flex items-center gap-2"
						>
							<Plus className="w-5 h-5" />
							Start New Chat
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
