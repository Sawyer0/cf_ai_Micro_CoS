/**
 * Authentication Middleware
 *
 * Validates Cloudflare Access JWT and extracts principal
 */

import { Principal } from '../../domain/shared/value-objects/principal.vo';

export interface AuthContext {
	principal: Principal;
}

export class AuthenticationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuthenticationError';
	}
}

// In-memory cache for JWKS keys to avoid fetching on every request
let jwksCache: { keys: JsonWebKey[]; expiry: number } | null = null;
const JWKS_CACHE_TTL = 3600 * 1000; // 1 hour

import { Logger } from '../../observability/logger';

export async function requireAuth(request: Request, env: any, logger: Logger): Promise<Principal> {
	// Check bypass header (case-insensitive) or query param
	const url = new URL(request.url);
	const bypass =
		request.headers.get('X-Test-Bypass-Auth') || request.headers.get('x-test-bypass-auth') || url.searchParams.get('bypass_auth');

	if (bypass === 'true') {
		// SECURE: Only allow bypass in development environment
		const isDev = env.ENVIRONMENT === 'development' || !env.ENVIRONMENT;

		if (isDev) {
			logger.info('[Auth] Using bypass auth for development');
			return Principal.create('dev-user', 'dev@example.com');
		} else {
			logger.warn('[Auth] Security Alert: Attempted auth bypass in non-dev environment');
			// Fall through to normal auth check (or throw immediately?)
			// Better to throw to be explicit
			throw new AuthenticationError('Auth bypass not allowed in this environment');
		}
	}

	const authHeader = request.headers.get('Cf-Access-Jwt-Assertion');

	if (!authHeader) {
		throw new AuthenticationError('Missing Cloudflare Access JWT');
	}

	try {
		// Full cryptographic verification
		const payload = await validateJwt(authHeader, env, logger);

		return Principal.create(payload.sub, payload.email);
	} catch (error) {
		logger.error('[Auth] JWT Validation failed', error as Error);
		throw new AuthenticationError('Invalid JWT token');
	}
}

async function validateJwt(token: string, env: any, logger: Logger): Promise<any> {
	const parts = token.split('.');
	if (parts.length !== 3) {
		throw new Error('Invalid JWT format');
	}

	const header = JSON.parse(base64UrlDecode(parts[0]));
	const payload = JSON.parse(base64UrlDecode(parts[1]));

	// 1. Validate Issuer (must be Cloudflare Access)
	if (!payload.iss || !payload.iss.endsWith('.cloudflareaccess.com')) {
		throw new Error('Invalid issuer');
	}

	// 2. Validate Audience (if configured)
	if (env.CF_ACCESS_AUD && payload.aud !== env.CF_ACCESS_AUD) {
		throw new Error('Invalid audience');
	}

	// 3. Validate Expiry
	const now = Math.floor(Date.now() / 1000);
	if (payload.exp && payload.exp < now) {
		throw new Error('Token expired');
	}

	// 4. Verify Signature
	// We need to fetch keys from the issuer
	const keys = await getPublicKeys(payload.iss, logger);
	const isValid = await verifySignature(token, keys, header.kid);

	if (!isValid) {
		throw new Error('Invalid signature');
	}

	return payload;
}

async function getPublicKeys(issuer: string, logger: Logger): Promise<JsonWebKey[]> {
	const now = Date.now();
	if (jwksCache && jwksCache.expiry > now) {
		return jwksCache.keys;
	}

	const certsUrl = `${issuer}/cdn-cgi/access/certs`;
	try {
		const response = await fetch(certsUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch keys from ${certsUrl}`);
		}
		const data: any = await response.json();

		jwksCache = {
			keys: data.keys,
			expiry: now + JWKS_CACHE_TTL,
		};

		return data.keys;
	} catch (error) {
		logger.error('[Auth] Failed to fetch JWKS', error as Error);
		throw error;
	}
}

async function verifySignature(token: string, keys: any[], kid: string): Promise<boolean> {
	const parts = token.split('.');
	const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
	const signature = base64UrlDecodeToUint8Array(parts[2]);

	const keyData = keys.find((k) => k.kid === kid);
	if (!keyData) {
		throw new Error('Key not found');
	}

	const key = await crypto.subtle.importKey('jwk', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);

	return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature as any, data as any);
}

function base64UrlDecode(str: string): string {
	let output = str.replace(/-/g, '+').replace(/_/g, '/');
	switch (output.length % 4) {
		case 0:
			break;
		case 2:
			output += '==';
			break;
		case 3:
			output += '=';
			break;
		default:
			throw new Error('Illegal base64url string!');
	}
	return atob(output);
}

function base64UrlDecodeToUint8Array(str: string): Uint8Array {
	const binaryString = base64UrlDecode(str);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

export function getPrincipalId(request: Request): string | undefined {
	try {
		const authHeader = request.headers.get('Cf-Access-Jwt-Assertion');
		if (!authHeader) return undefined;

		const parts = authHeader.split('.');
		if (parts.length !== 3) return undefined;

		const payload = JSON.parse(base64UrlDecode(parts[1]));
		return payload.sub;
	} catch {
		return undefined;
	}
}
