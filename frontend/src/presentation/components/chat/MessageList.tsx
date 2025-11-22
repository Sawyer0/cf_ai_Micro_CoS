import * as React from 'react';
import { AssistantMessage, UserMessage } from '@assistant-ui/react-ui';
import type { MessageEntity } from '../../../domain/entities/Message';

interface MessageListProps {
	messages: MessageEntity[];
	isStreaming: boolean;
	streamingContent: string;
}

export function MessageList({ messages, isStreaming, streamingContent }: MessageListProps) {
	return (
		<div className="flex-1 overflow-y-auto space-y-4 p-4">
			{messages.map((message) => (
				<div key={message.id} className="flex gap-3">
					{message.role === 'assistant' ? (
						<>
							<div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-xs font-semibold">
								A
							</div>
							<div className="flex-1 bg-slate-800 rounded-lg p-3 text-sm text-slate-100">
								{message.content}
							</div>
						</>
					) : (
						<div className="flex-1 text-right">
							<div className="inline-block bg-cyan-600 rounded-lg p-3 text-sm text-white max-w-xs">
								{message.content}
							</div>
						</div>
					)}
				</div>
			))}

			{isStreaming && streamingContent && (
				<div className="flex gap-3">
					<div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-xs font-semibold">
						A
					</div>
					<div className="flex-1 bg-slate-800 rounded-lg p-3 text-sm text-slate-100">
						{streamingContent}
						<span className="inline-block w-2 h-4 ml-1 bg-slate-400 animate-pulse" />
					</div>
				</div>
			)}

			{isStreaming && !streamingContent && (
				<div className="px-4 pb-3 text-xs text-slate-400 flex items-center gap-2">
					<span className="inline-flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
					<span>Assistant is thinking…</span>
				</div>
			)}
		</div>
	);
}
