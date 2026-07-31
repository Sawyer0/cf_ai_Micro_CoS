import { DurableObject } from 'cloudflare:workers';
import { WorkerEnv } from '../../env';
import { createErrorResponse } from '../../http';
import { getPrincipalId } from '../../api/middleware/auth';
import { WebSocketManager } from './websocket.manager';
import { StorageManager } from './storage.manager';
import { LLMHandler } from './llm.handler';
import { IntentDetector, DialogueState, WorkflowType } from './intent-detector';
import { WSMessage } from './types';
import { Logger } from '../../observability/logger';
import { DuffelFlightAdapter } from '../../adapters/mcp/flights.adapter';
import { DuffelApiClient } from '../../adapters/mcp/clients/duffel-api.client';
import { DuffelFlightMapper } from '../../adapters/mcp/mappers/duffel-flight.mapper';
import { FlightSearchValidator } from '../../adapters/mcp/validators/flight-search.validator';
import { D1SemanticMemoryRepository } from '../../infrastructure/memory/D1SemanticMemoryRepository';
import { D1EpisodicMemoryRepository } from '../../infrastructure/memory/D1EpisodicMemoryRepository';
import { D1ProceduralMemoryRepository } from '../../infrastructure/memory/D1ProceduralMemoryRepository';
import { ContextManager, StructuredContext } from './context-manager';

/**
 * Full Dialogue State Tracking (DST) implementation
 * Tracks conversation state, active workflows, and user context across turns
 */
export interface FullDialogueState extends DialogueState {
	conversationId: string;
	principalId: string;
	lastUpdateTime: number;
	lastAccessTime?: number; // Track last time this conversation was accessed
	turnCount: number;
	activeWorkflow?: {
		type: WorkflowType;
		startTime: number;
		lastUpdate: number;
		status: 'pending' | 'running' | 'completed' | 'failed';
		result?: string;
	};
	slots: {
		origin?: string;
		destination?: string;
		departureDate?: string;
		returnDate?: string;
		taskDescription?: string;
		planningDate?: string;
	};
	context: {
		previousWorkflows: WorkflowType[];
		userPreferences: Record<string, unknown>;
		lastTravelRequest?: { origin: string; destination: string; date: string };
	};
}

export class ChatSessionDO extends DurableObject<WorkerEnv> {
	private wsManager: WebSocketManager;
	private storage: StorageManager;
	private llm: LLMHandler;
	private intentDetector: IntentDetector;
	private semanticMemory: D1SemanticMemoryRepository;
	private episodicMemory: D1EpisodicMemoryRepository;
	private proceduralMemory: D1ProceduralMemoryRepository;
	private contextManager: ContextManager;
	private logger: Logger = new Logger('chat-session');
	private dialogueStateCache: Map<string, FullDialogueState> = new Map(); // in-memory cache
	private storageKey = 'dst:'; // prefix for DST keys in durable storage

	constructor(state: DurableObjectState, env: WorkerEnv) {
		super(state, env);
		this.wsManager = new WebSocketManager(state);
		this.storage = new StorageManager(env.DB, this.wsManager);
		this.llm = new LLMHandler(env, this.storage);
		this.intentDetector = new IntentDetector();
		this.semanticMemory = new D1SemanticMemoryRepository(env.DB);
		this.episodicMemory = new D1EpisodicMemoryRepository(env.DB);
		this.proceduralMemory = new D1ProceduralMemoryRepository(env.DB);
		this.contextManager = new ContextManager(this.semanticMemory, this.episodicMemory, this.proceduralMemory);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const correlationId = request.headers.get('X-Correlation-ID') ?? crypto.randomUUID();

		if (request.headers.get('Upgrade') === 'websocket') {
			return this.wsManager.handleUpgrade(request, this.ctx);
		}

		if (request.method === 'POST' && url.pathname === '/chat') {
			return this.handleChat(request);
		}

		if (request.method === 'POST' && url.pathname === '/log') {
			return this.handleLog(request);
		}

		if (request.method === 'POST' && url.pathname === '/workflow-result') {
			return this.handleWorkflowResult(request);
		}

		// GET /conversations - List all conversations for user
		if (request.method === 'GET' && url.pathname === '/conversations') {
			return this.handleListConversations(request, correlationId);
		}

		// GET /conversations/:conversationId/messages - Get messages for a conversation
		const conversationMatch = url.pathname.match(/^\/conversations\/([^/]+)\/messages$/);
		if (request.method === 'GET' && conversationMatch) {
			const conversationId = conversationMatch[1];
			return this.handleGetConversationMessages(conversationId, request, correlationId);
		}

		return new Response('Not found', { status: 404 });
	}

	async alarm() {
		await this.storage.cleanup();
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		try {
			const data = JSON.parse(message.toString()) as WSMessage;
			if (data.type === 'ping') {
				ws.send(JSON.stringify({ type: 'pong' }));
			}
		} catch (err) {
			// Ignore invalid messages
		}
	}

	async webSocketClose(ws: WebSocket) {
		this.wsManager.removeSession(ws);
	}

	async webSocketError(ws: WebSocket) {
		this.wsManager.removeSession(ws);
	}

	private async handleChat(request: Request): Promise<Response> {
		const correlationId = request.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
		const body = (await request.json().catch(() => null)) as any;

		if (!body?.messages || !Array.isArray(body.messages)) {
			return createErrorResponse('VALIDATION_ERROR', 'Invalid messages', 400, correlationId);
		}

		const principalIdHeader = request.headers.get('X-Principal-Id');

		const principalId = principalIdHeader || getPrincipalId(request) || 'anonymous';

		const conversationId = body.conversation_id || crypto.randomUUID();
		const userContent = [...body.messages].reverse().find((m: any) => m.role === 'user')?.content;

		// Ensure session exists in database before processing
		// This prevents 404 errors when frontend tries to load messages
		try {
			await Promise.race([
				this.storage.ensureSession(conversationId, principalId),
				new Promise((_, reject) => setTimeout(() => reject(new Error('ensureSession timeout')), 5000)),
			]);
		} catch (error) {
			// Log but don't fail—continue with the chat even if session creation fails
			this.logger.warn('Failed to ensure session, continuing anyway', {
				metadata: { conversationId, principalId, error: String(error) },
			});
		}

		// Retrieve previous messages for fallback entity extraction
		let previousMessages: string[] = [];
		try {
			previousMessages = await this.storage.getLastUserMessages(conversationId, 3);
		} catch (error) {
			// If retrieval fails, continue without fallback
			this.logger.debug('Could not retrieve previous messages', {
				metadata: { conversationId, principalId },
			});
		}

		// Initialize or retrieve full dialogue state for this conversation
		const currentDialogueState = await this.getOrInitializeDialogueState(conversationId, principalId);

		// Detect intent from user message with fallback context and dialogue state
		const intentResult = this.intentDetector.detect(userContent || '', previousMessages, currentDialogueState);

		// Build intelligent, intent-aware context
		let structuredContext: StructuredContext | null = null;
		try {
			structuredContext = await this.contextManager.buildContext(currentDialogueState, intentResult.workflow || 'general', principalId);

			if (this.contextManager.exceedsTokenBudget(structuredContext)) {
				this.logger.warn('Context exceeds token budget', {
					metadata: {
						conversationId,
						principalId,
						tokenEstimate: structuredContext.tokenEstimate,
					},
				});
			}
		} catch (error) {
			this.logger.warn('Failed to build structured context', {
				metadata: { principalId, conversationId },
			});
			// Continue without structured context
		}

		// Update dialogue state with current intent and slot filling
		await this.updateDialogueState(conversationId, principalId, intentResult);

		// Trigger workflow or pre-fetch data based on intent
		try {
			if (intentResult.workflow === 'travel' && intentResult.entities.destination) {
				const logMessage = intentResult.usedFallback ? 'Travel intent detected (using fallback entities)' : 'Travel intent detected';
				this.logger.info(logMessage, {
					metadata: {
						entities: intentResult.entities,
						principalId,
						usedFallback: intentResult.usedFallback,
					},
				});

				// Trigger async workflow (LLM will call tool for real-time flights)
				await this.env.TRAVEL_PLANNING.create({
					params: {
						userId: principalId,
						conversationId,
						...intentResult.entities,
						correlationId,
					},
				});
			} else if (intentResult.workflow === 'task') {
				this.logger.info('Triggering task extraction workflow', {
					metadata: { entities: intentResult.entities, principalId },
				});
				await this.env.TASK_EXTRACTION.create({
					params: {
						userId: principalId,
						conversationId,
						...intentResult.entities,
						correlationId,
					},
				});
			} else if (intentResult.workflow === 'planning') {
				this.logger.info('Triggering daily planning workflow', {
					metadata: { entities: intentResult.entities, principalId },
				});
				await this.env.DAILY_PLANNING.create({
					params: {
						userId: principalId,
						conversationId,
						...intentResult.entities,
						correlationId,
					},
				});
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.logger.error('Failed to trigger workflow/action', err, {
				metadata: { principalId, conversationId },
			});
		}

		// Schedule cleanup
		await this.ctx.storage.setAlarm(Date.now() + 7 * 24 * 60 * 60 * 1000);

		// Load conversation history to provide full context to LLM
		let messagesWithContext = [...body.messages];
		try {
			const history = await Promise.race([
				this.storage.getConversationHistory(conversationId, 20),
				new Promise<any[]>((_, reject) => setTimeout(() => reject(new Error('getConversationHistory timeout')), 3000)),
			]);
			if (history.length > 0) {
				this.logger.debug('Loaded conversation history', {
					metadata: { messageCount: history.length, principalId, conversationId },
				});
				// Merge history with current messages, avoiding duplicates
				// History contains previous turns; current messages contain the new user message
				// If body.messages is empty or just the current user message, use full history
				if (body.messages.length <= 1) {
					messagesWithContext = history;
					// Append current user message if not already in history
					const currentUserMsg = body.messages[0];
					if (currentUserMsg && !history.some((h) => h.content === currentUserMsg.content)) {
						messagesWithContext.push(currentUserMsg);
					}
				}
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.logger.debug('Could not load conversation history', {
				metadata: { conversationId, principalId, error: err.message },
			});
			// Continue with just the messages in body
		}

		// Format and inject intelligent context into last user message
		const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
		const dateContext = `\n\n[CURRENT_DATE: ${today}]`;

		let contextInjection = dateContext;

		if (structuredContext) {
			const formattedContext = this.contextManager.formatContextForPrompt(structuredContext);
			contextInjection += formattedContext;

			this.logger.info('Injecting structured context into user message', {
				metadata: {
					tokenEstimate: structuredContext.tokenEstimate,
					hasSlots: Object.keys(structuredContext.dialogueState.slots).length > 0,
					principalId,
					conversationId,
				},
			});
		}

		// Inject context into last user message
		for (let i = messagesWithContext.length - 1; i >= 0; i--) {
			if (messagesWithContext[i]?.role === 'user') {
				messagesWithContext[i] = {
					...messagesWithContext[i],
					content: messagesWithContext[i].content + contextInjection,
				};
				break;
			}
		}

		return this.llm.processChat(
			messagesWithContext,
			userContent,
			conversationId,
			principalId,
			correlationId,
			structuredContext,
			body.stream !== false,
		);
	}

	private async handleLog(request: Request): Promise<Response> {
		const body = (await request.json()) as any;
		await this.storage.logTurn({
			principalId: body.principal_id,
			conversationId: body.conversation_id,
			correlationId: body.correlation_id,
			userMessage: body.user_message,
			assistantMessage: body.assistant_message,
		});
		return new Response(null, { status: 204 });
	}

	private async handleWorkflowResult(request: Request): Promise<Response> {
		const body = (await request.json()) as any;
		const { message, conversationId, correlationId } = body;
		this.logger.info('Received workflow result', {
			metadata: { messageLength: message?.length, conversationId, correlationId },
		});

		// Update DST: mark workflow as completed
		const state = this.dialogueStateCache.get(conversationId);
		if (state && state.activeWorkflow) {
			state.activeWorkflow.status = 'completed';
			state.activeWorkflow.result = message;
			state.activeWorkflow.lastUpdate = Date.now();
			// Persist to durable storage
			await this.persistDialogueState(conversationId, state);
			this.logger.info('Workflow completed in DST', {
				metadata: { conversationId, workflowType: state.activeWorkflow.type },
			});
		}

		// Store in history
		await this.storage.logTurn({
			principalId: 'system',
			conversationId,
			correlationId,
			userMessage: undefined,
			assistantMessage: message,
		});

		// Broadcast to WebSocket clients
		this.wsManager.broadcast({
			type: 'token',
			token: `\n\n[Workflow Result]\n${message}\n`,
		});

		return new Response('OK', { status: 200 });
	}

	private async handleListConversations(request: Request, correlationId: string): Promise<Response> {
		try {
			const principalIdHeader = request.headers.get('X-Principal-Id');
			const principalId = principalIdHeader || getPrincipalId(request) || 'anonymous';

			const conversations = await this.storage.listConversations(principalId);

			this.logger.info('Listed conversations', {
				metadata: {
					principalId,
					conversationCount: conversations.length,
					correlationId,
				},
			});

			return new Response(JSON.stringify({ conversations }), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'X-Correlation-ID': correlationId,
				},
			});
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.logger.error('Failed to list conversations', err, {
				metadata: { correlationId },
			});
			return createErrorResponse(
				'LIST_CONVERSATIONS_ERROR',
				'Failed to list conversations: ' + (error instanceof Error ? error.message : String(error)),
				500,
				correlationId,
			);
		}
	}

	private async handleGetConversationMessages(conversationId: string, request: Request, correlationId: string): Promise<Response> {
		try {
			const principalIdHeader = request.headers.get('X-Principal-Id');
			const principalId = principalIdHeader || getPrincipalId(request) || 'anonymous';

			const messages = await this.storage.getConversationMessages(conversationId);

			this.logger.info('Retrieved conversation messages', {
				metadata: {
					conversationId,
					principalId,
					messageCount: messages.length,
					correlationId,
				},
			});

			return new Response(JSON.stringify({ conversationId, messages }), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'X-Correlation-ID': correlationId,
				},
			});
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.logger.error('Failed to get conversation messages', err, {
				metadata: { conversationId, correlationId },
			});
			return createErrorResponse(
				'GET_MESSAGES_ERROR',
				'Failed to get conversation messages: ' + (error instanceof Error ? error.message : String(error)),
				500,
				correlationId,
			);
		}
	}

	/**
	 * Initialize or retrieve dialogue state for a conversation
	 * Loads from durable storage if persisted, otherwise creates new state
	 */
	private async getOrInitializeDialogueState(conversationId: string, principalId: string): Promise<FullDialogueState> {
		const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

		// Check cache first
		let state = this.dialogueStateCache.get(conversationId);
		if (state) {
			state.lastAccessTime = Date.now();
			await this.persistDialogueState(conversationId, state);
			return state;
		}

		// Try to load from durable storage
		const storageKey = `${this.storageKey}${conversationId}`;
		const stored = await this.ctx.storage.get<FullDialogueState>(storageKey);

		if (stored) {
			// Check if conversation is stale (not accessed for 30+ minutes)
			const lastAccess = stored.lastAccessTime ?? stored.lastUpdateTime;
			const ageMs = Date.now() - lastAccess;

			if (ageMs > STALE_THRESHOLD_MS) {
				this.logger.info('Conversation stale, resetting dialogue state', {
					metadata: {
						conversationId,
						principalId,
						ageMinutes: Math.floor(ageMs / 60000),
					},
				});
				// Reset to fresh state for new conversation session
				const freshState: FullDialogueState = {
					conversationId,
					principalId,
					lastUpdateTime: Date.now(),
					lastAccessTime: Date.now(),
					turnCount: 0,
					slots: {},
					context: {
						previousWorkflows: [],
						userPreferences: {},
					},
					lastSuggestion: undefined,
				};
				this.dialogueStateCache.set(conversationId, freshState);
				await this.persistDialogueState(conversationId, freshState);
				return freshState;
			}

			// Conversation is fresh, use it
			stored.lastAccessTime = Date.now();
			this.dialogueStateCache.set(conversationId, stored);
			await this.persistDialogueState(conversationId, stored);

			this.logger.debug('Loaded dialogue state from storage', {
				metadata: { conversationId, principalId, turnCount: stored.turnCount },
			});
			return stored;
		}

		// Create new state
		state = {
			conversationId,
			principalId,
			lastUpdateTime: Date.now(),
			lastAccessTime: Date.now(),
			turnCount: 0,
			slots: {},
			context: {
				previousWorkflows: [],
				userPreferences: {},
			},
			lastSuggestion: undefined,
		};
		this.dialogueStateCache.set(conversationId, state);
		await this.persistDialogueState(conversationId, state);

		this.logger.debug('Initialized new dialogue state', {
			metadata: { conversationId, principalId },
		});

		return state;
	}

	/**
	 * Persist dialogue state to durable storage
	 */
	private async persistDialogueState(conversationId: string, state: FullDialogueState): Promise<void> {
		const storageKey = `${this.storageKey}${conversationId}`;
		await this.ctx.storage.put(storageKey, state);
	}

	/**
	 * Update dialogue state after intent detection
	 * Handles slot filling, workflow transitions, and context enrichment
	 * Persists changes to durable storage
	 */
	private async updateDialogueState(conversationId: string, principalId: string, intentResult: any): Promise<void> {
		const state = await this.getOrInitializeDialogueState(conversationId, principalId);

		// Increment turn count
		state.turnCount += 1;
		state.lastUpdateTime = Date.now();

		// Fill slots based on detected intent and entities
		if (intentResult.workflow === 'travel') {
			state.slots.origin = (intentResult.entities.origin as string) || state.slots.origin;
			state.slots.destination = (intentResult.entities.destination as string) || state.slots.destination;
			state.slots.departureDate = (intentResult.entities.departureDate as string) || state.slots.departureDate;
			state.slots.returnDate = (intentResult.entities.returnDate as string) || state.slots.returnDate;

			// Store last travel request
			if (state.slots.origin && state.slots.destination) {
				state.context.lastTravelRequest = {
					origin: state.slots.origin,
					destination: state.slots.destination,
					date: state.slots.departureDate || new Date().toISOString().split('T')[0],
				};
			}

			// Update last suggestion for confirmations
			if (state.slots.destination) {
				state.lastSuggestion = {
					origin: state.slots.origin || 'JFK',
					destination: state.slots.destination,
					date: state.slots.departureDate || new Date().toISOString().split('T')[0],
					type: 'travel',
				};
			}
		} else if (intentResult.workflow === 'task') {
			state.slots.taskDescription = (intentResult.entities.description as string) || state.slots.taskDescription;
			state.lastSuggestion = {
				type: 'task',
			};
		} else if (intentResult.workflow === 'planning') {
			state.slots.planningDate = (intentResult.entities.date as string) || state.slots.planningDate;
			state.lastSuggestion = {
				type: 'planning',
			};
		}

		// Track workflow transitions
		if (intentResult.workflow && !state.context.previousWorkflows.includes(intentResult.workflow)) {
			state.context.previousWorkflows.push(intentResult.workflow);
		}

		// Mark workflow as active if one is triggered
		if (intentResult.workflow) {
			state.activeWorkflow = {
				type: intentResult.workflow,
				startTime: Date.now(),
				lastUpdate: Date.now(),
				status: 'pending',
			};

			this.logger.info('Dialogue state updated with active workflow', {
				metadata: {
					conversationId,
					workflowType: intentResult.workflow,
					turnCount: state.turnCount,
					slots: state.slots,
				},
			});
		}

		// Persist updated state
		await this.persistDialogueState(conversationId, state);
	}

	/**
	 * Get current dialogue state for a conversation
	 * Returns complete state snapshot for inspection/debugging
	 */
	private getDialogueState(conversationId: string): FullDialogueState | null {
		return this.dialogueStateCache.get(conversationId) ?? null;
	}

	/**
	 * Clear dialogue state for a conversation
	 * Deletes from both cache and durable storage
	 */
	private async clearDialogueState(conversationId: string): Promise<void> {
		this.dialogueStateCache.delete(conversationId);
		const storageKey = `${this.storageKey}${conversationId}`;
		await this.ctx.storage.delete(storageKey);
		this.logger.debug('Cleared dialogue state', { metadata: { conversationId } });
	}

	/**
	 * Get all cached dialogue states
	 * Useful for observability and debugging
	 */
	private getAllDialogueStates(): Map<string, FullDialogueState> {
		return new Map(this.dialogueStateCache);
	}
}
