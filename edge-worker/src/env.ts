export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<{ results?: T[] } | undefined>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface DurableObjectId {}

export interface DurableObjectStub {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface Env {
  AI: {
    run: (
      model: string,
      input: Record<string, unknown>,
    ) => Promise<{ response?: string } | unknown>;
  };
  IDEMPOTENCY_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  WORKERS_AI_MODEL_ID?: string;
  DB: D1Database;
  CHAT_SESSIONS: DurableObjectNamespace;
}

export const SYSTEM_PROMPT =
  'You are Micro Chief of Staff (Micro CoS), a calm, structured chief-of-staff assistant for a busy professional. Be concise, avoid speculation, do not fabricate facts or events, and focus on clear, actionable answers that help the user manage their work, calendar, and travel.';

export type SseEvent =
  | { type: 'token'; token: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; result: Record<string, unknown> }
  | { type: 'done'; message_id: string }
  | { type: 'error'; error: string };

export function encodeSseEvent(encoder: TextEncoder, event: SseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function getModelId(env: Env): string {
  return env.WORKERS_AI_MODEL_ID ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
}
