/**
 * Knowledge Triple Extraction
 *
 * Implements LLM-based extraction of knowledge triples from document chunks.
 * Triples represent relationships between concepts (e.g., A PREREQUISITE B).
 *
 * @module @jubilant/rag/ingestion/extractor
 */

import type { Driver, Session } from 'neo4j-driver';
import { Qwen3LLM, createLLM } from '../generation/llm';
import type { KnowledgeTriple, EmbeddedChunk } from '../types';

// ============================================================================
// Valid Predicates (T059)
// ============================================================================

/**
 * Valid predicate types for knowledge triples
 */
export const VALID_PREDICATES = [
  'PREREQUISITE',    // Concept A requires Concept B
  'RELATED_TO',      // General relationship
  'COMPARED_TO',     // Comparison between concepts
  'PART_OF',         // Hierarchy/composition
  'USES',            // Algorithm uses technique/data structure
  'IMPLEMENTS',      // Code implements algorithm
  'EXAMPLE_OF',      // Instance/example relationship
] as const;

export type ValidPredicate = typeof VALID_PREDICATES[number];

/**
 * Minimum confidence threshold for accepting a triple
 */
export const MIN_CONFIDENCE = 0.5;

// ============================================================================
// Triple Extraction Prompts (T058)
// ============================================================================

/**
 * System prompt for triple extraction
 */
export const TRIPLE_EXTRACTION_SYSTEM_PROMPT = `You are a knowledge extraction assistant specializing in computer science and mathematics competition content.

Your task is to extract knowledge triples from the given text. A triple consists of:
- Subject: A concept, algorithm, data structure, or technique
- Predicate: The relationship type (from the allowed list)
- Object: Another concept that relates to the subject
- Confidence: Your confidence in this relationship (0.0 to 1.0)

Allowed predicates:
- PREREQUISITE: Subject requires understanding Object first (e.g., "Binary Search" PREREQUISITE "Arrays")
- RELATED_TO: Subject is related to Object in some way
- COMPARED_TO: Subject is compared with Object (similar or contrasting)
- PART_OF: Subject is a component/subset of Object
- USES: Subject uses/employs Object (e.g., "Dijkstra's Algorithm" USES "Priority Queue")
- IMPLEMENTS: Subject implements/realizes Object
- EXAMPLE_OF: Subject is an example/instance of Object

Guidelines:
1. Focus on EXPLICIT relationships mentioned in the text
2. Use proper noun capitalization for concepts (e.g., "Dynamic Programming", "Binary Search Tree")
3. Set confidence based on how clearly the relationship is stated
4. Avoid creating triples for vague or implied relationships
5. Each triple should represent a distinct, meaningful relationship
6. For code examples, extract what algorithm/concept the code demonstrates`;

/**
 * Create the user prompt for triple extraction
 */
export function createTripleExtractionPrompt(chunkContent: string): string {
  return `Extract knowledge triples from the following text. Return a JSON array of triples.

Each triple should be an object with:
- "subject": string (the source concept)
- "predicate": string (one of: PREREQUISITE, RELATED_TO, COMPARED_TO, PART_OF, USES, IMPLEMENTS, EXAMPLE_OF)
- "object": string (the target concept)
- "confidence": number (0.0 to 1.0)

If no meaningful triples can be extracted, return an empty array: []

TEXT:
${chunkContent}

Respond with ONLY a valid JSON array. Do not include any other text or explanation.`;
}

// ============================================================================
// Triple Validation (T059)
// ============================================================================

/**
 * Validate a single triple
 */
export function validateTriple(triple: unknown): triple is KnowledgeTriple {
  if (!triple || typeof triple !== 'object') return false;

  const t = triple as Record<string, unknown>;

  // Check required fields
  if (typeof t.subject !== 'string' || t.subject.length === 0) return false;
  if (typeof t.object !== 'string' || t.object.length === 0) return false;
  if (typeof t.predicate !== 'string') return false;
  if (typeof t.confidence !== 'number') return false;

  // Validate predicate
  if (!VALID_PREDICATES.includes(t.predicate as ValidPredicate)) return false;

  // Validate confidence threshold
  if (t.confidence < MIN_CONFIDENCE || t.confidence > 1.0) return false;

  return true;
}

/**
 * Parse and validate triples from LLM response
 */
export function parseTriples(
  response: string,
  sourceChunkId: string
): KnowledgeTriple[] {
  try {
    // Extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    // Validate and transform each triple
    const validTriples: KnowledgeTriple[] = [];

    for (const item of parsed) {
      if (validateTriple(item)) {
        validTriples.push({
          subject: item.subject.trim(),
          predicate: item.predicate,
          object: item.object.trim(),
          confidence: item.confidence,
          sourceChunkId,
        });
      }
    }

    return validTriples;
  } catch {
    return [];
  }
}

// ============================================================================
// Triple Extractor Class
// ============================================================================

/**
 * Configuration for TripleExtractor
 */
export interface TripleExtractorConfig {
  /** Maximum triples to extract per chunk */
  maxTriplesPerChunk: number;
  /** Minimum confidence for accepting triples */
  minConfidence: number;
  /** Skip chunks with code only (no explanatory text) */
  skipCodeOnlyChunks: boolean;
}

const DEFAULT_CONFIG: TripleExtractorConfig = {
  maxTriplesPerChunk: 10,
  minConfidence: MIN_CONFIDENCE,
  skipCodeOnlyChunks: true,
};

/**
 * Progress callback for extraction
 */
export type ExtractionProgressCallback = (progress: {
  completed: number;
  total: number;
  triplesExtracted: number;
}) => void;

/**
 * Result of triple extraction
 */
export interface ExtractionResult {
  triples: KnowledgeTriple[];
  chunksProcessed: number;
  chunksSkipped: number;
  duration: number;
}

/**
 * TripleExtractor - Extracts knowledge triples from chunks using LLM
 */
export class TripleExtractor {
  private llm: Qwen3LLM;
  private config: TripleExtractorConfig;

  constructor(llm?: Qwen3LLM, config: Partial<TripleExtractorConfig> = {}) {
    this.llm = llm || createLLM();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract triples from multiple chunks
   *
   * @param chunks - Embedded chunks to extract from
   * @param onProgress - Optional progress callback
   * @returns Extraction result with all triples
   */
  async extractFromChunks(
    chunks: EmbeddedChunk[],
    onProgress?: ExtractionProgressCallback
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    const allTriples: KnowledgeTriple[] = [];
    let chunksProcessed = 0;
    let chunksSkipped = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Skip code-only chunks if configured
      if (this.config.skipCodeOnlyChunks && this.isCodeOnlyChunk(chunk)) {
        chunksSkipped++;
        continue;
      }

      try {
        const triples = await this.extractFromChunk(chunk);
        allTriples.push(...triples);
        chunksProcessed++;
      } catch (error) {
        // Log but continue with other chunks
        console.error(`Triple extraction failed for chunk ${chunk.id}:`, error);
        chunksSkipped++;
      }

      if (onProgress) {
        onProgress({
          completed: i + 1,
          total: chunks.length,
          triplesExtracted: allTriples.length,
        });
      }
    }

    return {
      triples: allTriples,
      chunksProcessed,
      chunksSkipped,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Extract triples from a single chunk
   */
  async extractFromChunk(chunk: EmbeddedChunk): Promise<KnowledgeTriple[]> {
    const messages = [
      { role: 'system' as const, content: TRIPLE_EXTRACTION_SYSTEM_PROMPT },
      { role: 'user' as const, content: createTripleExtractionPrompt(chunk.content) },
    ];

    const response = await this.llm.complete(messages);
    const triples = parseTriples(response, chunk.id);

    // Limit triples per chunk
    return triples.slice(0, this.config.maxTriplesPerChunk);
  }

  /**
   * Check if a chunk contains only code (no explanatory text)
   */
  private isCodeOnlyChunk(chunk: EmbeddedChunk): boolean {
    const content = chunk.content;

    // Count code block content
    const codeBlockRegex = /```[\s\S]*?```/g;
    let codeLength = 0;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeLength += match[0].length;
    }

    // If more than 80% is code, consider it code-only
    return codeLength / content.length > 0.8;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<TripleExtractorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Neo4j Triple Storage (T060)
// ============================================================================

/**
 * Neo4jTripleStorage - Stores knowledge triples in Neo4j
 */
export class Neo4jTripleStorage {
  private driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  /**
   * Store triples in Neo4j, creating Concept nodes and relationships
   *
   * @param triples - Knowledge triples to store
   * @returns Number of relationships created
   */
  async storeTriples(triples: KnowledgeTriple[]): Promise<number> {
    if (triples.length === 0) return 0;

    const session = this.driver.session();
    let created = 0;

    try {
      // Group triples by predicate type for efficient batch creation
      const triplesByPredicate = new Map<string, KnowledgeTriple[]>();

      for (const triple of triples) {
        const existing = triplesByPredicate.get(triple.predicate) || [];
        existing.push(triple);
        triplesByPredicate.set(triple.predicate, existing);
      }

      // Create relationships for each predicate type
      for (const [predicate, predicateTriples] of triplesByPredicate) {
        const result = await this.createRelationships(
          session,
          predicate,
          predicateTriples
        );
        created += result;
      }

      return created;
    } finally {
      await session.close();
    }
  }

  /**
   * Create relationships for a specific predicate type
   */
  private async createRelationships(
    session: Session,
    predicate: string,
    triples: KnowledgeTriple[]
  ): Promise<number> {
    // Prepare data for batch operation
    const tripleData = triples.map((t) => ({
      subject: t.subject,
      object: t.object,
      confidence: t.confidence,
      sourceChunkId: t.sourceChunkId,
    }));

    // Use dynamic relationship type based on predicate
    const query = `
      UNWIND $triples AS triple
      MERGE (s:Concept {name: triple.subject})
      MERGE (o:Concept {name: triple.object})
      WITH s, o, triple
      CALL apoc.merge.relationship(s, $predicate, {
        confidence: triple.confidence,
        sourceChunkId: triple.sourceChunkId
      }, {}, o, {}) YIELD rel
      RETURN count(rel) as created
    `;

    // Fallback if APOC is not available
    const fallbackQuery = this.getFallbackQuery(predicate);

    try {
      const result = await session.run(query, { triples: tripleData, predicate });
      return result.records[0]?.get('created')?.toNumber() || 0;
    } catch {
      // Try fallback without APOC
      const result = await session.run(fallbackQuery, { triples: tripleData });
      return result.records[0]?.get('created')?.toNumber() || 0;
    }
  }

  /**
   * Generate fallback query for specific predicate (without APOC)
   */
  private getFallbackQuery(predicate: string): string {
    // Since Neo4j doesn't allow dynamic relationship types without APOC,
    // we use a switch for each predicate type
    const predicateQueries: Record<string, string> = {
      PREREQUISITE: `
        UNWIND $triples AS triple
        MERGE (s:Concept {name: triple.subject})
        MERGE (o:Concept {name: triple.object})
        MERGE (s)-[r:PREREQUISITE {confidence: triple.confidence, sourceChunkId: triple.sourceChunkId}]->(o)
        RETURN count(r) as created
      `,
      RELATED_TO: `
        UNWIND $triples AS triple
        MERGE (s:Concept {name: triple.subject})
        MERGE (o:Concept {name: triple.object})
        MERGE (s)-[r:RELATED_TO {confidence: triple.confidence, sourceChunkId: triple.sourceChunkId}]->(o)
        RETURN count(r) as created
      `,
      COMPARED_TO: `
        UNWIND $triples AS triple
        MERGE (s:Concept {name: triple.subject})
        MERGE (o:Concept {name: triple.object})
        MERGE (s)-[r:COMPARED_TO {confidence: triple.confidence, sourceChunkId: triple.sourceChunkId}]->(o)
        RETURN count(r) as created
      `,
      PART_OF: `
        UNWIND $triples AS triple
        MERGE (s:Concept {name: triple.subject})
        MERGE (o:Concept {name: triple.object})
        MERGE (s)-[r:PART_OF {confidence: triple.confidence, sourceChunkId: triple.sourceChunkId}]->(o)
        RETURN count(r) as created
      `,
      USES: `
        UNWIND $triples AS triple
        MERGE (s:Concept {name: triple.subject})
        MERGE (o:Concept {name: triple.object})
        MERGE (s)-[r:USES {confidence: triple.confidence, sourceChunkId: triple.sourceChunkId}]->(o)
        RETURN count(r) as created
      `,
      IMPLEMENTS: `
        UNWIND $triples AS triple
        MERGE (s:Concept {name: triple.subject})
        MERGE (o:Concept {name: triple.object})
        MERGE (s)-[r:IMPLEMENTS {confidence: triple.confidence, sourceChunkId: triple.sourceChunkId}]->(o)
        RETURN count(r) as created
      `,
      EXAMPLE_OF: `
        UNWIND $triples AS triple
        MERGE (s:Concept {name: triple.subject})
        MERGE (o:Concept {name: triple.object})
        MERGE (s)-[r:EXAMPLE_OF {confidence: triple.confidence, sourceChunkId: triple.sourceChunkId}]->(o)
        RETURN count(r) as created
      `,
    };

    return predicateQueries[predicate] || predicateQueries.RELATED_TO;
  }

  /**
   * Delete triples associated with a source chunk
   *
   * @param chunkId - Source chunk ID
   */
  async deleteByChunkId(chunkId: string): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(
        `
        MATCH ()-[r]->()
        WHERE r.sourceChunkId = $chunkId
        DELETE r
        `,
        { chunkId }
      );
    } finally {
      await session.close();
    }
  }
}

/**
 * Create a TripleExtractor with default configuration
 */
export function createTripleExtractor(
  llm?: Qwen3LLM,
  config?: Partial<TripleExtractorConfig>
): TripleExtractor {
  return new TripleExtractor(llm, config);
}

/**
 * Create a Neo4jTripleStorage instance
 */
export function createTripleStorage(driver: Driver): Neo4jTripleStorage {
  return new Neo4jTripleStorage(driver);
}
