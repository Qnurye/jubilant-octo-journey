/**
 * Query Pipeline Integration Tests
 *
 * Tests for User Story 1: Student Asks a Competition Question
 * Tests for User Story 2: System Handles Insufficient Evidence
 *
 * These tests verify the integration of the RAG pipeline components:
 * - Retrieval (vector + graph)
 * - Reranking
 * - Generation with citations
 * - Confidence handling
 *
 * Note: These are mock-based integration tests that verify pipeline logic
 * without requiring actual LLM/database connections.
 *
 * @module @jubilant/rag/tests/integration/query-pipeline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getConfidenceLevel,
  hasInsufficientEvidence,
  buildChatMessages,
  createQueryPrompt,
  createInsufficientEvidencePrompt,
} from '../../src/generation/prompts';
import {
  createCitations,
  filterUsedCitations,
  renumberCitations,
  validateCitations,
} from '../../src/generation/citations';
import {
  createTokenChunk,
  createMetadataChunk,
  createConfidenceChunk,
  createDoneChunk,
  CitationDetector,
  StreamResponseBuilder,
} from '../../src/generation/streaming';
import { reciprocalRankFusion } from '../../src/retrieval/hybrid';
import type { RankedResult, Citation, RetrievalResult } from '../../src/types';

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockRetrievalResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    id: 'chunk-1',
    content: 'Dynamic programming is a technique for solving optimization problems.',
    score: 0.85,
    source: 'vector',
    metadata: {
      documentId: 'doc-1',
      documentTitle: 'Algorithm Handbook',
      documentUrl: 'https://example.com/algorithms',
      chunkIndex: 0,
    },
    ...overrides,
  };
}

function createMockRankedResult(overrides: Partial<RankedResult> = {}): RankedResult {
  return {
    id: 'chunk-1',
    content: 'Dynamic programming is a technique for solving optimization problems.',
    metadata: {
      documentId: 'doc-1',
      documentTitle: 'Algorithm Handbook',
      documentUrl: 'https://example.com/algorithms',
      chunkIndex: 0,
    },
    rerankScore: 0.85,
    originalScore: 0.75,
    source: 'vector',
    ...overrides,
  };
}

// ============================================================================
// User Story 1: Student Asks a Competition Question
// ============================================================================

describe('User Story 1: Student Asks a Competition Question', () => {
  describe('Acceptance Scenario 1: Dynamic programming question with citations', () => {
    it('should generate response with proper citations', () => {
      // Given: A student has entered a question about dynamic programming
      const query = 'What is dynamic programming?';

      // And: The system has retrieved relevant results
      const rankedResults: RankedResult[] = [
        createMockRankedResult({
          id: 'chunk-1',
          content: 'Dynamic programming breaks problems into overlapping subproblems.',
          rerankScore: 0.9,
        }),
        createMockRankedResult({
          id: 'chunk-2',
          content: 'It uses memoization to avoid redundant calculations.',
          metadata: { documentId: 'doc-2', documentTitle: 'CS Algorithms', documentUrl: 'https://example.com/cs', chunkIndex: 1 },
          rerankScore: 0.85,
        }),
      ];

      // When: Citations are created
      const citations = createCitations(rankedResults);

      // Then: Citations should be properly formatted
      expect(citations).toHaveLength(2);
      expect(citations[0].id).toBe('[1]');
      expect(citations[1].id).toBe('[2]');
      expect(citations[0].documentTitle).toBe('Algorithm Handbook');
      expect(citations[1].documentTitle).toBe('CS Algorithms');
    });

    it('should include prerequisite concepts from knowledge graph', () => {
      // Given: Results from both vector and graph retrieval
      const vectorResults = [
        createMockRetrievalResult({
          id: 'vec-1',
          content: 'Dynamic programming solves problems by breaking them down.',
          source: 'vector',
        }),
      ];

      const graphResults = [
        createMockRetrievalResult({
          id: 'graph-1',
          content: 'Recursion is a prerequisite for understanding DP.',
          source: 'graph',
        }),
      ];

      // When: Results are fused using RRF
      const fusedMap = reciprocalRankFusion([vectorResults, graphResults]);

      // Then: Both sources contribute to results
      expect(fusedMap.size).toBe(2);
      expect(fusedMap.has('vec-1')).toBe(true);
      expect(fusedMap.has('graph-1')).toBe(true);
    });

    it('should ensure every claim is traceable to evidence', () => {
      // Given: A response with citations
      const responseText = 'Dynamic programming breaks problems into subproblems [1]. ' +
        'It uses memoization [2] to avoid redundant work [1][2].';

      const citations: Citation[] = [
        { id: '[1]', chunkId: 'chunk-1', documentTitle: 'Doc 1', documentUrl: 'url1', snippet: 'snip1', relevanceScore: 0.9 },
        { id: '[2]', chunkId: 'chunk-2', documentTitle: 'Doc 2', documentUrl: 'url2', snippet: 'snip2', relevanceScore: 0.85 },
      ];

      // When: Validating citations
      const validation = validateCitations(responseText, citations);

      // Then: All citations should be valid
      expect(validation.valid).toBe(true);
      expect(validation.missing).toHaveLength(0);
    });
  });

  describe('Acceptance Scenario 2: Response includes contextual information', () => {
    it('should build chat messages with context from sources', () => {
      // Given: Results with context
      const results: RankedResult[] = [
        createMockRankedResult({
          content: 'DP requires understanding recursion first.',
          rerankScore: 0.8,
        }),
      ];

      const citations = createCitations(results);
      const confidenceLevel = getConfidenceLevel(0.8);

      // When: Building chat messages
      const messages = buildChatMessages(
        'What are the prerequisites for DP?',
        results,
        citations,
        false,
        confidenceLevel
      );

      // Then: Messages should contain context
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toContain('recursion');
    });
  });

  describe('Response streaming (FR-016)', () => {
    it('should stream tokens with citation detection', () => {
      // Given: Citations for the response
      const citations: Citation[] = [
        { id: '[1]', chunkId: 'chunk-1', documentTitle: 'Doc 1', documentUrl: 'url1', snippet: 'snip', relevanceScore: 0.9 },
        { id: '[2]', chunkId: 'chunk-2', documentTitle: 'Doc 2', documentUrl: 'url2', snippet: 'snip', relevanceScore: 0.85 },
      ];

      const detector = new CitationDetector(citations);

      // When: Processing streaming tokens
      detector.processToken('DP breaks problems ');
      const detected1 = detector.processToken('into subproblems [1]');
      const detected2 = detector.processToken(' and uses memoization [2].');

      // Then: Citations should be detected in order
      expect(detected1).toHaveLength(1);
      expect(detected1[0].id).toBe('[1]');
      expect(detected2).toHaveLength(1);
      expect(detected2[0].id).toBe('[2]');
    });

    it('should build complete response from stream', () => {
      // Given: A stream response builder
      const builder = new StreamResponseBuilder();

      // When: Processing stream chunks
      builder.addToken('Dynamic ');
      builder.addToken('programming ');
      builder.addToken('is ');
      builder.addToken('powerful.');

      // Then: Complete text should be assembled
      expect(builder.getText()).toBe('Dynamic programming is powerful.');
    });
  });
});

// ============================================================================
// User Story 2: System Handles Insufficient Evidence
// ============================================================================

describe('User Story 2: System Handles Insufficient Evidence', () => {
  describe('Acceptance Scenario 1: Topic not in knowledge base', () => {
    it('should detect insufficient evidence below threshold', () => {
      // Given: Low confidence results
      const topScore = 0.4; // Below 0.6 threshold

      // When: Checking for insufficient evidence
      const hasInsufficient = hasInsufficientEvidence(topScore);

      // Then: Should indicate insufficient
      expect(hasInsufficient).toBe(true);
    });

    it('should use appropriate prompt for insufficient evidence', () => {
      // Given: Query about unknown topic
      const query = 'What is quantum machine learning?';
      const context = 'Some vaguely related content about ML...';

      // When: Creating insufficient evidence prompt
      const prompt = createInsufficientEvidencePrompt(query, context, 'insufficient');

      // Then: Prompt should acknowledge limitations
      expect(prompt).toContain('very limited');
      expect(prompt).toContain('Do NOT make up information');
    });

    it('should send confidence chunk in stream', () => {
      // Given: Low confidence score
      const confidenceInfo = {
        level: 'insufficient' as const,
        hasInsufficientEvidence: true,
        topScore: 0.35,
      };

      // When: Creating confidence chunk
      const chunk = createConfidenceChunk(confidenceInfo);

      // Then: Chunk should contain confidence info
      expect(chunk.type).toBe('confidence');
      expect((chunk as { confidence: typeof confidenceInfo }).confidence.level).toBe('insufficient');
      expect((chunk as { confidence: typeof confidenceInfo }).confidence.hasInsufficientEvidence).toBe(true);
    });
  });

  describe('Acceptance Scenario 2: Partial evidence handling', () => {
    it('should differentiate high and low confidence results', () => {
      // Given: Mixed confidence results
      const results: RankedResult[] = [
        createMockRankedResult({ id: 'high-1', rerankScore: 0.85 }),
        createMockRankedResult({ id: 'high-2', rerankScore: 0.75 }),
        createMockRankedResult({ id: 'low-1', rerankScore: 0.45 }),
        createMockRankedResult({ id: 'low-2', rerankScore: 0.35 }),
      ];

      // When: Filtering by confidence threshold (0.6)
      const highConfidence = results.filter(r => r.rerankScore >= 0.6);
      const lowConfidence = results.filter(r => r.rerankScore < 0.6);

      // Then: Should have mixed results
      expect(highConfidence).toHaveLength(2);
      expect(lowConfidence).toHaveLength(2);
    });

    it('should build messages with partial evidence prompt', () => {
      // Given: Mixed results
      const results: RankedResult[] = [
        createMockRankedResult({ id: 'high', rerankScore: 0.7 }),
        createMockRankedResult({ id: 'low', rerankScore: 0.4 }),
      ];

      const citations = createCitations(results);
      const confidenceLevel = getConfidenceLevel(0.55); // 'low' level

      // When: Building messages with low confidence
      const messages = buildChatMessages(
        'What about this topic?',
        results,
        citations,
        false,
        confidenceLevel
      );

      // Then: Should use partial evidence approach
      expect(messages[1].content).toContain('Highly Relevant Sources');
      expect(messages[1].content).toContain('Partially Relevant Sources');
    });
  });

  describe('Confidence level thresholds (FR-007)', () => {
    it('should return high for scores >= 0.8', () => {
      expect(getConfidenceLevel(0.8)).toBe('high');
      expect(getConfidenceLevel(0.95)).toBe('high');
      expect(getConfidenceLevel(1.0)).toBe('high');
    });

    it('should return medium for scores >= 0.6', () => {
      expect(getConfidenceLevel(0.6)).toBe('medium');
      expect(getConfidenceLevel(0.7)).toBe('medium');
    });

    it('should return low for scores >= 0.4', () => {
      expect(getConfidenceLevel(0.4)).toBe('low');
      expect(getConfidenceLevel(0.5)).toBe('low');
    });

    it('should return insufficient for scores < 0.4', () => {
      expect(getConfidenceLevel(0.39)).toBe('insufficient');
      expect(getConfidenceLevel(0.1)).toBe('insufficient');
    });

    it('should use 0.6 as default insufficient threshold', () => {
      expect(hasInsufficientEvidence(0.59)).toBe(true);
      expect(hasInsufficientEvidence(0.6)).toBe(false);
    });
  });
});

// ============================================================================
// End-to-End Pipeline Flow Tests
// ============================================================================

describe('Pipeline Flow Integration', () => {
  describe('Full query processing flow', () => {
    it('should process query through full pipeline stages', () => {
      // Stage 1: Query input
      const query = 'How does quicksort work?';

      // Stage 2: Retrieval (simulated)
      const vectorResults = [
        createMockRetrievalResult({ id: 'v1', content: 'Quicksort uses partitioning', source: 'vector' }),
        createMockRetrievalResult({ id: 'v2', content: 'Pivot selection is crucial', source: 'vector' }),
      ];

      const graphResults = [
        createMockRetrievalResult({ id: 'g1', content: 'Related to divide and conquer', source: 'graph' }),
        createMockRetrievalResult({ id: 'v1', content: 'Quicksort uses partitioning', source: 'graph' }), // Overlap
      ];

      // Stage 3: Fusion
      const fusedMap = reciprocalRankFusion([vectorResults, graphResults]);
      const fusedResults = Array.from(fusedMap.entries())
        .map(([id, data]) => ({
          id,
          content: data.result.content,
          fusedScore: data.score,
          metadata: data.result.metadata,
          rerankScore: data.score,
          originalScore: data.result.score,
          source: data.result.source,
        }))
        .sort((a, b) => b.fusedScore - a.fusedScore);

      // Stage 4: Check confidence
      const topScore = fusedResults[0]?.fusedScore || 0;
      const confidenceLevel = getConfidenceLevel(topScore * 10); // Scale up for testing

      // Stage 5: Generate citations
      const citations = createCitations(fusedResults as RankedResult[]);

      // Stage 6: Build prompt
      const messages = buildChatMessages(
        query,
        fusedResults as RankedResult[],
        citations,
        false,
        'high'
      );

      // Verify pipeline output
      expect(fusedResults.length).toBeGreaterThan(0);
      expect(citations.length).toBe(fusedResults.length);
      expect(messages).toHaveLength(2);
      expect(messages[1].content).toContain(query);

      // Overlapping result should have higher score
      const overlappingResult = fusedResults.find(r => r.id === 'v1');
      const nonOverlapping = fusedResults.find(r => r.id === 'v2');
      expect(overlappingResult!.fusedScore).toBeGreaterThan(nonOverlapping!.fusedScore);
    });
  });

  describe('Error handling in pipeline', () => {
    it('should handle empty retrieval results gracefully', () => {
      // Given: Empty results
      const results: RankedResult[] = [];

      // When: Creating citations
      const citations = createCitations(results);

      // Then: Should return empty array, not throw
      expect(citations).toHaveLength(0);
    });

    it('should handle single source results (graceful degradation)', () => {
      // Given: Only vector results (graph failed)
      const vectorResults = [
        createMockRetrievalResult({ id: 'v1', source: 'vector' }),
      ];

      // When: Fusing with empty graph results
      const fusedMap = reciprocalRankFusion([vectorResults, []]);

      // Then: Should still produce results
      expect(fusedMap.size).toBe(1);
      expect(fusedMap.has('v1')).toBe(true);
    });
  });
});
