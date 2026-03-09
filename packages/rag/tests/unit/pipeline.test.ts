/**
 * Ingestion Pipeline Unit Tests
 *
 * Tests for the IngestionPipeline class including:
 * - Status state machine transitions
 * - processJob() happy path and failure scenarios
 * - startIngestion() validation
 * - Document size and chunk count validation
 * - ingestDirect() storage failure handling
 * - Helper methods (extractTitleFromUrl, detectFormat)
 *
 * @module @jubilant/rag/tests/unit/pipeline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { Driver } from 'neo4j-driver';
import {
  IngestionPipeline,
  isValidTransition,
  getNextStatus,
  DocumentSizeError,
  type DatabaseOperations,
  type DocumentStatus,
  type PipelineResult,
} from '../../src/ingestion/pipeline';
import type { EmbeddedChunk, ChunkMetadata } from '../../src/types';
import type { StorageResult } from '../../src/ingestion/storage';

// Mock the parsers module to avoid actual file/network I/O
vi.mock('../../src/ingestion/parsers', () => ({
  parseDocument: vi.fn().mockResolvedValue({
    content: 'Parsed document content for testing.',
    title: 'Test Document',
    url: 'https://example.com/doc.md',
    format: 'markdown',
    metadata: {},
  }),
}));

// ============================================================================
// Mock Factories
// ============================================================================

function createMockMilvusClient(): MilvusClient {
  return {
    insert: vi.fn().mockResolvedValue({ succ_count: 3 }),
    flush: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({ delete_cnt: 5 }),
  } as unknown as MilvusClient;
}

function createMockNeo4jDriver(): Driver {
  const mockSession = {
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    session: vi.fn().mockReturnValue(mockSession),
  } as unknown as Driver;
}

function createMockDatabaseOperations(overrides: Partial<DatabaseOperations> = {}): DatabaseOperations {
  return {
    insertDocument: vi.fn().mockResolvedValue(undefined),
    insertJob: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue({
      id: 'job-1',
      documentId: 'doc-1',
      status: 'pending',
      currentStep: null,
      progress: 0,
      totalChunks: null,
      processedChunks: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
    }),
    getDocument: vi.fn().mockResolvedValue({
      id: 'doc-1',
      url: 'https://example.com/doc.md',
      title: 'Test Document',
      format: 'markdown',
      status: 'pending',
      chunkCount: 0,
      errorMessage: null,
    }),
    updateJob: vi.fn().mockResolvedValue(undefined),
    updateDocument: vi.fn().mockResolvedValue(undefined),
    ...overrides,
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
// Status State Machine Tests (A)
// ============================================================================

describe('Status State Machine', () => {
  describe('isValidTransition', () => {
    it('should allow pending → chunking', () => {
      expect(isValidTransition('pending', 'chunking')).toBe(true);
    });

    it('should allow pending → failed', () => {
      expect(isValidTransition('pending', 'failed')).toBe(true);
    });

    it('should allow chunking → embedding', () => {
      expect(isValidTransition('chunking', 'embedding')).toBe(true);
    });

    it('should allow chunking → failed', () => {
      expect(isValidTransition('chunking', 'failed')).toBe(true);
    });

    it('should allow embedding → extracting', () => {
      expect(isValidTransition('embedding', 'extracting')).toBe(true);
    });

    it('should allow extracting → active', () => {
      expect(isValidTransition('extracting', 'active')).toBe(true);
    });

    it('should not allow active → chunking (terminal state)', () => {
      expect(isValidTransition('active', 'chunking')).toBe(false);
    });

    it('should not allow active → any state (terminal)', () => {
      expect(isValidTransition('active', 'pending')).toBe(false);
      expect(isValidTransition('active', 'failed')).toBe(false);
      expect(isValidTransition('active', 'embedding')).toBe(false);
    });

    it('should allow failed → pending (retry)', () => {
      expect(isValidTransition('failed', 'pending')).toBe(true);
    });

    it('should not allow failed → active', () => {
      expect(isValidTransition('failed', 'active')).toBe(false);
    });
  });

  describe('getNextStatus', () => {
    it('should return chunking for pending', () => {
      expect(getNextStatus('pending')).toBe('chunking');
    });

    it('should return embedding for chunking', () => {
      expect(getNextStatus('chunking')).toBe('embedding');
    });

    it('should return extracting for embedding', () => {
      expect(getNextStatus('embedding')).toBe('extracting');
    });

    it('should return active for extracting', () => {
      expect(getNextStatus('extracting')).toBe('active');
    });

    it('should return null for active (terminal state)', () => {
      expect(getNextStatus('active')).toBeNull();
    });

    it('should return pending for failed (retry path)', () => {
      expect(getNextStatus('failed')).toBe('pending');
    });
  });
});

// ============================================================================
// processJob() Tests (B-I)
// ============================================================================

describe('IngestionPipeline.processJob()', () => {
  let pipeline: IngestionPipeline;
  let mockDb: DatabaseOperations;
  let mockMilvus: MilvusClient;
  let mockNeo4j: Driver;

  beforeEach(() => {
    mockMilvus = createMockMilvusClient();
    mockNeo4j = createMockNeo4jDriver();
    pipeline = new IngestionPipeline(mockMilvus, mockNeo4j, {
      extractTriples: true,
    });
    mockDb = createMockDatabaseOperations();
    pipeline.setDatabase(mockDb);
  });

  // B: Happy path
  it('should process job successfully with all stages', async () => {
    // Mock chunker
    const mockChunks = [
      { content: 'chunk 1', index: 0, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false } },
      { content: 'chunk 2', index: 1, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false } },
      { content: 'chunk 3', index: 2, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false } },
    ];
    const mockEmbeddedChunks = createMockEmbeddedChunks(3);

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: mockEmbeddedChunks,
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 3,
      neo4jCreated: 3,
      errors: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getExtractor(), 'extractFromChunks').mockResolvedValue({
      triples: [
        { subject: 'A', predicate: 'RELATED_TO', object: 'B', confidence: 0.9, sourceChunkId: 'chunk-0' },
      ],
      chunksProcessed: 3,
      chunksSkipped: 0,
      duration: 50,
    });

    // Mock triple storage (accessed via private field, so we mock the extractor result + storeTriples)
    // We need to access the private tripleStorage - use the pipeline's processJob which calls it internally
    // Instead, we'll mock at the Neo4j driver level for storeTriples
    const mockSession = (mockNeo4j as any).session();
    mockSession.run.mockResolvedValue({
      records: [{ get: () => ({ toNumber: () => 1 }) }],
    });

    const result = await pipeline.processJob('job-1');

    expect(result.status).toBe('active');
    expect(result.chunkCount).toBe(3);
    expect(result.documentId).toBe('doc-1');
    expect(result.jobId).toBe('job-1');
    expect(result.error).toBeUndefined();

    // Verify updateDocumentStatus was called with 'active' and chunk count 3
    expect(mockDb.updateDocument).toHaveBeenCalledWith('doc-1', expect.objectContaining({
      status: 'active',
      chunkCount: 3,
    }));
  });

  // C: Storage failure with errors array
  it('should fail when storage returns errors', async () => {
    const mockChunks = [
      { content: 'chunk 1', index: 0, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false } },
    ];

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(1),
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 0,
      neo4jCreated: 0,
      errors: ['Milvus connection failed'],
      duration: 50,
    });

    const result = await pipeline.processJob('job-1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Storage failed');
    expect(result.error).toContain('Milvus connection failed');

    expect(mockDb.updateDocument).toHaveBeenCalledWith('doc-1', expect.objectContaining({
      status: 'failed',
    }));
    expect(mockDb.updateJob).toHaveBeenCalledWith('job-1', expect.objectContaining({
      status: 'failed',
    }));
  });

  // D: Milvus zero inserts (partial failure)
  it('should fail when Milvus inserts zero chunks', async () => {
    const mockChunks = [
      { content: 'chunk 1', index: 0, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false } },
    ];

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(1),
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 0,
      neo4jCreated: 3,
      errors: [],
      duration: 100,
    });

    const result = await pipeline.processJob('job-1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Milvus');
  });

  // E: Neo4j zero creates (partial failure)
  it('should fail when Neo4j creates zero nodes', async () => {
    const mockChunks = [
      { content: 'chunk 1', index: 0, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false } },
    ];

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(1),
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 3,
      neo4jCreated: 0,
      errors: [],
      duration: 100,
    });

    const result = await pipeline.processJob('job-1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Neo4j');
  });

  // F: Uses actual stored count, not parsed count
  it('should use actual stored count instead of parsed chunk count', async () => {
    const mockChunks = Array.from({ length: 5 }, (_, i) => ({
      content: `chunk ${i}`,
      index: i,
      tokenCount: 100,
      metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false },
    }));

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(5),
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 4,
      neo4jCreated: 4,
      errors: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getExtractor(), 'extractFromChunks').mockResolvedValue({
      triples: [],
      chunksProcessed: 5,
      chunksSkipped: 0,
      duration: 50,
    });

    const mockSession = (mockNeo4j as any).session();
    mockSession.run.mockResolvedValue({
      records: [{ get: () => ({ toNumber: () => 0 }) }],
    });

    const result = await pipeline.processJob('job-1');

    expect(result.status).toBe('active');
    // chunkCount should be min(milvusInserted, neo4jCreated) = 4, not 5
    expect(result.chunkCount).toBe(4);
  });

  // F2: Cross-store consistency violation (partial failure)
  it('should fail when Milvus and Neo4j counts diverge', async () => {
    const mockChunks = Array.from({ length: 5 }, (_, i) => ({
      content: `chunk ${i}`,
      index: i,
      tokenCount: 100,
      metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false },
    }));

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(5),
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 5,
      neo4jCreated: 3, // Partial failure — divergent counts
      errors: [],
      duration: 100,
    });

    const result = await pipeline.processJob('job-1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Cross-store consistency violation');
    expect(result.error).toContain('Milvus inserted 5');
    expect(result.error).toContain('Neo4j created 3');
  });

  // G: Embedding partial failure (warns but doesn't fail)
  it('should continue when some embeddings fail', async () => {
    const mockChunks = Array.from({ length: 3 }, (_, i) => ({
      content: `chunk ${i}`,
      index: i,
      tokenCount: 100,
      metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false },
    }));

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(2),
      failed: [{ chunk: mockChunks[2] as any, error: 'timeout' }],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 2,
      neo4jCreated: 2,
      errors: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getExtractor(), 'extractFromChunks').mockResolvedValue({
      triples: [],
      chunksProcessed: 2,
      chunksSkipped: 0,
      duration: 50,
    });

    const mockSession = (mockNeo4j as any).session();
    mockSession.run.mockResolvedValue({
      records: [{ get: () => ({ toNumber: () => 0 }) }],
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await pipeline.processJob('job-1');

    expect(result.status).toBe('active');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1 chunks failed to embed'));

    warnSpy.mockRestore();
  });

  // G2: All embeddings fail → throws before reaching storage (processJob)
  it('should fail when all chunks fail to embed in processJob', async () => {
    const mockChunks = Array.from({ length: 3 }, (_, i) => ({
      content: `chunk ${i}`,
      index: i,
      tokenCount: 100,
      metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false },
    }));

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: [],
      failed: [
        { chunk: mockChunks[0] as any, error: 'connection timeout' },
        { chunk: mockChunks[1] as any, error: 'rate limit exceeded' },
        { chunk: mockChunks[2] as any, error: 'server error' },
      ],
      duration: 100,
    });
    const storeSpy = vi.spyOn(pipeline.getStorage(), 'storeChunks');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await pipeline.processJob('job-1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Embedding failed: all 3 chunks failed to embed');
    expect(result.error).toContain('connection timeout');
    // Storage should NOT have been called
    expect(storeSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // G3: Partial embedding failure → storage validation uses embeddedCount not chunks.length
  it('should use embeddedCount for storage validation after partial embedding failure', async () => {
    const mockChunks = Array.from({ length: 5 }, (_, i) => ({
      content: `chunk ${i}`,
      index: i,
      tokenCount: 100,
      metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'https://example.com/doc.md', hasCode: false, hasFormula: false, hasTable: false },
    }));

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    // Only 3 of 5 chunks embedded successfully
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(3),
      failed: [
        { chunk: mockChunks[3] as any, error: 'timeout' },
        { chunk: mockChunks[4] as any, error: 'timeout' },
      ],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 3,
      neo4jCreated: 3,
      errors: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getExtractor(), 'extractFromChunks').mockResolvedValue({
      triples: [],
      chunksProcessed: 3,
      chunksSkipped: 0,
      duration: 50,
    });

    const mockSession = (mockNeo4j as any).session();
    mockSession.run.mockResolvedValue({
      records: [{ get: () => ({ toNumber: () => 0 }) }],
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await pipeline.processJob('job-1');

    // Should succeed — 3 embedded, 3 stored in both stores
    expect(result.status).toBe('active');
    expect(result.chunkCount).toBe(3);

    warnSpy.mockRestore();
  });

  // H: Job not found
  it('should throw when job is not found', async () => {
    (mockDb.getJob as any).mockResolvedValue(null);

    await expect(pipeline.processJob('nonexistent-job')).rejects.toThrow('not found');
  });

  // I: Document not found
  it('should fail when document is not found', async () => {
    (mockDb.getDocument as any).mockResolvedValue(null);

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue([]);

    const result = await pipeline.processJob('job-1');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('not found');

    expect(mockDb.updateDocument).toHaveBeenCalledWith('doc-1', expect.objectContaining({
      status: 'failed',
    }));
  });
});

// ============================================================================
// startIngestion() Tests (J, K)
// ============================================================================

describe('IngestionPipeline.startIngestion()', () => {
  let pipeline: IngestionPipeline;

  beforeEach(() => {
    const mockMilvus = createMockMilvusClient();
    const mockNeo4j = createMockNeo4jDriver();
    pipeline = new IngestionPipeline(mockMilvus, mockNeo4j);
  });

  // J: Without database
  it('should throw when database is not configured', async () => {
    await expect(
      pipeline.startIngestion({ documentUrl: 'https://example.com/doc.md' })
    ).rejects.toThrow('Database not configured');
  });

  // K: Happy path
  it('should create document and job records and return IDs', async () => {
    const mockDb = createMockDatabaseOperations();
    pipeline.setDatabase(mockDb);

    const result = await pipeline.startIngestion({
      documentUrl: 'https://example.com/doc.md',
      title: 'Test Doc',
      format: 'markdown',
      metadata: { source: 'test' },
    });

    expect(result.jobId).toBeDefined();
    expect(result.documentId).toBeDefined();
    expect(result.status).toBe('queued');

    // Verify document record was created
    expect(mockDb.insertDocument).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/doc.md',
      title: 'Test Doc',
      format: 'markdown',
      status: 'pending',
    }));

    // Verify job record was created
    expect(mockDb.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      documentId: result.documentId,
      status: 'queued',
      progress: 0,
    }));
  });

  it('should extract title from URL when not provided', async () => {
    const mockDb = createMockDatabaseOperations();
    pipeline.setDatabase(mockDb);

    await pipeline.startIngestion({
      documentUrl: 'https://example.com/path/to/my-doc.pdf',
    });

    expect(mockDb.insertDocument).toHaveBeenCalledWith(expect.objectContaining({
      title: 'my doc',
    }));
  });

  it('should detect format from URL when not provided', async () => {
    const mockDb = createMockDatabaseOperations();
    pipeline.setDatabase(mockDb);

    await pipeline.startIngestion({
      documentUrl: 'https://example.com/doc.pdf',
    });

    expect(mockDb.insertDocument).toHaveBeenCalledWith(expect.objectContaining({
      format: 'pdf',
    }));
  });
});

// ============================================================================
// validateDocumentSize() Tests (L)
// ============================================================================

describe('IngestionPipeline.validateDocumentSize()', () => {
  let pipeline: IngestionPipeline;

  beforeEach(() => {
    pipeline = new IngestionPipeline(
      createMockMilvusClient(),
      createMockNeo4jDriver(),
      { maxDocumentSize: 1000 }
    );
  });

  it('should return valid for content within limit', () => {
    const result = pipeline.validateDocumentSize('a'.repeat(500));

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.actualSize).toBe(500);
    expect(result.maxSize).toBe(1000);
  });

  it('should return invalid with DocumentSizeError for content exceeding limit', () => {
    const result = pipeline.validateDocumentSize('a'.repeat(1500));

    expect(result.valid).toBe(false);
    expect(result.error).toBeInstanceOf(DocumentSizeError);
    expect(result.error!.errorType).toBe('DOCUMENT_TOO_LARGE');
    expect(result.error!.actualSize).toBe(1500);
    expect(result.error!.maxSize).toBe(1000);
  });

  it('should return valid for content at 85% of limit (but log warning externally)', () => {
    const result = pipeline.validateDocumentSize('a'.repeat(850));

    expect(result.valid).toBe(true);
    expect(result.sizePercentage).toBe(85);
  });

  it('should include documentId in error when provided', () => {
    const result = pipeline.validateDocumentSize('a'.repeat(1500), 'my-doc-id');

    expect(result.error!.documentId).toBe('my-doc-id');
  });
});

// ============================================================================
// validateChunkCount() Tests (M)
// ============================================================================

describe('IngestionPipeline.validateChunkCount()', () => {
  let pipeline: IngestionPipeline;

  beforeEach(() => {
    pipeline = new IngestionPipeline(
      createMockMilvusClient(),
      createMockNeo4jDriver(),
      { maxChunksPerDocument: 100 }
    );
  });

  it('should return valid for chunk count within limit', () => {
    const result = pipeline.validateChunkCount(50);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return invalid for chunk count exceeding limit', () => {
    const result = pipeline.validateChunkCount(150);

    expect(result.valid).toBe(false);
    expect(result.error).toBeInstanceOf(DocumentSizeError);
    expect(result.error!.errorType).toBe('TOO_MANY_CHUNKS');
    expect(result.error!.actualSize).toBe(150);
    expect(result.error!.maxSize).toBe(100);
  });

  it('should return valid for count at exactly the limit', () => {
    const result = pipeline.validateChunkCount(100);

    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// ingestDirect() Tests (N)
// ============================================================================

describe('IngestionPipeline.ingestDirect()', () => {
  let pipeline: IngestionPipeline;

  beforeEach(() => {
    pipeline = new IngestionPipeline(
      createMockMilvusClient(),
      createMockNeo4jDriver(),
      { extractTriples: false, maxDocumentSize: 10_000_000 }
    );
  });

  it('should throw when storage returns errors', async () => {
    const mockChunks = [
      { content: 'chunk 1', index: 0, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'url', hasCode: false, hasFormula: false, hasTable: false } },
    ];

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(1),
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 0,
      neo4jCreated: 0,
      errors: ['Connection refused'],
      duration: 50,
    });

    await expect(
      pipeline.ingestDirect('Some content', {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com/doc.md',
      })
    ).rejects.toThrow('Storage failed');
  });

  it('should throw when Milvus inserts zero chunks in ingestDirect', async () => {
    const mockChunks = [
      { content: 'chunk 1', index: 0, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'url', hasCode: false, hasFormula: false, hasTable: false } },
    ];

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(1),
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 0,
      neo4jCreated: 1,
      errors: [],
      duration: 50,
    });

    await expect(
      pipeline.ingestDirect('Some content', {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com/doc.md',
      })
    ).rejects.toThrow('Milvus storage failed');
  });

  it('should throw when Neo4j creates zero nodes in ingestDirect', async () => {
    const mockChunks = [
      { content: 'chunk 1', index: 0, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'url', hasCode: false, hasFormula: false, hasTable: false } },
    ];

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(1),
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 1,
      neo4jCreated: 0,
      errors: [],
      duration: 50,
    });

    await expect(
      pipeline.ingestDirect('Some content', {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com/doc.md',
      })
    ).rejects.toThrow('Neo4j storage failed');
  });

  it('should throw on cross-store consistency violation in ingestDirect', async () => {
    const mockChunks = [
      { content: 'chunk 1', index: 0, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'url', hasCode: false, hasFormula: false, hasTable: false } },
    ];

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(3),
      failed: [],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 3,
      neo4jCreated: 1, // Divergent counts
      errors: [],
      duration: 50,
    });

    await expect(
      pipeline.ingestDirect('Some content', {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com/doc.md',
      })
    ).rejects.toThrow('Cross-store consistency violation');
  });

  it('should throw when all chunks fail to embed in ingestDirect', async () => {
    const mockChunks = Array.from({ length: 2 }, (_, i) => ({
      content: `chunk ${i}`,
      index: i,
      tokenCount: 100,
      metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'url', hasCode: false, hasFormula: false, hasTable: false },
    }));

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: [],
      failed: [
        { chunk: mockChunks[0] as any, error: 'service unavailable' },
        { chunk: mockChunks[1] as any, error: 'timeout' },
      ],
      duration: 100,
    });
    const storeSpy = vi.spyOn(pipeline.getStorage(), 'storeChunks');

    await expect(
      pipeline.ingestDirect('Some content', {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com/doc.md',
      })
    ).rejects.toThrow('Embedding failed: all 2 chunks failed to embed');

    // Storage should NOT have been called
    expect(storeSpy).not.toHaveBeenCalled();
  });

  it('should include failure reasons in embedding error message', async () => {
    const mockChunks = [
      { content: 'chunk 0', index: 0, tokenCount: 100, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'url', hasCode: false, hasFormula: false, hasTable: false } },
    ];

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: [],
      failed: [
        { chunk: mockChunks[0] as any, error: 'rate limit exceeded' },
      ],
      duration: 100,
    });

    await expect(
      pipeline.ingestDirect('Some content', {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com/doc.md',
      })
    ).rejects.toThrow('rate limit exceeded');
  });

  it('should use embeddedCount in storage validation errors for ingestDirect', async () => {
    const mockChunks = Array.from({ length: 4 }, (_, i) => ({
      content: `chunk ${i}`,
      index: i,
      tokenCount: 100,
      metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'url', hasCode: false, hasFormula: false, hasTable: false },
    }));

    vi.spyOn(pipeline.getChunker(), 'chunk').mockReturnValue(mockChunks as any);
    // Only 2 of 4 chunks embedded
    vi.spyOn(pipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(2),
      failed: [
        { chunk: mockChunks[2] as any, error: 'timeout' },
        { chunk: mockChunks[3] as any, error: 'timeout' },
      ],
      duration: 100,
    });
    vi.spyOn(pipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 0,
      neo4jCreated: 2,
      errors: [],
      duration: 50,
    });

    // Error should reference embeddedCount (2), not chunks.length (4)
    await expect(
      pipeline.ingestDirect('Some content', {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com/doc.md',
      })
    ).rejects.toThrow('0 of 2 chunks inserted');
  });

  it('should throw DocumentSizeError when content exceeds limit', async () => {
    const smallPipeline = new IngestionPipeline(
      createMockMilvusClient(),
      createMockNeo4jDriver(),
      { maxDocumentSize: 10 }
    );

    await expect(
      smallPipeline.ingestDirect('a'.repeat(100), {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com/doc.md',
      })
    ).rejects.toThrow(DocumentSizeError);
  });

  it('should log warning when content is at 85% of limit', async () => {
    const limitedPipeline = new IngestionPipeline(
      createMockMilvusClient(),
      createMockNeo4jDriver(),
      { maxDocumentSize: 1000, extractTriples: false }
    );

    vi.spyOn(limitedPipeline.getChunker(), 'chunk').mockReturnValue([
      { content: 'chunk', index: 0, tokenCount: 10, metadata: { documentId: 'doc-1', documentTitle: 'Test', documentUrl: 'url', hasCode: false, hasFormula: false, hasTable: false } },
    ] as any);
    vi.spyOn(limitedPipeline.getEmbedder(), 'embedChunks').mockResolvedValue({
      embeddings: createMockEmbeddedChunks(1),
      failed: [],
      duration: 10,
    });
    vi.spyOn(limitedPipeline.getStorage(), 'storeChunks').mockResolvedValue({
      milvusInserted: 1,
      neo4jCreated: 1,
      errors: [],
      duration: 10,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await limitedPipeline.ingestDirect('a'.repeat(850), {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com/doc.md',
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('85.0%'));

    warnSpy.mockRestore();
  });
});

// ============================================================================
// Helper Method Tests (O)
// ============================================================================

describe('IngestionPipeline helper methods', () => {
  let pipeline: IngestionPipeline;

  beforeEach(() => {
    pipeline = new IngestionPipeline(
      createMockMilvusClient(),
      createMockNeo4jDriver()
    );
  });

  describe('extractTitleFromUrl (via startIngestion)', () => {
    it('should extract title from path and replace dashes/underscores with spaces', async () => {
      const mockDb = createMockDatabaseOperations();
      pipeline.setDatabase(mockDb);

      await pipeline.startIngestion({
        documentUrl: 'path/to/my-doc.pdf',
      });

      expect(mockDb.insertDocument).toHaveBeenCalledWith(expect.objectContaining({
        title: 'my doc',
      }));
    });

    it('should handle underscores in filename', async () => {
      const mockDb = createMockDatabaseOperations();
      pipeline.setDatabase(mockDb);

      await pipeline.startIngestion({
        documentUrl: 'path/to/my_document_v2.md',
      });

      expect(mockDb.insertDocument).toHaveBeenCalledWith(expect.objectContaining({
        title: 'my document v2',
      }));
    });
  });

  describe('detectFormat (via startIngestion)', () => {
    it('should detect markdown format from .md extension', async () => {
      const mockDb = createMockDatabaseOperations();
      pipeline.setDatabase(mockDb);

      await pipeline.startIngestion({ documentUrl: 'doc.md' });

      expect(mockDb.insertDocument).toHaveBeenCalledWith(expect.objectContaining({
        format: 'markdown',
      }));
    });

    it('should detect pdf format from .pdf extension', async () => {
      const mockDb = createMockDatabaseOperations();
      pipeline.setDatabase(mockDb);

      await pipeline.startIngestion({ documentUrl: 'doc.pdf' });

      expect(mockDb.insertDocument).toHaveBeenCalledWith(expect.objectContaining({
        format: 'pdf',
      }));
    });

    it('should default to text format for unknown extensions', async () => {
      const mockDb = createMockDatabaseOperations();
      pipeline.setDatabase(mockDb);

      await pipeline.startIngestion({ documentUrl: 'doc.txt' });

      expect(mockDb.insertDocument).toHaveBeenCalledWith(expect.objectContaining({
        format: 'text',
      }));
    });

    it('should detect markdown format from .markdown extension', async () => {
      const mockDb = createMockDatabaseOperations();
      pipeline.setDatabase(mockDb);

      await pipeline.startIngestion({ documentUrl: 'doc.markdown' });

      expect(mockDb.insertDocument).toHaveBeenCalledWith(expect.objectContaining({
        format: 'markdown',
      }));
    });
  });
});
