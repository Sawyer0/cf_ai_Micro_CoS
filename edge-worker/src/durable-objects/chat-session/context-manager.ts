import { Logger } from '../../observability/logger';
import { FullDialogueState } from './chat-session.do';
import { D1SemanticMemoryRepository, D1EpisodicMemoryRepository, D1ProceduralMemoryRepository } from '../../infrastructure/memory';

/**
 * Structured context for LLM, designed to minimize token bloat
 * Follows best practices: selective retrieval, intent-based filtering, token awareness
 */
export interface StructuredContext {
	dialogueState: {
		turnCount: number;
		activeWorkflow?: string;
		slots: Record<string, string | undefined>;
		lastTravelRequest?: { origin: string; destination: string; date: string };
	};
	relevantMemories: {
		semantic?: string;
		episodic?: string;
		procedural?: string;
	};
	tokenEstimate: number;
	contextSummary?: string;
}

/**
 * Context Manager - Intelligent context window management
 * Retrieves and structures only relevant context based on intent
 * Filters memory by relevance and token budget
 */
export class ContextManager {
	private logger: Logger = new Logger('context-manager');
	private readonly MAX_CONTEXT_TOKENS = 2000; // Target context size (leave room for response)
	private readonly MEMORY_TOKEN_BUDGET = 800; // Max tokens for memory injection

	constructor(
		private semanticMemory: D1SemanticMemoryRepository,
		private episodicMemory: D1EpisodicMemoryRepository,
		private proceduralMemory: D1ProceduralMemoryRepository,
	) { }

	/**
	 * Build structured context based on detected intent and dialogue state
	 * Retrieves only relevant memories to minimize token bloat
	 */
	async buildContext(dialogueState: FullDialogueState, detectedIntent: string, principalId: string): Promise<StructuredContext> {
		const startTime = Date.now();

		// 1. Extract dialogue state as primary context (slots, workflow, turn count)
		const dialogueStateContext: StructuredContext['dialogueState'] = {
			turnCount: dialogueState.turnCount,
			activeWorkflow: dialogueState.activeWorkflow?.type as string | undefined,
			slots: this.extractRelevantSlots(dialogueState, detectedIntent),
			lastTravelRequest: dialogueState.context.lastTravelRequest,
		};

		// 2. Retrieve memories filtered by intent
		const relevantMemories = await this.retrieveRelevantMemories(principalId, detectedIntent, dialogueState);

		// 3. Estimate tokens to ensure we stay under budget
		const estimatedTokens = this.estimateTokens(dialogueStateContext, relevantMemories);

		if (estimatedTokens > this.MAX_CONTEXT_TOKENS) {
			this.logger.warn('Context exceeds token budget', {
				metadata: {
					estimatedTokens,
					maxTokens: this.MAX_CONTEXT_TOKENS,
					principalId,
				},
			});
		}

		const context: StructuredContext = {
			dialogueState: dialogueStateContext,
			relevantMemories,
			tokenEstimate: estimatedTokens,
		};

		this.logger.debug('Context built', {
			metadata: {
				estimatedTokens,
				intent: detectedIntent,
				hasSemanticMemory: !!relevantMemories.semantic,
				hasEpisodicMemory: !!relevantMemories.episodic,
				hasProcedureMemory: !!relevantMemories.procedural,
				buildTimeMs: Date.now() - startTime,
			},
		});

		return context;
	}

	/**
	 * Extract only slots relevant to the detected intent
	 * Minimizes context bloat by ignoring irrelevant slots
	 */
	private extractRelevantSlots(dialogueState: FullDialogueState, intent: string): Record<string, string | undefined> {
		const slots: Record<string, string | undefined> = {};

		// Travel intent: include travel-specific slots
		if (intent === 'travel') {
			slots.origin = dialogueState.slots.origin;
			slots.destination = dialogueState.slots.destination;
			slots.departureDate = dialogueState.slots.departureDate;
			slots.returnDate = dialogueState.slots.returnDate;
		}
		// Task intent: include task-specific slots
		else if (intent === 'task') {
			slots.taskDescription = dialogueState.slots.taskDescription;
		}
		// Planning intent: include planning-specific slots
		else if (intent === 'planning') {
			slots.planningDate = dialogueState.slots.planningDate;
		}

		// Always include general slots
		return slots;
	}

	/**
	 * Retrieve memories filtered by relevance to intent
	 * Uses vector search where applicable, avoids dumping all memory
	 */
	private async retrieveRelevantMemories(
		principalId: string,
		intent: string,
		dialogueState: FullDialogueState,
	): Promise<{ semantic?: string; episodic?: string; procedural?: string }> {
		const memories: { semantic?: string; episodic?: string; procedural?: string } = {};

		try {
			// Semantic memory: only for travel or planning (user preferences, known destinations)
			if (intent === 'travel' || intent === 'planning') {
				const semantic = await this.semanticMemory.getSemanticMemory(principalId);
				if (semantic) {
					const context = semantic.toPromptContext();
					if (context && this.estimateTokens({}, { semantic: context }) < this.MEMORY_TOKEN_BUDGET) {
						memories.semantic = context;
					}
				}
			}

			// Episodic memory: for context-aware responses (recent events, recent trips)
			// Limit to 3 most recent episodes to minimize tokens
			if (dialogueState.turnCount > 5) {
				const episodic = await this.episodicMemory.getEpisodicMemory(principalId, 3);
				if (episodic) {
					const context = episodic.toPromptContext();
					if (context && this.estimateTokens({}, { episodic: context }) < this.MEMORY_TOKEN_BUDGET * 0.3) {
						memories.episodic = context;
					}
				}
			}

			// Procedural memory: for task-specific workflows
			if (intent === 'task' || intent === 'planning') {
				const procedural = await this.proceduralMemory.getProceduralMemory(principalId);
				if (procedural) {
					const context = procedural.toPromptContext();
					if (context && this.estimateTokens({}, { procedural: context }) < this.MEMORY_TOKEN_BUDGET * 0.3) {
						memories.procedural = context;
					}
				}
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.logger.warn('Failed to retrieve relevant memories', {
				metadata: { principalId, intent, error: err.message },
			});
		}

		return memories;
	}

	/**
	 * Rough token estimation (1 token ≈ 4 characters)
	 * Used to budget context and prevent bloat
	 */
	private estimateTokens(dialogueState: any, memories: { semantic?: string; episodic?: string; procedural?: string }): number {
		let charCount = 0;

		// Dialogue state + slots
		charCount += JSON.stringify(dialogueState).length;

		// Memories
		if (memories.semantic) charCount += memories.semantic.length;
		if (memories.episodic) charCount += memories.episodic.length;
		if (memories.procedural) charCount += memories.procedural.length;

		// Rough estimate: 1 token ≈ 4 chars in English
		return Math.ceil(charCount / 4);
	}

	/**
	 * Format structured context for injection into system prompt
	 * Creates human-readable context block
	 */
	formatContextForPrompt(context: StructuredContext): string {
		let formatted = '';

		// 1. Dialogue state section
		formatted += '\n\n[DIALOGUE STATE]\n';
		formatted += `Turn: ${context.dialogueState.turnCount}\n`;

		// Don't include active workflow - it confuses LLM into re-executing tools
		// Workflow status is for backend tracking only, not LLM guidance

		// 2. Relevant slots
		const nonEmptySlots = Object.entries(context.dialogueState.slots).filter(([, v]) => v);
		if (nonEmptySlots.length > 0) {
			formatted += '\n[CONVERSATION SLOTS]\n';
			for (const [key, value] of nonEmptySlots) {
				formatted += `${key}: ${value}\n`;
			}
		}

		// 3. Last travel request - make it VERY clear this is reference only
		if (context.dialogueState.lastTravelRequest) {
			const { origin, destination, date } = context.dialogueState.lastTravelRequest;
			formatted += `\n[REFERENCE ONLY - Previous Search]\nPreviously searched: ${origin} → ${destination} on ${date}\nDo NOT repeat this search unless user explicitly requests it again.\n`;
		}

		// 4. Relevant memories (only if they exist)
		if (Object.values(context.relevantMemories).some((v) => v)) {
			formatted += '\n[RELEVANT CONTEXT]\n';
			if (context.relevantMemories.semantic) {
				formatted += `\nUser Preferences & Knowledge:\n${context.relevantMemories.semantic}\n`;
			}
			if (context.relevantMemories.episodic) {
				formatted += `\nRecent Events:\n${context.relevantMemories.episodic}\n`;
			}
			if (context.relevantMemories.procedural) {
				formatted += `\nProcedures & Instructions:\n${context.relevantMemories.procedural}\n`;
			}
		}

		// 5. Token budget warning
		formatted += `\n[CONTEXT INFO] Tokens: ${context.tokenEstimate}/${this.MAX_CONTEXT_TOKENS}`;

		return formatted;
	}

	/**
	 * Get token estimate for logging/monitoring
	 */
	getTokenEstimate(context: StructuredContext): number {
		return context.tokenEstimate;
	}

	/**
	 * Check if context exceeds budget
	 */
	exceedsTokenBudget(context: StructuredContext): boolean {
		return context.tokenEstimate > this.MAX_CONTEXT_TOKENS;
	}
}
