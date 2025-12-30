/**
 * Qwen3 Embedding Client
 *
 * Custom embedding implementation for Qwen3-Embedding-8B model
 * via OpenAI-compatible API.
 *
 * @module @jubilant/rag/generation/embedder
 */

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
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<Qwen3EmbeddingConfig> = {
  baseUrl: process.env.EMBEDDING_BASE_URL || 'http://localhost:8001/v1',
  model: process.env.EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B',
  dimensions: 4096,
  timeout: 30000,
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
export class Qwen3Embedding {
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
    // Process in batches of 32 to avoid overloading the API
    const batchSize = 32;
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

/**
 * Create a Qwen3Embedding instance with environment configuration
 */
export function createEmbedder(config: Partial<Qwen3EmbeddingConfig> = {}): Qwen3Embedding {
  return new Qwen3Embedding({
    baseUrl: process.env.EMBEDDING_BASE_URL,
    apiKey: process.env.EMBEDDING_API_KEY,
    model: process.env.EMBEDDING_MODEL,
    ...config,
  });
}
