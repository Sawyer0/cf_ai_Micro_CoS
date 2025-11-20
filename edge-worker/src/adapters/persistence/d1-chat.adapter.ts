/**
 * D1ChatAdapter - Chat persistence using Cloudflare D1
 * 
 * Implements IChatRepository
 */

import { IChatRepository } from '../../domain/chat/ports/chat-repository.port';
import { Conversation, ConversationStatus } from '../../domain/chat/aggregates/conversation.aggregate';
import { Message, MessageRole } from '../../domain/chat/entities/message.entity';
import { Logger } from '../../observability/logger';

export class D1ChatAdapter implements IChatRepository {
    constructor(
        private readonly db: D1Database,
        private readonly logger: Logger
    ) { }

    async saveConversation(conversation: Conversation): Promise<void> {
        try {
            await this.db.prepare(`
        INSERT INTO conversations (id, status, created_at, updated_at, principal_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          updated_at = excluded.updated_at
      `).bind(
                conversation.id.toString(),
                conversation.getStatus(),
                new Date().toISOString(),
                new Date().toISOString(),
                '' // TODO: Add principal tracking
            ).run();
        } catch (error) {
            this.logger.error('Failed to save conversation', error as Error);
            throw error;
        }
    }

    async getConversation(id: string, principalId: string): Promise<Conversation | null> {
        try {
            const row = await this.db.prepare(`
        SELECT * FROM conversations WHERE id = ? AND principal_id = ?
      `).bind(id, principalId).first();

            if (!row) return null;

            const messages = await this.getMessages(id, 100);

            return Conversation.reconstitute(
                row.id as string,
                row.status as ConversationStatus,
                messages,
                new Date(row.created_at as string),
                new Date(row.updated_at as string)
            );
        } catch (error) {
            this.logger.error('Failed to get conversation', error as Error);
            return null;
        }
    }

    async saveMessage(message: Message, conversationId: string): Promise<void> {
        try {
            await this.db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
                message.id.toString(),
                conversationId,
                message.role,
                message.content,
                message.timestamp.toISOString()
            ).run();
        } catch (error) {
            this.logger.error('Failed to save message', error as Error);
            throw error;
        }
    }

    async getMessages(conversationId: string, limit: number, offset?: number): Promise<Message[]> {
        try {
            const results = await this.db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
        LIMIT ? OFFSET ?
      `).bind(conversationId, limit, offset || 0).all();

            return results.results.map(row => Message.reconstitute(
                row.id as string,
                row.role as MessageRole,
                row.content as string,
                new Date(row.timestamp as string),
                {}
            ));
        } catch (error) {
            this.logger.error('Failed to get messages', error as Error);
            return [];
        }
    }
}
