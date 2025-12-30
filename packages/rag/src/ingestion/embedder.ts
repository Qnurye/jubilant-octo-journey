/**
 * Batch Embedding for Ingestion
 *
 * Implements efficient batch embedding of document chunks using Qwen3Embedding.
 * Supports progress tracking and error handling for large document ingestion.
 *
 * @module @jubilant/rag/ingestion/embedder
 */

import { Qwen3Embedding, createEmbedder } from '../generation/embedder';
import type { EmbeddedChunk, ChunkMetadata } from '../types';
import type { Chunk } from './chunker';

/**
 * Configuration for batch embedding
 */
export interface BatchEmbedderConfig {
  /** Number of chunks to embed in a single API call */
  batchSize: number;
  /** Maximum concurrent batch requests */
  concurrency: number;
  /** Retry attempts for failed embeddings */
  retryAttempts: number;
  /** Delay between retries in ms */
  retryDelayMs: number;
}

const DEFAULT_CONFIG: BatchEmbedderConfig = {
  batchSize: 10,
  concurrency: 3,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

/**
 * Progress callback for batch embedding
 */
export type EmbeddingProgressCallback = (progress: {
  completed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
}) => void;

/**
 * Result of a batch embedding operation
 */
export interface BatchEmbedResult {
  embeddings: EmbeddedChunk[];
  failed: Array<{
    chunk: Chunk;
    error: string;
  }>;
  duration: number;
}

/**
 * BatchEmbedder - Efficient batch embedding for document ingestion
 */
export class BatchEmbedder {
  private embedder: Qwen3Embedding;
  private config: BatchEmbedderConfig;

  constructor(embedder?: Qwen3Embedding, config: Partial<BatchEmbedderConfig> = {}) {
    this.embedder = embedder || createEmbedder();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Embed chunks in batches
   *
   * @param chunks - Chunks to embed
   * @param onProgress - Optional progress callback
   * @returns Embedded chunks with any failures
   */
  async embedChunks(
    chunks: Chunk[],
    onProgress?: EmbeddingProgressCallback
  ): Promise<BatchEmbedResult> {
    const startTime = Date.now();
    const embeddings: EmbeddedChunk[] = [];
    const failed: Array<{ chunk: Chunk; error: string }> = [];

    // Split chunks into batches
    const batches: Chunk[][] = [];
    for (let i = 0; i < chunks.length; i += this.config.batchSize) {
      batches.push(chunks.slice(i, i + this.config.batchSize));
    }

    let completed = 0;

    // Process batches with concurrency control
    for (let i = 0; i < batches.length; i += this.config.concurrency) {
      const batchGroup = batches.slice(i, i + this.config.concurrency);

      const results = await Promise.allSettled(
        batchGroup.map((batch, batchIndex) =>
          this.embedBatch(batch, i + batchIndex)
        )
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const batch = batchGroup[j];

        if (result.status === 'fulfilled') {
          embeddings.push(...result.value);
          completed += batch.length;
        } else {
          // Mark all chunks in failed batch
          for (const chunk of batch) {
            failed.push({
              chunk,
              error: result.reason?.message || 'Unknown error',
            });
          }
          completed += batch.length;
        }

        // Report progress
        if (onProgress) {
          onProgress({
            completed,
            total: chunks.length,
            currentBatch: i + j + 1,
            totalBatches: batches.length,
          });
        }
      }
    }

    return {
      embeddings,
      failed,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Embed a single batch with retries
   */
  private async embedBatch(
    batch: Chunk[],
    batchIndex: number
  ): Promise<EmbeddedChunk[]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        return await this.doEmbedBatch(batch);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Wait before retrying
        if (attempt < this.config.retryAttempts - 1) {
          await this.delay(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError || new Error(`Failed to embed batch ${batchIndex}`);
  }

  /**
   * Perform the actual batch embedding
   */
  private async doEmbedBatch(batch: Chunk[]): Promise<EmbeddedChunk[]> {
    const contents = batch.map((chunk) => chunk.content);

    // Use the embedder's batch embedding capability
    const embeddings = await this.embedder.getTextEmbeddings(contents);

    return batch.map((chunk, i) => ({
      id: crypto.randomUUID(),
      content: chunk.content,
      embedding: embeddings[i],
      metadata: {
        documentId: chunk.metadata.documentId || '',
        documentTitle: chunk.metadata.documentTitle || '',
        documentUrl: chunk.metadata.documentUrl || '',
        sectionHeader: chunk.metadata.sectionHeader,
        chunkIndex: chunk.index,
        totalChunks: chunk.metadata.totalChunks || 0,
        tokenCount: chunk.tokenCount,
        hasCode: chunk.metadata.hasCode || false,
        hasFormula: chunk.metadata.hasFormula || false,
        hasTable: chunk.metadata.hasTable || false,
      } as ChunkMetadata,
    }));
  }

  /**
   * Embed a single chunk
   *
   * @param chunk - Chunk to embed
   * @returns Embedded chunk
   */
  async embedSingle(chunk: Chunk): Promise<EmbeddedChunk> {
    const embedding = await this.embedder.getTextEmbedding(chunk.content);

    return {
      id: crypto.randomUUID(),
      content: chunk.content,
      embedding,
      metadata: {
        documentId: chunk.metadata.documentId || '',
        documentTitle: chunk.metadata.documentTitle || '',
        documentUrl: chunk.metadata.documentUrl || '',
        sectionHeader: chunk.metadata.sectionHeader,
        chunkIndex: chunk.index,
        totalChunks: chunk.metadata.totalChunks || 0,
        tokenCount: chunk.tokenCount,
        hasCode: chunk.metadata.hasCode || false,
        hasFormula: chunk.metadata.hasFormula || false,
        hasTable: chunk.metadata.hasTable || false,
      } as ChunkMetadata,
    };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<BatchEmbedderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): BatchEmbedderConfig {
    return { ...this.config };
  }
}

/**
 * Create a BatchEmbedder with default configuration
 */
export function createBatchEmbedder(
  embedder?: Qwen3Embedding,
  config?: Partial<BatchEmbedderConfig>
): BatchEmbedder {
  return new BatchEmbedder(embedder, config);
}
