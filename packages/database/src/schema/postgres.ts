import { pgTable, serial, text, integer, timestamp, uuid, jsonb, boolean } from 'drizzle-orm/pg-core';

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
