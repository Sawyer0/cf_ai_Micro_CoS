import { D1Database, WorkerEnv } from '../../env';
import { LogTurnArgs } from './types';
import { WebSocketManager } from './websocket.manager';
import { Logger } from '../../observability/logger';

export class StorageManager {
	constructor(private readonly db: D1Database, private readonly wsManager: WebSocketManager) {}

	private async ensureSchema(): Promise<void> {
		await this.db
			.prepare(
				'CREATE TABLE IF NOT EXISTS chat_sessions (id TEXT PRIMARY KEY, principal_id TEXT, conversation_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'
			)
			.run();
		await this.db
			.prepare(
				'CREATE TABLE IF NOT EXISTS chat_events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, conversation_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL, correlation_id TEXT, created_at TEXT NOT NULL)'
			)
			.run();
	}

	async logTurn(args: LogTurnArgs): Promise<void> {
		await this.ensureSchema();

		const sessionId = args.conversationId;
		const now = new Date().toISOString();

		// Update Session
		// Update Session
		// CRITICAL: Do NOT update principal_id on conflict. Ownership is immutable.
		await this.db
			.prepare(
				'INSERT INTO chat_sessions (id, principal_id, conversation_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at'
			)
			.bind(sessionId, args.principalId, args.conversationId, now)
			.run();

		// Log User Message
		if (args.userMessage) {
			await this.db
				.prepare(
					'INSERT INTO chat_events (id, session_id, conversation_id, role, content, correlation_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
				)
				.bind(crypto.randomUUID(), sessionId, args.conversationId, 'user', args.userMessage, args.correlationId, now)
				.run();
		}

		// Log Assistant Message
		await this.db
			.prepare(
				'INSERT INTO chat_events (id, session_id, conversation_id, role, content, correlation_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
			)
			.bind(crypto.randomUUID(), sessionId, args.conversationId, 'assistant', args.assistantMessage, args.correlationId, now)
			.run();

		// Broadcast
		this.wsManager.broadcast({
			type: 'message',
			role: 'assistant',
			content: args.assistantMessage,
			conversationId: args.conversationId,
			timestamp: now,
		});
	}

	/**
	 * Ensure session exists in database before processing messages
	 * This prevents 404 errors when frontend tries to load messages
	 */
	async ensureSession(conversationId: string, principalId: string): Promise<void> {
		await this.ensureSchema();
		const now = new Date().toISOString();

		await this.db
			.prepare(
				'INSERT INTO chat_sessions (id, principal_id, conversation_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT(id) DO NOTHING'
			)
			.bind(conversationId, principalId, conversationId, now)
			.run();
	}

	async cleanup(retentionDays: number = 7): Promise<void> {
		const logger = new Logger('storage-manager');
		// Placeholder for cleanup logic
		logger.info('Running storage cleanup', {
			metadata: { retentionDays },
		});
	}
}
