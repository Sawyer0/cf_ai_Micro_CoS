/**
 * ILLMPort - Port for LLM operations
 * 
 * Port in Chat Bounded Context
 * Defines what the domain needs from LLM providers
 */

export interface LLMMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    name?: string; // Tool name for tool role
    tool_call_id?: string; // ID linking tool result to tool call
}

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, {
                type: string;
                description?: string;
                enum?: string[];
            }>;
            required?: string[];
        };
    };
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface LLMCompletionRequest {
    messages: LLMMessage[];
    temperature?: number;
    maxTokens?: number;
    tools?: ToolDefinition[]; // Available tools for the LLM
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface LLMCompletionResponse {
    content: string;
    tokenCount: number;
    model: string;
    tool_calls?: ToolCall[]; // Tool calls requested by the LLM
    finish_reason?: 'stop' | 'tool_calls' | 'length';
}

export interface ILLMPort {
    generateCompletion(
        request: LLMCompletionRequest,
        correlationId: string
    ): Promise<LLMCompletionResponse>;

    streamCompletion(
        request: LLMCompletionRequest
    ): AsyncIterableIterator<{
        delta: string;
        tool_calls?: ToolCall[];
        done: boolean;
    }>;
}
