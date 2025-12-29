/**
 * RAG Pipeline
 *
 * Main orchestrator that combines retrieval, reranking, and generation
 * into a complete query processing pipeline.
 *
 * @module @jubilant/rag/pipeline
 */

import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { Driver } from 'neo4j-driver';
import type {
  QueryRequest,
  QueryResponse,
  RankedResult,
  Citation,
  ResponseMetadata,
  StreamChunk,
  FusedResult,
} from './types';
import {
  HybridRetriever,
  type HybridRetrievalResult,
  type RetrievalMetrics,
} from './retrieval/hybrid';
import {
  MetricsCollector,
  createMetricsCollector,
  type DetailedRetrievalMetrics,
} from './retrieval/metrics';
import { Qwen3Reranker, createReranker } from './reranking/reranker';
import { Qwen3LLM, createLLM, type ChatMessage } from './generation/llm';
import { Qwen3Embedding, createEmbedder } from './generation/embedder';
import { createCitations, filterUsedCitations } from './generation/citations';
import {
  buildChatMessages,
  getConfidenceLevel,
  hasInsufficientEvidence,
  type ConfidenceLevel,
} from './generation/prompts';
import {
  createTokenChunk,
  createCitationChunk,
  createMetadataChunk,
  createDoneChunk,
  createErrorChunk,
  createConfidenceChunk,
  CitationDetector,
} from './generation/streaming';

/**
 * Configuration for RAGPipeline
 */
export interface RAGPipelineConfig {
  /** Number of results from hybrid retrieval */
  retrievalTopK: number;
  /** Number of results after reranking */
  rerankTopK: number;
  /** Confidence threshold for insufficient evidence */
  confidenceThreshold: number;
  /** Whether to include graph retrieval */
  includeGraph: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: RAGPipelineConfig = {
  retrievalTopK: 20, // Retrieve 10 from each source
  rerankTopK: 5, // Return top 5 after reranking
  confidenceThreshold: 0.6,
  includeGraph: true,
};

/**
 * Query context with all intermediate results
 */
export interface QueryContext {
  query: string;
  queryId: string;
  retrievalResult: HybridRetrievalResult;
  rankedResults: RankedResult[];
  citations: Citation[];
  confidenceLevel: ConfidenceLevel;
  hasInsufficientEvidence: boolean;
  messages: ChatMessage[];
  /** Detailed metrics collected during query processing */
  detailedMetrics?: DetailedRetrievalMetrics;
}

/**
 * RAGPipeline - Complete query processing pipeline
 *
 * Pipeline stages:
 * 1. Hybrid Retrieval: Parallel vector + graph search with RRF fusion
 * 2. Reranking: Qwen3-Reranker-4B scoring
 * 3. Citation Generation: Create citations from ranked results
 * 4. Response Generation: Qwen3-32B with grounded prompts
 */
export class RAGPipeline {
  private hybridRetriever: HybridRetriever;
  private reranker: Qwen3Reranker;
  private llm: Qwen3LLM;
  private config: RAGPipelineConfig;

  constructor(
    milvusClient: MilvusClient,
    neo4jDriver: Driver,
    config: Partial<RAGPipelineConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // Initialize components
    const embedder = createEmbedder();

    this.hybridRetriever = new HybridRetriever(
      milvusClient,
      neo4jDriver,
      embedder,
      {
        topK: this.config.retrievalTopK,
        includeGraph: this.config.includeGraph,
      }
    );

    this.reranker = createReranker({
      topN: this.config.rerankTopK,
      confidenceThreshold: this.config.confidenceThreshold,
    });

    this.llm = createLLM();
  }

  /**
   * Process a query and return a complete response
   *
   * @param request - The query request
   * @returns Complete query response with citations
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    const startTime = Date.now();
    const queryId = crypto.randomUUID();

    try {
      // Build query context through retrieval and reranking
      const context = await this.buildContext(request, queryId);

      // Generate response
      const answer = await this.llm.complete(context.messages);

      // Filter to only used citations
      const usedCitations = filterUsedCitations(context.citations, answer);

      // Build response
      const metadata: ResponseMetadata = {
        queryId,
        totalTokens: this.estimateTokens(
          context.messages.map((m) => m.content).join('')
        ),
        citationCount: usedCitations.length,
        confidence: context.confidenceLevel,
        vectorResultCount: context.retrievalResult.metrics.vectorResultCount,
        graphResultCount: context.retrievalResult.metrics.graphResultCount,
        latencyMs: Date.now() - startTime,
      };

      return {
        queryId,
        answer,
        citations: usedCitations,
        confidence: context.confidenceLevel,
        metadata,
      };
    } catch (error) {
      throw new Error(
        `Query processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Process a query and stream the response
   *
   * @param request - The query request
   * @returns Async generator of stream chunks
   */
  async *queryStream(request: QueryRequest): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();
    const queryId = crypto.randomUUID();

    try {
      // Build query context through retrieval and reranking
      const context = await this.buildContext(request, queryId);

      // Emit confidence information early in the stream
      // This allows the UI to show uncertainty indicators before the response arrives
      const topScore =
        context.rankedResults.length > 0
          ? context.rankedResults[0].rerankScore
          : 0;

      yield createConfidenceChunk({
        level: context.confidenceLevel,
        hasInsufficientEvidence: context.hasInsufficientEvidence,
        topScore,
      });

      // Set up citation detection
      const citationDetector = new CitationDetector(context.citations);
      let fullResponse = '';

      // Stream generation
      for await (const chunk of this.llm.stream(context.messages)) {
        if (chunk.content) {
          fullResponse += chunk.content;
          yield createTokenChunk(chunk.content);

          // Check for citations
          const detectedCitations = citationDetector.processToken(chunk.content);
          for (const citation of detectedCitations) {
            yield createCitationChunk(citation);
          }
        }

        if (chunk.finishReason === 'stop') {
          break;
        }
      }

      // Emit metadata at the end
      const metadata: ResponseMetadata = {
        queryId,
        totalTokens: this.estimateTokens(fullResponse),
        citationCount: citationDetector.getEmittedCitationIds().length,
        confidence: context.confidenceLevel,
        vectorResultCount: context.retrievalResult.metrics.vectorResultCount,
        graphResultCount: context.retrievalResult.metrics.graphResultCount,
        latencyMs: Date.now() - startTime,
      };

      yield createMetadataChunk(metadata);
      yield createDoneChunk();
    } catch (error) {
      yield createErrorChunk(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Build query context through retrieval and reranking
   */
  private async buildContext(
    request: QueryRequest,
    queryId: string
  ): Promise<QueryContext> {
    const query = request.query;
    const topK = request.topK || this.config.rerankTopK;
    const includeGraph = request.includeGraph ?? this.config.includeGraph;

    // Initialize metrics collector
    const metricsCollector = createMetricsCollector(queryId, this.config.confidenceThreshold);

    // Step 1: Hybrid retrieval (timing is handled internally by HybridRetriever)
    const retrievalResult = await this.hybridRetriever.retrieve(
      query,
      this.config.retrievalTopK,
      includeGraph,
      request.topicFilter
    );

    // Record retrieval metrics from hybrid retriever
    const retrievalMetrics = retrievalResult.metrics;
    metricsCollector.recordVectorResults(
      retrievalResult.results
        .filter((r) => r.vectorRank !== undefined)
        .map((r) => r.fusedScore)
    );
    metricsCollector.recordGraphResults(
      retrievalMetrics.graphResultCount,
      retrievalMetrics.graphMaxDepth,
      retrievalMetrics.conceptsFound ?? 0
    );
    metricsCollector.recordFusionResults(retrievalResult.results);

    // Step 2: Rerank fused results with timing
    metricsCollector.startStage('rerank');
    const rankedResults = await this.rerankFusedResults(
      query,
      retrievalResult.results,
      topK
    );
    metricsCollector.stopStage('rerank');

    // Record reranking metrics
    metricsCollector.recordRerankResults(rankedResults.map((r) => r.rerankScore));

    // Step 3: Determine confidence level
    const topScore = rankedResults.length > 0 ? rankedResults[0].rerankScore : 0;
    const confidenceLevel = getConfidenceLevel(topScore);
    const insufficientEvidence = hasInsufficientEvidence(
      topScore,
      this.config.confidenceThreshold
    );

    // Step 4: Create citations
    const citations = createCitations(rankedResults);

    // Step 5: Build chat messages
    const messages = buildChatMessages(
      query,
      rankedResults,
      citations,
      insufficientEvidence,
      confidenceLevel
    );

    // Record final context metrics
    const totalTokens = this.estimateTokens(messages.map((m) => m.content).join(''));
    metricsCollector.setFinalContext(totalTokens, citations.length);

    return {
      query,
      queryId,
      retrievalResult,
      rankedResults,
      citations,
      confidenceLevel,
      hasInsufficientEvidence: insufficientEvidence,
      messages,
      detailedMetrics: metricsCollector.getDetailedMetrics(),
    };
  }

  /**
   * Rerank fused results using Qwen3Reranker
   */
  private async rerankFusedResults(
    query: string,
    fusedResults: FusedResult[],
    topK: number
  ): Promise<RankedResult[]> {
    if (fusedResults.length === 0) {
      return [];
    }

    // Extract content for reranking
    const documents = fusedResults.map((r) => r.content);

    // Rerank
    const reranked = await this.reranker.rerank(query, documents);

    // Map back to RankedResult format
    return reranked.slice(0, topK).map((r) => {
      const original = fusedResults[r.index];
      return {
        id: original.id,
        content: original.content,
        rerankScore: r.score,
        originalFusedScore: original.fusedScore,
        metadata: original.metadata,
      };
    });
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English
    // This is imprecise but sufficient for metadata
    return Math.ceil(text.length / 4);
  }

  /**
   * Get retrieval metrics from the last query
   *
   * @param request - The query request
   * @returns Retrieval metrics for logging
   */
  async getRetrievalMetrics(request: QueryRequest): Promise<RetrievalMetrics> {
    const result = await this.hybridRetriever.retrieve(
      request.query,
      this.config.retrievalTopK,
      request.includeGraph ?? this.config.includeGraph,
      request.topicFilter
    );
    return result.metrics;
  }

  /**
   * Get the confidence threshold
   */
  get confidenceThreshold(): number {
    return this.config.confidenceThreshold;
  }
}

/**
 * Create a RAGPipeline with default configuration
 */
export function createRAGPipeline(
  milvusClient: MilvusClient,
  neo4jDriver: Driver,
  config?: Partial<RAGPipelineConfig>
): RAGPipeline {
  return new RAGPipeline(milvusClient, neo4jDriver, config);
}
