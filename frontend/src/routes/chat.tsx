import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";

interface ChatMessageItem {
  id: number;
  role: ChatRole;
  content: string;
}

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage() {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMessage: ChatMessageItem = {
      id: Date.now(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-Bypass-Auth": "true",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: text,
            },
          ],
          stream: false,
        }),
      });

      const data = await response.json().catch(() => undefined as any);

      if (!response.ok || !data) {
        const errorText =
          (data && (data.error?.message || data.error?.code)) ||
          `Error ${response.status}`;

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "assistant",
            content: `Server error: ${errorText}`,
          },
        ]);
        return;
      }

      const assistantContent: string =
        typeof data.message === "string"
          ? data.message
          : typeof data.content === "string"
            ? data.content
            : JSON.stringify(data);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: assistantContent,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "Network error while calling /api/chat",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (
    event,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      <main className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold mb-4">Micro Chief of Staff</h1>
        <div className="flex-1 min-h-0 border border-slate-800 rounded-xl bg-slate-900/70 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 whitespace-pre-wrap break-words ${
                  message.role === "user"
                    ? "ml-auto bg-cyan-600 text-white"
                    : "mr-auto bg-slate-800 text-slate-100"
                }`}
              >
                {message.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-800 p-3 flex gap-2 items-end bg-slate-900">
            <textarea
              className="flex-1 resize-none rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/70 text-slate-50"
              rows={2}
              placeholder="Write a message..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isSending || !input.trim()}
              className="inline-flex items-center justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyan-500 transition-colors"
            >
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
