import type { Env } from './env';
import type { SseEvent } from './env';
import { encodeSseEvent } from './env';

export function createJsonResponse(
  body: unknown,
  status: number,
  correlationId: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'X-Correlation-ID': correlationId,
      ...(extraHeaders ?? {}),
    },
  });
}

export function createErrorResponse(
  code: string,
  message: string,
  httpStatus: number,
  correlationId: string,
  details?: Record<string, unknown>,
): Response {
  const body = {
    error: {
      code,
      message,
      details: details ?? {},
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    },
  };
  return createJsonResponse(body, httpStatus, correlationId);
}

export function createSseFromTranscript(transcript: string, correlationId: string): Response {
  const encoder = new TextEncoder();
  const messageId = crypto.randomUUID();
  const chunkSize = 128;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: SseEvent) => {
        controller.enqueue(encodeSseEvent(encoder, event));
      };

      for (let i = 0; i < transcript.length; i += chunkSize) {
        const token = transcript.slice(i, i + chunkSize);
        if (!token) continue;
        send({ type: 'token', token });
      }

      send({ type: 'done', message_id: messageId });
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'X-Correlation-ID': correlationId,
    },
  });
}


