/**
 * Hybrid Retriever
 *
 * Combines Milvus vector search with Neo4j graph traversal using
 * Reciprocal Rank Fusion (RRF) for result merging.
 *
 * @module @jubilant/rag/retrieval/hybrid
 */

import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { Driver } from 'neo4j-driver';
import type { RetrievalResult, FusedResult, ChunkMetadata } from '../types';
import { MilvusRetriever, type MilvusRetrieverConfig } from './vector';
import { Neo4jGraphRetriever, type Neo4jGraphRetrieverConfig } from './graph';
import { Qwen3Embedding, createEmbedder } from '../generation/embedder';

/**
 * Configuration for HybridRetriever
 */
export interface HybridRetrieverConfig {
  /** Configuration for vector retriever */
  vector?: Partial<MilvusRetrieverConfig>;
  /** Configuration for graph retriever */
  graph?: Partial<Neo4jGraphRetrieverConfig>;
  /** RRF constant (k parameter) - higher values give more weight to lower-ranked results */
  rrfK: number;
  /** Number of final results after fusion */
  topK: number;
  /** Whether to include graph retrieval */
  includeGraph: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: HybridRetrieverConfig = {
  rrfK: 60, // Standard RRF constant
  topK: 10,
  includeGraph: true,
};

/**
 * Retrieval metrics for logging
 */
export interface RetrievalMetrics {
  vectorSearchMs: number;
  vectorResultCount: number;
  vectorTopScore: number | null;
  vectorAvgScore: number | null;
  graphTraversalMs: number;
  graphResultCount: number;
  graphMaxDepth: number;
  /** Number of distinct concepts found in graph traversal */
  conceptsFound?: number;
  fusionMs: number;
  overlapCount: number;
  rrfTopScore: number | null;
}

/**
 * Result from hybrid retrieval
 */
export interface HybridRetrievalResult {
  results: FusedResult[];
  metrics: RetrievalMetrics;
}

/**
 * Reciprocal Rank Fusion (RRF)
 *
 * Merges multiple ranked lists into a single list.
 * RRF score = sum(1 / (k + rank)) for each list where the item appears.
 *
 * @param resultLists - Array of ranked result lists
 * @param k - RRF constant (default 60)
 * @returns Merged results sorted by RRF score
 */
export function reciprocalRankFusion(
  resultLists: RetrievalResult[][],
  k: number = 60
): Map<string, { score: number; ranks: Map<string, number>; result: RetrievalResult }> {
  const fusedScores = new Map<
    string,
    { score: number; ranks: Map<string, number>; result: RetrievalResult }
  >();

  for (const results of resultLists) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      const rrfScore = 1 / (k + rank + 1); // rank is 0-indexed, so add 1

      const existing = fusedScores.get(result.id);
      if (existing) {
        existing.score += rrfScore;
        existing.ranks.set(result.source, rank + 1);
      } else {
        const ranks = new Map<string, number>();
        ranks.set(result.source, rank + 1);
        fusedScores.set(result.id, {
          score: rrfScore,
          ranks,
          result,
        });
      }
    }
  }

  return fusedScores;
}

/**
 * HybridRetriever - Combines vector and graph retrieval with RRF fusion
 */
export class HybridRetriever {
  private vectorRetriever: MilvusRetriever;
  private graphRetriever: Neo4jGraphRetriever;
  private config: HybridRetrieverConfig;

  constructor(
    milvusClient: MilvusClient,
    neo4jDriver: Driver,
    embedder?: Qwen3Embedding,
    config: Partial<HybridRetrieverConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    const embeddingClient = embedder || createEmbedder();
    this.vectorRetriever = new MilvusRetriever(
      milvusClient,
      embeddingClient,
      config.vector
    );
    this.graphRetriever = new Neo4jGraphRetriever(
      neo4jDriver,
      config.graph
    );
  }

  /**
   * Perform hybrid retrieval with parallel execution
   *
   * @param query - The search query
   * @param topK - Number of final results
   * @param includeGraph - Whether to include graph retrieval
   * @param topicFilter - Optional topic filter for vector search
   * @returns Fused results with retrieval metrics
   */
  async retrieve(
    query: string,
    topK?: number,
    includeGraph?: boolean,
    topicFilter?: string
  ): Promise<HybridRetrievalResult> {
    const k = topK || this.config.topK;
    const useGraph = includeGraph ?? this.config.includeGraph;

    const metrics: RetrievalMetrics = {
      vectorSearchMs: 0,
      vectorResultCount: 0,
      vectorTopScore: null,
      vectorAvgScore: null,
      graphTraversalMs: 0,
      graphResultCount: 0,
      graphMaxDepth: 0,
      fusionMs: 0,
      overlapCount: 0,
      rrfTopScore: null,
    };

    // Execute retrieval in parallel
    const retrievalStart = Date.now();

    const retrievalPromises: Promise<{ results: RetrievalResult[]; type: 'vector' | 'graph'; duration: number }>[] = [];

    // Vector search
    retrievalPromises.push(
      (async () => {
        const start = Date.now();
        const results = await this.vectorRetriever.search(query, k, topicFilter);
        return { results, type: 'vector' as const, duration: Date.now() - start };
      })()
    );

    // Graph search (if enabled)
    if (useGraph) {
      retrievalPromises.push(
        (async () => {
          const start = Date.now();
          const results = await this.graphRetriever.search(query, k);
          return { results, type: 'graph' as const, duration: Date.now() - start };
        })()
      );
    }

    const retrievalResults = await Promise.all(retrievalPromises);

    // Collect results and metrics
    const resultLists: RetrievalResult[][] = [];

    for (const { results, type, duration } of retrievalResults) {
      resultLists.push(results);

      if (type === 'vector') {
        metrics.vectorSearchMs = duration;
        metrics.vectorResultCount = results.length;
        if (results.length > 0) {
          metrics.vectorTopScore = results[0].score;
          metrics.vectorAvgScore =
            results.reduce((sum, r) => sum + r.score, 0) / results.length;
        }
      } else {
        metrics.graphTraversalMs = duration;
        metrics.graphResultCount = results.length;
        metrics.graphMaxDepth = this.graphRetriever.maxDepth;
      }
    }

    // Perform RRF fusion
    const fusionStart = Date.now();
    const fusedMap = reciprocalRankFusion(resultLists, this.config.rrfK);

    // Convert to sorted array
    const fusedResults: FusedResult[] = Array.from(fusedMap.entries())
      .map(([id, data]) => ({
        id,
        content: data.result.content,
        fusedScore: data.score,
        vectorRank: data.ranks.get('vector'),
        graphRank: data.ranks.get('graph'),
        metadata: data.result.metadata,
      }))
      .sort((a, b) => b.fusedScore - a.fusedScore)
      .slice(0, k);

    metrics.fusionMs = Date.now() - fusionStart;
    metrics.overlapCount = fusedResults.filter(
      (r) => r.vectorRank !== undefined && r.graphRank !== undefined
    ).length;
    if (fusedResults.length > 0) {
      metrics.rrfTopScore = fusedResults[0].fusedScore;
    }

    return {
      results: fusedResults,
      metrics,
    };
  }

  /**
   * Perform vector-only retrieval (for fallback or testing)
   */
  async vectorOnly(
    query: string,
    topK?: number,
    topicFilter?: string
  ): Promise<RetrievalResult[]> {
    return this.vectorRetriever.search(query, topK, topicFilter);
  }

  /**
   * Perform graph-only retrieval (for fallback or testing)
   */
  async graphOnly(query: string, topK?: number): Promise<RetrievalResult[]> {
    return this.graphRetriever.search(query, topK);
  }

  /**
   * Get the configured topK
   */
  get topK(): number {
    return this.config.topK;
  }
}

/**
 * Create a HybridRetriever with default configuration
 */
export function createHybridRetriever(
  milvusClient: MilvusClient,
  neo4jDriver: Driver,
  embedder?: Qwen3Embedding,
  config?: Partial<HybridRetrieverConfig>
): HybridRetriever {
  return new HybridRetriever(milvusClient, neo4jDriver, embedder, config);
}
