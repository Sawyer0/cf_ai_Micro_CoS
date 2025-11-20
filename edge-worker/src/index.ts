/**
 * Main Worker Entry Point
 * 
 * Cloudflare Worker handler with full middleware pipeline
 * Integrates: Router, DI Container, Middleware, Services
 */

import { handleRequest } from './api/router';
import { Logger } from './observability/logger';
import { createContainer } from './config/container';
import { loadConfig } from './config/settings';
import { ChatSessionDO } from './chat-session-do';

// Export Durable Objects
export { ChatSessionDO };

export interface Env {
  // Durable Objects
  CHAT_SESSIONS: DurableObjectNamespace;

  // Bindings
  D1: D1Database;
  KV: KVNamespace;
  AI: any;
  ANALYTICS_ENGINE: any;

  // Environment Variables
  ENVIRONMENT?: string;
  DUFFEL_API_KEY?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  RATE_LIMIT_PER_HOUR?: string;
  WORKERS_AI_MODEL_ID?: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Derive correlation ID once at the top for all paths
    const correlationId = request.headers.get('X-Correlation-ID') || crypto.randomUUID();
    const logger = new Logger('edge-worker');

    try {
      // Load configuration and create DI container once per request
      const config = loadConfig(env);
      const container = createContainer(env, config);

      // Handle request through router with container
      return await handleRequest(request, {
        env,
        ctx,
        container
      });

    } catch (error) {
      logger.error('Unhandled error in Worker', error as Error, {
        correlationId
      });

      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'An unexpected error occurred'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': correlationId
          }
        }
      );
    }
  }
};