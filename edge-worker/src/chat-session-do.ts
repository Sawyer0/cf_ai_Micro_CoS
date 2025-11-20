import { DurableObject } from 'cloudflare:workers';
import { Env, D1Database, SYSTEM_PROMPT, SseEvent, encodeSseEvent, getModelId } from './env';
import { createErrorResponse, createJsonResponse, createSseFromTranscript, getPrincipalIdFromRequest } from './http';
import { ToolRegistry, ToolExecutor } from './tools';
import { ToolCallParser } from './tool-parser';

async function handleIdempotentRequest(
	env: Env,
	scope: string,
	idempotencyKey: string,
	correlationId: string,
	handler: () => Promise<Response>
): Promise<Response> {
	const storeKey = `${scope}:${idempotencyKey}`;

	try {
		const cached = await env.IDEMPOTENCY_KV.get(storeKey);
		if (cached) {
			const parsed = JSON.parse(cached) as {
				status: number;
				body: unknown;
			};
			return createJsonResponse(parsed.body, parsed.status, correlationId);
		}
	} catch {}

	const response = await handler();

	try {
		const rawBody = await response.clone().text();
		let parsedBody: unknown = rawBody;
		try {
			parsedBody = JSON.parse(rawBody);
		} catch {}

		await env.IDEMPOTENCY_KV.put(storeKey, JSON.stringify({ status: response.status, body: parsedBody }), { expirationTtl: 60 * 60 * 24 });
	} catch {}

	return response;
}

export class ChatSessionDO extends DurableObject<Env> {
	private toolRegistry: ToolRegistry;

	constructor(state: any, env: Env) {
		super(state, env);
		this.toolRegistry = new ToolRegistry();
	}

	/**
	 * Map tool name from LLM output to tool ID for registry lookup
	 * Examples:
	 *   search_flights -> flights-mcp::search-flights
	 *   list_events -> google-calendar-mcp::list-events
	 */
	private mapToolNameToId(toolName: string): string | undefined {
		const mappings: Record<string, string> = {
			search_flights: 'flights-mcp::search-flights',
			list_events: 'google-calendar-mcp::list-events',
		};
		return mappings[toolName];
	}

	private async ensureSchema(db: D1Database): Promise<void> {
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

	private async logTurn(
		db: D1Database,
		args: {
			principalId: string;
			conversationId: string;
			correlationId: string;
			userMessage: string;
			assistantMessage: string;
		}
	): Promise<void> {
		await this.ensureSchema(db);

		const sessionId = args.conversationId;
		const now = new Date().toISOString();

		await db
			.prepare(
				'INSERT INTO chat_sessions (id, principal_id, conversation_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT(id) DO UPDATE SET principal_id = excluded.principal_id, conversation_id = excluded.conversation_id, updated_at = excluded.updated_at'
			)
			.bind(sessionId, args.principalId, args.conversationId, now)
			.run();

		await db
			.prepare(
				'INSERT INTO chat_events (id, session_id, conversation_id, role, content, correlation_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
			)
			.bind(crypto.randomUUID(), sessionId, args.conversationId, 'user', args.userMessage, args.correlationId, now)
			.run();

		await db
			.prepare(
				'INSERT INTO chat_events (id, session_id, conversation_id, role, content, correlation_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
			)
			.bind(crypto.randomUUID(), sessionId, args.conversationId, 'assistant', args.assistantMessage, args.correlationId, now)
			.run();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/chat') {
			const correlationId = request.headers.get('X-Correlation-ID') ?? crypto.randomUUID();

			const body = (await request.json().catch(() => null)) as {
				messages?: unknown;
				stream?: unknown;
				tool_choice?: unknown;
				conversation_id?: unknown;
			} | null;

			if (!body || !Array.isArray((body as { messages?: unknown }).messages)) {
				return createErrorResponse('VALIDATION_ERROR', 'Request body must include a messages array.', 400, correlationId);
			}

			const messages = (body as { messages: Array<{ role?: unknown; content?: unknown }> }).messages;
			const lastUserMessage = [...messages].reverse().find((m) => m && m.role === 'user' && typeof m.content === 'string');

			const userContent = lastUserMessage && typeof lastUserMessage.content === 'string' ? lastUserMessage.content : undefined;

			if (!userContent) {
				return createErrorResponse('VALIDATION_ERROR', 'At least one user message with string content is required.', 400, correlationId);
			}

			const conversationId =
				typeof (body as { conversation_id?: unknown }).conversation_id === 'string' &&
				(body as { conversation_id?: unknown }).conversation_id !== ''
					? ((body as { conversation_id?: string }).conversation_id as string)
					: crypto.randomUUID();

			const llamaMessages = [
				{ role: 'system', content: SYSTEM_PROMPT },
				...messages.map((m) => ({
					role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
					content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
				})),
			];

			const principalId = getPrincipalIdFromRequest(request);
			const shouldStream = body.stream !== false;
			const idempotencyKey = request.headers.get('Idempotency-Key') ?? undefined;

			if (shouldStream) {
				const storeKey = idempotencyKey ? `chat:POST:${idempotencyKey}` : undefined;

				if (storeKey) {
					try {
						const cached = await this.env.IDEMPOTENCY_KV.get(storeKey);
						if (cached) {
							const parsed = JSON.parse(cached) as { message: string };
							return createSseFromTranscript(parsed.message, correlationId);
						}
					} catch {}
				}

				try {
					const aiStream = (await this.env.AI.run(getModelId(this.env), {
						messages: llamaMessages,
						max_tokens: 512,
						temperature: 0.4,
						stream: true,
					} as Record<string, unknown>)) as ReadableStream<Uint8Array>;

					const encoder = new TextEncoder();
					const decoder = new TextDecoder();
					let transcript = '';
					const messageId = crypto.randomUUID();
					const db = this.env.DB;
					const self = this;

					const toolExecutor = new ToolExecutor(this.toolRegistry, this.env, correlationId);
					const toolParser = new ToolCallParser();

					const sseStream = new ReadableStream<Uint8Array>({
						async start(controller) {
							const send = (event: SseEvent) => {
								controller.enqueue(encodeSseEvent(encoder, event));
							};

							const reader = aiStream.getReader();
							try {
								while (true) {
									const { value, done } = await reader.read();
									if (done) break;
									if (!value) continue;
									const chunk = decoder.decode(value, { stream: true });
									if (!chunk) continue;

									// Parse chunk for tool_call markers
									const { text, tools } = toolParser.processChunk(chunk);

									// Emit visible text tokens
									if (text) {
										transcript += text;
										send({ type: 'token', token: text });
									}

									// Execute any complete tool calls found in this chunk
									for (const toolCall of tools) {
										try {
											// Map tool name to tool ID for registry lookup
											// Tool names follow pattern: search_flights -> flights-mcp::search-flights
											const toolId = self.mapToolNameToId(toolCall.name);
											if (!toolId) {
												console.warn(`Unknown tool: ${toolCall.name}`);
												send({
													type: 'error',
													error: `Unknown tool: ${toolCall.name}`,
												});
												continue;
											}

											// Execute tool and emit tool_call/tool_result events
											await toolExecutor.execute(toolId, toolCall.args, send);
										} catch (toolError) {
											const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
											console.error(`Tool execution error: ${errorMsg}`, toolError);
											send({
												type: 'error',
												error: `Tool error: ${errorMsg}`,
											});
										}
									}
								}

								// Flush remaining buffered tool calls at end of stream
								const { text: finalText, tools: finalTools } = toolParser.flush();
								if (finalText) {
									transcript += finalText;
									send({ type: 'token', token: finalText });
								}
								for (const toolCall of finalTools) {
									try {
										const toolId = self.mapToolNameToId(toolCall.name);
										if (!toolId) {
											console.warn(`Unknown tool: ${toolCall.name}`);
											send({
												type: 'error',
												error: `Unknown tool: ${toolCall.name}`,
											});
											continue;
										}
										await toolExecutor.execute(toolId, toolCall.args, send);
									} catch (toolError) {
										const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
										console.error(`Tool execution error: ${errorMsg}`, toolError);
										send({
											type: 'error',
											error: `Tool error: ${errorMsg}`,
										});
									}
								}
							} finally {
								send({ type: 'done', message_id: messageId });
								controller.close();
								if (storeKey) {
									try {
										await self.env.IDEMPOTENCY_KV.put(storeKey, JSON.stringify({ message: transcript }), { expirationTtl: 60 * 60 * 24 });
									} catch {}
								}
								try {
									await self.logTurn(db, {
										principalId,
										conversationId,
										correlationId,
										userMessage: userContent,
										assistantMessage: transcript,
									});
								} catch {}
							}
						},
					});

					return new Response(sseStream, {
						status: 200,
						headers: {
							'content-type': 'text/event-stream',
							'cache-control': 'no-cache',
							connection: 'keep-alive',
							'X-Correlation-ID': correlationId,
						},
					});
				} catch (error) {
					const message = 'Chat request failed (streaming): ' + (error instanceof Error ? error.message : String(error));
					return createErrorResponse('LLM_ERROR', message, 500, correlationId);
				}
			}

			if (!idempotencyKey) {
				try {
					const aiResult = await this.env.AI.run(getModelId(this.env), {
						messages: llamaMessages,
						max_tokens: 512,
						temperature: 0.4,
					} as Record<string, unknown>);

					const responseText = (aiResult as { response?: string } | undefined)?.response ?? String(aiResult);
					try {
						await this.logTurn(this.env.DB, {
							principalId,
							conversationId,
							correlationId,
							userMessage: userContent,
							assistantMessage: responseText,
						});
					} catch {}

					return createJsonResponse({ message: responseText }, 200, correlationId);
				} catch (error) {
					const message = 'Chat request failed: ' + (error instanceof Error ? error.message : String(error));
					return createErrorResponse('LLM_ERROR', message, 500, correlationId);
				}
			}

			return handleIdempotentRequest(this.env, 'chat:POST', idempotencyKey, correlationId, async () => {
				try {
					const aiResult = await this.env.AI.run(getModelId(this.env), {
						messages: llamaMessages,
						max_tokens: 512,
						temperature: 0.4,
					} as Record<string, unknown>);

					const responseText = (aiResult as { response?: string } | undefined)?.response ?? String(aiResult);
					try {
						await this.logTurn(this.env.DB, {
							principalId,
							conversationId,
							correlationId,
							userMessage: userContent,
							assistantMessage: responseText,
						});
					} catch {}

					return createJsonResponse({ message: responseText }, 200, correlationId);
				} catch (error) {
					const message = 'Chat request failed: ' + (error instanceof Error ? error.message : String(error));
					return createErrorResponse('LLM_ERROR', message, 500, correlationId);
				}
			});
		}

		if (request.method === 'POST' && url.pathname === '/log') {
			const body = (await request.json()) as {
				principal_id: string;
				conversation_id: string;
				correlation_id: string;
				user_message: string;
				assistant_message: string;
			};

			const db = this.env.DB;
			await this.logTurn(db, {
				principalId: body.principal_id,
				conversationId: body.conversation_id,
				correlationId: body.correlation_id,
				userMessage: body.user_message,
				assistantMessage: body.assistant_message,
			});

			return new Response(null, { status: 204 });
		}

		return new Response('Not found', { status: 404 });
	}
}
