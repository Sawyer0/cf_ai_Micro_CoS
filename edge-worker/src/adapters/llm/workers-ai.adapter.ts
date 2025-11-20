/**
 * WorkersAIAdapter - LLM Adapter using Cloudflare Workers AI
 * 
 * Implements ILLMPort using Workers AI binding
 * Provides text generation and streaming capabilities
 */

import { ILLMPort, LLMCompletionRequest, LLMCompletionResponse, LLMMessage } from '../../domain/chat/ports/llm.port';
import { Logger } from '../../observability/logger';

export class WorkersAIAdapter implements ILLMPort {
    constructor(
        private readonly ai: any,
        private readonly logger: Logger
    ) { }

    async generateCompletion(
        request: LLMCompletionRequest,
        correlationId: string
    ): Promise<LLMCompletionResponse> {
        const startTime = Date.now();

        try {
            const response = await this.ai.run('@cf/meta/llama-2-7b-chat-int8', {
                messages: request.messages,
                temperature: request.temperature ?? 0.7,
                max_tokens: request.maxTokens ?? 512,
                stream: false
            });

            const latency = Date.now() - startTime;

            this.logger.info('LLM completion generated', {
                correlationId,
                metadata: {
                    model: '@cf/meta/llama-2-7b-chat-int8',
                    tokenCount: response.token_count || 0,
                    latencyMs: latency
                }
            });

            return {
                content: response.response,
                tokenCount: response.token_count || 0,
                model: '@cf/meta/llama-2-7b-chat-int8'
            };
        } catch (error) {
            this.logger.error('LLM completion failed', error as Error, { correlationId });
            throw error;
        }
    }

    async *streamCompletion(request: LLMCompletionRequest): AsyncIterableIterator<string> {
        const stream = await this.ai.run('@cf/meta/llama-2-7b-chat-int8', {
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 512,
            stream: true
        });

        for await (const chunk of stream) {
            if (chunk.response) {
                yield chunk.response;
            }
        }
    }
}
