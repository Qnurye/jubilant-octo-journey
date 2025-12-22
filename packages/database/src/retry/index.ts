export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    factor = 2,
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries) {
        throw error;
      }

      console.warn(
        `Operation failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`,
        error instanceof Error ? error.message : String(error)
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      delay = Math.min(delay * factor, maxDelayMs);
    }
  }
}
