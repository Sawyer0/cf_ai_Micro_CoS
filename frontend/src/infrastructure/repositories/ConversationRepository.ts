import type { IConversationRepository } from "@/domain/ports/IConversationRepository";
import type { IStorageAdapter } from "@/domain/ports/IStorageAdapter";
import {
  ConversationEntity,
  type Conversation,
} from "@/domain/entities/Conversation";

const STORAGE_KEY = "conversations";

export class ConversationRepository implements IConversationRepository {
  constructor(private readonly storage: IStorageAdapter) {}

  async findAll(): Promise<ConversationEntity[]> {
    const json = this.storage.getItem(STORAGE_KEY);
    if (!json) return [];

    try {
      const data = JSON.parse(json) as Conversation[];
      return data.map((c) => ConversationEntity.reconstitute(c));
    } catch {
      return [];
    }
  }

  async findById(id: string): Promise<ConversationEntity | null> {
    const all = await this.findAll();
    return all.find((c) => c.id === id) ?? null;
  }

  async save(conversation: ConversationEntity): Promise<void> {
    const all = await this.findAll();
    const index = all.findIndex((c) => c.id === conversation.id);

    if (index >= 0) {
      all[index] = conversation;
    } else {
      all.push(conversation);
    }

    this.storage.setItem(
      STORAGE_KEY,
      JSON.stringify(all.map((c) => c.toJSON())),
    );
  }

  async delete(id: string): Promise<void> {
    const all = await this.findAll();
    const filtered = all.filter((c) => c.id !== id);
    this.storage.setItem(
      STORAGE_KEY,
      JSON.stringify(filtered.map((c) => c.toJSON())),
    );
  }
}
