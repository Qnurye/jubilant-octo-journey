/**
 * Metrics Middleware
 *
 * Provides request timing and logging for API endpoints.
 *
 * @module apps/api/middleware/metrics
 */

import type { Context, Next } from 'hono';

/**
 * Request metrics collected during processing
 */
export interface RequestMetrics {
  /** Request start timestamp */
  startTime: number;
  /** Request path */
  path: string;
  /** HTTP method */
  method: string;
  /** Response status code */
  statusCode?: number;
  /** Total request duration in milliseconds */
  durationMs?: number;
  /** Request ID for tracing */
  requestId: string;
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Metrics middleware for request timing and logging
 *
 * Adds the following to the context:
 * - c.set('requestId', string) - Unique request identifier
 * - c.set('startTime', number) - Request start timestamp
 */
export async function metricsMiddleware(c: Context, next: Next): Promise<Response | void> {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Store metrics in context for use by handlers
  c.set('requestId', requestId);
  c.set('startTime', startTime);

  // Add request ID to response headers
  c.header('X-Request-ID', requestId);

  // Log incoming request
  const method = c.req.method;
  const path = c.req.path;

  console.log(JSON.stringify({
    type: 'request',
    requestId,
    method,
    path,
    timestamp: new Date(startTime).toISOString(),
  }));

  try {
    await next();
  } catch (error) {
    // Log error
    const durationMs = Date.now() - startTime;
    console.error(JSON.stringify({
      type: 'error',
      requestId,
      method,
      path,
      durationMs,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }));
    throw error;
  }

  // Log response
  const durationMs = Date.now() - startTime;
  const statusCode = c.res.status;

  console.log(JSON.stringify({
    type: 'response',
    requestId,
    method,
    path,
    statusCode,
    durationMs,
  }));

  // Add timing header
  c.header('X-Response-Time', `${durationMs}ms`);
}

/**
 * Get request metrics from context
 */
export function getRequestMetrics(c: Context): Partial<RequestMetrics> {
  return {
    requestId: c.get('requestId'),
    startTime: c.get('startTime'),
    path: c.req.path,
    method: c.req.method,
  };
}

/**
 * Calculate duration from start time
 */
export function calculateDuration(startTime: number): number {
  return Date.now() - startTime;
}

/**
 * Middleware to track specific operation timing
 */
export function createTimingContext(): {
  start: () => void;
  end: () => number;
  elapsed: () => number;
} {
  let startTime = 0;
  let endTime = 0;

  return {
    start: () => {
      startTime = Date.now();
    },
    end: () => {
      endTime = Date.now();
      return endTime - startTime;
    },
    elapsed: () => {
      return (endTime || Date.now()) - startTime;
    },
  };
}
