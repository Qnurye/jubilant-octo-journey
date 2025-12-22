import { describe, it, expect, afterAll } from 'vitest';
import { getMilvusClient, closeMilvusClient } from '../../src/clients/milvus';
import { initMilvusCollection, COLLECTION_NAME, VECTOR_DIM } from '../../src/schema/milvus';

// Integration tests require running Docker containers
// Use longer timeout for Milvus operations which can be slow on startup
describe('Milvus Integration', () => {

  it('should connect to Milvus and initialize collection', async () => {
    const client = await getMilvusClient();
    expect(client).toBeDefined();

    await initMilvusCollection(client);

    const hasCollection = await client.hasCollection({ collection_name: COLLECTION_NAME });
    expect(hasCollection.value).toBe(true);
  }, 30000);

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

    // Small delay for near real-time visibility
    await new Promise(resolve => setTimeout(resolve, 1000));

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
  }, 30000);

  afterAll(async () => {
    // Cleanup: Drop collection to keep state clean? Or just leave it?
    // Leaving it is better for debugging usually.
    // We definitely close the client.
    await closeMilvusClient();
  });
});
