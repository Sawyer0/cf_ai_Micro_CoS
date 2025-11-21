"use client";

import { useLocalRuntime } from "@assistant-ui/react";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatApiResponse {
  conversationId: string;
  messageId: string;
  content: string;
  role: "assistant";
  timestamp: string;
}

export function useCloudflareRuntime() {
  const runtime = useLocalRuntime({
    async onNew(messages: ChatMessage[]) {
      const lastUserMessage = [...messages]
        .reverse()
        .find((m) => m.role === "user");

      const text = lastUserMessage?.content ?? "";

      const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
      const url = `${baseUrl}/api/chat`;

      console.log("useCloudflareRuntime.onNew called", { url, text });

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Test-Bypass-Auth": "true",
          },
          body: JSON.stringify({
            message: text,
            stream: false,
          }),
        });

        console.log("/api/chat response status", response.status);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as ChatApiResponse;
        const fullText = data.content ?? "";

        return {
          async *stream() {
            const chunkSize = 64;
            for (let i = 0; i < fullText.length; i += chunkSize) {
              const token = fullText.slice(i, i + chunkSize);
              if (!token) continue;
              yield { type: "text-delta" as const, textDelta: token };
            }
          },
        };
      } catch (error) {
        console.error("Error in useCloudflareRuntime.onNew", error);
        throw error;
      }
    },
  });

  return { runtime };
}
