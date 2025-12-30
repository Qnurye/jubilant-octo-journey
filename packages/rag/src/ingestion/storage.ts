/**
 * Chunk Storage
 *
 * Implements storage of embedded chunks to Milvus (vector store)
 * and Neo4j (graph store) with cross-store consistency.
 *
 * @module @jubilant/rag/ingestion/storage
 */

import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { Driver, Session } from 'neo4j-driver';
import type { EmbeddedChunk, ChunkMetadata } from '../types';

/**
 * Configuration for chunk storage
 */
export interface StorageConfig {
  /** Milvus collection name */
  collectionName: string;
  /** Batch size for Milvus insertions */
  milvusBatchSize: number;
  /** Batch size for Neo4j operations */
  neo4jBatchSize: number;
}

const DEFAULT_CONFIG: StorageConfig = {
  collectionName: 'knowledge_chunks',
  milvusBatchSize: 100,
  neo4jBatchSize: 50,
};

/**
 * Result of a storage operation
 */
export interface StorageResult {
  milvusInserted: number;
  neo4jCreated: number;
  errors: string[];
  duration: number;
}

/**
 * Progress callback for storage operations
 */
export type StorageProgressCallback = (progress: {
  phase: 'milvus' | 'neo4j';
  completed: number;
  total: number;
}) => void;

// ============================================================================
// Milvus Chunk Insertion (T056)
// ============================================================================

/**
 * MilvusChunkStorage - Vector store for chunk embeddings
 */
export class MilvusChunkStorage {
  private client: MilvusClient;
  private config: StorageConfig;

  constructor(client: MilvusClient, config: Partial<StorageConfig> = {}) {
    this.client = client;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Insert embedded chunks into Milvus
   *
   * @param chunks - Embedded chunks to insert
   * @param onProgress - Optional progress callback
   * @returns Number of chunks inserted
   */
  async insertChunks(
    chunks: EmbeddedChunk[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<number> {
    if (chunks.length === 0) return 0;

    let inserted = 0;

    // Process in batches
    for (let i = 0; i < chunks.length; i += this.config.milvusBatchSize) {
      const batch = chunks.slice(i, i + this.config.milvusBatchSize);

      const data = batch.map((chunk) => {
        // Generate a unique ID from the chunk UUID
        // We use the first 13 hex characters (52 bits) to ensure it fits in a JavaScript Number (MAX_SAFE_INTEGER is 53 bits)
        // This avoids BigInt serialization issues with the Milvus SDK while maintaining collision resistance
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(chunk.id).digest('hex');
        const chunkId = parseInt(hash.slice(0, 13), 16);

        return {
          chunk_id: chunkId,
          vector: chunk.embedding,
          content_text: chunk.content,
          metadata: JSON.stringify(chunk.metadata),
          topic_tag: this.extractTopicTag(chunk.metadata),
        };
      });

      await this.client.insert({
        collection_name: this.config.collectionName,
        data,
      });

      inserted += batch.length;

      if (onProgress) {
        onProgress(inserted, chunks.length);
      }
    }

    // Flush to ensure data is persisted
    await this.client.flush({
      collection_names: [this.config.collectionName],
    });

    return inserted;
  }

  /**
   * Delete chunks by document ID
   *
   * @param documentId - Document ID to delete chunks for
   * @returns Number of chunks deleted
   */
  async deleteByDocumentId(documentId: string): Promise<number> {
    const result = await this.client.delete({
      collection_name: this.config.collectionName,
      filter: `metadata["documentId"] == "${documentId}"`,
    });

    const deleteCount = (result as unknown as { delete_cnt?: number | string }).delete_cnt;
    return typeof deleteCount === 'number' ? deleteCount : parseInt(String(deleteCount || '0'), 10);
  }

  /**
   * Extract topic tag from metadata
   */
  private extractTopicTag(metadata: ChunkMetadata): string {
    // Use section header or document title as topic
    if (metadata.sectionHeader) {
      return metadata.sectionHeader.toLowerCase().replace(/\s+/g, '-');
    }
    return '';
  }

  /**
   * Get the collection name
   */
  get collectionName(): string {
    return this.config.collectionName;
  }
}

// ============================================================================
// Neo4j Chunk Node Creation (T057)
// ============================================================================

/**
 * Neo4jChunkStorage - Graph store for chunk nodes and relationships
 */
export class Neo4jChunkStorage {
  private driver: Driver;
  private config: StorageConfig;

  constructor(driver: Driver, config: Partial<StorageConfig> = {}) {
    this.driver = driver;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create chunk nodes and relationships in Neo4j
   *
   * @param chunks - Embedded chunks to store
   * @param documentUrl - URL of the source document
   * @param onProgress - Optional progress callback
   * @returns Number of nodes created
   */
  async createChunkNodes(
    chunks: EmbeddedChunk[],
    documentUrl: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<number> {
    if (chunks.length === 0) return 0;

    const session = this.driver.session();
    let created = 0;

    try {
      // First, ensure the Document node exists
      await session.run(
        `
        MERGE (d:Document {url: $url})
        SET d.title = $title,
            d.chunkCount = $chunkCount,
            d.status = 'active',
            d.updatedAt = datetime()
        RETURN d
        `,
        {
          url: documentUrl,
          title: chunks[0]?.metadata.documentTitle || 'Untitled',
          chunkCount: chunks.length,
        }
      );

      // Create chunk nodes in batches
      for (let i = 0; i < chunks.length; i += this.config.neo4jBatchSize) {
        const batch = chunks.slice(i, i + this.config.neo4jBatchSize);

        // Prepare batch data
        const chunkData = batch.map((chunk, idx) => ({
          chunkId: chunk.id,
          contentHash: this.hashContent(chunk.content),
          preview: chunk.content.slice(0, 200),
          tokenCount: chunk.metadata.tokenCount,
          hasCode: chunk.metadata.hasCode,
          hasFormula: chunk.metadata.hasFormula,
          hasTable: chunk.metadata.hasTable,
          chunkIndex: i + idx,
        }));

        // Create chunk nodes
        await session.run(
          `
          UNWIND $chunks AS chunk
          MERGE (c:Chunk {chunk_id: chunk.chunkId})
          SET c.hash = chunk.contentHash,
              c.preview = chunk.preview,
              c.tokenCount = chunk.tokenCount,
              c.hasCode = chunk.hasCode,
              c.hasFormula = chunk.hasFormula,
              c.hasTable = chunk.hasTable,
              c.chunkIndex = chunk.chunkIndex
          WITH c, chunk
          MATCH (d:Document {url: $documentUrl})
          MERGE (c)-[:FROM_DOCUMENT]->(d)
          RETURN count(c) as created
          `,
          {
            chunks: chunkData,
            documentUrl,
          }
        );

        created += batch.length;

        if (onProgress) {
          onProgress(created, chunks.length);
        }
      }

      // Create NEXT_CHUNK relationships for sequential ordering
      await this.createSequentialRelationships(session, chunks);

      return created;
    } finally {
      await session.close();
    }
  }

  /**
   * Create NEXT_CHUNK relationships between sequential chunks
   */
  private async createSequentialRelationships(
    session: Session,
    chunks: EmbeddedChunk[]
  ): Promise<void> {
    if (chunks.length <= 1) return;

    // Create pairs of consecutive chunk IDs
    const pairs: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < chunks.length - 1; i++) {
      pairs.push({
        from: chunks[i].id,
        to: chunks[i + 1].id,
      });
    }

    // Batch create relationships
    for (let i = 0; i < pairs.length; i += this.config.neo4jBatchSize) {
      const batch = pairs.slice(i, i + this.config.neo4jBatchSize);

      await session.run(
        `
        UNWIND $pairs AS pair
        MATCH (c1:Chunk {chunk_id: pair.from})
        MATCH (c2:Chunk {chunk_id: pair.to})
        MERGE (c1)-[:NEXT_CHUNK]->(c2)
        `,
        { pairs: batch }
      );
    }
  }

  /**
   * Create DISCUSSES relationships between chunks and concepts
   *
   * @param chunkId - The chunk ID
   * @param concepts - Concepts discussed in this chunk
   */
  async linkChunkToConcepts(
    chunkId: string,
    concepts: string[]
  ): Promise<void> {
    if (concepts.length === 0) return;

    const session = this.driver.session();

    try {
      await session.run(
        `
        MATCH (c:Chunk {chunk_id: $chunkId})
        UNWIND $concepts AS conceptName
        MERGE (concept:Concept {name: conceptName})
        MERGE (c)-[:DISCUSSES]->(concept)
        `,
        { chunkId, concepts }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Create special relationships for code examples
   *
   * @param chunkId - The chunk ID containing code
   * @param concept - The concept the code demonstrates
   */
  async linkCodeExample(chunkId: string, concept: string): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(
        `
        MATCH (c:Chunk {chunk_id: $chunkId})
        MERGE (concept:Concept {name: $concept})
        MERGE (c)-[:CODE_EXAMPLE_FOR]->(concept)
        `,
        { chunkId, concept }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Create special relationships for formulas
   *
   * @param chunkId - The chunk ID containing a formula
   * @param concept - The concept the formula relates to
   */
  async linkFormula(chunkId: string, concept: string): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(
        `
        MATCH (c:Chunk {chunk_id: $chunkId})
        MERGE (concept:Concept {name: $concept})
        MERGE (c)-[:FORMULA_FOR]->(concept)
        `,
        { chunkId, concept }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Delete chunk nodes by document URL
   *
   * @param documentUrl - Document URL to delete chunks for
   * @returns Number of chunks deleted
   */
  async deleteByDocumentUrl(documentUrl: string): Promise<number> {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (c:Chunk)-[:FROM_DOCUMENT]->(d:Document {url: $documentUrl})
        DETACH DELETE c
        RETURN count(c) as deleted
        `,
        { documentUrl }
      );

      return result.records[0]?.get('deleted')?.toNumber() || 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Hash content for deduplication
   */
  private hashContent(content: string): string {
    // Simple hash using crypto
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}

// ============================================================================
// Unified Storage Manager
// ============================================================================

/**
 * ChunkStorageManager - Coordinates storage across Milvus and Neo4j
 */
export class ChunkStorageManager {
  private milvus: MilvusChunkStorage;
  private neo4j: Neo4jChunkStorage;

  constructor(
    milvusClient: MilvusClient,
    neo4jDriver: Driver,
    config: Partial<StorageConfig> = {}
  ) {
    this.milvus = new MilvusChunkStorage(milvusClient, config);
    this.neo4j = new Neo4jChunkStorage(neo4jDriver, config);
  }

  /**
   * Store chunks in both Milvus and Neo4j
   *
   * @param chunks - Embedded chunks to store
   * @param documentUrl - URL of the source document
   * @param onProgress - Optional progress callback
   * @returns Storage result with counts and errors
   */
  async storeChunks(
    chunks: EmbeddedChunk[],
    documentUrl: string,
    onProgress?: StorageProgressCallback
  ): Promise<StorageResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let milvusInserted = 0;
    let neo4jCreated = 0;

    // Step 1: Insert into Milvus (vector store)
    try {
      milvusInserted = await this.milvus.insertChunks(
        chunks,
        (completed, total) => {
          if (onProgress) {
            onProgress({ phase: 'milvus', completed, total });
          }
        }
      );
    } catch (error) {
      errors.push(`Milvus insertion failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 2: Create nodes in Neo4j (graph store)
    try {
      neo4jCreated = await this.neo4j.createChunkNodes(
        chunks,
        documentUrl,
        (completed, total) => {
          if (onProgress) {
            onProgress({ phase: 'neo4j', completed, total });
          }
        }
      );
    } catch (error) {
      errors.push(`Neo4j creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      milvusInserted,
      neo4jCreated,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Delete chunks by document URL from both stores
   *
   * @param documentUrl - Document URL
   * @param documentId - Document ID for Milvus
   */
  async deleteChunks(documentUrl: string, documentId: string): Promise<void> {
    await Promise.all([
      this.milvus.deleteByDocumentId(documentId),
      this.neo4j.deleteByDocumentUrl(documentUrl),
    ]);
  }

  /**
   * Get the Milvus storage instance
   */
  getMilvusStorage(): MilvusChunkStorage {
    return this.milvus;
  }

  /**
   * Get the Neo4j storage instance
   */
  getNeo4jStorage(): Neo4jChunkStorage {
    return this.neo4j;
  }
}

/**
 * Create a ChunkStorageManager
 */
export function createChunkStorageManager(
  milvusClient: MilvusClient,
  neo4jDriver: Driver,
  config?: Partial<StorageConfig>
): ChunkStorageManager {
  return new ChunkStorageManager(milvusClient, neo4jDriver, config);
}
