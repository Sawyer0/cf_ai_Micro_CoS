import { DurableObject } from 'cloudflare:workers';
import { WorkerEnv } from '../../env';
import { createErrorResponse } from '../../http';
import { getPrincipalId } from '../../api/middleware/auth';
import { WebSocketManager } from './websocket.manager';
import { StorageManager } from './storage.manager';
import { LLMHandler } from './llm.handler';
import { IntentDetector } from './intent-detector';
import { WSMessage } from './types';
import { Logger } from '../../observability/logger';
import { DuffelFlightAdapter } from '../../adapters/mcp/flights.adapter';
import { DuffelApiClient } from '../../adapters/mcp/clients/duffel-api.client';
import { DuffelFlightMapper } from '../../adapters/mcp/mappers/duffel-flight.mapper';
import { FlightSearchValidator } from '../../adapters/mcp/validators/flight-search.validator';
import { D1SemanticMemoryRepository } from '../../infrastructure/memory/D1SemanticMemoryRepository';
import { D1EpisodicMemoryRepository } from '../../infrastructure/memory/D1EpisodicMemoryRepository';
import { D1ProceduralMemoryRepository } from '../../infrastructure/memory/D1ProceduralMemoryRepository';

export class ChatSessionDO extends DurableObject<WorkerEnv> {
	private wsManager: WebSocketManager;
	private storage: StorageManager;
	private llm: LLMHandler;
	private intentDetector: IntentDetector;
	private semanticMemory: D1SemanticMemoryRepository;
	private episodicMemory: D1EpisodicMemoryRepository;
	private proceduralMemory: D1ProceduralMemoryRepository;
	private logger: Logger = new Logger('chat-session');

	constructor(state: DurableObjectState, env: WorkerEnv) {
		super(state, env);
		this.wsManager = new WebSocketManager(state);
		this.storage = new StorageManager(env.DB, this.wsManager);
		this.llm = new LLMHandler(env, this.storage);
		this.intentDetector = new IntentDetector();
		this.semanticMemory = new D1SemanticMemoryRepository(env.DB);
		this.episodicMemory = new D1EpisodicMemoryRepository(env.DB);
		this.proceduralMemory = new D1ProceduralMemoryRepository(env.DB);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

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
		await this.storage.ensureSession(conversationId, principalId);

		// Detect intent from user message
		const intentResult = this.intentDetector.detect(userContent || '');
		let contextInjection = '';

		// Retrieve all long-term memory layers (semantic, episodic, procedural)
		try {
			const [semanticMemory, episodicMemory, proceduralMemory] = await Promise.all([
				this.semanticMemory.getSemanticMemory(principalId),
				this.episodicMemory.getEpisodicMemory(principalId, 5),
				this.proceduralMemory.getProceduralMemory(principalId),
			]);

			// Inject all memory types into context
			contextInjection += semanticMemory.toPromptContext();
			contextInjection += episodicMemory.toPromptContext();
			contextInjection += proceduralMemory.toPromptContext();
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.logger.error('Failed to retrieve long-term memory', err, {
				metadata: { principalId },
			});
		}

		// Trigger workflow or pre-fetch data based on intent
		try {
			if (intentResult.workflow === 'travel' && intentResult.entities.destination) {
				this.logger.info('Travel intent detected', {
					metadata: { entities: intentResult.entities, principalId },
				});

				// Normalize city names to IATA codes
				const normalizeAirportCode = (code: string): string => {
					const cityMap: Record<string, string> = {
						NYC: 'JFK',
						LA: 'LAX',
						SF: 'SFO',
						CHI: 'ORD',
						London: 'LHR',
						Paris: 'CDG',
						Tokyo: 'NRT',
						Ibiza: 'IBZ',
					};
					const upper = code.toUpperCase();
					return cityMap[upper] || cityMap[code] || code.toUpperCase();
				};

				// Pre-fetch flights for immediate context (RAG pattern)
				const apiKey = this.env.DUFFEL_API_KEY || '';
				this.logger.debug('Duffel API key status', {
					metadata: { keyPresent: !!apiKey, keyLength: apiKey.length, principalId },
				});

				const origin = normalizeAirportCode((intentResult.entities.origin as string) || 'JFK');
				const destination = normalizeAirportCode(intentResult.entities.destination as string);

				const duffelClient = new DuffelApiClient(apiKey, this.logger);
				const duffelMapper = new DuffelFlightMapper(this.logger);
				const flightValidator = new FlightSearchValidator();

				const flightAdapter = new DuffelFlightAdapter(duffelClient, duffelMapper, flightValidator, this.logger, apiKey);
				const flights = await flightAdapter.searchFlights({
					origin,
					destination,
					departureDate: (intentResult.entities.departureDate as string) || new Date().toISOString().split('T')[0],
					passengers: 1,
				});

				if (flights.length > 0) {
					contextInjection = `\n\n[System Note: Real-time flight data found]\n`;
					flights.slice(0, 3).forEach((f) => {
						const seg = f.segments[0];
						contextInjection += `- ${seg.airline} (${seg.flightNumber}): ${f.totalPrice} ${
							f.currency
						}, Departs ${seg.departureTime.toLocaleTimeString()}\n`;
					});
				}

				// Also trigger workflow
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

		// Inject context into last user message
		const messagesWithContext = [...body.messages];
		if (contextInjection) {
			this.logger.info('Injecting context into user message', {
				metadata: {
					contextLength: contextInjection.length,
					principalId,
					conversationId,
				},
			});
			for (let i = messagesWithContext.length - 1; i >= 0; i--) {
				if (messagesWithContext[i]?.role === 'user') {
					messagesWithContext[i] = {
						...messagesWithContext[i],
						content: messagesWithContext[i].content + contextInjection,
					};
					this.logger.debug('Context injected into message', {
						metadata: { messageIndex: i, principalId },
					});
					break;
				}
			}
		} else {
			this.logger.debug('No context to inject', {
				metadata: { principalId, conversationId },
			});
		}

		return this.llm.processChat(messagesWithContext, userContent, conversationId, principalId, correlationId, body.stream !== false);
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
			metadata: { messageLength: message?.length, conversationId, correlationId }
		});

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
}
