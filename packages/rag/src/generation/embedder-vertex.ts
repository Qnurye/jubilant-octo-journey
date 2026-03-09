/**
 * Vertex AI Embedding Client
 *
 * Embedding implementation using Google Vertex AI's text-multilingual-embedding-002
 * model via the Vertex AI predict API with Application Default Credentials.
 *
 * @module @jubilant/rag/generation/embedder-vertex
 */

import { GoogleAuth } from 'google-auth-library';
import type { Embedder } from './embedder';

/**
 * Configuration for VertexEmbedding
 */
export interface VertexEmbeddingConfig {
  /** Google Cloud project ID */
  projectId: string;
  /** Google Cloud region (default: us-central1) */
  region: string;
  /** Model name (default: text-multilingual-embedding-002) */
  model: string;
  /** Embedding dimensions (default: 768 for text-multilingual-embedding-002) */
  dimensions?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum texts per API call (default: 32, Vertex AI allows up to 250) */
  batchSize?: number;
}

/**
 * Vertex AI predict API response shape
 */
interface VertexPredictResponse {
  predictions: Array<{
    embeddings: {
      values: number[];
      statistics: {
        truncated: boolean;
        token_count: number;
      };
    };
  }>;
}

/**
 * Default configuration
 */
const DEFAULT_VERTEX_CONFIG: Partial<VertexEmbeddingConfig> = {
  region: 'us-central1',
  model: 'text-multilingual-embedding-002',
  dimensions: 768,
  timeout: 30000,
  batchSize: 32,
};

/**
 * Vertex AI Embedding implementation
 *
 * Uses Google Application Default Credentials (ADC) for authentication.
 * Supports the same interface as Qwen3Embedding for drop-in replacement.
 */
export class VertexEmbedding implements Embedder {
  private config: VertexEmbeddingConfig;
  private auth: GoogleAuth;
  private endpoint: string;

  constructor(config: Partial<VertexEmbeddingConfig> = {}) {
    this.config = {
      ...DEFAULT_VERTEX_CONFIG,
      ...config,
    } as VertexEmbeddingConfig;

    if (!this.config.projectId) {
      throw new Error('VertexEmbedding requires projectId (set GCP_PROJECT_ID env var)');
    }

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const { region, projectId, model } = this.config;
    this.endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:predict`;
  }

  /**
   * Embed a single text string
   */
  async getTextEmbedding(text: string): Promise<number[]> {
    const response = await this.callPredictAPI([text]);
    return response.predictions[0].embeddings.values;
  }

  /**
   * Embed multiple text strings in batches
   */
  async getTextEmbeddings(texts: string[]): Promise<number[][]> {
    const batchSize = this.config.batchSize || 32;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.callPredictAPI(batch);
      allEmbeddings.push(...response.predictions.map(p => p.embeddings.values));
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
   * Call the Vertex AI predict API
   */
  private async callPredictAPI(texts: string[]): Promise<VertexPredictResponse> {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    if (!token) {
      throw new Error('Failed to obtain access token from Google Auth');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout || 30000
    );

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instances: texts.map(content => ({ content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Vertex AI Embedding API error: ${response.status} - ${error}`);
      }

      return (await response.json()) as VertexPredictResponse;
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
    return this.config.dimensions || 768;
  }
}
