import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import config from '../config/index';
import { withRetry } from '../retry/index';

let clientInstance: MilvusClient | null = null;

export const getMilvusClient = async (): Promise<MilvusClient> => {
  if (clientInstance) {
    // Basic check if client is connected? Milvus SDK doesn't always expose isConnected clearly in all versions,
    // but usually we trust the instance if it exists.
    return clientInstance;
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

    // Verify connection by checking health or server info
    // checkHealth() is available in newer SDKs
    try {
        await client.checkHealth();
    } catch (e) {
         // Fallback or re-throw
         throw new Error(`Failed to connect to Milvus at ${address}: ${e instanceof Error ? e.message : String(e)}`);
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
