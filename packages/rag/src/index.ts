/**
 * @jubilant/rag - Hybrid RAG Pipeline Package
 *
 * This package provides the core RAG (Retrieval-Augmented Generation) pipeline
 * that combines Milvus vector search with Neo4j knowledge graph traversal.
 *
 * @module @jubilant/rag
 */

// ============================================================================
// Core Types
// ============================================================================

export * from './types';

// ============================================================================
// RAG Pipeline
// ============================================================================

export { RAGPipeline, createRAGPipeline } from './pipeline';
export type { RAGPipelineConfig, QueryContext } from './pipeline';

// ============================================================================
// Retrieval Components
// ============================================================================

export { MilvusRetriever, createMilvusRetriever } from './retrieval/vector';
export type { MilvusRetrieverConfig } from './retrieval/vector';

export { Neo4jGraphRetriever, createGraphRetriever } from './retrieval/graph';
export type { Neo4jGraphRetrieverConfig } from './retrieval/graph';

export {
  HybridRetriever,
  createHybridRetriever,
  reciprocalRankFusion,
} from './retrieval/hybrid';
export type {
  HybridRetrieverConfig,
  HybridRetrievalResult,
  RetrievalMetrics,
} from './retrieval/hybrid';

export {
  MetricsCollector,
  createMetricsCollector,
  StageTimer,
  calculateScoreStats,
} from './retrieval/metrics';
export type {
  DetailedRetrievalMetrics,
  TimingMetrics,
  VectorStats,
  GraphStats,
  FusionStats,
  RerankStats,
} from './retrieval/metrics';

// ============================================================================
// LLM Components
// ============================================================================

export { Qwen3Embedding, createEmbedder } from './generation/embedder';
export type { Qwen3EmbeddingConfig } from './generation/embedder';

export { Qwen3LLM, createLLM } from './generation/llm';
export type { Qwen3LLMConfig, ChatMessage, LLMStreamChunk } from './generation/llm';

export {
  LLMHealthChecker,
  createHealthChecker,
  checkLLMHealth,
} from './generation/health';
export type { LLMHealthStatus } from './generation/health';

// ============================================================================
// Reranking
// ============================================================================

export { Qwen3Reranker, createReranker } from './reranking/reranker';
export type { Qwen3RerankerConfig, RerankedResult } from './reranking/reranker';

// ============================================================================
// Generation Utilities
// ============================================================================

export {
  getConfidenceLevel,
  hasInsufficientEvidence,
  formatContext,
  buildChatMessages,
  createQueryPrompt,
  createInsufficientEvidencePrompt,
  GROUNDED_RESPONSE_SYSTEM_PROMPT,
} from './generation/prompts';
export type { ConfidenceLevel } from './generation/prompts';

export {
  createCitations,
  extractSnippet,
  extractCitationIds,
  filterUsedCitations,
  renumberCitations,
  formatCitation,
  createReferencesSection,
  validateCitations,
} from './generation/citations';
export type { CitationConfig } from './generation/citations';

// ============================================================================
// Streaming Utilities
// ============================================================================

export {
  formatSSEEvent,
  createTokenChunk,
  createCitationChunk,
  createMetadataChunk,
  createDoneChunk,
  createErrorChunk,
  createConfidenceChunk,
  createSSETransformStream,
  createSSEStream,
  parseSSEEvent,
  parseSSEResponse,
  CitationDetector,
  StreamResponseBuilder,
  SSE_HEADERS,
} from './generation/streaming';

// ============================================================================
// Ingestion Components
// ============================================================================

export {
  ContentAwareChunker,
  createChunker,
  countTokens,
  extractProtectedElements,
  restoreProtectedElements,
  splitIntoSections,
  chunkText,
} from './ingestion/chunker';
export type {
  ChunkerConfig,
  ProtectedElement,
  Section,
  Chunk,
} from './ingestion/chunker';

export {
  BatchEmbedder,
  createBatchEmbedder,
} from './ingestion/embedder';
export type {
  BatchEmbedderConfig,
  BatchEmbedResult,
  EmbeddingProgressCallback,
} from './ingestion/embedder';

export {
  MilvusChunkStorage,
  Neo4jChunkStorage,
  ChunkStorageManager,
  createChunkStorageManager,
} from './ingestion/storage';
export type {
  StorageConfig,
  StorageResult,
  StorageProgressCallback,
} from './ingestion/storage';

export {
  TripleExtractor,
  Neo4jTripleStorage,
  createTripleExtractor,
  createTripleStorage,
  validateTriple,
  parseTriples,
  VALID_PREDICATES,
  MIN_CONFIDENCE,
  TRIPLE_EXTRACTION_SYSTEM_PROMPT,
  createTripleExtractionPrompt,
} from './ingestion/extractor';
export type {
  TripleExtractorConfig,
  ExtractionResult,
  ExtractionProgressCallback,
  ValidPredicate,
} from './ingestion/extractor';

export {
  IngestionPipeline,
  createIngestionPipeline,
  isValidTransition,
  getNextStatus,
  STATUS_TRANSITIONS,
} from './ingestion/pipeline';
export type {
  IngestionPipelineConfig,
  PipelineResult,
  PipelineProgressCallback,
  DocumentStatus,
  IngestionJob,
  DocumentRecord,
  DatabaseOperations,
} from './ingestion/pipeline';

// ============================================================================
// Document Parsers
// ============================================================================

export {
  parseDocument,
  getParser,
  detectFormat,
  validateSource,
  isFormatSupported,
  getSupportedFormats,
  registerParser,
  MarkdownParser,
  createMarkdownParser,
  PDFParser,
  createPDFParser,
  TextParser,
  createTextParser,
} from './ingestion/parsers';
export type {
  DocumentFormat,
  ParsedDocument,
  DocumentParser,
} from './ingestion/parsers';
