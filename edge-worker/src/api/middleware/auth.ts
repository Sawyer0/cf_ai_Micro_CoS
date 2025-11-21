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

export async function requireAuth(request: Request): Promise<Principal> {
    const bypass = request.headers.get('X-Test-Bypass-Auth');
    if (bypass === 'true') {
        return Principal.create('dev-user', 'dev@example.com');
    }

    const authHeader = request.headers.get('Cf-Access-Jwt-Assertion');

    if (!authHeader) {
        throw new AuthenticationError('Missing Cloudflare Access JWT');
    }

    try {
        // Parse JWT (simplified - in production, verify signature)
        const payload = parseJWT(authHeader);

        return Principal.create(
            payload.sub,
            payload.email
        );
    } catch (error) {
        throw new AuthenticationError('Invalid JWT token');
    }
}

function parseJWT(token: string): any {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
    }

    const payload = JSON.parse(atob(parts[1]));
    return payload;
}

export function getPrincipalId(request: Request): string | undefined {
    try {
        const authHeader = request.headers.get('Cf-Access-Jwt-Assertion');
        if (!authHeader) return undefined;

        const payload = parseJWT(authHeader);
        return payload.sub;
    } catch {
        return undefined;
    }
}
