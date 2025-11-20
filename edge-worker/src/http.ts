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

export function requireAuth(request: Request, correlationId: string): Response | null {
  const accessJwt = request.headers.get('CF-Access-JWT-Assertion');
  if (!accessJwt) {
    return createErrorResponse(
      'UNAUTHORIZED',
      'Missing CF-Access-JWT-Assertion header. Request must go through Cloudflare Access.',
      401,
      correlationId,
    );
  }

  // Cloudflare Access validates the JWT before the Worker in production, so we
  // only check for presence here.
  return null;
}

export function getPrincipalIdFromRequest(request: Request): string {
  const jwt = request.headers.get('CF-Access-JWT-Assertion');
  if (!jwt) return 'anonymous';
  const parts = jwt.split('.');
  if (parts.length !== 3) return 'anonymous';
  try {
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as {
      sub?: string;
      email?: string;
    };
    return payload.sub || payload.email || 'anonymous';
  } catch {
    return 'anonymous';
  }
}
