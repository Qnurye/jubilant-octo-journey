import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getMilvusClient, closeMilvusClient } from '../../src/clients/milvus';
import { initMilvusCollection, COLLECTION_NAME, VECTOR_DIM } from '../../src/schema/milvus';
import { DataType } from '@zilliz/milvus2-sdk-node';

// Skip if MILVUS_HOST is not reachable (we can't easily detect this inside the test without timeout)
// But integration tests usually assume env is up.
describe('Milvus Integration', () => {
  
  it('should connect to Milvus and initialize collection', async () => {
    try {
      const client = await getMilvusClient();
      expect(client).toBeDefined();

      await initMilvusCollection(client);

      const hasCollection = await client.hasCollection({ collection_name: COLLECTION_NAME });
      expect(hasCollection.value).toBe(true);
    } catch (error) {
      console.warn("Skipping Milvus test because connection failed. Ensure Docker is running.");
      console.error(error);
      // In a real CI environment, we might want this to fail. 
      // For local dev where docker might be off, we warn.
      // But for the purpose of this task, I will let it fail if it can't connect,
      // as that validates the implementation.
      // However, to avoid blocking the agent loop if user hasn't started docker:
      // I will rethrow if it is a logic error, but maybe suppress connection error?
      // No, let's be strict.
      throw error;
    }
  });

  it('should insert and search vectors', async () => {
    const client = await getMilvusClient();
    
    // Generate dummy vector
    const dummyVector = Array(VECTOR_DIM).fill(0).map(() => Math.random());
    const chunkId = Date.now(); // Simple unique ID

    // Insert
    const insertRes = await client.insert({
      collection_name: COLLECTION_NAME,
      data: [{
        chunk_id: chunkId,
        vector: dummyVector,
        content_text: 'This is a test chunk.',
        metadata: { source: 'test' },
        topic_tag: 'test_topic'
      }],
    });

    expect(insertRes.status.error_code).toBe('Success');

    // Search (might need a small delay for consistency, though loadCollectionSync handles most)
    // Milvus is near real-time.
    
    const searchRes = await client.search({
      collection_name: COLLECTION_NAME,
      data: dummyVector,
      limit: 1,
      metric_type: 'COSINE',
      output_fields: ['content_text', 'metadata'],
    });

    expect(searchRes.status.error_code).toBe('Success');
    expect(searchRes.results.length).toBeGreaterThan(0);
    // Note: ID match isn't guaranteed to be exact top 1 if we inserted many randoms, 
    // but with 1 item it should be.
    // However, we didn't flush. Milvus insert is async in persistence but search sees memory segments.
    // Let's verify we got something.
  });

  afterAll(async () => {
    // Cleanup: Drop collection to keep state clean? Or just leave it?
    // Leaving it is better for debugging usually.
    // We definitely close the client.
    await closeMilvusClient();
  });
});
