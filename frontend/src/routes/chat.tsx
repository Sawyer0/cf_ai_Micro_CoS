import { createFileRoute } from '@tanstack/react-router';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Thread } from '@assistant-ui/react-ui';
import { useCloudflareRuntime } from '@/lib/assistant/runtime';

function ChatPageComponent() {
	const { runtime } = useCloudflareRuntime();

	return (
		<div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
			<header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur-sm">
				<div className="max-w-4xl mx-auto px-4 py-4">
					<h1 className="text-2xl font-semibold">Micro Chief of Staff</h1>
				</div>
			</header>

			<main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
				<div className="h-[calc(100vh-140px)]">
					<AssistantRuntimeProvider runtime={runtime}>
						<Thread />
					</AssistantRuntimeProvider>
				</div>
			</main>
		</div>
	);
}

export const Route = createFileRoute('/chat')({
	component: ChatPageComponent,
});
