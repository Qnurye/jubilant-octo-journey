import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { Driver } from 'neo4j-driver';
import type postgres from 'postgres';

export interface HealthStatus {
  milvus: boolean;
  neo4j: boolean;
  postgres: boolean;
  healthy: boolean;
}

export interface HealthCheckClients {
  milvus: MilvusClient | null;
  neo4j: Driver | null;
  postgres: ReturnType<typeof postgres> | null;
}

export const checkMilvusHealth = async (client: MilvusClient | null): Promise<boolean> => {
  if (!client) return false;
  try {
    const health = await client.checkHealth();
    return health.isHealthy;
  } catch {
    return false;
  }
};

export const checkNeo4jHealth = async (driver: Driver | null): Promise<boolean> => {
  if (!driver) return false;
  try {
    await driver.verifyConnectivity();
    return true;
  } catch {
    return false;
  }
};

export const checkPostgresHealth = async (client: ReturnType<typeof postgres> | null): Promise<boolean> => {
  if (!client) return false;
  try {
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
};

export const healthCheck = async (clients: HealthCheckClients): Promise<HealthStatus> => {
  const [milvus, neo4j, postgres] = await Promise.all([
    checkMilvusHealth(clients.milvus),
    checkNeo4jHealth(clients.neo4j),
    checkPostgresHealth(clients.postgres),
  ]);

  return {
    milvus,
    neo4j,
    postgres,
    healthy: milvus && neo4j && postgres,
  };
};
