/**
 * Neo4j Graph Retriever
 *
 * Performs knowledge graph traversal using Neo4j to find related chunks
 * through concept relationships (prerequisites, related concepts, etc.)
 *
 * @module @jubilant/rag/retrieval/graph
 */

import { int, type Driver, type Session } from 'neo4j-driver';
import type { RetrievalResult, ChunkMetadata } from '../types';

/**
 * Configuration for Neo4jGraphRetriever
 */
export interface Neo4jGraphRetrieverConfig {
  /** Maximum traversal depth (hops) */
  maxDepth: number;
  /** Number of results to return */
  topK: number;
  /** Relationship types to follow */
  relationshipTypes: string[];
  /** Whether to use fulltext search for concept matching */
  useFulltextSearch: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Neo4jGraphRetrieverConfig = {
  maxDepth: 2,
  topK: 10,
  relationshipTypes: [
    'PREREQUISITE',
    'RELATED_TO',
    'COMPARED_TO',
    'PART_OF',
    'DISCUSSES',
  ],
  useFulltextSearch: true,
};

/**
 * Raw result from Neo4j query
 */
interface Neo4jChunkResult {
  chunkId: number;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
  conceptPath: string[];
}

/**
 * Neo4jGraphRetriever - Knowledge graph traversal using Neo4j
 *
 * Search strategy:
 * 1. Find concepts matching the query (via fulltext search or exact match)
 * 2. Traverse relationships to find related concepts
 * 3. Return chunks that discuss those concepts
 * 4. Score based on traversal depth and relationship strength
 */
export class Neo4jGraphRetriever {
  private driver: Driver;
  private config: Neo4jGraphRetrieverConfig;

  constructor(
    driver: Driver,
    config: Partial<Neo4jGraphRetrieverConfig> = {}
  ) {
    this.driver = driver;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Search for related chunks through graph traversal
   *
   * @param query - The search query
   * @param topK - Optional override for number of results
   * @returns Array of retrieval results sorted by graph relevance
   */
  async search(query: string, topK?: number): Promise<RetrievalResult[]> {
    const k = topK || this.config.topK;
    const session = this.driver.session();

    try {
      let results: RetrievalResult[];

      if (this.config.useFulltextSearch) {
        results = await this.searchWithFulltext(session, query, k);
      } else {
        results = await this.searchWithKeywords(session, query, k);
      }

      return results;
    } finally {
      await session.close();
    }
  }

  /**
   * Search using Neo4j fulltext index on concepts
   */
  private async searchWithFulltext(
    session: Session,
    query: string,
    topK: number
  ): Promise<RetrievalResult[]> {
    // Escape special characters in query for Lucene
    const escapedQuery = this.escapeLuceneQuery(query);

    const cypher = `
      // First, find concepts matching the query via fulltext search
      CALL db.index.fulltext.queryNodes('conceptNameIndex', $query) YIELD node AS concept, score AS conceptScore
      WITH concept, conceptScore
      ORDER BY conceptScore DESC
      LIMIT 5

      // Traverse to related concepts within maxDepth hops
      CALL {
        WITH concept
        MATCH path = (concept)-[r*1..${this.config.maxDepth}]-(related:Concept)
        WHERE ALL(rel IN relationships(path) WHERE type(rel) IN $relationshipTypes)
        RETURN related, length(path) AS depth
        UNION
        WITH concept
        RETURN concept AS related, 0 AS depth
      }
      WITH DISTINCT related, MIN(depth) AS minDepth

      // Find chunks that discuss these concepts
      MATCH (chunk:Chunk)-[:DISCUSSES]->(related)
      MATCH (chunk)-[:FROM_DOCUMENT]->(doc:Document)

      // Calculate score based on depth (closer = higher score)
      WITH chunk, doc, related,
           1.0 / (1.0 + minDepth) AS depthScore

      // Aggregate scores for chunks mentioned multiple concepts
      WITH chunk, doc,
           COLLECT(DISTINCT related.name) AS concepts,
           SUM(depthScore) AS totalScore

      RETURN
        chunk.chunk_id AS chunkId,
        chunk.preview AS content,
        totalScore AS score,
        {
          documentId: doc.url,
          documentTitle: doc.title,
          documentUrl: doc.url,
          hasCode: chunk.hasCode,
          hasFormula: chunk.hasFormula,
          hasTable: chunk.hasTable,
          tokenCount: chunk.tokenCount
        } AS metadata,
        concepts AS conceptPath
      ORDER BY totalScore DESC
      LIMIT $topK
    `;

    const result = await session.run(cypher, {
      query: escapedQuery,
      relationshipTypes: this.config.relationshipTypes,
      topK: int(topK),
    });

    return this.transformResults(result.records);
  }

  /**
   * Fallback search using keyword extraction from query
   */
  private async searchWithKeywords(
    session: Session,
    query: string,
    topK: number
  ): Promise<RetrievalResult[]> {
    // Extract keywords (simple approach: split on spaces, filter short words)
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 5); // Limit to 5 keywords

    if (keywords.length === 0) {
      return [];
    }

    const cypher = `
      // Find concepts matching any keyword
      UNWIND $keywords AS keyword
      MATCH (concept:Concept)
      WHERE toLower(concept.name) CONTAINS keyword
         OR ANY(alias IN concept.aliases WHERE toLower(alias) CONTAINS keyword)
      WITH DISTINCT concept

      // Traverse to related concepts
      CALL {
        WITH concept
        MATCH path = (concept)-[r*1..${this.config.maxDepth}]-(related:Concept)
        WHERE ALL(rel IN relationships(path) WHERE type(rel) IN $relationshipTypes)
        RETURN related, length(path) AS depth
        UNION
        WITH concept
        RETURN concept AS related, 0 AS depth
      }
      WITH DISTINCT related, MIN(depth) AS minDepth

      // Find chunks
      MATCH (chunk:Chunk)-[:DISCUSSES]->(related)
      MATCH (chunk)-[:FROM_DOCUMENT]->(doc:Document)

      WITH chunk, doc, related,
           1.0 / (1.0 + minDepth) AS depthScore

      WITH chunk, doc,
           COLLECT(DISTINCT related.name) AS concepts,
           SUM(depthScore) AS totalScore

      RETURN
        chunk.chunk_id AS chunkId,
        chunk.preview AS content,
        totalScore AS score,
        {
          documentId: doc.url,
          documentTitle: doc.title,
          documentUrl: doc.url,
          hasCode: chunk.hasCode,
          hasFormula: chunk.hasFormula,
          hasTable: chunk.hasTable,
          tokenCount: chunk.tokenCount
        } AS metadata,
        concepts AS conceptPath
      ORDER BY totalScore DESC
      LIMIT $topK
    `;

    const result = await session.run(cypher, {
      keywords,
      relationshipTypes: this.config.relationshipTypes,
      topK: int(topK),
    });

    return this.transformResults(result.records);
  }

  /**
   * Transform Neo4j records to RetrievalResult format
   */
  private transformResults(records: unknown[]): RetrievalResult[] {
    return records.map((record: unknown) => {
      const r = record as {
        get: (key: string) => unknown;
      };

      const metadata = r.get('metadata') as Record<string, unknown>;

      return {
        id: String(r.get('chunkId')),
        content: (r.get('content') as string) || '',
        score: this.normalizeScore(r.get('score') as number),
        metadata: {
          documentId: (metadata.documentId as string) || '',
          documentTitle: (metadata.documentTitle as string) || '',
          documentUrl: (metadata.documentUrl as string) || '',
          chunkIndex: 0,
          totalChunks: 0,
          tokenCount: (metadata.tokenCount as number) || 0,
          hasCode: (metadata.hasCode as boolean) || false,
          hasFormula: (metadata.hasFormula as boolean) || false,
          hasTable: (metadata.hasTable as boolean) || false,
        } as ChunkMetadata,
        source: 'graph' as const,
      };
    });
  }

  /**
   * Normalize graph scores to 0-1 range
   * Graph scores are based on depth traversal, so we normalize them
   */
  private normalizeScore(score: number): number {
    // Scores from graph are typically 0.5-3.0 range based on depth
    // Normalize to 0-1 using sigmoid-like function
    return 1 / (1 + Math.exp(-score + 1));
  }

  /**
   * Escape special Lucene query characters
   */
  private escapeLuceneQuery(query: string): string {
    // Lucene special characters that need escaping
    const specialChars = /[+\-&|!(){}[\]^"~*?:\\/]/g;
    return query.replace(specialChars, '\\$&');
  }

  /**
   * Get the configured max depth
   */
  get maxDepth(): number {
    return this.config.maxDepth;
  }

  /**
   * Get the configured topK
   */
  get topK(): number {
    return this.config.topK;
  }
}

/**
 * Create a Neo4jGraphRetriever with default configuration
 */
export function createGraphRetriever(
  driver: Driver,
  config?: Partial<Neo4jGraphRetrieverConfig>
): Neo4jGraphRetriever {
  return new Neo4jGraphRetriever(driver, config);
}
