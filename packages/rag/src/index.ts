/**
 * @jubilant/rag - Hybrid RAG Pipeline Package
 *
 * This package provides the core RAG (Retrieval-Augmented Generation) pipeline
 * that combines Milvus vector search with Neo4j knowledge graph traversal.
 *
 * @module @jubilant/rag
 */

// Export all types
export * from './types';

// Export LLM infrastructure
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

// Export reranker
export { Qwen3Reranker, createReranker } from './reranking/reranker';
export type { Qwen3RerankerConfig, RerankedResult } from './reranking/reranker';

// Placeholder exports for pipeline classes (to be implemented in Phase 3+)
// export { RAGPipeline } from './pipeline';
// export { HybridRetriever } from './retrieval/hybrid';
// export { MilvusRetriever } from './retrieval/vector';
// export { Neo4jGraphRetriever } from './retrieval/graph';
// export { IngestionPipeline } from './ingestion/pipeline';
