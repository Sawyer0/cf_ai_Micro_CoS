import { Env } from './env';
import { createJsonResponse, createErrorResponse, requireAuth } from './http';
import { estimateTokensFromMessages, applyRateLimit } from './rate-limit';
import { ChatSessionDO } from './chat-session-do';

export { ChatSessionDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const correlationId =
      request.headers.get('X-Correlation-ID') ?? crypto.randomUUID();

    const isApiPath = url.pathname.startsWith('/api/');
    if (isApiPath) {
      const authError = requireAuth(request, correlationId);
      if (authError) {
        return authError;
      }
    }

    if (url.pathname === '/health') {
      return createJsonResponse(
        { status: 'ok', service: 'micro-cos-edge-worker' },
        200,
        correlationId,
      );
    }

    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Method not allowed. Use POST for /api/chat.',
          405,
          correlationId,
        );
      }

      const body = (await request.json().catch(() => null)) as
        | { messages?: unknown; stream?: unknown; tool_choice?: unknown; conversation_id?: unknown }
        | null;

      if (!body || !Array.isArray((body as { messages?: unknown }).messages)) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Request body must include a messages array.',
          400,
          correlationId,
        );
      }

      const messages = (
        body as { messages: Array<{ role?: unknown; content?: unknown }> }
      ).messages;

      const principalId = (() => {
        const jwt = request.headers.get('CF-Access-JWT-Assertion');
        if (!jwt) return 'anonymous';
        const parts = jwt.split('.');
        if (parts.length !== 3) return 'anonymous';
        try {
          const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadJson) as { sub?: string; email?: string };
          return payload.sub || payload.email || 'anonymous';
        } catch {
          return 'anonymous';
        }
      })();

      const tokensEstimate = estimateTokensFromMessages(messages);
      const rateResult = await applyRateLimit(
        env,
        principalId,
        tokensEstimate,
        correlationId,
      );
      if (rateResult.error) {
        return rateResult.error;
      }
      const rateHeaders = rateResult.headers;

      const resolvedConversationId =
        typeof (body as { conversation_id?: unknown }).conversation_id === 'string' &&
        (body as { conversation_id?: unknown }).conversation_id !== ''
          ? ((body as { conversation_id?: string }).conversation_id as string)
          : crypto.randomUUID();

      const sessionId = resolvedConversationId;
      const id = env.CHAT_SESSIONS.idFromName(sessionId as any);
      const stub = env.CHAT_SESSIONS.get(id);
      const forwardBody = JSON.stringify({
        ...body,
        conversation_id: resolvedConversationId,
      });

      const doResponse = await stub.fetch('https://chat-session/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Correlation-ID': correlationId,
          'Idempotency-Key': request.headers.get('Idempotency-Key') ?? '',
          'CF-Access-JWT-Assertion':
            request.headers.get('CF-Access-JWT-Assertion') ?? '',
        },
        body: forwardBody,
      });

      const mergedHeaders = new Headers(doResponse.headers);
      mergedHeaders.set('X-Correlation-ID', correlationId);
      for (const [k, v] of Object.entries(rateHeaders)) {
        mergedHeaders.set(k, v);
      }

      return new Response(doResponse.body, {
        status: doResponse.status,
        headers: mergedHeaders,
      });
    }

    if (url.pathname === '/llm-test') {
      try {
        const aiResult = await env.AI.run(
          env.WORKERS_AI_MODEL_ID ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          {
            prompt:
              'You are Micro CoS, a friendly chief of staff assistant. Reply with EXACTLY ONE short sentence that says hello to the user. Do not add any extra commentary.',
            max_tokens: 48,
          },
        );

        const text =
          (aiResult as { response?: string } | undefined)?.response ??
          String(aiResult);

        return createJsonResponse(
          {
            model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
            message: text,
          },
          200,
          correlationId,
        );
      } catch (error) {
        const message =
          'Workers AI call failed: ' +
          (error instanceof Error ? error.message : String(error));
        return createErrorResponse('LLM_ERROR', message, 500, correlationId);
      }
    }

    return createJsonResponse(
      { message: 'Micro CoS edge worker up', path: url.pathname },
      200,
      correlationId,
    );
  },
};