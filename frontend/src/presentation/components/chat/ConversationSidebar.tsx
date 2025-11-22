import * as React from 'react';
import type { ConversationEntity } from '@/domain/entities/Conversation';

interface ConversationSidebarProps {
	conversations: ConversationEntity[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onRename: (id: string) => void;
	onDelete: (id: string) => void;
}

export function ConversationSidebar({
	conversations,
	activeId,
	onSelect,
	onRename,
	onDelete,
}: ConversationSidebarProps) {
	const [hoveredId, setHoveredId] = React.useState<string | null>(null);

	return (
		<aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
			<div className="p-4 border-b border-slate-800">
				<h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
					Recent chats
				</h2>
			</div>

			<div className="flex-1 overflow-y-auto">
				{conversations.length === 0 ? (
					<div className="p-4 text-center text-sm text-slate-500">
						No conversations yet
					</div>
				) : (
					<div className="p-2 space-y-1">
						{conversations.map((conversation) => (
							<div
								key={conversation.id}
								className={`group relative rounded-lg px-3 py-2 cursor-pointer transition-colors ${
									activeId === conversation.id
										? 'bg-cyan-600/20 text-cyan-400'
										: 'hover:bg-slate-800 text-slate-300'
								}`}
								onClick={() => onSelect(conversation.id)}
								onMouseEnter={() => setHoveredId(conversation.id)}
								onMouseLeave={() => setHoveredId(null)}
							>
								<div className="flex items-center justify-between gap-2">
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium truncate">
											{conversation.title}
										</p>
										<p className="text-xs text-slate-500 truncate">
											{conversation.updatedAt.toLocaleDateString()}
										</p>
									</div>

									{/* Actions (show on hover) */}
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
													onDelete(conversation.id);
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
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</aside>
	);
}
