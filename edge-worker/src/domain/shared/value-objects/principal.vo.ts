/**
 * Principal - Authenticated user identity
 * 
 * Value Object from Shared Kernel
 * Represents the authenticated user across all bounded contexts
 */

export class Principal {
    readonly sub: string;  // Subject (user ID from Cloudflare Access JWT)
    readonly email?: string;

    private constructor(sub: string, email?: string) {
        if (!sub || sub.trim().length === 0) {
            throw new Error('Principal sub cannot be empty');
        }
        this.sub = sub;
        this.email = email;
    }

    static create(sub: string, email?: string): Principal {
        return new Principal(sub, email);
    }

    get id(): string {
        return this.sub;
    }

    equals(other: Principal): boolean {
        return this.sub === other.sub;
    }

    toString(): string {
        return this.email || this.sub;
    }
}
