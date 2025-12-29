/**
 * Core types for the RAG pipeline
 * @module @jubilant/rag/types
 */

// ============================================================================
// Chunk and Embedding Types
// ============================================================================

/**
 * Metadata attached to each document chunk
 */
export interface ChunkMetadata {
  documentId: string;
  documentTitle: string;
  documentUrl: string;
  sectionHeader?: string;
  chunkIndex: number;
  totalChunks: number;
  tokenCount: number;
  hasCode: boolean;
  hasFormula: boolean;
  hasTable: boolean;
}

/**
 * A chunk with its embedding vector
 */
export interface EmbeddedChunk {
  id: string;
  content: string;
  embedding: number[];
  metadata: ChunkMetadata;
}

/**
 * A knowledge triple extracted from content
 */
export interface KnowledgeTriple {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  sourceChunkId: string;
}

// ============================================================================
// Retrieval Types
// ============================================================================

/**
 * Result from a single retriever (vector or graph)
 */
export interface RetrievalResult {
  id: string;
  content: string;
  score: number;
  metadata: ChunkMetadata;
  source: 'vector' | 'graph';
}

/**
 * Result after RRF fusion of multiple retrievers
 */
export interface FusedResult {
  id: string;
  content: string;
  fusedScore: number;
  vectorRank?: number;
  graphRank?: number;
  metadata: ChunkMetadata;
}

/**
 * Result after reranking
 */
export interface RankedResult {
  id: string;
  content: string;
  rerankScore: number;
  originalFusedScore: number;
  metadata: ChunkMetadata;
}

// ============================================================================
// Generation Types
// ============================================================================

/**
 * Citation reference in a generated response
 */
export interface Citation {
  id: string; // e.g., "[1]"
  chunkId: string;
  documentTitle: string;
  documentUrl: string;
  snippet: string;
  relevanceScore: number;
}

/**
 * Context provided to the LLM for response generation
 */
export interface QueryContext {
  query: string;
  rankedResults: RankedResult[];
  citations: Citation[];
  hasInsufficientEvidence: boolean;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
}

/**
 * A chunk of streamed response data
 */
export interface StreamChunk {
  type: 'token' | 'citation' | 'metadata' | 'done' | 'error';
  content?: string;
  citation?: Citation;
  metadata?: ResponseMetadata;
  error?: string;
}

/**
 * Metadata about a completed response
 */
export interface ResponseMetadata {
  queryId: string;
  totalTokens: number;
  citationCount: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  vectorResultCount: number;
  graphResultCount: number;
  latencyMs: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Query endpoint request body
 */
export interface QueryRequest {
  query: string;
  sessionId?: string;
  topK?: number;
  includeGraph?: boolean;
  topicFilter?: string;
}

/**
 * Query endpoint response body
 */
export interface QueryResponse {
  queryId: string;
  answer: string;
  citations: Citation[];
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  metadata: ResponseMetadata;
}

/**
 * Ingest endpoint request body
 */
export interface IngestRequest {
  documentUrl: string;
  title?: string;
  format?: 'markdown' | 'pdf' | 'text';
  metadata?: Record<string, unknown>;
}

/**
 * Ingest endpoint response body
 */
export interface IngestResponse {
  jobId: string;
  documentId: string;
  status: 'queued';
  estimatedChunks?: number;
}

/**
 * Ingestion job status
 */
export interface IngestStatusResponse {
  jobId: string;
  documentId: string;
  status: 'queued' | 'chunking' | 'embedding' | 'extracting' | 'complete' | 'failed';
  progress: number;
  totalChunks?: number;
  processedChunks?: number;
  errorMessage?: string;
}

/**
 * Feedback request body
 */
export interface FeedbackRequest {
  queryId: string;
  rating: number; // 1-5
  comment?: string;
}

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Health status for a single component
 */
export interface ComponentHealth {
  healthy: boolean;
  latencyMs?: number;
  message?: string;
}

/**
 * Overall health check response
 */
export interface HealthResponse {
  healthy: boolean;
  components: {
    milvus: ComponentHealth;
    neo4j: ComponentHealth;
    postgres: ComponentHealth;
    llm: ComponentHealth;
    embedding: ComponentHealth;
    reranker: ComponentHealth;
  };
  timestamp: string;
}

/**
 * Standard error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
