/**
 * Chunk Storage Unit Tests
 *
 * Tests for MilvusChunkStorage, Neo4jChunkStorage, and ChunkStorageManager.
 * All database connections are mocked - no real DB needed.
 *
 * @module @jubilant/rag/tests/unit/storage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { Driver } from 'neo4j-driver';
import {
  MilvusChunkStorage,
  Neo4jChunkStorage,
  ChunkStorageManager,
} from '../../src/ingestion/storage';
import type { EmbeddedChunk, ChunkMetadata } from '../../src/types';

// ============================================================================
// Mock Factories
// ============================================================================

function createMockMilvusClient() {
  return {
    insert: vi.fn().mockResolvedValue({ succ_count: 3 }),
    flush: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({ delete_cnt: 5 }),
  } as unknown as MilvusClient;
}

function createMockNeo4jDriver() {
  const mockSession = {
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    session: vi.fn().mockReturnValue(mockSession),
    _mockSession: mockSession, // expose for test assertions
  };
}

function createMockChunkMetadata(overrides: Partial<ChunkMetadata> = {}): ChunkMetadata {
  return {
    documentId: 'doc-1',
    documentTitle: 'Test Document',
    documentUrl: 'https://example.com/doc.md',
    sectionHeader: 'Introduction',
    chunkIndex: 0,
    totalChunks: 3,
    tokenCount: 100,
    hasCode: false,
    hasFormula: false,
    hasTable: false,
    ...overrides,
  };
}

function createMockEmbeddedChunks(count: number): EmbeddedChunk[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i}`,
    content: `Content of chunk ${i}`,
    embedding: [0.1, 0.2, 0.3],
    metadata: createMockChunkMetadata({ chunkIndex: i, totalChunks: count }),
  }));
}

// ============================================================================
// MilvusChunkStorage Tests (A)
// ============================================================================

describe('MilvusChunkStorage', () => {
  let client: MilvusClient;
  let storage: MilvusChunkStorage;

  beforeEach(() => {
    client = createMockMilvusClient();
    storage = new MilvusChunkStorage(client, { milvusBatchSize: 100 });
  });

  describe('insertChunks()', () => {
    it('should return 0 for empty array', async () => {
      const result = await storage.insertChunks([]);

      expect(result).toBe(0);
      expect(client.insert).not.toHaveBeenCalled();
    });

    it('should insert 3 chunks and call client.insert once', async () => {
      const chunks = createMockEmbeddedChunks(3);

      const result = await storage.insertChunks(chunks);

      expect(result).toBe(3);
      expect(client.insert).toHaveBeenCalledTimes(1);
      expect(client.insert).toHaveBeenCalledWith(expect.objectContaining({
        collection_name: 'knowledge_chunks',
        data: expect.arrayContaining([
          expect.objectContaining({
            content_text: 'Content of chunk 0',
            vector: [0.1, 0.2, 0.3],
          }),
        ]),
      }));
    });

    it('should batch 150 chunks into 2 batches with batchSize=100', async () => {
      const chunks = createMockEmbeddedChunks(150);

      const result = await storage.insertChunks(chunks);

      expect(result).toBe(150);
      expect(client.insert).toHaveBeenCalledTimes(2);
    });

    it('should call progress callback correctly', async () => {
      const chunks = createMockEmbeddedChunks(3);
      const progressFn = vi.fn();

      await storage.insertChunks(chunks, progressFn);

      expect(progressFn).toHaveBeenCalledWith(3, 3);
    });

    it('should call progress callback per batch', async () => {
      const chunks = createMockEmbeddedChunks(150);
      const progressFn = vi.fn();

      await storage.insertChunks(chunks, progressFn);

      expect(progressFn).toHaveBeenCalledTimes(2);
      expect(progressFn).toHaveBeenCalledWith(100, 150);
      expect(progressFn).toHaveBeenCalledWith(150, 150);
    });

    it('should call client.flush after insert', async () => {
      const chunks = createMockEmbeddedChunks(3);

      await storage.insertChunks(chunks);

      expect(client.flush).toHaveBeenCalledWith({
        collection_names: ['knowledge_chunks'],
      });
    });

    it('should propagate error when client.insert throws', async () => {
      const chunks = createMockEmbeddedChunks(3);
      (client.insert as any).mockRejectedValue(new Error('Milvus connection lost'));

      await expect(storage.insertChunks(chunks)).rejects.toThrow('Milvus connection lost');
    });

    it('should throw when Milvus insert returns non-success error_code', async () => {
      const chunks = createMockEmbeddedChunks(2);
      (client.insert as any).mockResolvedValue({
        status: { error_code: 1, reason: 'collection not found', extra_info: {}, retriable: false },
      });

      await expect(storage.insertChunks(chunks)).rejects.toThrow('Milvus insert returned error code 1');
      await expect(storage.insertChunks(chunks)).rejects.toThrow('collection not found');
    });

    it('should throw when Milvus insert returns error status string', async () => {
      const chunks = createMockEmbeddedChunks(2);
      (client.insert as any).mockResolvedValue({
        status: { error_code: 'Error', reason: 'quota exceeded', extra_info: {}, retriable: false },
      });

      await expect(storage.insertChunks(chunks)).rejects.toThrow('Milvus insert returned error code Error');
      await expect(storage.insertChunks(chunks)).rejects.toThrow('quota exceeded');
    });

    it('should not throw when insert returns Success status', async () => {
      const chunks = createMockEmbeddedChunks(2);
      (client.insert as any).mockResolvedValue({
        status: { error_code: 'Success', reason: '', extra_info: {}, retriable: false },
        insert_cnt: '2',
      });

      const result = await storage.insertChunks(chunks);
      expect(result).toBe(2);
    });

    it('should use insert_cnt from response when available', async () => {
      const chunks = createMockEmbeddedChunks(5);
      (client.insert as any).mockResolvedValue({
        insert_cnt: '4',
      });

      const result = await storage.insertChunks(chunks);
      // insert_cnt says 4, not batch.length (5)
      expect(result).toBe(4);
    });

    it('should use succ_index array length from response when insert_cnt is absent', async () => {
      const chunks = createMockEmbeddedChunks(5);
      (client.insert as any).mockResolvedValue({
        succ_index: [0, 1, 2],
      });

      const result = await storage.insertChunks(chunks);
      // succ_index has 3 elements
      expect(result).toBe(3);
    });

    it('should fall back to batch.length when neither insert_cnt nor succ_index is present', async () => {
      const chunks = createMockEmbeddedChunks(3);
      (client.insert as any).mockResolvedValue({});

      const result = await storage.insertChunks(chunks);
      expect(result).toBe(3);
    });

    it('should prefer insert_cnt over succ_index when both are present', async () => {
      const chunks = createMockEmbeddedChunks(5);
      (client.insert as any).mockResolvedValue({
        insert_cnt: '4',
        succ_index: [0, 1, 2, 3, 4],
      });

      const result = await storage.insertChunks(chunks);
      // insert_cnt takes precedence
      expect(result).toBe(4);
    });
  });

  describe('deleteByDocumentId()', () => {
    it('should call client.delete with correct filter', async () => {
      (client.delete as any).mockResolvedValue({ delete_cnt: 5 });

      const result = await storage.deleteByDocumentId('doc-1');

      expect(client.delete).toHaveBeenCalledWith({
        collection_name: 'knowledge_chunks',
        filter: 'metadata["documentId"] == "doc-1"',
      });
      expect(result).toBe(5);
    });

    it('should handle string delete_cnt', async () => {
      (client.delete as any).mockResolvedValue({ delete_cnt: '10' });

      const result = await storage.deleteByDocumentId('doc-1');

      expect(result).toBe(10);
    });

    it('should return 0 when delete_cnt is missing', async () => {
      (client.delete as any).mockResolvedValue({});

      const result = await storage.deleteByDocumentId('doc-1');

      expect(result).toBe(0);
    });
  });
});

// ============================================================================
// Neo4jChunkStorage Tests (C)
// ============================================================================

describe('Neo4jChunkStorage', () => {
  let driverMock: ReturnType<typeof createMockNeo4jDriver>;
  let storage: Neo4jChunkStorage;

  beforeEach(() => {
    driverMock = createMockNeo4jDriver();
    storage = new Neo4jChunkStorage(driverMock as unknown as Driver, { neo4jBatchSize: 50 });
  });

  describe('createChunkNodes()', () => {
    it('should return 0 for empty array', async () => {
      const result = await storage.createChunkNodes([], 'https://example.com/doc.md');

      expect(result).toBe(0);
      expect(driverMock._mockSession.run).not.toHaveBeenCalled();
    });

    it('should create Document node first (MERGE)', async () => {
      const chunks = createMockEmbeddedChunks(2);

      await storage.createChunkNodes(chunks, 'https://example.com/doc.md');

      // First call should MERGE a Document node
      const firstCall = driverMock._mockSession.run.mock.calls[0];
      expect(firstCall[0]).toContain('MERGE (d:Document');
      expect(firstCall[1]).toEqual(expect.objectContaining({
        url: 'https://example.com/doc.md',
        title: 'Test Document',
        chunkCount: 2,
      }));
    });

    it('should create Chunk nodes with correct properties', async () => {
      const chunks = createMockEmbeddedChunks(2);

      await storage.createChunkNodes(chunks, 'https://example.com/doc.md');

      // Second call should create chunk nodes
      const chunkCall = driverMock._mockSession.run.mock.calls[1];
      expect(chunkCall[0]).toContain('MERGE (c:Chunk');
      expect(chunkCall[0]).toContain('FROM_DOCUMENT');
      expect(chunkCall[1].chunks).toHaveLength(2);
      expect(chunkCall[1].chunks[0]).toEqual(expect.objectContaining({
        chunkId: 'chunk-0',
        tokenCount: 100,
        hasCode: false,
        hasFormula: false,
        hasTable: false,
        chunkIndex: 0,
      }));
    });

    it('should create NEXT_CHUNK relationships for sequential chunks', async () => {
      const chunks = createMockEmbeddedChunks(3);

      await storage.createChunkNodes(chunks, 'https://example.com/doc.md');

      // Should have a call for NEXT_CHUNK relationships
      const nextChunkCall = driverMock._mockSession.run.mock.calls.find(
        (call: any[]) => call[0].includes('NEXT_CHUNK')
      );
      expect(nextChunkCall).toBeDefined();
      expect(nextChunkCall![1].pairs).toHaveLength(2);
      expect(nextChunkCall![1].pairs[0]).toEqual({ from: 'chunk-0', to: 'chunk-1' });
      expect(nextChunkCall![1].pairs[1]).toEqual({ from: 'chunk-1', to: 'chunk-2' });
    });

    it('should not create NEXT_CHUNK relationships for single chunk', async () => {
      const chunks = createMockEmbeddedChunks(1);

      await storage.createChunkNodes(chunks, 'https://example.com/doc.md');

      // Should not have a call for NEXT_CHUNK
      const nextChunkCall = driverMock._mockSession.run.mock.calls.find(
        (call: any[]) => call[0].includes('NEXT_CHUNK')
      );
      expect(nextChunkCall).toBeUndefined();
    });

    it('should always close session (finally block)', async () => {
      const chunks = createMockEmbeddedChunks(2);

      await storage.createChunkNodes(chunks, 'https://example.com/doc.md');

      expect(driverMock._mockSession.close).toHaveBeenCalled();
    });

    it('should close session even when session.run throws', async () => {
      const chunks = createMockEmbeddedChunks(2);
      driverMock._mockSession.run.mockRejectedValue(new Error('Neo4j unavailable'));

      await expect(
        storage.createChunkNodes(chunks, 'https://example.com/doc.md')
      ).rejects.toThrow('Neo4j unavailable');

      expect(driverMock._mockSession.close).toHaveBeenCalled();
    });

    it('should return correct created count', async () => {
      const chunks = createMockEmbeddedChunks(5);

      const result = await storage.createChunkNodes(chunks, 'https://example.com/doc.md');

      expect(result).toBe(5);
    });

    it('should call progress callback correctly', async () => {
      const chunks = createMockEmbeddedChunks(3);
      const progressFn = vi.fn();

      await storage.createChunkNodes(chunks, 'https://example.com/doc.md', progressFn);

      expect(progressFn).toHaveBeenCalledWith(3, 3);
    });
  });

  describe('deleteByDocumentUrl()', () => {
    it('should delete chunks by document URL', async () => {
      driverMock._mockSession.run.mockResolvedValue({
        records: [{ get: (key: string) => ({ toNumber: () => 5 }) }],
      });

      const result = await storage.deleteByDocumentUrl('https://example.com/doc.md');

      expect(result).toBe(5);
      expect(driverMock._mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        { documentUrl: 'https://example.com/doc.md' }
      );
      expect(driverMock._mockSession.close).toHaveBeenCalled();
    });

    it('should return 0 when no records found', async () => {
      driverMock._mockSession.run.mockResolvedValue({ records: [] });

      const result = await storage.deleteByDocumentUrl('nonexistent');

      expect(result).toBe(0);
    });
  });
});

// ============================================================================
// ChunkStorageManager Tests (D, E)
// ============================================================================

describe('ChunkStorageManager', () => {
  let milvusClient: MilvusClient;
  let neo4jDriver: ReturnType<typeof createMockNeo4jDriver>;
  let manager: ChunkStorageManager;

  beforeEach(() => {
    milvusClient = createMockMilvusClient();
    neo4jDriver = createMockNeo4jDriver();
    manager = new ChunkStorageManager(
      milvusClient,
      neo4jDriver as unknown as Driver
    );
  });

  describe('storeChunks()', () => {
    // D: Happy path
    it('should return counts from both stores when both succeed', async () => {
      const chunks = createMockEmbeddedChunks(3);

      const result = await manager.storeChunks(chunks, 'https://example.com/doc.md');

      expect(result.milvusInserted).toBe(3);
      expect(result.neo4jCreated).toBe(3);
      expect(result.errors).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    // D: Milvus fails, Neo4j still attempted
    it('should catch Milvus error and still attempt Neo4j', async () => {
      const chunks = createMockEmbeddedChunks(3);
      (milvusClient.insert as any).mockRejectedValue(new Error('Milvus down'));

      const result = await manager.storeChunks(chunks, 'https://example.com/doc.md');

      expect(result.milvusInserted).toBe(0);
      expect(result.neo4jCreated).toBe(3);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Milvus insertion failed');
    });

    // D: Neo4j fails
    it('should catch Neo4j error and report it', async () => {
      const chunks = createMockEmbeddedChunks(3);
      neo4jDriver._mockSession.run.mockRejectedValue(new Error('Neo4j down'));

      const result = await manager.storeChunks(chunks, 'https://example.com/doc.md');

      expect(result.milvusInserted).toBe(3);
      expect(result.neo4jCreated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Neo4j creation failed');
    });

    // D: Both fail
    it('should report both errors when both stores fail', async () => {
      const chunks = createMockEmbeddedChunks(3);
      (milvusClient.insert as any).mockRejectedValue(new Error('Milvus down'));
      neo4jDriver._mockSession.run.mockRejectedValue(new Error('Neo4j down'));

      const result = await manager.storeChunks(chunks, 'https://example.com/doc.md');

      expect(result.milvusInserted).toBe(0);
      expect(result.neo4jCreated).toBe(0);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('Milvus');
      expect(result.errors[1]).toContain('Neo4j');
    });

    // D: Duration is calculated
    it('should calculate duration correctly', async () => {
      const chunks = createMockEmbeddedChunks(1);

      const result = await manager.storeChunks(chunks, 'https://example.com/doc.md');

      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    // D: Progress callback forwarded
    it('should forward progress callback to both stores', async () => {
      const chunks = createMockEmbeddedChunks(3);
      const progressFn = vi.fn();

      await manager.storeChunks(chunks, 'https://example.com/doc.md', progressFn);

      // Progress should have been called for both milvus and neo4j phases
      const milvusCalls = progressFn.mock.calls.filter(
        (call: any[]) => call[0].phase === 'milvus'
      );
      const neo4jCalls = progressFn.mock.calls.filter(
        (call: any[]) => call[0].phase === 'neo4j'
      );

      expect(milvusCalls.length).toBeGreaterThanOrEqual(1);
      expect(neo4jCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // E: deleteChunks
  describe('deleteChunks()', () => {
    it('should call both milvus.deleteByDocumentId and neo4j.deleteByDocumentUrl in parallel', async () => {
      (milvusClient.delete as any).mockResolvedValue({ delete_cnt: 3 });
      neo4jDriver._mockSession.run.mockResolvedValue({
        records: [{ get: () => ({ toNumber: () => 3 }) }],
      });

      await manager.deleteChunks('https://example.com/doc.md', 'doc-1');

      // Milvus delete should be called
      expect(milvusClient.delete).toHaveBeenCalledWith(expect.objectContaining({
        collection_name: 'knowledge_chunks',
        filter: expect.stringContaining('doc-1'),
      }));

      // Neo4j delete should be called
      expect(neo4jDriver._mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        { documentUrl: 'https://example.com/doc.md' }
      );
    });
  });
});
