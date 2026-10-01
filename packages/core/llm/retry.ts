/**
 * Exponential backoff and retry helper for API resilience.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 10000;
  const backoffFactor = options.backoffFactor ?? 2;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const isRateLimit =
        error?.status === 429 ||
        error?.message?.includes('429') ||
        error?.message?.includes('RESOURCE_EXHAUSTED') ||
        error?.message?.includes('quota');

      if (attempt > maxRetries || !isRateLimit) {
        throw error;
      }

      // Add jitter
      const jitter = Math.random() * 200;
      const actualDelay = Math.min(delay + jitter, maxDelayMs);
      console.warn(`[Retry] API rate limited (attempt ${attempt}/${maxRetries}). Backing off for ${Math.round(actualDelay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
      delay *= backoffFactor;
    }
  }
}
