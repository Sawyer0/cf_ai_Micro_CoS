/**
 * Configuration Settings
 * 
 * Environment variable access and validation
 */

export interface AppConfig {
    environment: 'development' | 'staging' | 'production';
    duffelApiKey?: string;
    rateLimitPerMinute: number;
    rateLimitPerHour: number;
}

export function loadConfig(env: any): AppConfig {
    return {
        environment: env.ENVIRONMENT || 'development',
        duffelApiKey: env.DUFFEL_API_KEY,
        rateLimitPerMinute: parseInt(env.RATE_LIMIT_PER_MINUTE || '60', 10),
        rateLimitPerHour: parseInt(env.RATE_LIMIT_PER_HOUR || '1000', 10)
    };
}
