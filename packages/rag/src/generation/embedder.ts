/**
 * Embedding Client Factory
 *
 * Provides a unified Embedder interface and factory function that supports
 * multiple embedding providers: OpenAI-compatible (Qwen3) and Google Vertex AI.
 *
 * @module @jubilant/rag/generation/embedder
 */

import { VertexEmbedding } from './embedder-vertex';
import type { VertexEmbeddingConfig } from './embedder-vertex';

// ============================================================================
// Common Embedder Interface
// ============================================================================

/**
 * Supported embedding providers
 */
export type EmbeddingProvider = 'openai' | 'vertex';

/**
 * Common interface that all embedding providers implement
 */
export interface Embedder {
  getTextEmbedding(text: string): Promise<number[]>;
  getTextEmbeddings(texts: string[]): Promise<number[][]>;
  getQueryEmbedding(query: string): Promise<number[]>;
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number; message?: string }>;
  readonly dimensions: number;
}

// ============================================================================
// OpenAI-Compatible (Qwen3) Embedding Provider
// ============================================================================

/**
 * Configuration for Qwen3Embedding
 */
export interface Qwen3EmbeddingConfig {
  /** Base URL for the embedding service */
  baseUrl: string;
  /** API key (optional for local deployments) */
  apiKey?: string;
  /** Model name */
  model: string;
  /** Embedding dimensions (default: 4096 for Qwen3-Embedding-8B) */
  dimensions?: number;
  /** Request timeout in milliseconds (default: 120000 for local model compatibility) */
  timeout?: number;
  /** Maximum texts per API call (default: 32) */
  batchSize?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<Qwen3EmbeddingConfig> = {
  baseUrl: process.env.EMBEDDING_BASE_URL || 'http://localhost:8001/v1',
  model: process.env.EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B',
  dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '4096', 10),
  timeout: parseInt(process.env.EMBEDDING_TIMEOUT || '300000', 10),
  batchSize: 32,
};

/**
 * OpenAI-compatible embedding response
 */
interface EmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Qwen3 Embedding implementation using OpenAI-compatible API
 *
 * This is a standalone implementation that doesn't extend LlamaIndex BaseEmbedding
 * to avoid type compatibility issues. It provides the same interface.
 */
export class Qwen3Embedding implements Embedder {
  private config: Qwen3EmbeddingConfig;

  constructor(config: Partial<Qwen3EmbeddingConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Qwen3EmbeddingConfig;
  }

  /**
   * Embed a single text string
   */
  async getTextEmbedding(text: string): Promise<number[]> {
    const response = await this.callEmbeddingAPI([text]);
    return response.data[0].embedding;
  }

  /**
   * Embed multiple text strings in a batch
   */
  async getTextEmbeddings(texts: string[]): Promise<number[][]> {
    const batchSize = this.config.batchSize || 32;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.callEmbeddingAPI(batch);

      // Sort by index to maintain order
      const sortedData = response.data.sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sortedData.map(d => d.embedding));
    }

    return allEmbeddings;
  }

  /**
   * Get query embedding (same as text embedding for this model)
   */
  async getQueryEmbedding(query: string): Promise<number[]> {
    return this.getTextEmbedding(query);
  }

  /**
   * Call the OpenAI-compatible embedding API
   */
  private async callEmbeddingAPI(input: string[]): Promise<EmbeddingResponse> {
    const url = `${this.config.baseUrl}/embeddings`;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout || 120000
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
          input,
          encoding_format: 'float',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${error}`);
      }

      return (await response.json()) as EmbeddingResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if the embedding service is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; message?: string }> {
    const start = Date.now();

    try {
      // Test with a simple embedding request
      await this.getTextEmbedding('health check');
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
   * Get the embedding dimensions
   */
  get dimensions(): number {
    return this.config.dimensions || 4096;
  }
}

// ============================================================================
// Embedder Factory
// ============================================================================

/**
 * Create an embedder instance based on the configured provider.
 *
 * Provider is selected via EMBEDDING_PROVIDER env var:
 * - "openai" (default): Uses Qwen3Embedding (OpenAI-compatible API)
 * - "vertex": Uses VertexEmbedding (Google Vertex AI)
 */
export function createEmbedder(config: Partial<Qwen3EmbeddingConfig> = {}): Embedder {
  const provider = (process.env.EMBEDDING_PROVIDER || 'openai') as EmbeddingProvider;

  if (provider === 'vertex') {
    return new VertexEmbedding({
      projectId: process.env.GCP_PROJECT_ID || '',
      region: process.env.GCP_REGION || 'us-central1',
      model: process.env.EMBEDDING_MODEL || 'text-multilingual-embedding-002',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10),
      timeout: parseInt(process.env.EMBEDDING_TIMEOUT || '30000', 10),
      batchSize: config.batchSize,
    });
  }

  // Default: OpenAI-compatible (existing behavior)
  return new Qwen3Embedding({
    baseUrl: process.env.EMBEDDING_BASE_URL,
    apiKey: process.env.EMBEDDING_API_KEY,
    model: process.env.EMBEDDING_MODEL,
    ...config,
  });
}
