import { WorkerEnv, getModelId, SseEvent, encodeSseEvent, SYSTEM_PROMPT } from '../../env';
import { ToolRegistry, ToolExecutor } from '../../tools';
import { StorageManager } from './storage.manager';
import { createErrorResponse } from '../../http';
import { Logger } from '../../observability/logger';

export class LLMHandler {
	private toolRegistry: ToolRegistry;

	constructor(private readonly env: WorkerEnv, private readonly storage: StorageManager) {
		this.toolRegistry = new ToolRegistry();
	}

	private mapToolNameToId(toolName: string): string | undefined {
		const mappings: Record<string, string> = {
			search_flights: 'flights-mcp::search-flights',
			list_events: 'google-calendar-mcp::list-events',
		};
		return mappings[toolName];
	}

	async processChat(
		messages: any[],
		userContent: string | undefined,
		conversationId: string,
		principalId: string,
		correlationId: string,
		shouldStream: boolean
	): Promise<Response> {
		const logger = new Logger('llm-handler');
		const llamaMessages = [
			{ role: 'system', content: SYSTEM_PROMPT },
			...messages.map((m) => ({
				role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
				content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
			})),
		];

		// Debug: Log the last user message to verify context injection
		const lastUserMessage = [...llamaMessages].reverse().find((m) => m.role === 'user');
		if (lastUserMessage) {
			logger.debug('Last user message prepared', {
				metadata: {
					messageLength: lastUserMessage.content.length,
					messagePreview: lastUserMessage.content.substring(0, 300),
					principalId,
					conversationId,
				},
			});
		}

		if (shouldStream) {
			return this.streamResponse(llamaMessages, userContent, conversationId, principalId, correlationId);
		} else {
			return this.standardResponse(llamaMessages, userContent, conversationId, principalId, correlationId);
		}
	}

	private async standardResponse(
		messages: any[],
		userContent: string | undefined,
		conversationId: string,
		principalId: string,
		correlationId: string
	): Promise<Response> {
		try {
			const aiResult = await this.env.AI.run(getModelId(this.env), {
				messages,
				max_tokens: 512,
				temperature: 0.4,
			} as Record<string, unknown>);

			const responseText = (aiResult as { response?: string } | undefined)?.response ?? String(aiResult);

			await this.storage.logTurn({
				principalId,
				conversationId,
				correlationId,
				userMessage: userContent,
				assistantMessage: responseText,
			});

			return new Response(JSON.stringify({ message: responseText }), {
				status: 200,
				headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
			});
		} catch (error) {
			const message = 'Chat request failed: ' + (error instanceof Error ? error.message : String(error));
			return createErrorResponse('LLM_ERROR', message, 500, correlationId);
		}
	}

	private async streamResponse(
		messages: any[],
		userContent: string | undefined,
		conversationId: string,
		principalId: string,
		correlationId: string
	): Promise<Response> {
		try {
			const aiStream = (await this.env.AI.run(getModelId(this.env), {
				messages,
				max_tokens: 512,
				temperature: 0.4,
				stream: true,
			} as Record<string, unknown>)) as ReadableStream<Uint8Array>;

			const encoder = new TextEncoder();
			const decoder = new TextDecoder();
			let transcript = '';
			const messageId = crypto.randomUUID();
			const self = this;

			const sseStream = new ReadableStream<Uint8Array>({
				async start(controller) {
					const send = (event: SseEvent) => {
						controller.enqueue(encodeSseEvent(encoder, event));
					};

					const reader = aiStream.getReader();
					let buffer = '';
					let lastResponse = '';

					try {
						while (true) {
							const { value, done } = await reader.read();
							if (done) break;
							if (!value) continue;
							buffer += decoder.decode(value, { stream: true });

							// Workers AI streaming uses SSE: "data: { ... }\n\n"
							let separatorIndex: number;
							while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
								const rawEvent = buffer.slice(0, separatorIndex).trim();
								buffer = buffer.slice(separatorIndex + 2);

								if (rawEvent.startsWith('data: ')) {
									const json = rawEvent.slice(6);
									if (json === '[DONE]') continue;

									try {
										const obj = JSON.parse(json) as any;
										const full = typeof obj.response === 'string' ? obj.response : '';
										if (!full) continue;

										let delta = '';
										// Check if the response is accumulated (starts with previous response)
										// or if it's a new token delta (Llama 3.3 behavior on Workers AI)
										if (lastResponse && full.startsWith(lastResponse)) {
											delta = full.slice(lastResponse.length);
										} else {
											delta = full;
										}

										lastResponse = full;

										if (delta) {
											transcript += delta;
											send({ type: 'token', token: delta });
										}
									} catch (e) {
										// Ignore parse errors
									}
								}
							}
						}
					} catch (error) {
						const err = error instanceof Error ? error : new Error(String(error));
						logger.error('Stream reading error', err, {
							metadata: { principalId, conversationId, correlationId },
						});
						send({ type: 'error', error: 'Stream failed' });
					} finally {
						send({ type: 'done', message_id: messageId });
						controller.close();
						// Log the turn asynchronously
						self.storage
							.logTurn({
								principalId,
								conversationId,
								correlationId,
								userMessage: userContent,
								assistantMessage: transcript,
							})
							.catch((err) => {
								const error = err instanceof Error ? err : new Error(String(err));
								logger.error('Failed to log turn', error, {
									metadata: { principalId, conversationId, correlationId },
								});
							});
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

	private async executeTool(toolCall: any, executor: ToolExecutor, send: (event: SseEvent) => void) {
		try {
			const toolId = this.mapToolNameToId(toolCall.name);
			if (!toolId) {
				send({ type: 'error', error: `Unknown tool: ${toolCall.name}` });
				return;
			}
			await executor.execute(toolId, toolCall.args, send);
		} catch (toolError) {
			const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
			send({ type: 'error', error: `Tool error: ${errorMsg}` });
		}
	}
}
