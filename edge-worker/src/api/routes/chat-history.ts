import { D1Database } from '../../env';
import { ChatConversationsResponse, ChatHistoryResponse } from '../dto/chat.dto';
import { Principal, CorrelationId } from '../../domain/shared';
import { Logger } from '../../observability/logger';

async function ensureChatSchema(db: D1Database): Promise<void> {
	await db
		.prepare(
			'CREATE TABLE IF NOT EXISTS chat_sessions (id TEXT PRIMARY KEY, principal_id TEXT, conversation_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'
		)
		.run();
	await db
		.prepare(
			'CREATE TABLE IF NOT EXISTS chat_events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, conversation_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL, correlation_id TEXT, created_at TEXT NOT NULL)'
		)
		.run();
}

export async function handleChatConversationsRequest(
	request: Request,
	principal: Principal,
	correlationId: CorrelationId,
	db: D1Database
): Promise<Response> {
	if (request.method !== 'GET') {
		return new Response('Method Not Allowed', { status: 405 });
	}

	await ensureChatSchema(db);

	const url = new URL(request.url);
	const limitParam = url.searchParams.get('limit');
	const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 100);

	const results = await db
		.prepare(
			'SELECT id, conversation_id, created_at, updated_at FROM chat_sessions WHERE principal_id = ?1 ORDER BY updated_at DESC LIMIT ?2'
		)
		.bind(principal.id, limit)
		.all();

	const conversations = (results.results || []).map((row: any) => ({
		id: (row.conversation_id as string) || (row.id as string),
		// Note: Conversation title generation via LLM is scheduled for a future update.
		// Currently defaulting to a truncated ID for display purposes.
		title: `Conversation ${((row.conversation_id as string) || (row.id as string)).slice(0, 8)}`,
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string,
	}));

	const body: ChatConversationsResponse = { conversations };

	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'X-Correlation-ID': correlationId.toString(),
		},
	});
}

export async function handleSaveConversationRequest(
	request: Request,
	principal: Principal,
	correlationId: CorrelationId,
	db: D1Database
): Promise<Response> {
	const logger = new Logger('chat-history');
	if (request.method !== 'POST') {
		return new Response('Method Not Allowed', { status: 405 });
	}

	await ensureChatSchema(db);

	const body = (await request.json().catch(() => null)) as any;
	logger.debug('Received save conversation request', {
		metadata: {
			hasId: !!body?.id,
			hasTitle: !!body?.title,
			correlationId: correlationId.toString(),
		},
	});

	if (!body || !body.id || !body.title) {
		logger.warn('Invalid save conversation request', {
			metadata: {
				hasId: !!body?.id,
				hasTitle: !!body?.title,
				correlationId: correlationId.toString(),
			},
		});
		return new Response('Invalid request: id and title required', { status: 400 });
	}

	const { id, title, createdAt, updatedAt } = body as {
		id: string;
		title: string;
		createdAt?: string;
		updatedAt?: string;
	};

	// Upsert conversation
	await db
		.prepare(
			`INSERT INTO chat_sessions (id, principal_id, conversation_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET updated_at = ?5`
		)
		.bind(id, principal.id, id, createdAt || new Date().toISOString(), updatedAt || new Date().toISOString())
		.run();

	return new Response(null, {
		status: 204,
		headers: {
			'X-Correlation-ID': correlationId.toString(),
		},
	});
}

export async function handleDeleteConversationRequest(
	request: Request,
	principal: Principal,
	correlationId: CorrelationId,
	db: D1Database,
	conversationId: string
): Promise<Response> {
	if (request.method !== 'DELETE') {
		return new Response('Method Not Allowed', { status: 405 });
	}

	await ensureChatSchema(db);

	// Delete conversation and all its messages
	await db.prepare('DELETE FROM chat_events WHERE session_id = ?1').bind(conversationId).run();

	await db.prepare('DELETE FROM chat_sessions WHERE id = ?1 AND principal_id = ?2').bind(conversationId, principal.id).run();

	return new Response(null, {
		status: 204,
		headers: {
			'X-Correlation-ID': correlationId.toString(),
		},
	});
}

export async function handleChatHistoryRequest(
	request: Request,
	principal: Principal,
	correlationId: CorrelationId,
	db: D1Database
): Promise<Response> {
	const logger = new Logger('chat-history');
	if (request.method !== 'GET') {
		return new Response('Method Not Allowed', { status: 405 });
	}

	await ensureChatSchema(db);

	const url = new URL(request.url);
	const conversationId = url.searchParams.get('conversationId');
	if (!conversationId) {
		return new Response('conversationId is required', { status: 400 });
	}

	const limitParam = url.searchParams.get('limit');
	const offsetParam = url.searchParams.get('offset');
	const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 200);
	const offset = Math.max(parseInt(offsetParam || '0', 10) || 0, 0);

	const session = await db
		.prepare('SELECT id FROM chat_sessions WHERE id = ?1 AND principal_id = ?2')
		.bind(conversationId, principal.id)
		.first();

	logger.debug('Fetching chat history session', {
		metadata: {
			conversationId,
			principalId: principal.id,
			sessionFound: !!session,
			correlationId: correlationId.toString(),
		},
	});

	if (!session) {
		logger.warn('Chat history session not found', {
			metadata: {
				conversationId,
				principalId: principal.id,
				correlationId: correlationId.toString(),
			},
		});
		return new Response('Conversation not found', { status: 404 });
	}

	const eventsResult = await db
		.prepare('SELECT id, role, content, created_at FROM chat_events WHERE session_id = ?1 ORDER BY created_at ASC LIMIT ?2 OFFSET ?3')
		.bind(conversationId, limit + 1, offset)
		.all();

	const rows = eventsResult.results || [];
	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;

	const messages = page.map((row: any) => ({
		id: row.id as string,
		role: (row.role as 'user' | 'assistant' | 'system') || 'assistant',
		content: row.content as string,
		timestamp: row.created_at as string,
	}));

	const body: ChatHistoryResponse = {
		conversationId,
		messages,
		hasMore,
	};

	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'X-Correlation-ID': correlationId.toString(),
		},
	});
}
