import * as React from "react";
import { Plus, Trash2, PencilIcon } from "lucide-react";
import type { ConversationEntity } from "@/domain/entities/Conversation";

interface ConversationSidebarProps {
	conversations: ConversationEntity[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onNew: () => void;
	onRename: (id: string) => void;
	onDelete: (id: string) => void;
	renameId?: string | null;
	renameValue?: string;
	onRenameChange?: (value: string) => void;
	onRenameConfirm?: (id: string) => void;
}

export function ConversationSidebar({
	conversations,
	activeId,
	onSelect,
	onNew,
	onRename,
	onDelete,
	renameId,
	renameValue = "",
	onRenameChange,
	onRenameConfirm,
}: ConversationSidebarProps) {
	const [hoveredId, setHoveredId] = React.useState<string | null>(null);

	return (
		<aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
			<div className="p-4 border-b border-slate-800 flex items-center justify-between">
				<h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Recent Chats</h2>
				<button
					onClick={onNew}
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
									activeId === conversation.id
										? "bg-cyan-600/20 text-cyan-400"
										: "hover:bg-slate-800 text-slate-300"
								}`}
								onClick={() => onSelect(conversation.id)}
								onMouseEnter={() => setHoveredId(conversation.id)}
								onMouseLeave={() => setHoveredId(null)}
							>
								{renameId === conversation.id ? (
									<input
										autoFocus
										type="text"
										value={renameValue}
										onChange={(e) => onRenameChange?.(e.target.value)}
										onBlur={() => onRenameConfirm?.(conversation.id)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												onRenameConfirm?.(conversation.id);
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

										{hoveredId === conversation.id && (
											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														onRename(conversation.id);
													}}
													className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
													title="Rename"
												>
													<PencilIcon className="w-4 h-4" />
												</button>
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														onDelete(conversation.id);
													}}
													className="p-1 rounded hover:bg-red-900/50 text-slate-400 hover:text-red-400"
													title="Delete"
												>
													<Trash2 className="w-4 h-4" />
												</button>
											</div>
										)}
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</aside>
	);
}
