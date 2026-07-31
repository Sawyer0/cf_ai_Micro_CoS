import { WorkerEnv, getModelId, SseEvent, encodeSseEvent, SYSTEM_PROMPT } from '../../env';
import { ToolRegistry, ToolExecutor } from '../../tools';
import { StorageManager } from './storage.manager';
import { createErrorResponse } from '../../http';
import { Logger } from '../../observability/logger';
import { buildChatSystemPrompt } from '../../prompts/chat-response.prompt';

interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

interface LLMToolCall {
	name: string;
	id: string;
	arguments: Record<string, unknown>;
}

export class LLMHandler {
	private toolRegistry: ToolRegistry;
	private logger: Logger = new Logger('llm-handler');

	// Tool definitions for the LLM
	private readonly AVAILABLE_TOOLS: ToolDefinition[] = [
		{
			name: 'search_flights',
			description: 'Search for flight options between two cities on a specific date',
			inputSchema: {
				type: 'object',
				properties: {
					origin: { type: 'string', description: 'IATA airport code or city name (e.g., PHL, LAX)' },
					destination: { type: 'string', description: 'IATA airport code or city name' },
					departureDate: { type: 'string', description: 'Date in YYYY-MM-DD format' },
					passengers: { type: 'number', description: 'Number of passengers', default: 1 },
				},
				required: ['origin', 'destination', 'departureDate'],
			},
		},
		{
			name: 'list_events',
			description: 'List calendar events for a date range to check availability and conflicts',
			inputSchema: {
				type: 'object',
				properties: {
					startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
					endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
				},
				required: ['startDate', 'endDate'],
			},
		},
	];

	constructor(
		private readonly env: WorkerEnv,
		private readonly storage: StorageManager,
	) {
		this.toolRegistry = new ToolRegistry();
	}

	private mapToolNameToId(toolName: string): string | undefined {
		const mappings: Record<string, string> = {
			search_flights: 'flights-mcp::search-flights',
			list_events: 'google-calendar-mcp::list-events',
		};
		return mappings[toolName];
	}

	/**
	 * Select tools based on keywords in user message
	 * Industry best practice: Selective tool exposure prevents spurious tool calls
	 * Only pass tools relevant to the user's query
	 */
	private selectToolsForMessage(userContent: string | undefined): any[] {
		if (!userContent) return [];

		const content = userContent.toLowerCase();
		const tools: any[] = [];

		// Check for flight-related keywords
		const flightKeywords = /\b(flights?|fly|flying|travel|trips?|airports?|airlines?|book|booking|departs?|arrives?|destinations?)\b/i;
		if (flightKeywords.test(content)) {
			tools.push(this.AVAILABLE_TOOLS[0]); // search_flights
		}

		// Check for calendar-related keywords
		const calendarKeywords = /\b(calendar|schedules?|meetings?|events?|appointments?|busy|free|availability|conflicts?)\b/i;
		if (calendarKeywords.test(content)) {
			tools.push(this.AVAILABLE_TOOLS[1]); // list_events
		}

		this.logger.info('Selected tools for message', {
			metadata: {
				contentPreview: content.substring(0, 50),
				flightMatch: flightKeywords.test(content),
				calendarMatch: calendarKeywords.test(content),
				selectedTools: tools.map(t => t.name),
			},
		});

		return tools;
	}

	async processChat(
		messages: any[],
		userContent: string | undefined,
		conversationId: string,
		principalId: string,
		correlationId: string,
		structuredContext: any | null,
		shouldStream: boolean,
	): Promise<Response> {
		this.logger.info('Processing chat request', {
			metadata: {
				conversationId,
				hasUserContent: !!userContent,
				contentPreview: userContent ? userContent.substring(0, 50) : 'empty',
			},
		});

		// Detect if flight data is in the message context
		const hasFlightData = messages.some(
			(m) => m.content && typeof m.content === 'string' && m.content.includes('[STRUCTURED FLIGHT DATA]'),
		);

		// Select tools based on user message keywords (industry best practice)
		const selectedTools = this.selectToolsForMessage(userContent);

		// Build dynamic system prompt based on context
		const systemPrompt = buildChatSystemPrompt({
			hasFlightData,
			toolsAvailable: selectedTools.length > 0
		});

		// Debug: log the system prompt to verify it includes today's date
		this.logger.debug('Built system prompt', {
			metadata: {
				promptLength: systemPrompt.length,
				promptPreview: systemPrompt.substring(0, 300),
				correlationId,
				toolsAvailable: selectedTools.length > 0,
			},
		});

		const llamaMessages = [
			{ role: 'system', content: systemPrompt },
			...messages.map((m) => ({
				role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
				content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
			})),
		];

		// Debug: Log the last user message to verify context injection
		const lastUserMessage = [...llamaMessages].reverse().find((m) => m.role === 'user');
		if (lastUserMessage) {
			this.logger.debug('Last user message prepared', {
				metadata: {
					messageLength: lastUserMessage.content.length,
					messagePreview: lastUserMessage.content.substring(0, 300),
					principalId,
					conversationId,
				},
			});
		}

		if (shouldStream) {
			return this.streamResponse(
				llamaMessages,
				userContent,
				conversationId,
				principalId,
				correlationId,
				structuredContext,
				selectedTools,
			);
		} else {
			return this.standardResponse(
				llamaMessages,
				userContent,
				conversationId,
				principalId,
				correlationId,
				structuredContext,
				selectedTools,
			);
		}
	}

	private async standardResponse(
		messages: any[],
		userContent: string | undefined,
		conversationId: string,
		principalId: string,
		correlationId: string,
		structuredContext: any | null,
		selectedTools: any[],
	): Promise<Response> {
		try {
			// First call: get response with tool definitions available
			const aiResult = await this.env.AI.run(getModelId(this.env), {
				messages,
				max_tokens: 512,
				temperature: 0.4,
				...(selectedTools.length > 0 ? { tools: selectedTools } : {}),
			} as Record<string, unknown>);

			let responseText = (aiResult as { response?: string } | undefined)?.response ?? String(aiResult);
			let conversationMessages = [...messages];

			// Check if the response contains tool calls
			let toolCalls = this.parseToolCalls(aiResult);

			// Fallback: if no structured tool calls but response looks like JSON tool call, parse it
			if (toolCalls.length === 0) {
				const textToolCall = this.tryParseToolCallFromText(responseText);
				if (textToolCall) {
					toolCalls = [textToolCall];
					responseText = ''; // Don't surface raw JSON to user
				}
			}

			if (toolCalls.length > 0) {
				// Add assistant response with tool calls
				conversationMessages.push({
					role: 'assistant',
					content: responseText,
					// Don't include tool_calls array - just use the text representation
				});

				// Execute each tool call and collect results
				const toolResults = [];
				for (const toolCall of toolCalls) {
					const result = await this.executeToolCall(toolCall, principalId, correlationId);
					toolResults.push({
						tool_call_id: toolCall.id,
						role: 'tool',
						content: JSON.stringify(result),
					});
				}

				// Add tool results to conversation
				conversationMessages = conversationMessages.concat(toolResults);

				// Second call: get final response based on tool results
				// Rebuild system prompt with fresh context (same today's date)
				const updatedSystemPrompt = buildChatSystemPrompt({ hasFlightData: true });
				const messagesForSecondCall = [
					{ role: 'system', content: updatedSystemPrompt },
					...conversationMessages.filter((m: any) => m.role !== 'system'),
				];

				const finalResult = await this.env.AI.run(getModelId(this.env), {
					messages: messagesForSecondCall,
					max_tokens: 512,
					temperature: 0.4,
				} as Record<string, unknown>);

				responseText = (finalResult as { response?: string } | undefined)?.response ?? String(finalResult);
			}

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
		correlationId: string,
		structuredContext: any | null,
		selectedTools: any[],
	): Promise<Response> {
		try {
			const encoder = new TextEncoder();
			const messageId = crypto.randomUUID();
			const self = this;

			const sseStream = new ReadableStream<Uint8Array>({
				async start(controller) {
					const send = (event: SseEvent) => {
						controller.enqueue(encodeSseEvent(encoder, event));
					};

					try {
						// Extract system prompt from messages for reuse in second call
						const systemPromptMsg = messages.find((m: any) => m.role === 'system');

						// Send thinking indicator immediately
						self.logger.debug('Sending thinking event');
						send({ type: 'thinking', message: 'Processing your request...' });

						// First request with selective tool availability
						self.logger.debug('Starting AI stream request', {
							metadata: {
								principalId,
								conversationId,
								correlationId,
								toolCount: selectedTools.length,
								tools: selectedTools.map(t => t.name),
							},
						});

						const aiResult = await self.env.AI.run(getModelId(self.env), {
							messages,
							max_tokens: 512,
							temperature: 0.4,
							...(selectedTools.length > 0 ? { tools: selectedTools } : {}), // Only pass tools if relevant
							stream: true,
						} as Record<string, unknown>);

						self.logger.debug('AI stream request returned', {
							metadata: { principalId, conversationId, correlationId, resultType: typeof aiResult },
						});

						const aiStream = aiResult as ReadableStream<Uint8Array>;
						const decoder = new TextDecoder();
						const reader = aiStream.getReader();
						let buffer = '';
						let transcript = '';
						let lastResponse = '';
						let toolCalls: LLMToolCall[] = [];

						// Token buffering to prevent raw JSON/Python output
						let tokenBuffer = '';
						const BUFFER_CHECK_LENGTH = 10; // Check for tool calls after this many chars

						self.logger.debug('Starting to read from AI stream');

						// Stream the response
						while (true) {
							const { value, done } = await reader.read();
							if (done) {
								self.logger.debug('AI stream reading complete');
								break;
							}
							if (!value) continue;
							self.logger.debug('Received chunk from AI stream', { metadata: { byteLength: value.byteLength } });
							buffer += decoder.decode(value, { stream: true });

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
										if (lastResponse && full.startsWith(lastResponse)) {
											delta = full.slice(lastResponse.length);
										} else {
											delta = full;
										}

										lastResponse = full;

										if (delta) {
											transcript += delta;
											tokenBuffer += delta;

											// Check for tool calls in the response
											if (obj.tool_calls) {
												toolCalls = obj.tool_calls;
												// Don't send buffered tokens if we detected a tool call
												tokenBuffer = '';
											} else {
												// If buffer is long enough and no tool call detected, check and send
												if (tokenBuffer.length >= BUFFER_CHECK_LENGTH) {
													const isLikelyToolCall = self.looksLikeToolCallStart(tokenBuffer);
													if (!isLikelyToolCall) {
														send({ type: 'token', token: tokenBuffer });
														tokenBuffer = '';
													}
												}
											}
										}
									} catch (e) {
										self.logger.debug('Error parsing AI stream event', {
											metadata: { principalId, conversationId, correlationId, error: String(e) },
										});
									}
								}
							}
						}

						// After stream completes, check for tool calls using both parsers
						if (toolCalls.length === 0) {
							// 1. Try Python-style first (Llama 3.3's natural format)
							let textToolCall = self.tryParsePythonToolCall(transcript);

							// 2. Fall back to JSON if Python parsing fails
							if (!textToolCall) {
								textToolCall = self.tryParseToolCallFromText(transcript);
							}

							if (textToolCall) {
								toolCalls = [textToolCall];
								transcript = ''; // Don't surface raw code/JSON to user
								tokenBuffer = ''; // Clear buffer
							} else {
								// Not a tool call, send any remaining buffered content
								if (tokenBuffer) {
									send({ type: 'token', token: tokenBuffer });
									tokenBuffer = '';
								}
							}
						}

						// Handle tool calls if present
						if (toolCalls.length > 0) {
							send({ type: 'thinking', message: 'Executing tools to gather real-time data...' });

							// Build conversation with tool results
							let conversationMessages = [...messages];
							conversationMessages.push({
								role: 'assistant',
								content: transcript,
								// Don't include tool_calls array - just use the text representation
								// Workers AI will understand the context from the tool results we add below
							});

							// Execute tools and collect results
							const toolResults = [];
							for (const toolCall of toolCalls) {
								send({ type: 'tool_start', toolName: toolCall.name });
								const result = await self.executeToolCall(toolCall, principalId, correlationId);

								if ((result as Record<string, unknown>).error) {
									send({
										type: 'tool_error',
										toolName: toolCall.name,
										error: (result as Record<string, unknown>).error as string,
									});
								} else {
									send({
										type: 'tool_result',
										result: { toolName: toolCall.name, status: 'success', data: result },
									});
								}

								toolResults.push({
									tool_call_id: toolCall.id,
									role: 'tool',
									content: JSON.stringify(result),
								});
							}

							send({ type: 'thinking', message: 'Processing tool results...' });

							conversationMessages = conversationMessages.concat(toolResults);

							// Final response based on tool results
							// Rebuild system prompt with fresh context
							const updatedSystemPrompt = buildChatSystemPrompt({ hasFlightData: true });
							const messagesForFinalCall = [
								{ role: 'system', content: updatedSystemPrompt },
								...conversationMessages.filter((m: any) => m.role !== 'system'),
							];

							const finalStream = (await self.env.AI.run(getModelId(self.env), {
								messages: messagesForFinalCall,
								max_tokens: 512,
								temperature: 0.4,
								stream: true,
							} as Record<string, unknown>)) as ReadableStream<Uint8Array>;

							const finalReader = finalStream.getReader();
							let finalBuffer = '';
							let finalTranscript = '';
							let finalLastResponse = '';

							while (true) {
								const { value: finalValue, done: finalDone } = await finalReader.read();
								if (finalDone) break;
								if (!finalValue) continue;
								finalBuffer += decoder.decode(finalValue, { stream: true });

								let separatorIdx: number;
								while ((separatorIdx = finalBuffer.indexOf('\n\n')) !== -1) {
									const event = finalBuffer.slice(0, separatorIdx).trim();
									finalBuffer = finalBuffer.slice(separatorIdx + 2);

									if (event.startsWith('data: ')) {
										const eventJson = event.slice(6);
										if (eventJson === '[DONE]') continue;

										try {
											const eventObj = JSON.parse(eventJson) as any;
											const fullResp = typeof eventObj.response === 'string' ? eventObj.response : '';
											if (!fullResp) continue;

											let delta = '';
											if (finalLastResponse && fullResp.startsWith(finalLastResponse)) {
												delta = fullResp.slice(finalLastResponse.length);
											} else {
												delta = fullResp;
											}

											finalLastResponse = fullResp;

											if (delta) {
												finalTranscript += delta;
												send({ type: 'token', token: delta });
											}
										} catch (e) {
											self.logger.debug('Error parsing final AI stream event', {
												metadata: { principalId, conversationId, correlationId, error: String(e) },
											});
										}
									}
								}
							}

							transcript = finalTranscript;
						}

						// Log the turn
						await self.storage.logTurn({
							principalId,
							conversationId,
							correlationId,
							userMessage: userContent,
							assistantMessage: transcript,
						});
					} catch (error) {
						const err = error instanceof Error ? error : new Error(String(error));
						self.logger.error('Stream processing error', err, {
							metadata: {
								principalId,
								conversationId,
								correlationId,
								errorMessage: err.message,
								errorStack: err.stack,
							},
						});
						send({ type: 'error', error: `Stream failed: ${err.message}` });
					} finally {
						send({ type: 'done', message_id: messageId });
						controller.close();
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

	private parseToolCalls(aiResult: any): LLMToolCall[] {
		if (!aiResult || typeof aiResult !== 'object') {
			return [];
		}

		// Handle different response formats from Workers AI
		if (Array.isArray(aiResult.tool_calls)) {
			return aiResult.tool_calls;
		}

		if (aiResult.tool_calls && typeof aiResult.tool_calls === 'object') {
			return [aiResult.tool_calls];
		}

		return [];
	}

	/**
	 * Attempt to parse a tool call from plain-text JSON embedded in the response.
	 * Workers AI sometimes returns tool calls as text instead of structured fields.
	 */
	private tryParseToolCallFromText(text: string): LLMToolCall | null {
		if (!text || typeof text !== 'string') return null;

		const trimmed = text.trim();

		// Check if it looks like a JSON object
		if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

		try {
			const parsed = JSON.parse(trimmed);

			// Must have "name" field to be a tool call
			if (!parsed.name || typeof parsed.name !== 'string') return null;

			// Extract tool name and parameters
			const toolName = parsed.name;
			let parameters =
				parsed.parameters ||
				parsed.arguments ||
				(() => {
					// If neither parameters nor arguments, construct from all props except name, type
					const { name, type, ...rest } = parsed;
					return Object.keys(rest).length > 0 ? rest : {};
				})();

			// Normalize parameter names from camelCase to snake_case for tool executor
			parameters = this.normalizeParameterNames(parameters);

			return {
				name: toolName,
				id: crypto.randomUUID(),
				arguments: parameters,
			};
		} catch {
			// Not valid JSON or doesn't match tool call structure
			return null;
		}
	}

	/**
	 * Normalize tool parameters from camelCase to snake_case.
	 * The LLM often returns camelCase but the tool executor expects snake_case.
	 */
	private normalizeParameterNames(params: Record<string, unknown>): Record<string, unknown> {
		const normalized: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(params)) {
			// Convert camelCase to snake_case
			const snakeCase = key.replace(/([A-Z])/g, '_$1').toLowerCase();
			normalized[snakeCase] = value;
		}

		return normalized;
	}

	private async executeToolCall(
		toolCall: LLMToolCall,
		principalId: string,
		correlationId: string,
	): Promise<Record<string, unknown>> {
		const toolId = this.mapToolNameToId(toolCall.name);
		if (!toolId) {
			this.logger.error('Unknown tool called', new Error(`Tool not found: ${toolCall.name}`), {
				metadata: { toolName: toolCall.name, principalId, correlationId },
			});
			return {
				error: `Unknown tool: ${toolCall.name}`,
				status: 'error',
			};
		}

		try {
			// Create a dummy send function (tools don't need to emit events during non-streaming execution)
			const send = () => { };

			const executor = new ToolExecutor(this.toolRegistry, this.env, correlationId);
			const result = await executor.execute(toolId, toolCall.arguments, send);

			this.logger.info('Tool executed successfully', {
				metadata: {
					toolName: toolCall.name,
					toolId,
					principalId,
					correlationId,
				},
			});

			return (result as Record<string, unknown>) || {};
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.logger.error('Tool execution failed', err, {
				metadata: {
					toolName: toolCall.name,
					toolId,
					principalId,
					correlationId,
				},
			});

			return {
				error: err.message,
				status: 'error',
				toolName: toolCall.name,
			};
		}
	}

	/**
	 * Parse Python-style tool calls that Llama 3.3 naturally outputs
	 * Examples:
	 *   <|python_tag|>search_flights(origin="PHL", destination="BOS", departure_date="2025-11-29")
	 *   search_flights(origin="Philadelphia", destination="Boston", departureDate="2025-11-28", passengers=1)
	 */
	private tryParsePythonToolCall(text: string): LLMToolCall | null {
		if (!text || typeof text !== 'string') return null;

		const trimmed = text.trim();

		// Remove Python tags if present
		let cleaned = trimmed
			.replace(/<\|python_tag\|>/g, '')
			.replace(/<\|python>/g, '')
			.replace(/<\/python>/g, '')
			.replace(/<lpython>/g, '')
			.trim();

		// Match function call pattern: function_name(arg1=value1, arg2=value2, ...)
		const functionMatch = cleaned.match(/^([a-z_]+)\s*\((.*)\)\s*$/);

		if (!functionMatch) return null;

		const functionName = functionMatch[1];
		const argsString = functionMatch[2];

		// Parse arguments
		const args: Record<string, unknown> = {};

		// Split by commas not inside quotes
		const argParts: string[] = [];
		let currentArg = '';
		let inQuotes = false;
		let quoteChar = '';

		for (let i = 0; i < argsString.length; i++) {
			const char = argsString[i];

			if ((char === '"' || char === "'") && (i === 0 || argsString[i - 1] !== '\\')) {
				if (!inQuotes) {
					inQuotes = true;
					quoteChar = char;
				} else if (char === quoteChar) {
					inQuotes = false;
				}
			}

			if (char === ',' && !inQuotes) {
				argParts.push(currentArg.trim());
				currentArg = '';
			} else {
				currentArg += char;
			}
		}

		if (currentArg.trim()) {
			argParts.push(currentArg.trim());
		}

		// Parse each argument
		for (const part of argParts) {
			const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
			if (!match) continue;

			const key = match[1];
			let value: unknown = match[2].trim();

			// Remove quotes if present
			if (typeof value === 'string') {
				if ((value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))) {
					value = value.slice(1, -1);
				}
				// Try to parse as number
				else if (/^\d+$/.test(value)) {
					value = parseInt(value, 10);
				}
				// Try to parse as float
				else if (/^\d+\.\d+$/.test(value)) {
					value = parseFloat(value);
				}
				// Parse booleans
				else if (value === 'True' || value === 'true') {
					value = true;
				}
				else if (value === 'False' || value === 'false') {
					value = false;
				}
			}

			args[key] = value;
		}

		// Normalize parameter names from camelCase to snake_case
		const normalizedArgs = this.normalizeParameterNames(args);

		this.logger.info('Parsed Python-style tool call', {
			metadata: {
				functionName,
				args: normalizedArgs,
				originalText: text.substring(0, 100),
			},
		});

		return {
			name: functionName,
			id: crypto.randomUUID(),
			arguments: normalizedArgs,
		};
	}

	/**
	 * Check if text looks like the start of a JSON tool call OR Python-style tool call
	 * Used to decide if we should buffer or send tokens immediately
	 */
	private looksLikeToolCallStart(text: string): boolean {
		if (!text) return false;

		const trimmed = text.trim();

		// Check for Python tags FIRST (Llama 3.3 uses these)
		if (trimmed.includes('<|python') || trimmed.includes('<lpython') || trimmed.includes('|python_tag')) {
			return true;
		}

		// Check for JSON object start
		if (trimmed.startsWith('{')) {
			// Check for common tool call patterns
			if (trimmed.includes('"name"') || trimmed.includes('"parameters"') || trimmed.includes('"arguments"')) {
				return true;
			}
			// If it starts with { and has quotes, likely JSON
			if (trimmed.length > 5 && trimmed.includes('"')) {
				return true;
			}
		}

		return false;
	}
}
