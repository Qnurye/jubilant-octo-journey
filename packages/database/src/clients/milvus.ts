import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import config from '../config/index';
import { withRetry } from '../retry/index';

let clientInstance: MilvusClient | null = null;

/**
 * Verifies the Milvus client connection is healthy.
 * Returns true if healthy, false otherwise.
 */
const verifyConnection = async (client: MilvusClient): Promise<boolean> => {
  try {
    const health = await client.checkHealth();
    return health.isHealthy;
  } catch {
    return false;
  }
};

export const getMilvusClient = async (): Promise<MilvusClient> => {
  // If we have an existing client, verify it's still connected
  if (clientInstance) {
    const isHealthy = await verifyConnection(clientInstance);
    if (isHealthy) {
      return clientInstance;
    }
    // Connection is stale, close and reconnect
    console.log('Milvus connection stale, reconnecting...');
    try {
      await clientInstance.closeConnection();
    } catch {
      // Ignore close errors for stale connection
    }
    clientInstance = null;
  }

  const address = `${config.MILVUS_HOST}:${config.MILVUS_PORT}`;
  const username = config.MILVUS_USER;
  const password = config.MILVUS_PASSWORD;

  // We use withRetry to handle initial connection failures (e.g. if Milvus is starting up)
  clientInstance = await withRetry(async () => {
    console.log(`Connecting to Milvus at ${address}...`);
    const client = new MilvusClient({
      address,
      username,
      password,
    });

    // Verify connection by checking health
    const isHealthy = await verifyConnection(client);
    if (!isHealthy) {
      throw new Error(`Failed to connect to Milvus at ${address}: health check failed`);
    }

    console.log('Successfully connected to Milvus');
    return client;
  });

  return clientInstance!;
};

export const closeMilvusClient = async () => {
  if (clientInstance) {
    await clientInstance.closeConnection();
    clientInstance = null;
  }
};
