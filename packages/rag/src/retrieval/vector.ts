/**
 * Milvus Vector Retriever
 *
 * Performs semantic similarity search using Milvus vector database.
 * Returns top-K results based on cosine similarity of query embeddings.
 *
 * @module @jubilant/rag/retrieval/vector
 */

import type { MilvusClient, SearchResultData } from '@zilliz/milvus2-sdk-node';
import type { RetrievalResult, ChunkMetadata } from '../types';
import { Qwen3Embedding, createEmbedder } from '../generation/embedder';

/**
 * Configuration for MilvusRetriever
 */
export interface MilvusRetrieverConfig {
  /** Milvus collection name */
  collectionName: string;
  /** Number of results to return */
  topK: number;
  /** Vector field name in the collection */
  vectorField: string;
  /** Output fields to retrieve */
  outputFields: string[];
  /** Optional topic filter */
  topicFilter?: string;
  /** Search parameters for HNSW index */
  searchParams?: {
    ef?: number;
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<MilvusRetrieverConfig> = {
  collectionName: 'knowledge_chunks',
  topK: 10,
  vectorField: 'vector',
  outputFields: ['chunk_id', 'content_text', 'metadata', 'topic_tag'],
  searchParams: {
    ef: 64, // ef for HNSW search (should be >= topK)
  },
};

/**
 * Extended search result data from Milvus with our schema fields
 */
type MilvusSearchResult = SearchResultData & {
  chunk_id?: number;
  content_text?: string;
  metadata?: ChunkMetadata | string;
  topic_tag?: string;
};

/**
 * MilvusRetriever - Vector similarity search using Milvus
 */
export class MilvusRetriever {
  private client: MilvusClient;
  private embedder: Qwen3Embedding;
  private config: MilvusRetrieverConfig;

  constructor(
    client: MilvusClient,
    embedder?: Qwen3Embedding,
    config: Partial<MilvusRetrieverConfig> = {}
  ) {
    this.client = client;
    this.embedder = embedder || createEmbedder();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as MilvusRetrieverConfig;
  }

  /**
   * Search for similar chunks given a query string
   *
   * @param query - The search query
   * @param topK - Optional override for number of results
   * @param topicFilter - Optional topic filter
   * @returns Array of retrieval results sorted by similarity
   */
  async search(
    query: string,
    topK?: number,
    topicFilter?: string
  ): Promise<RetrievalResult[]> {
    const k = topK || this.config.topK;
    const filter = topicFilter || this.config.topicFilter;

    // Generate query embedding
    const queryEmbedding = await this.embedder.getQueryEmbedding(query);

    // Build search request
    const searchParams: Record<string, unknown> = {
      collection_name: this.config.collectionName,
      vector: queryEmbedding,
      limit: k,
      output_fields: this.config.outputFields,
      metric_type: 'COSINE',
      params: this.config.searchParams,
    };

    // Add topic filter if specified
    if (filter) {
      searchParams.filter = `topic_tag == "${filter}"`;
    }

    // Execute search with type assertion for our schema
    const searchResult = await this.client.search(searchParams as Parameters<typeof this.client.search>[0]);

    if (!searchResult.results || searchResult.results.length === 0) {
      return [];
    }

    // Transform results to RetrievalResult format
    return searchResult.results.map((rawHit) => {
      const hit = rawHit as MilvusSearchResult;
      // Parse metadata if it's a string
      const metadata =
        typeof hit.metadata === 'string'
          ? JSON.parse(hit.metadata)
          : hit.metadata;

      return {
        id: String(hit.chunk_id || hit.id || ''),
        content: hit.content_text || '',
        score: hit.score ?? 0,
        metadata: (metadata || {}) as ChunkMetadata,
        source: 'vector' as const,
      };
    });
  }

  /**
   * Search with pre-computed embedding vector
   *
   * @param embedding - Pre-computed query embedding
   * @param topK - Number of results to return
   * @param topicFilter - Optional topic filter
   * @returns Array of retrieval results
   */
  async searchWithEmbedding(
    embedding: number[],
    topK?: number,
    topicFilter?: string
  ): Promise<RetrievalResult[]> {
    const k = topK || this.config.topK;
    const filter = topicFilter || this.config.topicFilter;

    const searchParams: Record<string, unknown> = {
      collection_name: this.config.collectionName,
      vector: embedding,
      limit: k,
      output_fields: this.config.outputFields,
      metric_type: 'COSINE',
      params: this.config.searchParams,
    };

    if (filter) {
      searchParams.filter = `topic_tag == "${filter}"`;
    }

    const searchResult = await this.client.search(searchParams as Parameters<typeof this.client.search>[0]);

    if (!searchResult.results || searchResult.results.length === 0) {
      return [];
    }

    return searchResult.results.map((rawHit) => {
      const hit = rawHit as MilvusSearchResult;
      const metadata =
        typeof hit.metadata === 'string'
          ? JSON.parse(hit.metadata)
          : hit.metadata;

      return {
        id: String(hit.chunk_id || hit.id || ''),
        content: hit.content_text || '',
        score: hit.score ?? 0,
        metadata: (metadata || {}) as ChunkMetadata,
        source: 'vector' as const,
      };
    });
  }

  /**
   * Get the configured collection name
   */
  get collectionName(): string {
    return this.config.collectionName;
  }

  /**
   * Get the configured topK
   */
  get topK(): number {
    return this.config.topK;
  }
}

/**
 * Create a MilvusRetriever with default configuration
 */
export function createMilvusRetriever(
  client: MilvusClient,
  embedder?: Qwen3Embedding,
  config?: Partial<MilvusRetrieverConfig>
): MilvusRetriever {
  return new MilvusRetriever(client, embedder, config);
}
