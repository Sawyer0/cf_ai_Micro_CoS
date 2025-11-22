import { Logger } from '../observability/logger';

export interface RetryOptions {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors?: (error: any) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 2000,
    backoffMultiplier: 2
};

export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = DEFAULT_RETRY_OPTIONS,
    logger: Logger,
    context: { correlationId?: string; operation: string }
): Promise<T> {
    let lastError: any;
    let delay = options.initialDelayMs;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            const isRetryable = options.retryableErrors ? options.retryableErrors(error) : true;
            if (!isRetryable || attempt === options.maxAttempts) {
                throw error;
            }

            logger.warn(`Retry attempt ${attempt}/${options.maxAttempts} failed for ${context.operation}`, {
                correlationId: context.correlationId,
                metadata: {
                    error: error instanceof Error ? error.message : String(error),
                    nextRetryDelayMs: delay
                }
            });

            await new Promise(resolve => setTimeout(resolve, delay));

            // Exponential backoff with jitter
            delay = Math.min(
                delay * options.backoffMultiplier * (1 + Math.random() * 0.1),
                options.maxDelayMs
            );
        }
    }

    throw lastError;
}
