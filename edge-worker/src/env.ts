export interface KVNamespace {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	run<T = unknown>(): Promise<{ results: T[]; success: true; meta: any; error?: never }>;
	all<T = unknown>(): Promise<{ results: T[]; success: true; meta: any; error?: never }>;
	first<T = unknown>(colName?: string): Promise<T | null>;
	raw<T = unknown[]>(): Promise<T>;
}

export interface D1Database {
	prepare(query: string): D1PreparedStatement;
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<any[]>;
	exec(query: string): Promise<{ count: number; duration: number }>;
	dump(): Promise<ArrayBuffer>;
	withSession(constraintOrBookmark?: string): any;
}

export interface DurableObjectId {}

export interface DurableObjectStub {
	fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace {
	idFromName(name: string): DurableObjectId;
	get(id: DurableObjectId): DurableObjectStub;
}

export interface Workflow {
	create(options?: { id?: string; params?: any }): Promise<{
		id: string;
		status(): Promise<{ status: string; output?: any }>;
	}>;
	get(id: string): Promise<{
		id: string;
		status(): Promise<{ status: string; output?: any }>;
	}>;
}

export interface WorkerEnv {
	AI: {
		run: (model: string, input: Record<string, unknown>) => Promise<{ response?: string } | unknown>;
	};
	IDEMPOTENCY_KV: KVNamespace;
	RATE_LIMIT_KV: KVNamespace;
	WORKERS_AI_MODEL_ID?: string;
	DB: D1Database;
	CHAT_SESSIONS: DurableObjectNamespace;
	TRAVEL_PLANNING: Workflow;
	TASK_EXTRACTION: Workflow;
	DAILY_PLANNING: Workflow;
	ANALYTICS_ENGINE?: any;

	// Environment Variables
	ENVIRONMENT?: string;
	DUFFEL_API_KEY?: string;
	RATE_LIMIT_PER_MINUTE?: string;
	RATE_LIMIT_PER_HOUR?: string;
	CF_ACCESS_AUD?: string;
	GOOGLE_CALENDAR_MCP_URL?: string;
	FLIGHTS_MCP_URL?: string;
}

export const SYSTEM_PROMPT =
	'You are Micro Chief of Staff (Micro CoS), a calm, structured chief-of-staff assistant for a busy professional. ' +
	'Always respond in clear, natural-sounding, grammatically correct sentences and finish your thoughts instead of trailing off. ' +
	'Be concise, avoid speculation, do not fabricate facts or events, and focus on clear, actionable answers that help the user manage their work, calendar, and travel.';

export type SseEvent =
	| { type: 'token'; token: string }
	| { type: 'tool_call'; name: string; args: Record<string, unknown> }
	| { type: 'tool_result'; result: Record<string, unknown> }
	| { type: 'done'; message_id: string }
	| { type: 'error'; error: string };

export function encodeSseEvent(encoder: TextEncoder, event: SseEvent): Uint8Array {
	return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function getModelId(env: WorkerEnv): string {
	return env.WORKERS_AI_MODEL_ID ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
}
