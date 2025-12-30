export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'tutor' | 'admin';
  createdAt: Date;
}

export type CreateUserDTO = Omit<User, 'id' | 'createdAt'>;

// ============================================================================
// RAG Pipeline Types (T090)
// Exported here for apps/web type checking
// ============================================================================

/**
 * Confidence level for RAG responses
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

/**
 * Citation from a RAG response
 */
export interface Citation {
  id: string;
  documentId: string;
  documentTitle: string;
  documentUrl: string;
  chunkIndex: number;
  snippet: string;
  relevanceScore: number;
}

/**
 * Metadata for a RAG response
 */
export interface ResponseMetadata {
  queryId: string;
  totalTokens: number;
  citationCount: number;
  confidence: ConfidenceLevel;
  vectorResultCount: number;
  graphResultCount: number;
  latencyMs: number;
  /** First token latency for streaming responses */
  firstTokenLatencyMs?: number;
  /** Whether first token target was met */
  firstTokenTargetMet?: boolean;
}

/**
 * Query request parameters
 */
export interface QueryRequest {
  query: string;
  sessionId?: string;
  topK?: number;
  includeGraph?: boolean;
  topicFilter?: string;
}

/**
 * Complete query response
 */
export interface QueryResponse {
  queryId: string;
  answer: string;
  citations: Citation[];
  confidence: ConfidenceLevel;
  metadata: ResponseMetadata;
}

/**
 * Stream chunk types for SSE responses
 */
export type StreamChunkType =
  | 'token'
  | 'citation'
  | 'metadata'
  | 'confidence'
  | 'done'
  | 'error';

/**
 * Base stream chunk
 */
export interface BaseStreamChunk {
  type: StreamChunkType;
}

/**
 * Token chunk (streaming content)
 */
export interface TokenChunk extends BaseStreamChunk {
  type: 'token';
  content: string;
}

/**
 * Citation chunk (reference detected)
 */
export interface CitationChunk extends BaseStreamChunk {
  type: 'citation';
  citation: Citation;
}

/**
 * Metadata chunk (end of response)
 */
export interface MetadataChunk extends BaseStreamChunk {
  type: 'metadata';
  metadata: ResponseMetadata;
}

/**
 * Confidence chunk (early confidence indicator)
 */
export interface ConfidenceChunk extends BaseStreamChunk {
  type: 'confidence';
  confidence: {
    level: ConfidenceLevel;
    hasInsufficientEvidence: boolean;
    topScore: number;
  };
}

/**
 * Done chunk (stream complete)
 */
export interface DoneChunk extends BaseStreamChunk {
  type: 'done';
}

/**
 * Error chunk (stream error)
 */
export interface ErrorChunk extends BaseStreamChunk {
  type: 'error';
  error: string;
}

/**
 * Union of all stream chunk types
 */
export type StreamChunk =
  | TokenChunk
  | CitationChunk
  | MetadataChunk
  | ConfidenceChunk
  | DoneChunk
  | ErrorChunk;

/**
 * API error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * Feedback request
 */
export interface FeedbackRequest {
  queryId: string;
  rating: number;
  comment?: string;
}

/**
 * Feedback response
 */
export interface FeedbackResponse {
  success: true;
  feedbackId: string;
  message: string;
}

/**
 * Query status response (throttle metrics)
 */
export interface QueryStatusResponse {
  status: 'operational' | 'degraded' | 'down';
  capacity: {
    maxConcurrent: number;
    active: number;
    available: number;
    queued: number;
    queueCapacity: number;
  };
  metrics: {
    totalRequests: number;
    totalQueued: number;
    totalRejected: number;
    totalTimedOut: number;
    avgQueueWaitMs: number;
    peakConcurrent: number;
    peakQueueSize: number;
  };
  health: {
    healthy: boolean;
    underLoad: boolean;
    atCapacity: boolean;
    queuedRequests: boolean;
  };
}