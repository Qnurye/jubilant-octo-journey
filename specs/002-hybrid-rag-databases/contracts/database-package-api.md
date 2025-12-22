# Contract: Database Package API

**Status**: Phase 1 Design
**Date**: 2025-12-22
**Type**: TypeScript Library Interface

## Overview

The `@jubilant/database` package exports a singleton client manager and typed accessors for all three database systems.

## Configuration Interface

```typescript
export interface DatabaseConfig {
  milvus: {
    address: string; // e.g., "localhost:19530"
    username?: string;
    password?: string;
  };
  neo4j: {
    uri: string; // e.g., "bolt://localhost:7687"
    user: string;
    password: string;
  };
  postgres: {
    url: string; // e.g., "postgres://user:pass@localhost:5432/db"
    maxConnections: number;
  };
}
```

## Main Client Exports

```typescript
/**
 * Main entry point for database connections.
 * Handles initialization, health checks, and graceful shutdown.
 */
export class DatabaseManager {
  constructor(config: DatabaseConfig);

  /**
   * Connects to all configured databases with exponential backoff.
   * Throws error if any connection fails after max retries.
   */
  connect(): Promise<void>;

  /**
   * Closes all database connections.
   */
  disconnect(): Promise<void>;

  /**
   * Returns a unified health status.
   */
  healthCheck(): Promise<{
    milvus: boolean;
    neo4j: boolean;
    postgres: boolean;
    healthy: boolean;
  }>;

  /**
   * Accessors for raw clients
   */
  get milvus(): MilvusClient; // @zilliz/milvus2-sdk-node
  get neo4j(): Driver;        // neo4j-driver
  get postgres(): PostgresJsDatabase; // drizzle-orm/postgres-js
}

/**
 * Singleton instance, auto-configured from process.env
 */
export const db: DatabaseManager;
```

## Utility Functions

```typescript
/**
 * Schema management
 */
export const schema: {
  /**
   * Pushes the current Drizzle schema to the Postgres database.
   * Useful for development/testing initialization.
   */
  syncPostgres(): Promise<void>;

  /**
   * Creates the Milvus collection and index if they don't exist.
   */
  initMilvusCollection(): Promise<void>;

  /**
   * Creates initial Neo4j constraints (uniqueness).
   */
  initGraphConstraints(): Promise<void>;
};
```
