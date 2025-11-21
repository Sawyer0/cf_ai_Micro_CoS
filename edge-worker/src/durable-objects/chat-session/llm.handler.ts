import { Env, getModelId, SseEvent, encodeSseEvent, SYSTEM_PROMPT } from '../../env';
import { ToolRegistry, ToolExecutor } from '../../tools';
import { ToolCallParser } from '../../tool-parser';
import { StorageManager } from './storage.manager';
import { createErrorResponse, createSseFromTranscript } from '../../http';

export class LLMHandler {
    private toolRegistry: ToolRegistry;

    constructor(
        private readonly env: Env,
        private readonly storage: StorageManager
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

    async processChat(
        messages: any[],
        userContent: string | undefined,
        conversationId: string,
        principalId: string,
        correlationId: string,
        shouldStream: boolean
    ): Promise<Response> {
        const llamaMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages.map((m) => ({
                role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
                content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
            })),
        ];

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
                assistantMessage: responseText
            });

            return new Response(JSON.stringify({ message: responseText }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId }
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

                            const { text, tools } = toolParser.processChunk(chunk);
                            if (text) {
                                transcript += text;
                                send({ type: 'token', token: text });
                            }

                            for (const toolCall of tools) {
                                await self.executeTool(toolCall, toolExecutor, send);
                            }
                        }

                        const { text: finalText, tools: finalTools } = toolParser.flush();
                        if (finalText) {
                            transcript += finalText;
                            send({ type: 'token', token: finalText });
                        }
                        for (const toolCall of finalTools) {
                            await self.executeTool(toolCall, toolExecutor, send);
                        }
                    } finally {
                        send({ type: 'done', message_id: messageId });
                        controller.close();
                        await self.storage.logTurn({
                            principalId,
                            conversationId,
                            correlationId,
                            userMessage: userContent,
                            assistantMessage: transcript
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
