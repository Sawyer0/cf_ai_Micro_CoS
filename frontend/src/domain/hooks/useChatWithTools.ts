import { useState, useCallback, useRef } from "react";
import type { MessageEntity } from "../entities/Message";

interface ToolState {
  type: "thinking" | "tool_start" | "tool_result" | "tool_error";
  toolName?: string;
  message?: string;
  error?: string;
  data?: unknown;
}

export function useChatWithTools(conversationId: string, apiBase: string = "/api") {
  const [messages, setMessages] = useState<MessageEntity[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [toolStates, setToolStates] = useState<ToolState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastConversationIdRef = useRef<string>("");
  const conversationCacheRef = useRef<Map<string, MessageEntity[]>>(new Map());

  // Check if we need to load a different conversation
  if (lastConversationIdRef.current !== conversationId) {
    lastConversationIdRef.current = conversationId;

    // Reset streaming state when switching conversations
    setIsStreaming(false);
    setStreamingContent("");
    setToolStates([]);
    setError(null);

    // Check cache first
    const cached = conversationCacheRef.current.get(conversationId);
    if (cached) {
      setMessages(cached);
    } else {
      // Load from backend
      setIsLoading(true);
      fetch(`${apiBase}/conversations/${conversationId}/messages`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(import.meta.env.DEV && { "X-Test-Bypass-Auth": "true" }),
        },
      })
        .then((res) => {
          if (!res.ok && res.status !== 404) throw new Error(`Failed to load: ${res.statusText}`);
          return res.ok ? res.json() : { conversationId, messages: [] };
        })
        .then((data) => {
          const msgs = data.messages || [];
          conversationCacheRef.current.set(conversationId, msgs);
          setMessages(msgs);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error("Failed to load conversation:", err);
          setMessages([]);
          setIsLoading(false);
        });
    }
  }

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      setError(null);
      setStreamingContent("");
      setToolStates([]);

      // Add user message
      const userMessage: MessageEntity = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => {
        const updated = [...prev, userMessage];
        conversationCacheRef.current.set(conversationId, updated);
        return updated;
      });
      setIsStreaming(true);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        // Add bypass auth header in development mode
        if (import.meta.env.DEV) {
          headers["X-Test-Bypass-Auth"] = "true";
        }

        const response = await fetch(`${apiBase}/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            conversation_id: conversationId,
            messages: [
              ...messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              { role: "user", content: content.trim() },
            ],
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Handle Server-Sent Events
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Response body is not readable");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let assistantContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events (format: "data: {...}\n\n")
          const events = buffer.split("\n\n");
          buffer = events.pop() || ""; // Keep incomplete event in buffer

          for (const eventStr of events) {
            if (!eventStr.trim() || !eventStr.startsWith("data: ")) continue;

            try {
              const event = JSON.parse(eventStr.slice(6));

              if (event.type === "token") {
                // Streaming text token
                assistantContent += event.token;
                setStreamingContent((prev) => prev + event.token);
              } else if (event.type === "thinking") {
                // LLM is thinking
                setToolStates((prev) => [
                  ...prev,
                  { type: "thinking", message: event.message },
                ]);
              } else if (event.type === "tool_call") {
                // Tool call initiated
                setToolStates((prev) => [
                  ...prev,
                  { type: "tool_call", toolName: event.name },
                ]);
              } else if (event.type === "tool_start") {
                // Tool execution started
                setToolStates((prev) => [
                  ...prev,
                  { type: "tool_start", toolName: event.toolName },
                ]);
              } else if (event.type === "tool_result") {
                // Tool execution successful
                setToolStates((prev) => [
                  ...prev,
                  {
                    type: "tool_result",
                    toolName: event.result?.toolName,
                    data: event.result?.data,
                  },
                ]);
              } else if (event.type === "tool_error") {
                // Tool execution failed
                setToolStates((prev) => [
                  ...prev,
                  {
                    type: "tool_error",
                    toolName: event.toolName,
                    error: event.error,
                  },
                ]);
              } else if (event.type === "done") {
                // Stream complete - clear tool states and streaming indicator
                setIsStreaming(false);
                setToolStates([]);
              } else if (event.type === "error") {
                throw new Error(event.error || "Unknown error");
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }

        // Add assistant message
        if (assistantContent) {
          const assistantMessage: MessageEntity = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: assistantContent,
            timestamp: new Date(),
          };

          setMessages((prev) => {
            const updated = [...prev, assistantMessage];
            conversationCacheRef.current.set(conversationId, updated);
            return updated;
          });
        }

        setStreamingContent("");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Chat error:", err);
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, isStreaming, conversationId, apiBase]
  );

  return {
    messages,
    isStreaming,
    isLoading,
    streamingContent,
    toolStates,
    error,
    sendMessage,
  };
}
