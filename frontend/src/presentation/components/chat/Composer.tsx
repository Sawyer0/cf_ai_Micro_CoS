import * as React from 'react';

interface ComposerProps {
	onSend: (message: string) => void;
	isLoading: boolean;
}

export function Composer({ onSend, isLoading }: ComposerProps) {
	const [input, setInput] = React.useState('');
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = input.trim();
		if (!trimmed || isLoading) return;

		onSend(trimmed);
		setInput('');

		// Reset textarea height
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && e.ctrlKey) {
			handleSubmit(e as any);
		}
	};

	const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInput(e.target.value);

		// Auto-resize textarea
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex gap-2">
			<textarea
				ref={textareaRef}
				value={input}
				onChange={handleInput}
				onKeyDown={handleKeyDown}
				placeholder="Type your message... (Ctrl+Enter to send)"
				disabled={isLoading}
				className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
				rows={1}
			/>
			<button
				type="submit"
				disabled={isLoading || !input.trim()}
				className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
			>
				Send
			</button>
		</form>
	);
}
