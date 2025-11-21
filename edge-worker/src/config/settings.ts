/**
 * Configuration Settings
 * 
 * Environment variable access and validation
 */

export interface AppConfig {
    environment: 'development' | 'staging' | 'production';
    duffelApiKey?: string;
    googleCalendarMcpUrl?: string;
    flightsMcpUrl?: string;
    rateLimitPerMinute: number;
    rateLimitPerHour: number;
}

export function loadConfig(env: any): AppConfig {
    const config: AppConfig = {
        environment: env.ENVIRONMENT || 'development',
        duffelApiKey: env.DUFFEL_API_KEY,
        googleCalendarMcpUrl: env.GOOGLE_CALENDAR_MCP_URL || 'http://localhost:3000',
        flightsMcpUrl: env.FLIGHTS_MCP_URL || 'http://localhost:3001',
        rateLimitPerMinute: parseInt(env.RATE_LIMIT_PER_MINUTE || '60', 10),
        rateLimitPerHour: parseInt(env.RATE_LIMIT_PER_HOUR || '1000', 10)
    };

    // Validate required credentials for production
    if (config.environment === 'production') {
        if (!config.duffelApiKey) {
            throw new Error('DUFFEL_API_KEY is required in production');
        }
    }

    return config;
}
