/**
 * Request Throttling Middleware
 *
 * Implements request queue/throttling for LLM endpoints (T087/T088)
 * to handle 10-20 concurrent users gracefully.
 *
 * Features:
 * - Configurable concurrency limits per endpoint
 * - Request queuing for overflow
 * - Fair queue processing (FIFO)
 * - Graceful timeout for queued requests
 *
 * @module apps/api/middleware/throttle
 */

import type { Context, Next } from 'hono';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Throttle configuration
 */
export interface ThrottleConfig {
  /** Maximum concurrent requests */
  maxConcurrent: number;
  /** Maximum queue size */
  maxQueueSize: number;
  /** Queue timeout in milliseconds */
  queueTimeoutMs: number;
  /** Whether to track metrics */
  trackMetrics: boolean;
}

const DEFAULT_CONFIG: ThrottleConfig = {
  maxConcurrent: 10,   // 10 concurrent LLM requests
  maxQueueSize: 50,    // 50 requests in queue
  queueTimeoutMs: 30000, // 30 second queue timeout
  trackMetrics: true,
};

// ============================================================================
// Metrics
// ============================================================================

/**
 * Throttle metrics for monitoring
 */
export interface ThrottleMetrics {
  currentConcurrent: number;
  currentQueueSize: number;
  totalRequests: number;
  totalQueued: number;
  totalRejected: number;
  totalTimedOut: number;
  avgQueueWaitMs: number;
  peakConcurrent: number;
  peakQueueSize: number;
}

// ============================================================================
// Request Queue
// ============================================================================

/**
 * Queued request waiting for processing
 */
interface QueuedRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Request Throttle Manager
 *
 * Manages concurrent request limits with queuing for overflow.
 */
export class RequestThrottle {
  private config: ThrottleConfig;
  private activeCount = 0;
  private queue: QueuedRequest[] = [];
  private metrics: ThrottleMetrics = {
    currentConcurrent: 0,
    currentQueueSize: 0,
    totalRequests: 0,
    totalQueued: 0,
    totalRejected: 0,
    totalTimedOut: 0,
    avgQueueWaitMs: 0,
    peakConcurrent: 0,
    peakQueueSize: 0,
  };
  private totalQueueWaitMs = 0;
  private processedFromQueue = 0;

  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Acquire a slot for request processing
   *
   * @returns Promise that resolves when slot is available
   * @throws Error if queue is full or timeout occurs
   */
  async acquire(): Promise<void> {
    this.metrics.totalRequests++;

    // If under limit, proceed immediately
    if (this.activeCount < this.config.maxConcurrent) {
      this.activeCount++;
      this.updateMetrics();
      return;
    }

    // Check if queue is full
    if (this.queue.length >= this.config.maxQueueSize) {
      this.metrics.totalRejected++;
      throw new ThrottleError(
        'Service is temporarily overloaded. Please try again later.',
        'QUEUE_FULL',
        this.getMetrics()
      );
    }

    // Add to queue
    this.metrics.totalQueued++;
    return new Promise<void>((resolve, reject) => {
      const enqueuedAt = Date.now();

      const timeoutId = setTimeout(() => {
        // Remove from queue on timeout
        const index = this.queue.findIndex((r) => r.enqueuedAt === enqueuedAt);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.metrics.totalTimedOut++;
          this.updateMetrics();
          reject(new ThrottleError(
            'Request timed out waiting in queue. Please try again.',
            'QUEUE_TIMEOUT',
            this.getMetrics()
          ));
        }
      }, this.config.queueTimeoutMs);

      const queuedRequest: QueuedRequest = {
        resolve: () => {
          clearTimeout(timeoutId);
          const waitTime = Date.now() - enqueuedAt;
          this.totalQueueWaitMs += waitTime;
          this.processedFromQueue++;
          resolve();
        },
        reject,
        enqueuedAt,
        timeoutId,
      };

      this.queue.push(queuedRequest);
      this.updateMetrics();
    });
  }

  /**
   * Release a slot after request completion
   */
  release(): void {
    this.activeCount--;

    // Process next queued request if any
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.activeCount++;
        next.resolve();
      }
    }

    this.updateMetrics();
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    this.metrics.currentConcurrent = this.activeCount;
    this.metrics.currentQueueSize = this.queue.length;
    this.metrics.peakConcurrent = Math.max(
      this.metrics.peakConcurrent,
      this.activeCount
    );
    this.metrics.peakQueueSize = Math.max(
      this.metrics.peakQueueSize,
      this.queue.length
    );
    if (this.processedFromQueue > 0) {
      this.metrics.avgQueueWaitMs =
        this.totalQueueWaitMs / this.processedFromQueue;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): ThrottleMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      currentConcurrent: this.activeCount,
      currentQueueSize: this.queue.length,
      totalRequests: 0,
      totalQueued: 0,
      totalRejected: 0,
      totalTimedOut: 0,
      avgQueueWaitMs: 0,
      peakConcurrent: this.activeCount,
      peakQueueSize: this.queue.length,
    };
    this.totalQueueWaitMs = 0;
    this.processedFromQueue = 0;
  }

  /**
   * Get current status
   */
  getStatus(): {
    active: number;
    queued: number;
    available: number;
    queueCapacity: number;
  } {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      available: Math.max(0, this.config.maxConcurrent - this.activeCount),
      queueCapacity: this.config.maxQueueSize - this.queue.length,
    };
  }
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Throttle error types
 */
export type ThrottleErrorType = 'QUEUE_FULL' | 'QUEUE_TIMEOUT';

/**
 * Custom error for throttle-related failures
 */
export class ThrottleError extends Error {
  public readonly errorType: ThrottleErrorType;
  public readonly metrics: ThrottleMetrics;

  constructor(message: string, errorType: ThrottleErrorType, metrics: ThrottleMetrics) {
    super(message);
    this.name = 'ThrottleError';
    this.errorType = errorType;
    this.metrics = metrics;
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

/**
 * Global throttle instance for LLM/query endpoints
 */
export const queryThrottle = new RequestThrottle({
  maxConcurrent: 10,   // Handle 10 concurrent LLM requests
  maxQueueSize: 30,    // Allow 30 queued requests
  queueTimeoutMs: 60000, // 60 second queue timeout
});

/**
 * Global throttle instance for ingestion endpoints
 */
export const ingestionThrottle = new RequestThrottle({
  maxConcurrent: 3,    // Only 3 concurrent ingestions
  maxQueueSize: 10,    // Allow 10 queued ingestions
  queueTimeoutMs: 300000, // 5 minute queue timeout
});

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create a throttle middleware for a specific throttle instance
 *
 * @param throttle - RequestThrottle instance to use
 * @param endpointName - Name for logging/metrics
 */
export function createThrottleMiddleware(
  throttle: RequestThrottle,
  endpointName: string
) {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();

    try {
      await throttle.acquire();

      // Add queue info to response headers for debugging
      const status = throttle.getStatus();
      c.res.headers.set('X-Throttle-Active', status.active.toString());
      c.res.headers.set('X-Throttle-Queued', status.queued.toString());

      try {
        await next();
      } finally {
        throttle.release();

        // Log slow requests
        const duration = Date.now() - startTime;
        if (duration > 10000) {
          console.info(
            `[${endpointName}] Slow request: ${duration}ms, ` +
            `concurrent: ${status.active}, queued: ${status.queued}`
          );
        }
      }
    } catch (error) {
      if (error instanceof ThrottleError) {
        const status = error.errorType === 'QUEUE_FULL' ? 503 : 504;
        return c.json(
          {
            error: error.errorType,
            message: error.message,
            metrics: {
              currentConcurrent: error.metrics.currentConcurrent,
              currentQueueSize: error.metrics.currentQueueSize,
            },
          },
          status
        );
      }
      throw error;
    }
  };
}

/**
 * Pre-configured middleware for query endpoints
 */
export const queryThrottleMiddleware = createThrottleMiddleware(
  queryThrottle,
  'query'
);

/**
 * Pre-configured middleware for ingestion endpoints
 */
export const ingestionThrottleMiddleware = createThrottleMiddleware(
  ingestionThrottle,
  'ingestion'
);
