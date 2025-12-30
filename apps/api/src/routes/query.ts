/**
 * Query Routes
 *
 * Endpoints for RAG query processing:
 * - POST /api/query - Submit a question, get complete response
 * - POST /api/query/stream - Submit a question, get streaming SSE response
 *
 * Includes request timeout handling (T086) with 3 second first token target.
 *
 * @module apps/api/routes/query
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, postgresSchema } from '@jubilant/database';
import {
  createRAGPipeline,
  formatSSEEvent,
  createErrorChunk,
  type QueryRequest,
  type QueryResponse,
  type ErrorResponse,
  type DetailedRetrievalMetrics,
} from '@jubilant/rag';
import { queryThrottleMiddleware, queryThrottle } from '../middleware/throttle';

const query = new Hono();

// Apply throttle middleware to all query routes (T087/T088)
query.use('*', queryThrottleMiddleware);

// ============================================================================
// Timeout Configuration (T086)
// ============================================================================

/**
 * Timeout thresholds for query processing
 */
const TIMEOUT_CONFIG = {
  /** Target time for first token in streaming mode (3 seconds) */
  FIRST_TOKEN_TARGET_MS: 3000,
  /** Maximum time for complete query (2 minutes) */
  COMPLETE_QUERY_MAX_MS: 120000,
  /** Retrieval phase timeout (10 seconds) */
  RETRIEVAL_TIMEOUT_MS: 10000,
  /** Generation phase timeout (90 seconds) */
  GENERATION_TIMEOUT_MS: 90000,
};

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
function createTimeoutPromise<T>(
  ms: number,
  errorMessage: string
): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new QueryTimeoutError(errorMessage, ms));
    }, ms);
  });
}

/**
 * Custom error class for query timeouts
 */
class QueryTimeoutError extends Error {
  public readonly timeoutMs: number;
  public readonly isTimeout = true;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'QueryTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Execute a promise with a timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    createTimeoutPromise<T>(timeoutMs, errorMessage),
  ]);
}

// ============================================================================
// Validation Schemas
// ============================================================================

const querySchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(2000, 'Query exceeds maximum length of 2000 characters'),
  sessionId: z.string().uuid().optional(),
  topK: z.number().int().min(1).max(20).default(5),
  includeGraph: z.boolean().default(true),
  topicFilter: z.string().optional(),
});

const streamQuerySchema = querySchema.extend({
  stream: z.literal(true).optional(),
});

// ============================================================================
// Pipeline Initialization
// ============================================================================

let pipeline: ReturnType<typeof createRAGPipeline> | null = null;

/**
 * Get or create the RAG pipeline
 */
function getOrCreatePipeline() {
  if (!pipeline) {
    if (!db.isConnected) {
      throw new Error('Database not connected. Call db.connect() first.');
    }
    pipeline = createRAGPipeline(db.milvus, db.neo4j);
  }
  return pipeline;
}

// ============================================================================
// Metrics Logging
// ============================================================================

/**
 * Log query metrics to the database
 */
async function logQueryMetrics(
  queryId: string,
  sessionId: string | undefined,
  executionTimeMs: number,
  vectorHits: number,
  neo4jHits: number,
  strategyUsed: 'hybrid' | 'vector_only' | 'graph_only'
) {
  try {
    // Insert into rag_queries table
    await db.postgres.insert(postgresSchema.ragQueries).values({
      id: queryId,
      sessionId: sessionId || null,
      timestamp: new Date(),
      queryHash: null, // Anonymized - not storing actual query
      executionTimeMs,
      milvusHits: vectorHits,
      neo4jHits,
      strategyUsed,
    });
  } catch (error) {
    console.error('Failed to log query metrics:', error);
    // Don't throw - metrics logging shouldn't fail the request
  }
}

/**
 * Log detailed retrieval metrics from the DetailedRetrievalMetrics object
 */
async function logDetailedRetrievalMetrics(
  metrics: DetailedRetrievalMetrics
): Promise<void> {
  try {
    await db.postgres.insert(postgresSchema.retrievalMetrics).values({
      queryId: metrics.queryId,
      vectorSearchMs: metrics.timing.vectorSearchMs,
      vectorResultCount: metrics.vector.resultCount,
      vectorTopScore: metrics.vector.topScore,
      vectorAvgScore: metrics.vector.avgScore,
      graphTraversalMs: metrics.timing.graphTraversalMs,
      graphResultCount: metrics.graph.resultCount,
      graphMaxDepth: metrics.graph.maxDepth,
      conceptsFound: metrics.graph.conceptsFound,
      fusionMs: metrics.timing.fusionMs,
      overlapCount: metrics.fusion.overlapCount,
      rrfTopScore: metrics.fusion.rrfTopScore,
      rerankMs: metrics.timing.rerankMs,
      rerankTopScore: metrics.rerank.topScore,
      confidenceThresholdMet: metrics.rerank.confidenceThresholdMet,
      finalContextTokens: metrics.finalContextTokens,
      citationCount: metrics.citationCount,
    });
  } catch (error) {
    console.error('Failed to log detailed retrieval metrics:', error);
  }
}

/**
 * Log detailed retrieval metrics (legacy format for backward compatibility)
 */
async function logRetrievalMetrics(
  queryId: string,
  metrics: {
    vectorSearchMs: number;
    vectorResultCount: number;
    vectorTopScore: number | null;
    vectorAvgScore: number | null;
    graphTraversalMs: number;
    graphResultCount: number;
    graphMaxDepth: number;
    fusionMs: number;
    overlapCount: number;
    rrfTopScore: number | null;
    rerankMs?: number;
    rerankTopScore?: number;
    confidenceThresholdMet?: boolean;
    finalContextTokens?: number;
    citationCount?: number;
  }
) {
  try {
    await db.postgres.insert(postgresSchema.retrievalMetrics).values({
      queryId,
      vectorSearchMs: metrics.vectorSearchMs,
      vectorResultCount: metrics.vectorResultCount,
      vectorTopScore: metrics.vectorTopScore,
      vectorAvgScore: metrics.vectorAvgScore,
      graphTraversalMs: metrics.graphTraversalMs,
      graphResultCount: metrics.graphResultCount,
      graphMaxDepth: metrics.graphMaxDepth,
      fusionMs: metrics.fusionMs,
      overlapCount: metrics.overlapCount,
      rrfTopScore: metrics.rrfTopScore,
      rerankMs: metrics.rerankMs,
      rerankTopScore: metrics.rerankTopScore,
      confidenceThresholdMet: metrics.confidenceThresholdMet,
      finalContextTokens: metrics.finalContextTokens,
      citationCount: metrics.citationCount,
    });
  } catch (error) {
    console.error('Failed to log retrieval metrics:', error);
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/query
 *
 * Submit a question and receive a complete response with citations.
 * Includes timeout handling (T086) with 2 minute max processing time.
 */
query.post(
  '/',
  zValidator('json', querySchema, (result, c) => {
    if (!result.success) {
      const errorResponse: ErrorResponse = {
        error: 'VALIDATION_ERROR',
        message: 'Invalid query request',
        details: result.error.flatten().fieldErrors,
      };
      return c.json(errorResponse, 400);
    }
  }),
  async (c) => {
    const startTime = Date.now();
    const body = c.req.valid('json');

    try {
      const ragPipeline = getOrCreatePipeline();

      const request: QueryRequest = {
        query: body.query,
        sessionId: body.sessionId,
        topK: body.topK,
        includeGraph: body.includeGraph,
        topicFilter: body.topicFilter,
      };

      // Execute query with timeout (T086)
      const response = await withTimeout(
        ragPipeline.query(request),
        TIMEOUT_CONFIG.COMPLETE_QUERY_MAX_MS,
        `Query processing timed out after ${TIMEOUT_CONFIG.COMPLETE_QUERY_MAX_MS / 1000} seconds`
      );

      // Log metrics asynchronously
      const executionTimeMs = Date.now() - startTime;
      logQueryMetrics(
        response.queryId,
        body.sessionId,
        executionTimeMs,
        response.metadata.vectorResultCount,
        response.metadata.graphResultCount,
        body.includeGraph ? 'hybrid' : 'vector_only'
      ).catch(console.error);

      return c.json(response, 200);
    } catch (error) {
      console.error('Query processing error:', error);

      // Handle timeout errors specifically (T086)
      if (error instanceof QueryTimeoutError) {
        const errorResponse: ErrorResponse = {
          error: 'QUERY_TIMEOUT',
          message: error.message,
          details: {
            timeoutMs: error.timeoutMs,
            elapsedMs: Date.now() - startTime,
          },
        };
        return c.json(errorResponse, 504); // Gateway Timeout
      }

      const errorResponse: ErrorResponse = {
        error: 'QUERY_PROCESSING_ERROR',
        message: error instanceof Error ? error.message : 'Failed to process query',
      };

      return c.json(errorResponse, 500);
    }
  }
);

/**
 * POST /api/query/stream
 *
 * Submit a question and receive a streaming SSE response.
 * Includes first token timing tracking (T086) with 3 second target.
 */
query.post(
  '/stream',
  zValidator('json', streamQuerySchema, (result, c) => {
    if (!result.success) {
      const errorResponse: ErrorResponse = {
        error: 'VALIDATION_ERROR',
        message: 'Invalid query request',
        details: result.error.flatten().fieldErrors,
      };
      return c.json(errorResponse, 400);
    }
  }),
  async (c) => {
    const startTime = Date.now();
    const body = c.req.valid('json');

    try {
      const ragPipeline = getOrCreatePipeline();

      const request: QueryRequest = {
        query: body.query,
        sessionId: body.sessionId,
        topK: body.topK,
        includeGraph: body.includeGraph,
        topicFilter: body.topicFilter,
      };

      return streamSSE(c, async (stream) => {
        let firstTokenSent = false;
        let firstTokenLatencyMs: number | undefined;

        try {
          let queryId: string | undefined;

          for await (const chunk of ragPipeline.queryStream(request)) {
            // Track first token latency (T086)
            if (!firstTokenSent && chunk.type === 'token') {
              firstTokenSent = true;
              firstTokenLatencyMs = Date.now() - startTime;

              // Log warning if first token exceeds target
              if (firstTokenLatencyMs > TIMEOUT_CONFIG.FIRST_TOKEN_TARGET_MS) {
                console.warn(
                  `First token latency exceeded target: ${firstTokenLatencyMs}ms ` +
                  `(target: ${TIMEOUT_CONFIG.FIRST_TOKEN_TARGET_MS}ms)`
                );
              }
            }

            // Capture queryId from metadata
            if (chunk.type === 'metadata' && chunk.metadata) {
              queryId = chunk.metadata.queryId;

              // Add first token latency to metadata
              const enrichedMetadata = {
                ...chunk.metadata,
                firstTokenLatencyMs,
                firstTokenTargetMet: firstTokenLatencyMs
                  ? firstTokenLatencyMs <= TIMEOUT_CONFIG.FIRST_TOKEN_TARGET_MS
                  : undefined,
              };

              // Log metrics when we have them
              const executionTimeMs = Date.now() - startTime;
              logQueryMetrics(
                queryId,
                body.sessionId,
                executionTimeMs,
                chunk.metadata.vectorResultCount,
                chunk.metadata.graphResultCount,
                body.includeGraph ? 'hybrid' : 'vector_only'
              ).catch(console.error);

              // Send enriched metadata
              await stream.writeSSE({
                event: chunk.type,
                data: JSON.stringify({
                  ...chunk,
                  metadata: enrichedMetadata,
                }),
              });
              continue;
            }

            await stream.writeSSE({
              event: chunk.type,
              data: JSON.stringify(chunk),
            });

            if (chunk.type === 'done' || chunk.type === 'error') {
              break;
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);

          // Determine if this was a timeout
          const isTimeout = error instanceof QueryTimeoutError ||
            (error instanceof Error && error.message.toLowerCase().includes('timeout'));

          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify(
              createErrorChunk(
                isTimeout
                  ? 'Query generation timed out. Please try a shorter or simpler question.'
                  : error instanceof Error ? error.message : 'Streaming failed'
              )
            ),
          });
        }
      });
    } catch (error) {
      console.error('Stream setup error:', error);

      const errorResponse: ErrorResponse = {
        error: 'STREAM_SETUP_ERROR',
        message: error instanceof Error ? error.message : 'Failed to setup stream',
      };

      return c.json(errorResponse, 500);
    }
  }
);

/**
 * GET /api/query/status
 *
 * Get current query processing status and throttle metrics (T087).
 * Useful for monitoring and load balancing.
 */
query.get('/status', (c) => {
  const status = queryThrottle.getStatus();
  const metrics = queryThrottle.getMetrics();

  return c.json({
    status: 'operational',
    capacity: {
      maxConcurrent: 10,
      active: status.active,
      available: status.available,
      queued: status.queued,
      queueCapacity: status.queueCapacity,
    },
    metrics: {
      totalRequests: metrics.totalRequests,
      totalQueued: metrics.totalQueued,
      totalRejected: metrics.totalRejected,
      totalTimedOut: metrics.totalTimedOut,
      avgQueueWaitMs: Math.round(metrics.avgQueueWaitMs),
      peakConcurrent: metrics.peakConcurrent,
      peakQueueSize: metrics.peakQueueSize,
    },
    health: {
      healthy: status.active < 10 && status.queued < 20,
      underLoad: status.active >= 8 || status.queued >= 10,
      atCapacity: status.active >= 10,
      queuedRequests: status.queued > 0,
    },
  });
});

export default query;
