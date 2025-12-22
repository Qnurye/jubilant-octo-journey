import { describe, it, expect, vi } from 'vitest';
import {
  checkMilvusHealth,
  checkNeo4jHealth,
  checkPostgresHealth,
  healthCheck,
  type HealthCheckClients,
} from '../../src/health/index';

describe('Health Check Functions', () => {
  describe('checkMilvusHealth', () => {
    it('should return false when client is null', async () => {
      const result = await checkMilvusHealth(null);
      expect(result).toBe(false);
    });

    it('should return true when checkHealth returns isHealthy: true', async () => {
      const mockClient = {
        checkHealth: vi.fn().mockResolvedValue({ isHealthy: true }),
      };
      const result = await checkMilvusHealth(mockClient as never);
      expect(result).toBe(true);
      expect(mockClient.checkHealth).toHaveBeenCalled();
    });

    it('should return false when checkHealth returns isHealthy: false', async () => {
      const mockClient = {
        checkHealth: vi.fn().mockResolvedValue({ isHealthy: false }),
      };
      const result = await checkMilvusHealth(mockClient as never);
      expect(result).toBe(false);
    });

    it('should return false when checkHealth throws', async () => {
      const mockClient = {
        checkHealth: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      const result = await checkMilvusHealth(mockClient as never);
      expect(result).toBe(false);
    });
  });

  describe('checkNeo4jHealth', () => {
    it('should return false when driver is null', async () => {
      const result = await checkNeo4jHealth(null);
      expect(result).toBe(false);
    });

    it('should return true when verifyConnectivity succeeds', async () => {
      const mockDriver = {
        verifyConnectivity: vi.fn().mockResolvedValue(undefined),
      };
      const result = await checkNeo4jHealth(mockDriver as never);
      expect(result).toBe(true);
      expect(mockDriver.verifyConnectivity).toHaveBeenCalled();
    });

    it('should return false when verifyConnectivity throws', async () => {
      const mockDriver = {
        verifyConnectivity: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };
      const result = await checkNeo4jHealth(mockDriver as never);
      expect(result).toBe(false);
    });
  });

  describe('checkPostgresHealth', () => {
    it('should return false when client is null', async () => {
      const result = await checkPostgresHealth(null);
      expect(result).toBe(false);
    });

    it('should return true when query succeeds', async () => {
      // postgres.js uses tagged template literals, so we mock it as a function
      const mockClient = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
      const result = await checkPostgresHealth(mockClient as never);
      expect(result).toBe(true);
    });

    it('should return false when query throws', async () => {
      const mockClient = vi.fn().mockRejectedValue(new Error('Database unavailable'));
      const result = await checkPostgresHealth(mockClient as never);
      expect(result).toBe(false);
    });
  });

  describe('healthCheck (aggregated)', () => {
    it('should return all false when all clients are null', async () => {
      const clients: HealthCheckClients = {
        milvus: null,
        neo4j: null,
        postgres: null,
      };
      const result = await healthCheck(clients);
      expect(result).toEqual({
        milvus: false,
        neo4j: false,
        postgres: false,
        healthy: false,
      });
    });

    it('should return healthy: true only when all services are healthy', async () => {
      const mockMilvus = {
        checkHealth: vi.fn().mockResolvedValue({ isHealthy: true }),
      };
      const mockNeo4j = {
        verifyConnectivity: vi.fn().mockResolvedValue(undefined),
      };
      const mockPostgres = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

      const clients: HealthCheckClients = {
        milvus: mockMilvus as never,
        neo4j: mockNeo4j as never,
        postgres: mockPostgres as never,
      };

      const result = await healthCheck(clients);
      expect(result).toEqual({
        milvus: true,
        neo4j: true,
        postgres: true,
        healthy: true,
      });
    });

    it('should return healthy: false when one service is unhealthy', async () => {
      const mockMilvus = {
        checkHealth: vi.fn().mockResolvedValue({ isHealthy: true }),
      };
      const mockNeo4j = {
        verifyConnectivity: vi.fn().mockRejectedValue(new Error('Down')),
      };
      const mockPostgres = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

      const clients: HealthCheckClients = {
        milvus: mockMilvus as never,
        neo4j: mockNeo4j as never,
        postgres: mockPostgres as never,
      };

      const result = await healthCheck(clients);
      expect(result).toEqual({
        milvus: true,
        neo4j: false,
        postgres: true,
        healthy: false,
      });
    });

    it('should return healthy: false when multiple services are unhealthy', async () => {
      const mockMilvus = {
        checkHealth: vi.fn().mockResolvedValue({ isHealthy: false }),
      };
      const mockNeo4j = {
        verifyConnectivity: vi.fn().mockRejectedValue(new Error('Down')),
      };
      const mockPostgres = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

      const clients: HealthCheckClients = {
        milvus: mockMilvus as never,
        neo4j: mockNeo4j as never,
        postgres: mockPostgres as never,
      };

      const result = await healthCheck(clients);
      expect(result).toEqual({
        milvus: false,
        neo4j: false,
        postgres: true,
        healthy: false,
      });
    });

    it('should run health checks concurrently', async () => {
      const startTimes: number[] = [];

      const mockMilvus = {
        checkHealth: vi.fn().mockImplementation(async () => {
          startTimes.push(Date.now());
          await new Promise((r) => setTimeout(r, 50));
          return { isHealthy: true };
        }),
      };
      const mockNeo4j = {
        verifyConnectivity: vi.fn().mockImplementation(async () => {
          startTimes.push(Date.now());
          await new Promise((r) => setTimeout(r, 50));
        }),
      };
      const mockPostgres = vi.fn().mockImplementation(async () => {
        startTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 50));
        return [{ '?column?': 1 }];
      });

      const clients: HealthCheckClients = {
        milvus: mockMilvus as never,
        neo4j: mockNeo4j as never,
        postgres: mockPostgres as never,
      };

      const start = Date.now();
      await healthCheck(clients);
      const duration = Date.now() - start;

      // If sequential, would take ~150ms. If concurrent, should be ~50-70ms
      expect(duration).toBeLessThan(120);

      // All checks should start within a small window (concurrent execution)
      const maxDiff = Math.max(...startTimes) - Math.min(...startTimes);
      expect(maxDiff).toBeLessThan(20);
    });
  });
});
