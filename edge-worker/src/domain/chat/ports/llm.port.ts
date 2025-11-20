/**
 * ILLMPort - Port for LLM operations
 * 
 * Port in Chat Bounded Context
 * Defines what the domain needs from LLM providers
 */

export interface LLMMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface LLMCompletionRequest {
    messages: LLMMessage[];
    temperature?: number;
    maxTokens?: number;
}

export interface LLMCompletionResponse {
    content: string;
    tokenCount: number;
    model: string;
}

export interface ILLMPort {
    generateCompletion(
        request: LLMCompletionRequest,
        correlationId: string
    ): Promise<LLMCompletionResponse>;

    streamCompletion(
        request: LLMCompletionRequest
    ): AsyncIterableIterator<string>;
}
