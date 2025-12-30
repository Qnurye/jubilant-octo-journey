/**
 * Qwen3 Reranker
 *
 * Custom reranker implementation for Qwen3-Reranker-4B model
 * via OpenAI-compatible API.
 *
 * @module @jubilant/rag/reranking/reranker
 */

import type { NodeWithScore, BaseNode } from 'llamaindex';
import { MetadataMode } from 'llamaindex';

/**
 * Configuration for Qwen3Reranker
 */
export interface Qwen3RerankerConfig {
  /** Base URL for the reranker service */
  baseUrl: string;
  /** API key (optional for local deployments) */
  apiKey?: string;
  /** Model name */
  model: string;
  /** Number of top results to return after reranking */
  topN: number;
  /** Minimum confidence threshold (results below this are filtered) */
  confidenceThreshold: number;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<Qwen3RerankerConfig> = {
  baseUrl: process.env.RERANKER_BASE_URL || 'http://localhost:8002/v1',
  model: process.env.RERANKER_MODEL || 'Qwen/Qwen3-Reranker-4B',
  topN: parseInt(process.env.RAG_RERANK_TOP_K || '5', 10),
  confidenceThreshold: parseFloat(process.env.RAG_CONFIDENCE_THRESHOLD || '0.6'),
  timeout: 30000,
};

/**
 * Reranker API response (OpenAI-compatible format)
 */
interface RerankerResponse {
  results: Array<{
    index: number;
    relevance_score: number;
  }>;
  model: string;
  usage?: {
    total_tokens: number;
  };
}

/**
 * Result from reranking operation
 */
export interface RerankedResult {
  index: number;
  content: string;
  score: number;
  isAboveThreshold: boolean;
}

/**
 * Qwen3 Reranker implementation using OpenAI-compatible API
 */
export class Qwen3Reranker {
  private config: Qwen3RerankerConfig;

  constructor(config: Partial<Qwen3RerankerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Qwen3RerankerConfig;
  }

  /**
   * Rerank documents based on query relevance
   *
   * @param query - The search query
   * @param documents - Array of document texts to rerank
   * @returns Reranked results sorted by relevance score
   */
  async rerank(query: string, documents: string[]): Promise<RerankedResult[]> {
    if (documents.length === 0) {
      return [];
    }

    const response = await this.callRerankerAPI(query, documents);

    // Map results with original content and threshold check
    const results: RerankedResult[] = response.results.map(r => ({
      index: r.index,
      content: documents[r.index],
      score: r.relevance_score,
      isAboveThreshold: r.relevance_score >= this.config.confidenceThreshold,
    }));

    // Sort by score descending and limit to topN
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.topN);
  }

  /**
   * Rerank LlamaIndex nodes (for pipeline integration)
   */
  async rerankNodes(query: string, nodes: NodeWithScore[]): Promise<NodeWithScore[]> {
    if (nodes.length === 0) {
      return [];
    }

    // Extract text content from nodes
    const documents = nodes.map(n =>
      n.node.getContent(MetadataMode.NONE)
    );

    const response = await this.callRerankerAPI(query, documents);

    // Create new NodeWithScore array with reranker scores
    const rerankedNodes: NodeWithScore[] = response.results
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, this.config.topN)
      .filter(r => r.relevance_score >= this.config.confidenceThreshold)
      .map(r => ({
        node: nodes[r.index].node,
        score: r.relevance_score,
      }));

    return rerankedNodes;
  }

  /**
   * Call the reranker API
   */
  private async callRerankerAPI(
    query: string,
    documents: string[]
  ): Promise<RerankerResponse> {
    const url = `${this.config.baseUrl}/rerank`;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout || 30000
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && {
            Authorization: `Bearer ${this.config.apiKey}`,
          }),
        },
        body: JSON.stringify({
          model: this.config.model,
          query,
          documents,
          top_n: this.config.topN,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Reranker API error: ${response.status} - ${error}`);
      }

      return (await response.json()) as RerankerResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if the reranker service is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; message?: string }> {
    const start = Date.now();

    try {
      // Test with a simple rerank request
      await this.rerank('test query', ['test document']);
      return {
        healthy: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calculate confidence level from the top reranker score
   */
  static getConfidenceLevel(topScore: number): 'high' | 'medium' | 'low' | 'insufficient' {
    if (topScore >= 0.8) return 'high';
    if (topScore >= 0.6) return 'medium';
    if (topScore >= 0.4) return 'low';
    return 'insufficient';
  }

  /**
   * Get the configured confidence threshold
   */
  get confidenceThreshold(): number {
    return this.config.confidenceThreshold;
  }

  /**
   * Get the configured topN
   */
  get topN(): number {
    return this.config.topN;
  }
}

/**
 * Create a Qwen3Reranker instance with environment configuration
 */
export function createReranker(config: Partial<Qwen3RerankerConfig> = {}): Qwen3Reranker {
  return new Qwen3Reranker({
    baseUrl: process.env.RERANKER_BASE_URL,
    apiKey: process.env.RERANKER_API_KEY,
    model: process.env.RERANKER_MODEL,
    topN: process.env.RAG_RERANK_TOP_K
      ? parseInt(process.env.RAG_RERANK_TOP_K, 10)
      : undefined,
    confidenceThreshold: process.env.RAG_CONFIDENCE_THRESHOLD
      ? parseFloat(process.env.RAG_CONFIDENCE_THRESHOLD)
      : undefined,
    ...config,
  });
}
