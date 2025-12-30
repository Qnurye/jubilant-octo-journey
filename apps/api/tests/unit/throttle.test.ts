/**
 * Throttle Middleware Tests
 *
 * Tests for SC-005: System handles 10-20 concurrent student queries without degradation
 * Tests for T087: Verify concurrent query handling
 * Tests for T088: Request queue/throttling for LLM endpoint
 *
 * @module apps/api/tests/unit/throttle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequestThrottle, ThrottleError } from '../../src/middleware/throttle';

// ============================================================================
// RequestThrottle Tests
// ============================================================================

describe('RequestThrottle', () => {
  describe('Configuration', () => {
    it('should use default configuration', () => {
      const throttle = new RequestThrottle();
      const status = throttle.getStatus();

      expect(status.available).toBe(10); // Default maxConcurrent
    });

    it('should accept custom configuration', () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 5,
        maxQueueSize: 20,
        queueTimeoutMs: 10000,
      });

      const status = throttle.getStatus();
      expect(status.available).toBe(5);
      expect(status.queueCapacity).toBe(20);
    });
  });

  describe('acquire() - Basic functionality', () => {
    it('should acquire slot immediately when under limit', async () => {
      const throttle = new RequestThrottle({ maxConcurrent: 5 });

      await throttle.acquire(); // Should not throw or block

      const status = throttle.getStatus();
      expect(status.active).toBe(1);
      expect(status.available).toBe(4);
    });

    it('should track multiple concurrent acquisitions', async () => {
      const throttle = new RequestThrottle({ maxConcurrent: 5 });

      await throttle.acquire();
      await throttle.acquire();
      await throttle.acquire();

      const status = throttle.getStatus();
      expect(status.active).toBe(3);
      expect(status.available).toBe(2);
    });

    it('should increment totalRequests for each acquire', async () => {
      const throttle = new RequestThrottle({ maxConcurrent: 5 });

      await throttle.acquire();
      await throttle.acquire();

      const metrics = throttle.getMetrics();
      expect(metrics.totalRequests).toBe(2);
    });
  });

  describe('release() - Slot release', () => {
    it('should release slot and increase availability', async () => {
      const throttle = new RequestThrottle({ maxConcurrent: 5 });

      await throttle.acquire();
      expect(throttle.getStatus().active).toBe(1);

      throttle.release();
      expect(throttle.getStatus().active).toBe(0);
      expect(throttle.getStatus().available).toBe(5);
    });

    it('should process queued request when slot is released', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 1,
        maxQueueSize: 5,
        queueTimeoutMs: 5000,
      });

      // Fill the single slot
      await throttle.acquire();

      // Start a second acquire that should queue
      const acquirePromise = throttle.acquire();
      expect(throttle.getStatus().queued).toBe(1);

      // Release the first slot
      throttle.release();

      // The queued request should now acquire
      await acquirePromise;
      expect(throttle.getStatus().active).toBe(1);
      expect(throttle.getStatus().queued).toBe(0);
    });
  });

  describe('Queue behavior', () => {
    it('should queue requests when at capacity', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 2,
        maxQueueSize: 5,
        queueTimeoutMs: 5000,
      });

      // Fill all slots
      await throttle.acquire();
      await throttle.acquire();
      expect(throttle.getStatus().active).toBe(2);
      expect(throttle.getStatus().available).toBe(0);

      // This should queue
      const queuedPromise = throttle.acquire();
      expect(throttle.getStatus().queued).toBe(1);

      // Release one slot to process queue
      throttle.release();
      await queuedPromise;
    });

    it('should reject when queue is full', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 1,
        maxQueueSize: 1,
        queueTimeoutMs: 5000,
      });

      // Fill the slot
      await throttle.acquire();

      // Fill the queue
      const queuedPromise = throttle.acquire(); // This queues

      // This should throw because queue is full
      await expect(throttle.acquire()).rejects.toThrow(ThrottleError);
      await expect(throttle.acquire()).rejects.toThrow('temporarily overloaded');

      // Cleanup
      throttle.release();
      await queuedPromise;
      throttle.release();
    });

    it('should track totalQueued metric', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 1,
        maxQueueSize: 5,
        queueTimeoutMs: 5000,
      });

      await throttle.acquire();

      const queuedPromise = throttle.acquire(); // Should queue

      const metrics = throttle.getMetrics();
      expect(metrics.totalQueued).toBe(1);

      throttle.release();
      await queuedPromise;
      throttle.release();
    });

    it('should track totalRejected metric when queue is full', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 1,
        maxQueueSize: 0, // No queue allowed
        queueTimeoutMs: 5000,
      });

      await throttle.acquire();

      // Should be rejected
      try {
        await throttle.acquire();
      } catch {
        // Expected
      }

      const metrics = throttle.getMetrics();
      expect(metrics.totalRejected).toBe(1);

      throttle.release();
    });
  });

  describe('Queue timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should timeout queued requests after queueTimeoutMs', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 1,
        maxQueueSize: 5,
        queueTimeoutMs: 1000, // 1 second timeout
      });

      await throttle.acquire();

      const queuedPromise = throttle.acquire();

      // Fast-forward time past the timeout
      vi.advanceTimersByTime(1001);

      await expect(queuedPromise).rejects.toThrow(ThrottleError);
      await expect(queuedPromise).rejects.toThrow('timed out');

      // Cleanup
      throttle.release();
    });

    it('should track totalTimedOut metric', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 1,
        maxQueueSize: 5,
        queueTimeoutMs: 1000,
      });

      await throttle.acquire();

      const queuedPromise = throttle.acquire();

      vi.advanceTimersByTime(1001);

      try {
        await queuedPromise;
      } catch {
        // Expected
      }

      const metrics = throttle.getMetrics();
      expect(metrics.totalTimedOut).toBe(1);

      throttle.release();
    });
  });

  describe('Metrics tracking', () => {
    it('should track peak concurrent', async () => {
      const throttle = new RequestThrottle({ maxConcurrent: 5 });

      await throttle.acquire();
      await throttle.acquire();
      await throttle.acquire();

      const peakDuring = throttle.getMetrics().peakConcurrent;

      throttle.release();
      throttle.release();

      const peakAfter = throttle.getMetrics().peakConcurrent;

      expect(peakDuring).toBe(3);
      expect(peakAfter).toBe(3); // Peak should persist
    });

    it('should track peak queue size', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 1,
        maxQueueSize: 10,
        queueTimeoutMs: 30000,
      });

      // Fill slot
      await throttle.acquire();

      // Queue some requests
      const queuedPromises = [
        throttle.acquire(),
        throttle.acquire(),
        throttle.acquire(),
      ];

      const metrics = throttle.getMetrics();
      expect(metrics.peakQueueSize).toBe(3);
      expect(metrics.currentQueueSize).toBe(3);

      // Release to process queue
      for (let i = 0; i < 4; i++) {
        throttle.release();
      }

      await Promise.all(queuedPromises);
    });

    it('should calculate average queue wait time', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 1,
        maxQueueSize: 5,
        queueTimeoutMs: 30000,
      });

      // Fill slot
      await throttle.acquire();

      // Queue a request
      const queuedPromise = throttle.acquire();

      // Wait a bit before releasing
      await new Promise((resolve) => setTimeout(resolve, 50));

      throttle.release();
      await queuedPromise;

      const metrics = throttle.getMetrics();
      expect(metrics.avgQueueWaitMs).toBeGreaterThan(0);

      throttle.release();
    });

    it('should reset metrics', async () => {
      const throttle = new RequestThrottle({ maxConcurrent: 5 });

      await throttle.acquire();
      await throttle.acquire();

      throttle.resetMetrics();

      const metrics = throttle.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalQueued).toBe(0);
      expect(metrics.peakConcurrent).toBe(2); // Current state preserved

      throttle.release();
      throttle.release();
    });
  });

  describe('getStatus()', () => {
    it('should return current status', async () => {
      const throttle = new RequestThrottle({
        maxConcurrent: 5,
        maxQueueSize: 10,
      });

      await throttle.acquire();
      await throttle.acquire();

      const status = throttle.getStatus();

      expect(status.active).toBe(2);
      expect(status.queued).toBe(0);
      expect(status.available).toBe(3);
      expect(status.queueCapacity).toBe(10);

      throttle.release();
      throttle.release();
    });
  });
});

// ============================================================================
// ThrottleError Tests
// ============================================================================

describe('ThrottleError', () => {
  it('should have QUEUE_FULL error type', async () => {
    const throttle = new RequestThrottle({
      maxConcurrent: 1,
      maxQueueSize: 0,
    });

    await throttle.acquire();

    try {
      await throttle.acquire();
    } catch (error) {
      expect(error).toBeInstanceOf(ThrottleError);
      expect((error as ThrottleError).errorType).toBe('QUEUE_FULL');
    }

    throttle.release();
  });

  it('should include metrics in error', async () => {
    const throttle = new RequestThrottle({
      maxConcurrent: 1,
      maxQueueSize: 0,
    });

    await throttle.acquire();

    try {
      await throttle.acquire();
    } catch (error) {
      expect(error).toBeInstanceOf(ThrottleError);
      const metrics = (error as ThrottleError).metrics;
      expect(metrics.currentConcurrent).toBe(1);
    }

    throttle.release();
  });
});

// ============================================================================
// Concurrent Request Handling Tests (SC-005)
// ============================================================================

describe('Concurrent request handling (SC-005)', () => {
  it('should handle 10 concurrent requests without rejection', async () => {
    const throttle = new RequestThrottle({
      maxConcurrent: 10,
      maxQueueSize: 10,
      queueTimeoutMs: 5000,
    });

    // Acquire 10 slots concurrently
    const acquirePromises = Array(10)
      .fill(null)
      .map(() => throttle.acquire());

    await Promise.all(acquirePromises);

    const status = throttle.getStatus();
    expect(status.active).toBe(10);
    expect(status.available).toBe(0);
    expect(status.queued).toBe(0);

    // Release all
    for (let i = 0; i < 10; i++) {
      throttle.release();
    }
  });

  it('should queue requests beyond limit (up to 20 total)', async () => {
    const throttle = new RequestThrottle({
      maxConcurrent: 10,
      maxQueueSize: 10,
      queueTimeoutMs: 5000,
    });

    // Acquire 10 immediately, 10 queued
    const allPromises: Promise<void>[] = [];

    for (let i = 0; i < 20; i++) {
      allPromises.push(throttle.acquire());
    }

    // Wait for first 10 to acquire
    await new Promise((resolve) => setTimeout(resolve, 10));

    const status = throttle.getStatus();
    expect(status.active).toBe(10);
    expect(status.queued).toBe(10);

    // Release all to complete
    for (let i = 0; i < 20; i++) {
      throttle.release();
    }

    await Promise.all(allPromises);
  });

  it('should process queue in FIFO order', async () => {
    const throttle = new RequestThrottle({
      maxConcurrent: 1,
      maxQueueSize: 5,
      queueTimeoutMs: 5000,
    });

    const order: number[] = [];

    // Fill slot
    await throttle.acquire();

    // Queue requests
    const p1 = throttle.acquire().then(() => order.push(1));
    const p2 = throttle.acquire().then(() => order.push(2));
    const p3 = throttle.acquire().then(() => order.push(3));

    // Release to process queue
    throttle.release(); // Releases to p1
    await p1;
    throttle.release(); // Releases to p2
    await p2;
    throttle.release(); // Releases to p3
    await p3;
    throttle.release();

    expect(order).toEqual([1, 2, 3]);
  });
});
