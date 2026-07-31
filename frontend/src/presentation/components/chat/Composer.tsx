import * as React from "react";
import { ComposerPrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { Send } from "lucide-react";

interface ComposerProps {
	placeholder?: string;
	disabled?: boolean;
}

export function Composer({ placeholder = "Type your message...", disabled = false }: ComposerProps) {
	return (
		<ComposerPrimitive.Root className="border-t border-slate-800 bg-slate-900 p-4">
			<div className="flex gap-3">
				<ComposerPrimitive.Input
					placeholder={placeholder}
					disabled={disabled}
					className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-600 disabled:opacity-50 resize-none"
				/>
				<ThreadPrimitive.If running={false}>
					<ComposerPrimitive.Send
						asChild
						disabled={disabled}
						className="self-end rounded-lg bg-cyan-600 px-4 py-3 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
					>
						<button type="button">
							<Send className="w-4 h-4" />
							Send
						</button>
					</ComposerPrimitive.Send>
				</ThreadPrimitive.If>
				<ThreadPrimitive.If running={true}>
					<button
						disabled
						className="self-end rounded-lg bg-slate-600 px-4 py-3 text-sm font-medium text-white opacity-50 cursor-not-allowed flex items-center gap-2"
					>
						Sending...
					</button>
				</ThreadPrimitive.If>
			</div>
			<p className="text-xs text-slate-500 mt-2">
				Press <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">Ctrl+Enter</kbd> to send
			</p>
		</ComposerPrimitive.Root>
	);
}
