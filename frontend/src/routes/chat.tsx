import { createFileRoute } from "@tanstack/react-router";
import { ChatWithSidebar } from "@/presentation/components/chat/ChatWithSidebar";

function ChatPageComponent() {
	// Point directly to edge-worker (Nitro doesn't respect Vite proxy)
	return <ChatWithSidebar apiBase="http://127.0.0.1:8787/api" />;
}

export const Route = createFileRoute("/chat")({
	component: ChatPageComponent,
});
