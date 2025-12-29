/**
 * Ingestion Pipeline
 *
 * Orchestrates the complete document ingestion process:
 * 1. Parse document
 * 2. Chunk content (content-aware)
 * 3. Generate embeddings (batch)
 * 4. Store in Milvus and Neo4j
 * 5. Extract knowledge triples
 *
 * Includes async job tracking and state machine for document status.
 *
 * @module @jubilant/rag/ingestion/pipeline
 */

import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { Driver } from 'neo4j-driver';
import type { EmbeddedChunk, IngestRequest, IngestResponse, IngestStatusResponse } from '../types';
import { ContentAwareChunker, createChunker, type ChunkerConfig } from './chunker';
import { BatchEmbedder, createBatchEmbedder, type BatchEmbedderConfig } from './embedder';
import { ChunkStorageManager, createChunkStorageManager, type StorageConfig } from './storage';
import { TripleExtractor, Neo4jTripleStorage, createTripleExtractor, createTripleStorage, type TripleExtractorConfig } from './extractor';
import { parseDocument, type DocumentParser, type ParsedDocument } from './parsers';

// ============================================================================
// Document Status State Machine (T063)
// ============================================================================

/**
 * Valid document/job statuses
 */
export type DocumentStatus =
  | 'pending'
  | 'chunking'
  | 'embedding'
  | 'extracting'
  | 'active'
  | 'failed';

/**
 * Valid status transitions
 */
export const STATUS_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  pending: ['chunking', 'failed'],
  chunking: ['embedding', 'failed'],
  embedding: ['extracting', 'failed'],
  extracting: ['active', 'failed'],
  active: [], // Terminal state
  failed: ['pending'], // Can retry
};

/**
 * Check if a status transition is valid
 */
export function isValidTransition(
  from: DocumentStatus,
  to: DocumentStatus
): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get the next expected status after the current one
 */
export function getNextStatus(current: DocumentStatus): DocumentStatus | null {
  const transitions = STATUS_TRANSITIONS[current];
  // Return the first non-failed transition
  return transitions?.find((s) => s !== 'failed') || null;
}

// ============================================================================
// Job Tracking Types
// ============================================================================

/**
 * Ingestion job record (matches ingestionJobs table)
 */
export interface IngestionJob {
  id: string;
  documentId: string;
  status: DocumentStatus;
  currentStep: string | null;
  progress: number;
  totalChunks: number | null;
  processedChunks: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * Document record (matches documents table)
 */
export interface DocumentRecord {
  id: string;
  url: string;
  title: string;
  format: string;
  status: DocumentStatus;
  chunkCount: number;
  errorMessage: string | null;
}

// ============================================================================
// Pipeline Configuration
// ============================================================================

/**
 * Configuration for IngestionPipeline
 */
export interface IngestionPipelineConfig {
  /** Chunker configuration */
  chunker: Partial<ChunkerConfig>;
  /** Batch embedder configuration */
  embedder: Partial<BatchEmbedderConfig>;
  /** Storage configuration */
  storage: Partial<StorageConfig>;
  /** Triple extractor configuration */
  extractor: Partial<TripleExtractorConfig>;
  /** Whether to extract triples (can be skipped for faster ingestion) */
  extractTriples: boolean;
}

const DEFAULT_CONFIG: IngestionPipelineConfig = {
  chunker: {},
  embedder: {},
  storage: {},
  extractor: {},
  extractTriples: true,
};

/**
 * Progress callback for pipeline stages
 */
export type PipelineProgressCallback = (progress: {
  stage: 'parsing' | 'chunking' | 'embedding' | 'storing' | 'extracting';
  message: string;
  percentage: number;
}) => void;

/**
 * Result of a pipeline run
 */
export interface PipelineResult {
  documentId: string;
  jobId: string;
  status: DocumentStatus;
  chunkCount: number;
  tripleCount: number;
  duration: number;
  error?: string;
}

// ============================================================================
// Database Interface (T062)
// ============================================================================

/**
 * Database operations interface
 * This abstracts the database layer for flexibility
 */
export interface DatabaseOperations {
  insertDocument(doc: {
    id: string;
    url: string;
    title: string;
    format: string;
    status: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;

  insertJob(job: {
    id: string;
    documentId: string;
    status: string;
    progress: number;
  }): Promise<void>;

  getJob(jobId: string): Promise<IngestionJob | null>;

  getDocument(documentId: string): Promise<DocumentRecord | null>;

  updateJob(
    jobId: string,
    updates: Partial<IngestionJob>
  ): Promise<void>;

  updateDocument(
    documentId: string,
    updates: Partial<DocumentRecord>
  ): Promise<void>;
}

// ============================================================================
// Ingestion Pipeline Class (T061)
// ============================================================================

/**
 * IngestionPipeline - Orchestrates document ingestion
 *
 * Coordinates all stages of document processing:
 * - Document parsing (multiple formats)
 * - Content-aware chunking
 * - Batch embedding
 * - Cross-store storage (Milvus + Neo4j)
 * - Knowledge triple extraction
 *
 * Includes job tracking and status updates.
 */
export class IngestionPipeline {
  private chunker: ContentAwareChunker;
  private embedder: BatchEmbedder;
  private storage: ChunkStorageManager;
  private extractor: TripleExtractor;
  private tripleStorage: Neo4jTripleStorage;
  private config: IngestionPipelineConfig;

  // Database reference for job tracking
  private db: DatabaseOperations | null = null;

  constructor(
    milvusClient: MilvusClient,
    neo4jDriver: Driver,
    config: Partial<IngestionPipelineConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.chunker = createChunker(this.config.chunker);
    this.embedder = createBatchEmbedder(undefined, this.config.embedder);
    this.storage = createChunkStorageManager(
      milvusClient,
      neo4jDriver,
      this.config.storage
    );
    this.extractor = createTripleExtractor(undefined, this.config.extractor);
    this.tripleStorage = createTripleStorage(neo4jDriver);
  }

  /**
   * Set up database operations for job tracking
   *
   * @param db - Database operations implementation
   */
  setDatabase(db: DatabaseOperations): void {
    this.db = db;
  }

  /**
   * Start ingestion of a document
   *
   * Creates document record and job, then returns immediately.
   * Use processJob() to actually run the ingestion.
   *
   * @param request - Ingestion request
   * @returns Ingestion response with job and document IDs
   */
  async startIngestion(request: IngestRequest): Promise<IngestResponse> {
    if (!this.db) {
      throw new Error('Database not configured. Call setDatabase() first.');
    }

    const documentId = crypto.randomUUID();
    const jobId = crypto.randomUUID();

    // Create document record
    await this.db.insertDocument({
      id: documentId,
      url: request.documentUrl,
      title: request.title || this.extractTitleFromUrl(request.documentUrl),
      format: request.format || this.detectFormat(request.documentUrl),
      status: 'pending',
      metadata: request.metadata || {},
    });

    // Create job record
    await this.db.insertJob({
      id: jobId,
      documentId,
      status: 'queued',
      progress: 0,
    });

    return {
      jobId,
      documentId,
      status: 'queued',
    };
  }

  /**
   * Get job status
   *
   * @param jobId - Job ID to check
   * @returns Job status response
   */
  async getJobStatus(jobId: string): Promise<IngestStatusResponse | null> {
    if (!this.db) {
      throw new Error('Database not configured. Call setDatabase() first.');
    }

    const job = await this.db.getJob(jobId);
    if (!job) return null;

    return {
      jobId: job.id,
      documentId: job.documentId,
      status: job.status as IngestStatusResponse['status'],
      progress: job.progress,
      totalChunks: job.totalChunks || undefined,
      processedChunks: job.processedChunks,
      errorMessage: job.errorMessage || undefined,
    };
  }

  /**
   * Process an ingestion job
   *
   * Runs the full ingestion pipeline for a queued job.
   *
   * @param jobId - Job ID to process
   * @param onProgress - Optional progress callback
   * @returns Pipeline result
   */
  async processJob(
    jobId: string,
    onProgress?: PipelineProgressCallback
  ): Promise<PipelineResult> {
    const startTime = Date.now();

    // Get job and document info
    const job = await this.getJobStatus(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const { documentId } = job;
    let status: DocumentStatus = 'pending';
    let chunkCount = 0;
    let tripleCount = 0;
    let error: string | undefined;

    try {
      // Stage 1: Parse document
      await this.updateJobStatus(jobId, 'chunking', 'Parsing document...', 0);
      onProgress?.({ stage: 'parsing', message: 'Parsing document...', percentage: 5 });

      const document = await this.fetchAndParseDocument(job.documentId, jobId);

      // Stage 2: Chunk document
      onProgress?.({ stage: 'chunking', message: 'Chunking content...', percentage: 15 });

      const chunks = this.chunker.chunk(document.content, {
        documentId,
        documentTitle: document.title,
        documentUrl: document.url,
      });

      chunkCount = chunks.length;
      await this.updateJobProgress(jobId, 'chunking', 25, chunkCount);

      // Stage 3: Embed chunks
      await this.updateJobStatus(jobId, 'embedding', 'Generating embeddings...', 30);
      onProgress?.({ stage: 'embedding', message: 'Generating embeddings...', percentage: 30 });

      const embedResult = await this.embedder.embedChunks(chunks, (p) => {
        const percentage = 30 + (p.completed / p.total) * 30;
        onProgress?.({
          stage: 'embedding',
          message: `Embedding chunk ${p.completed}/${p.total}`,
          percentage,
        });
        this.updateJobProgress(jobId, 'embedding', Math.floor(percentage), chunkCount, p.completed);
      });

      if (embedResult.failed.length > 0) {
        console.warn(`${embedResult.failed.length} chunks failed to embed`);
      }

      // Stage 4: Store in databases
      await this.updateJobStatus(jobId, 'extracting', 'Storing chunks...', 60);
      onProgress?.({ stage: 'storing', message: 'Storing in databases...', percentage: 60 });

      const storageResult = await this.storage.storeChunks(
        embedResult.embeddings,
        document.url,
        (p) => {
          const percentage = 60 + (p.completed / p.total) * 15;
          onProgress?.({
            stage: 'storing',
            message: `Storing in ${p.phase}...`,
            percentage,
          });
        }
      );

      if (storageResult.errors.length > 0) {
        console.warn('Storage errors:', storageResult.errors);
      }

      // Stage 5: Extract triples (optional)
      if (this.config.extractTriples) {
        onProgress?.({ stage: 'extracting', message: 'Extracting knowledge triples...', percentage: 75 });

        const extractResult = await this.extractor.extractFromChunks(
          embedResult.embeddings,
          (p) => {
            const percentage = 75 + (p.completed / p.total) * 20;
            onProgress?.({
              stage: 'extracting',
              message: `Extracting triples: ${p.triplesExtracted} found`,
              percentage,
            });
          }
        );

        // Store triples
        tripleCount = await this.tripleStorage.storeTriples(extractResult.triples);
      }

      // Mark as complete
      status = 'active';
      await this.updateJobStatus(jobId, 'complete', 'Ingestion complete', 100);
      await this.updateDocumentStatus(documentId, 'active', chunkCount);

      onProgress?.({ stage: 'extracting', message: 'Complete!', percentage: 100 });

    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
      await this.updateJobStatus(jobId, 'failed', error, -1);
      await this.updateDocumentStatus(documentId, 'failed', 0, error);
    }

    return {
      documentId,
      jobId,
      status,
      chunkCount,
      tripleCount,
      duration: Date.now() - startTime,
      error,
    };
  }

  /**
   * Ingest a document synchronously (without job tracking)
   *
   * For simpler use cases where job tracking isn't needed.
   *
   * @param content - Document content
   * @param metadata - Document metadata
   * @param onProgress - Optional progress callback
   * @returns Embedded chunks
   */
  async ingestDirect(
    content: string,
    metadata: {
      documentId: string;
      documentTitle: string;
      documentUrl: string;
    },
    onProgress?: PipelineProgressCallback
  ): Promise<EmbeddedChunk[]> {
    // Chunk
    onProgress?.({ stage: 'chunking', message: 'Chunking content...', percentage: 10 });
    const chunks = this.chunker.chunk(content, metadata);

    // Embed
    onProgress?.({ stage: 'embedding', message: 'Generating embeddings...', percentage: 30 });
    const embedResult = await this.embedder.embedChunks(chunks);

    // Store
    onProgress?.({ stage: 'storing', message: 'Storing chunks...', percentage: 60 });
    await this.storage.storeChunks(embedResult.embeddings, metadata.documentUrl);

    // Extract triples
    if (this.config.extractTriples) {
      onProgress?.({ stage: 'extracting', message: 'Extracting triples...', percentage: 80 });
      const extractResult = await this.extractor.extractFromChunks(embedResult.embeddings);
      await this.tripleStorage.storeTriples(extractResult.triples);
    }

    onProgress?.({ stage: 'extracting', message: 'Complete!', percentage: 100 });

    return embedResult.embeddings;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Fetch and parse a document
   */
  private async fetchAndParseDocument(
    documentId: string,
    _jobId: string
  ): Promise<ParsedDocument> {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const doc = await this.db.getDocument(documentId);
    if (!doc) {
      throw new Error(`Document ${documentId} not found`);
    }

    // Parse the document
    return await parseDocument(doc.url, doc.format as 'markdown' | 'pdf' | 'text');
  }

  /**
   * Update job status
   */
  private async updateJobStatus(
    jobId: string,
    status: string,
    message: string,
    progress: number
  ): Promise<void> {
    if (!this.db) return;

    await this.db.updateJob(jobId, {
      status: status as DocumentStatus,
      currentStep: message,
      progress: Math.max(0, progress),
      startedAt: status === 'chunking' ? new Date() : undefined,
      completedAt: status === 'complete' || status === 'failed' ? new Date() : undefined,
      errorMessage: status === 'failed' ? message : null,
    });
  }

  /**
   * Update job progress
   */
  private async updateJobProgress(
    jobId: string,
    _status: string,
    progress: number,
    totalChunks?: number,
    processedChunks?: number
  ): Promise<void> {
    if (!this.db) return;

    await this.db.updateJob(jobId, {
      progress,
      totalChunks: totalChunks ?? null,
      processedChunks: processedChunks ?? 0,
    });
  }

  /**
   * Update document status
   */
  private async updateDocumentStatus(
    documentId: string,
    status: DocumentStatus,
    chunkCount: number,
    errorMessage?: string
  ): Promise<void> {
    if (!this.db) return;

    await this.db.updateDocument(documentId, {
      status,
      chunkCount,
      errorMessage: errorMessage ?? null,
    });
  }

  /**
   * Extract title from URL/path
   */
  private extractTitleFromUrl(url: string): string {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  }

  /**
   * Detect format from URL/path
   */
  private detectFormat(url: string): string {
    const ext = url.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (ext === 'pdf') return 'pdf';
    return 'text';
  }

  /**
   * Get the chunker instance
   */
  getChunker(): ContentAwareChunker {
    return this.chunker;
  }

  /**
   * Get the embedder instance
   */
  getEmbedder(): BatchEmbedder {
    return this.embedder;
  }

  /**
   * Get the storage manager
   */
  getStorage(): ChunkStorageManager {
    return this.storage;
  }

  /**
   * Get the triple extractor
   */
  getExtractor(): TripleExtractor {
    return this.extractor;
  }
}

/**
 * Create an IngestionPipeline
 */
export function createIngestionPipeline(
  milvusClient: MilvusClient,
  neo4jDriver: Driver,
  config?: Partial<IngestionPipelineConfig>
): IngestionPipeline {
  return new IngestionPipeline(milvusClient, neo4jDriver, config);
}
