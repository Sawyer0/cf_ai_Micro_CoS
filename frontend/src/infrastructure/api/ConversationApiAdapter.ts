import type { IConversationRepository } from "@/domain/ports/IConversationRepository";
import {
  ConversationEntity,
  type Conversation,
} from "@/domain/entities/Conversation";

/**
 * Fetches conversations from the backend API instead of localStorage
 */
export class ConversationApiAdapter implements IConversationRepository {
  constructor(private readonly baseUrl: string) {}

  async findAll(): Promise<ConversationEntity[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations`, {
      headers: {
        "X-Test-Bypass-Auth": "true", // TODO: Replace with real auth
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch conversations: ${response.statusText}`);
    }

    const data = (await response.json()) as { conversations: Conversation[] };
    return (data.conversations || []).map((c) =>
      ConversationEntity.reconstitute(c),
    );
  }

  async findById(id: string): Promise<ConversationEntity | null> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${id}`, {
      headers: {
        "X-Test-Bypass-Auth": "true",
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch conversation: ${response.statusText}`);
    }

    const data = (await response.json()) as Conversation;
    return ConversationEntity.reconstitute(data);
  }

  async save(conversation: ConversationEntity): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Bypass-Auth": "true",
      },
      body: JSON.stringify(conversation.toJSON()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to save conversation: ${response.statusText} - ${errorText}`,
      );
    }
  }

  async delete(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${id}`, {
      method: "DELETE",
      headers: {
        "X-Test-Bypass-Auth": "true",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete conversation: ${response.statusText}`);
    }
  }
}
