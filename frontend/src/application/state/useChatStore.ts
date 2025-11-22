import { create } from "zustand";
import type { ConversationEntity } from "@/domain/entities/Conversation";
import type { MessageEntity } from "@/domain/entities/Message";
import { ThreadStateEntity } from "@/domain/entities/ThreadState";

interface ChatStore {
  // State
  conversations: ConversationEntity[];
  currentConversationId: string | null;
  messages: Record<string, MessageEntity[]>;
  threadStates: Record<string, ThreadStateEntity>;

  // Actions
  setConversations: (conversations: ConversationEntity[]) => void;
  setCurrentConversation: (id: string | null) => void;
  setMessages: (conversationId: string, messages: MessageEntity[]) => void;
  addMessage: (message: MessageEntity) => void;
  setThreadState: (conversationId: string, state: ThreadStateEntity) => void;
  clearMessages: (conversationId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  // Initial state
  conversations: [],
  currentConversationId: null,
  messages: {},
  threadStates: {},

  // Actions
  setConversations: (conversations) => set({ conversations }),

  setCurrentConversation: (id) => set({ currentConversationId: id }),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: messages,
      },
    })),

  addMessage: (message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [message.conversationId]: [
          ...(state.messages[message.conversationId] || []),
          message,
        ],
      },
    })),

  setThreadState: (conversationId, threadState) =>
    set((state) => ({
      threadStates: {
        ...state.threadStates,
        [conversationId]: threadState,
      },
    })),

  clearMessages: (conversationId) =>
    set((state) => {
      const newMessages = { ...state.messages };
      delete newMessages[conversationId];
      return { messages: newMessages };
    }),
}));
