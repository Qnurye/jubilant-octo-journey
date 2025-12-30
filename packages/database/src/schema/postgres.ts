import { pgTable, serial, text, integer, timestamp, uuid, jsonb, boolean, real } from 'drizzle-orm/pg-core';

// ============================================================================
// Document Registry
// ============================================================================

/**
 * Source documents in the knowledge base
 */
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  url: text('url').notNull().unique(),
  title: text('title').notNull(),
  format: text('format').notNull(), // 'markdown', 'pdf', 'text'
  author: text('author'),
  fileHash: text('file_hash'),
  fileSize: integer('file_size'),
  chunkCount: integer('chunk_count').default(0),
  status: text('status').default('pending'), // 'pending', 'processing', 'active', 'failed', 'archived'
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  ingestedAt: timestamp('ingested_at'),
});

/**
 * Async ingestion job tracking
 */
export const ingestionJobs = pgTable('ingestion_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id),
  status: text('status').default('queued'), // 'queued', 'chunking', 'embedding', 'extracting', 'complete', 'failed'
  currentStep: text('current_step'),
  progress: integer('progress').default(0), // 0-100
  totalChunks: integer('total_chunks'),
  processedChunks: integer('processed_chunks').default(0),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// Analytics & Sessions
// ============================================================================

export const analyticsSessions = pgTable('analytics_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  userHash: text('user_hash').notNull(), // Anonymized
});

export const ragQueries = pgTable('rag_queries', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').references(() => analyticsSessions.id),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  queryHash: text('query_hash'), // Anonymized
  executionTimeMs: integer('execution_time_ms'),
  milvusHits: integer('milvus_hits'),
  neo4jHits: integer('neo4j_hits'),
  strategyUsed: text('strategy_used'), // 'vector_only', 'graph_only', 'hybrid'
});

export const feedbackEvents = pgTable('feedback_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  queryId: uuid('query_id').references(() => ragQueries.id),
  rating: integer('rating'), // 1-5 or binary 0/1
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// Retrieval Metrics
// ============================================================================

/**
 * Detailed per-query retrieval metrics for quality monitoring
 */
export const retrievalMetrics = pgTable('retrieval_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  queryId: uuid('query_id').references(() => ragQueries.id),

  // Vector retrieval metrics
  vectorSearchMs: integer('vector_search_ms'),
  vectorResultCount: integer('vector_result_count'),
  vectorTopScore: real('vector_top_score'),
  vectorAvgScore: real('vector_avg_score'),

  // Graph retrieval metrics
  graphTraversalMs: integer('graph_traversal_ms'),
  graphResultCount: integer('graph_result_count'),
  graphMaxDepth: integer('graph_max_depth'),
  conceptsFound: integer('concepts_found'),

  // Fusion metrics
  fusionMs: integer('fusion_ms'),
  overlapCount: integer('overlap_count'), // Results in both vector & graph
  rrfTopScore: real('rrf_top_score'),

  // Reranking metrics
  rerankMs: integer('rerank_ms'),
  rerankTopScore: real('rerank_top_score'),
  confidenceThresholdMet: boolean('confidence_threshold_met'), // >= 0.6

  // Final context
  finalContextTokens: integer('final_context_tokens'),
  citationCount: integer('citation_count'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});
