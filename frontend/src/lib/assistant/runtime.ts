"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";

let currentConversationId: string | null = null;

const CURRENT_CONVERSATION_KEY = "micro-cos-conversation-id";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getOrCreateConversationId(): string {
  if (currentConversationId) return currentConversationId;

  const storage = getStorage();
  const stored = storage?.getItem(CURRENT_CONVERSATION_KEY) ?? null;
  if (stored) {
    currentConversationId = stored;
    return stored;
  }

  const id = self.crypto.randomUUID();
  currentConversationId = id;
  storage?.setItem(CURRENT_CONVERSATION_KEY, id);
  return id;
}

export function startNewConversation(): string {
  const storage = getStorage();
  const id = self.crypto.randomUUID();
  currentConversationId = id;
  storage?.setItem(CURRENT_CONVERSATION_KEY, id);
  return id;
}

export function setConversationId(id: string): void {
  const storage = getStorage();
  currentConversationId = id;
  storage?.setItem(CURRENT_CONVERSATION_KEY, id);
}

type TextPart = { type: "text"; text: string };

async function streamAssistantResponse(
  userText: string,
  conversationId: string,
  appendAssistantChunk: (chunk: string) => void,
): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
  const url = `${baseUrl}/api/chat`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Bypass-Auth": "true",
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: userText,
        },
      ],
      stream: true,
      conversation_id: conversationId,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);

      const lines = rawEvent.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const json = trimmed.slice("data:".length).trim();
        if (!json) continue;
        if (json === "[DONE]") {
          return;
        }

        let event: { type: string; token?: string; error?: string };
        try {
          event = JSON.parse(json) as { type: string; token?: string; error?: string };
        } catch {
          continue;
        }

        if (event.type === "token" && typeof event.token === "string") {
          appendAssistantChunk(event.token);
        } else if (event.type === "error" && typeof event.error === "string") {
          appendAssistantChunk(`\n[error] ${event.error}`);
        }
      }
    }
  }
}

export function useCloudflareRuntime() {
  const [messages, setMessages] = React.useState<readonly ThreadMessageLike[]>([]);

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    setMessages,
    convertMessage: (message) => message,
    async onNew(append: AppendMessage) {
      if (
        append.content.length !== 1 ||
        append.content[0]?.type !== "text" ||
        !append.content[0]?.text
      ) {
        throw new Error("Only simple text messages are supported.");
      }

      const conversationId = getOrCreateConversationId();
      const userText = append.content[0].text;

      const userMessage: ThreadMessageLike = {
        role: "user",
        content: [{ type: "text", text: userText } as TextPart],
      };

      const assistantId = self.crypto.randomUUID();
      const assistantMessage: ThreadMessageLike = {
        id: assistantId,
        role: "assistant",
        content: [{ type: "text", text: "" } as TextPart],
      };

      setMessages((current) => [...current, userMessage, assistantMessage]);

      const appendAssistantChunk = (chunk: string) => {
        // Use flushSync to force immediate rendering of each token
        // This prevents React from batching updates and dumping all tokens at once
        flushSync(() => {
          setMessages((current) =>
            current.map((message) => {
              if (message.id !== assistantId) return message;
              const parts = (message.content ?? []) as TextPart[];
              if (parts.length === 0) {
                return {
                  ...message,
                  content: [{ type: "text", text: chunk } as TextPart],
                };
              }
              const last = parts[parts.length - 1];
              if (last.type === "text") {
                const updatedLast: TextPart = {
                  ...last,
                  text: last.text + chunk,
                };
                return {
                  ...message,
                  content: [...parts.slice(0, -1), updatedLast],
                };
              }
              return {
                ...message,
                content: [...parts, { type: "text", text: chunk } as TextPart],
              };
            }),
          );
        });
      };

      try {
        await streamAssistantResponse(userText, conversationId, appendAssistantChunk);
      } catch (error) {
        appendAssistantChunk(
          `\n[error] Chat request failed: ${error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  });

  return { runtime };
}
