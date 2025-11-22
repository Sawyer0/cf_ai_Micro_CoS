/**
 * WorkersAIAdapter - LLM Adapter using Cloudflare Workers AI
 *
 * Implements ILLMPort using Workers AI binding
 * Provides text generation, streaming, and tool calling capabilities
 */

import { Ai } from '@cloudflare/workers-types';
import { ILLMPort, LLMCompletionRequest, LLMCompletionResponse, ToolCall } from '../../domain/chat/ports/llm.port';
import { Logger } from '../../observability/logger';
import { withRetry } from '../../infrastructure/retry';

export class WorkersAIAdapter implements ILLMPort {
	constructor(
		private readonly ai: Ai,
		private readonly logger: Logger,
	) {}

	async generateCompletion(request: LLMCompletionRequest, correlationId: string): Promise<LLMCompletionResponse> {
		const startTime = Date.now();

		try {
			const aiRequest: Record<string, unknown> = {
				messages: request.messages,
				temperature: request.temperature ?? 0.7,
				max_tokens: request.maxTokens ?? 512,
				stream: false,
			};

			// Add tools if provided
			if (request.tools && request.tools.length > 0) {
				aiRequest.tools = request.tools;
				aiRequest.tool_choice = request.tool_choice ?? 'auto';
			}

			// Call Workers AI with Retry
			const response = (await withRetry(
				() => this.ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', aiRequest),
				{
					maxAttempts: 3,
					initialDelayMs: 100,
					maxDelayMs: 1000,
					backoffMultiplier: 2,
				},
				this.logger,
				{ correlationId, operation: 'WorkersAIAdapter.generateCompletion' },
			)) as any;

			const latency = Date.now() - startTime;

			this.logger.info('LLM completion generated', {
				correlationId,
				metadata: {
					model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
					tokenCount: response.token_count || 0,
					latencyMs: latency,
					toolCallsCount: response.tool_calls?.length || 0,
				},
			});

			return {
				content: response.response || '',
				tokenCount: response.token_count || 0,
				model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
				tool_calls: response.tool_calls,
				finish_reason: response.finish_reason,
			};
		} catch (error) {
			this.logger.error('LLM completion failed', error as Error, { correlationId });
			throw error;
		}
	}

	async *streamCompletion(request: LLMCompletionRequest): AsyncIterableIterator<{
		delta: string;
		tool_calls?: ToolCall[];
		done: boolean;
	}> {
		const aiRequest: Record<string, unknown> = {
			messages: request.messages,
			temperature: request.temperature ?? 0.7,
			max_tokens: request.maxTokens ?? 512,
			stream: true,
		};

		// Add tools if provided
		if (request.tools && request.tools.length > 0) {
			aiRequest.tools = request.tools;
			aiRequest.tool_choice = request.tool_choice ?? 'auto';
		}

		const stream = (await this.ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', aiRequest)) as any;

		for await (const chunk of stream) {
			yield {
				delta: chunk.response || '',
				tool_calls: chunk.tool_calls,
				done: chunk.done || false,
			};
		}
	}
}
