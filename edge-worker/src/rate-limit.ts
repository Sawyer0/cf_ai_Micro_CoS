import type { Env } from './env';

export function estimateTokensFromMessages(
  messages: Array<{ role?: unknown; content?: unknown }>,
): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') {
      chars += m.content.length;
    }
  }
  return Math.max(1, Math.ceil(chars / 4));
}

export async function applyRateLimit(
  env: Env,
  principalId: string,
  tokensEstimate: number,
  correlationId: string,
): Promise<{ error?: Response; headers: Record<string, string> }> {
  const now = Date.now();

  const chatLimit = 60;
  const chatWindowSeconds = 60;
  const chatWindowStartSec =
    Math.floor(now / 1000 / chatWindowSeconds) * chatWindowSeconds;
  const chatKey = `rate:chat:${principalId}:${chatWindowStartSec}`;

  let chatCount = 0;
  try {
    const existing = await env.RATE_LIMIT_KV.get(chatKey);
    if (existing) {
      chatCount = parseInt(existing, 10) || 0;
    }
  } catch {}

  if (chatCount >= chatLimit) {
    const reset = chatWindowStartSec + chatWindowSeconds;
    const headers = {
      'X-RateLimit-Limit': String(chatLimit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(reset),
    };
    return {
      error: new Response(
        JSON.stringify({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Chat rate limit exceeded (messages per minute).',
            details: { resource: 'chat', limit: chatLimit, used: chatCount },
            correlation_id: correlationId,
            timestamp: new Date().toISOString(),
          },
        }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'X-Correlation-ID': correlationId,
            ...headers,
          },
        },
      ),
      headers,
    };
  }

  const tokenLimit = 100_000;
  const date = new Date(now);
  const dayKey = date.toISOString().slice(0, 10);
  const tokensKey = `rate:tokens:${principalId}:${dayKey}`;

  let tokensUsed = 0;
  try {
    const existing = await env.RATE_LIMIT_KV.get(tokensKey);
    if (existing) {
      tokensUsed = parseInt(existing, 10) || 0;
    }
  } catch {}

  if (tokensUsed + tokensEstimate > tokenLimit) {
    const resetDate = new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    );
    const resetEpoch = Math.floor(resetDate.getTime() / 1000);
    const headers = {
      'X-RateLimit-Limit': String(chatLimit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(resetEpoch),
    };
    return {
      error: new Response(
        JSON.stringify({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'LLM token limit exceeded for today.',
            details: {
              resource: 'tokens',
              limit: tokenLimit,
              used: tokensUsed,
              attempt: tokensEstimate,
            },
            correlation_id: correlationId,
            timestamp: new Date().toISOString(),
          },
        }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'X-Correlation-ID': correlationId,
            ...headers,
          },
        },
      ),
      headers,
    };
  }

  try {
    await env.RATE_LIMIT_KV.put(
      chatKey,
      String(chatCount + 1),
      { expirationTtl: chatWindowSeconds + 5 },
    );
  } catch {}

  try {
    tokensUsed += tokensEstimate;
    const endOfDay = new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    );
    const ttlSeconds = Math.max(60, Math.floor((endOfDay.getTime() - now) / 1000));
    await env.RATE_LIMIT_KV.put(tokensKey, String(tokensUsed), {
      expirationTtl: ttlSeconds,
    });
  } catch {}

  const remaining = Math.max(0, chatLimit - (chatCount + 1));
  const reset = chatWindowStartSec + chatWindowSeconds;
  return {
    headers: {
      'X-RateLimit-Limit': String(chatLimit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(reset),
    },
  };
}
