/**
 * Health Check Routes
 *
 * Provides endpoints for monitoring system health:
 * - GET /api/health - Full health check with all components
 * - GET /api/health/ready - Kubernetes readiness probe
 * - GET /api/health/live - Kubernetes liveness probe
 *
 * @module apps/api/routes/health
 */

import { Hono } from 'hono';
import { db } from '@jubilant/database';
import { checkLLMHealth } from '@jubilant/rag';
import type { HealthResponse, ComponentHealth } from '@jubilant/rag';

const health = new Hono();

/**
 * Check database health (Milvus, Neo4j, PostgreSQL)
 */
async function checkDatabaseHealth(): Promise<{
  milvus: ComponentHealth;
  neo4j: ComponentHealth;
  postgres: ComponentHealth;
}> {
  const results = await Promise.allSettled([
    checkMilvusHealth(),
    checkNeo4jHealth(),
    checkPostgresHealth(),
  ]);

  return {
    milvus: results[0].status === 'fulfilled'
      ? results[0].value
      : { healthy: false, message: 'Check failed' },
    neo4j: results[1].status === 'fulfilled'
      ? results[1].value
      : { healthy: false, message: 'Check failed' },
    postgres: results[2].status === 'fulfilled'
      ? results[2].value
      : { healthy: false, message: 'Check failed' },
  };
}

async function checkMilvusHealth(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    // Simple connection check
    if (db.milvus) {
      await db.milvus.listCollections();
      return { healthy: true, latencyMs: Date.now() - start };
    }
    return { healthy: false, message: 'Milvus client not initialized' };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkNeo4jHealth(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    if (db.neo4j) {
      const session = db.neo4j.session();
      try {
        await session.run('RETURN 1');
        return { healthy: true, latencyMs: Date.now() - start };
      } finally {
        await session.close();
      }
    }
    return { healthy: false, message: 'Neo4j client not initialized' };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkPostgresHealth(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    if (db.postgres) {
      // Use raw SQL through drizzle
      await db.postgres.execute({ sql: 'SELECT 1', params: [] } as never);
      return { healthy: true, latencyMs: Date.now() - start };
    }
    return { healthy: false, message: 'PostgreSQL client not initialized' };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * GET /api/health
 *
 * Full health check including all system components
 */
health.get('/', async (c) => {
  const [dbHealth, llmHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkLLMHealth(),
  ]);

  const response: HealthResponse = {
    healthy:
      dbHealth.milvus.healthy &&
      dbHealth.neo4j.healthy &&
      dbHealth.postgres.healthy &&
      llmHealth.llm.healthy &&
      llmHealth.embedding.healthy &&
      llmHealth.reranker.healthy,
    components: {
      milvus: dbHealth.milvus,
      neo4j: dbHealth.neo4j,
      postgres: dbHealth.postgres,
      llm: llmHealth.llm,
      embedding: llmHealth.embedding,
      reranker: llmHealth.reranker,
    },
    timestamp: new Date().toISOString(),
  };

  const status = response.healthy ? 200 : 503;
  return c.json(response, status);
});

/**
 * GET /api/health/ready
 *
 * Kubernetes readiness probe - returns 200 if service is ready to accept traffic
 */
health.get('/ready', async (c) => {
  try {
    // Check critical dependencies
    const [dbHealth, llmHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkLLMHealth(),
    ]);

    const isReady =
      dbHealth.postgres.healthy &&
      dbHealth.milvus.healthy &&
      llmHealth.llm.healthy;

    if (isReady) {
      return c.json({ ready: true }, 200);
    }

    return c.json({ ready: false, reason: 'Dependencies not ready' }, 503);
  } catch (error) {
    return c.json({ ready: false, reason: 'Health check failed' }, 503);
  }
});

/**
 * GET /api/health/live
 *
 * Kubernetes liveness probe - returns 200 if service is alive
 */
health.get('/live', async (c) => {
  // Liveness just checks if the service is running
  return c.json({ alive: true }, 200);
});

export default health;
