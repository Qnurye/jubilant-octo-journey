import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { Driver } from 'neo4j-driver';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

import { getMilvusClient, closeMilvusClient } from './clients/milvus';
import { getNeo4jDriver, closeNeo4jDriver } from './clients/neo4j';
import { getPostgresClient, closePostgresClient } from './clients/postgres';
import { healthCheck, type HealthStatus } from './health/index';
import * as postgresSchema from './schema/postgres';

// Re-export schema initialization functions
export { initMilvusCollection, COLLECTION_NAME, VECTOR_DIM } from './schema/milvus';
export {
  initGraphConstraints,
  initGraphFulltextIndexes,
  initGraphSchema,
} from './schema/neo4j';
export * as postgresSchema from './schema/postgres';
export { withRetry, type RetryOptions } from './retry/index';
export type { HealthStatus } from './health/index';

// Re-export commonly used drizzle-orm operators for query building
export { eq, and, or, not, isNull, isNotNull, gt, gte, lt, lte, ne, like, ilike, inArray, sql } from 'drizzle-orm';

type PostgresDb = PostgresJsDatabase<typeof postgresSchema>;

export class DatabaseManager {
  private _milvus: MilvusClient | null = null;
  private _neo4j: Driver | null = null;
  private _postgres: PostgresDb | null = null;
  private _connected = false;

  get milvus(): MilvusClient {
    if (!this._milvus) {
      throw new Error('Milvus client not connected. Call connect() first.');
    }
    return this._milvus;
  }

  get neo4j(): Driver {
    if (!this._neo4j) {
      throw new Error('Neo4j driver not connected. Call connect() first.');
    }
    return this._neo4j;
  }

  get postgres(): PostgresDb {
    if (!this._postgres) {
      throw new Error('Postgres client not connected. Call connect() first.');
    }
    return this._postgres;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    if (this._connected) {
      console.log('DatabaseManager already connected.');
      return;
    }

    console.log('DatabaseManager: Connecting to all databases...');

    // Connect to all databases concurrently
    const [milvusClient, neo4jDriver, postgresDb] = await Promise.all([
      getMilvusClient(),
      getNeo4jDriver(),
      Promise.resolve(getPostgresClient()),
    ]);

    this._milvus = milvusClient;
    this._neo4j = neo4jDriver;
    this._postgres = postgresDb;

    // Store raw postgres client for health checks
    // We need to access it via a workaround since getPostgresClient returns drizzle instance
    // For health checks, we'll run a query through drizzle
    this._connected = true;

    console.log('DatabaseManager: All databases connected successfully.');
  }

  async disconnect(): Promise<void> {
    if (!this._connected) {
      console.log('DatabaseManager already disconnected.');
      return;
    }

    console.log('DatabaseManager: Disconnecting from all databases...');

    await Promise.all([
      closeMilvusClient(),
      closeNeo4jDriver(),
      closePostgresClient(),
    ]);

    this._milvus = null;
    this._neo4j = null;
    this._postgres = null;
    this._connected = false;

    console.log('DatabaseManager: All databases disconnected.');
  }

  async healthCheck(): Promise<HealthStatus> {
    // For postgres health check, we need to use the raw client or run a simple query
    // Since we access through drizzle, we can check by running a simple query
    const milvusHealthy = await this.checkMilvusHealth();
    const neo4jHealthy = await this.checkNeo4jHealth();
    const postgresHealthy = await this.checkPostgresHealth();

    return {
      milvus: milvusHealthy,
      neo4j: neo4jHealthy,
      postgres: postgresHealthy,
      healthy: milvusHealthy && neo4jHealthy && postgresHealthy,
    };
  }

  private async checkMilvusHealth(): Promise<boolean> {
    if (!this._milvus) return false;
    try {
      const health = await this._milvus.checkHealth();
      return health.isHealthy;
    } catch {
      return false;
    }
  }

  private async checkNeo4jHealth(): Promise<boolean> {
    if (!this._neo4j) return false;
    try {
      await this._neo4j.verifyConnectivity();
      return true;
    } catch {
      return false;
    }
  }

  private async checkPostgresHealth(): Promise<boolean> {
    if (!this._postgres) return false;
    try {
      // Use drizzle's execute method to run a simple health check query
      await this._postgres.execute({ sql: 'SELECT 1', params: [] } as never);
      return true;
    } catch {
      // If execute fails, the connection might be down
      return false;
    }
  }
}

// Singleton instance - lazy initialized
let instance: DatabaseManager | null = null;

export const db = new Proxy({} as DatabaseManager, {
  get(_, prop) {
    if (!instance) {
      instance = new DatabaseManager();
    }
    
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    
    // Bind functions to the instance to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    
    return value;
  },
});

// Also export the class for custom instantiation
export { DatabaseManager as default };
