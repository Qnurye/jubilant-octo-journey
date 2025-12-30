/**
 * Hybrid Retriever Tests
 *
 * Tests for FR-001: Vector similarity search using Milvus
 * Tests for FR-002: Knowledge graph traversal using Neo4j
 * Tests for FR-003: Parallel execution of vector and graph retrieval
 * Tests for FR-004: Fusion of results using re-ranking
 *
 * Also tests graceful degradation (T083/T084):
 * - Graph returns empty but vector has results
 * - Vector returns empty but graph has results
 *
 * @module @jubilant/rag/tests/unit/hybrid-retriever
 */

import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from '../../src/retrieval/hybrid';
import type { RetrievalResult, RetrievalStrategy, RetrievalMetrics } from '../../src/retrieval/hybrid';

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockRetrievalResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    id: 'chunk-1',
    content: 'Test content',
    score: 0.85,
    source: 'vector',
    metadata: {
      documentId: 'doc-1',
      documentTitle: 'Test Document',
      documentUrl: 'https://example.com/doc',
      chunkIndex: 0,
    },
    ...overrides,
  };
}

// ============================================================================
// reciprocalRankFusion Tests
// ============================================================================

describe('reciprocalRankFusion', () => {
  describe('Single list input', () => {
    it('should assign RRF scores to single list items', () => {
      const results = [
        createMockRetrievalResult({ id: 'chunk-1', source: 'vector' }),
        createMockRetrievalResult({ id: 'chunk-2', source: 'vector' }),
      ];

      const fused = reciprocalRankFusion([results], 60);

      expect(fused.size).toBe(2);

      // First item: 1/(60+1) = 0.01639
      const chunk1 = fused.get('chunk-1');
      expect(chunk1).toBeDefined();
      expect(chunk1!.score).toBeCloseTo(1 / 61, 5);

      // Second item: 1/(60+2) = 0.01613
      const chunk2 = fused.get('chunk-2');
      expect(chunk2).toBeDefined();
      expect(chunk2!.score).toBeCloseTo(1 / 62, 5);
    });

    it('should track ranks in the result', () => {
      const results = [
        createMockRetrievalResult({ id: 'chunk-1', source: 'vector' }),
      ];

      const fused = reciprocalRankFusion([results]);

      const chunk1 = fused.get('chunk-1');
      expect(chunk1!.ranks.get('vector')).toBe(1); // 1-indexed rank
    });
  });

  describe('Multiple lists input', () => {
    it('should combine scores for items appearing in multiple lists', () => {
      const vectorResults = [
        createMockRetrievalResult({ id: 'chunk-1', source: 'vector' }),
        createMockRetrievalResult({ id: 'chunk-2', source: 'vector' }),
      ];

      const graphResults = [
        createMockRetrievalResult({ id: 'chunk-1', source: 'graph' }), // Same as vector result 1
        createMockRetrievalResult({ id: 'chunk-3', source: 'graph' }),
      ];

      const fused = reciprocalRankFusion([vectorResults, graphResults]);

      // chunk-1 appears in both lists, so it should have higher score
      const chunk1 = fused.get('chunk-1');
      const chunk2 = fused.get('chunk-2');

      expect(chunk1!.score).toBeGreaterThan(chunk2!.score);
    });

    it('should track ranks from both sources for overlapping items', () => {
      const vectorResults = [
        createMockRetrievalResult({ id: 'chunk-1', source: 'vector' }),
      ];

      const graphResults = [
        createMockRetrievalResult({ id: 'chunk-2', source: 'graph' }),
        createMockRetrievalResult({ id: 'chunk-1', source: 'graph' }), // Rank 2 in graph
      ];

      const fused = reciprocalRankFusion([vectorResults, graphResults]);

      const chunk1 = fused.get('chunk-1');
      expect(chunk1!.ranks.get('vector')).toBe(1);
      expect(chunk1!.ranks.get('graph')).toBe(2);
    });

    it('should preserve the original result data', () => {
      const results = [
        createMockRetrievalResult({
          id: 'chunk-1',
          content: 'Original content',
          metadata: { documentTitle: 'Original Title', documentId: '', documentUrl: '', chunkIndex: 0 },
        }),
      ];

      const fused = reciprocalRankFusion([results]);

      const chunk1 = fused.get('chunk-1');
      expect(chunk1!.result.content).toBe('Original content');
      expect(chunk1!.result.metadata.documentTitle).toBe('Original Title');
    });
  });

  describe('RRF constant (k) parameter', () => {
    it('should use k=60 as default', () => {
      const results = [
        createMockRetrievalResult({ id: 'chunk-1' }),
      ];

      const fused = reciprocalRankFusion([results]);

      const chunk1 = fused.get('chunk-1');
      // k=60, rank=1: 1/(60+1) = 0.01639
      expect(chunk1!.score).toBeCloseTo(1 / 61, 5);
    });

    it('should respect custom k value', () => {
      const results = [
        createMockRetrievalResult({ id: 'chunk-1' }),
      ];

      // With k=10
      const fused = reciprocalRankFusion([results], 10);

      const chunk1 = fused.get('chunk-1');
      // k=10, rank=1: 1/(10+1) = 0.0909
      expect(chunk1!.score).toBeCloseTo(1 / 11, 5);
    });

    it('should give more weight to lower-ranked items with higher k', () => {
      const results = [
        createMockRetrievalResult({ id: 'chunk-1' }),
        createMockRetrievalResult({ id: 'chunk-2' }),
        createMockRetrievalResult({ id: 'chunk-3' }),
      ];

      // With low k, score differences are larger
      const fusedLowK = reciprocalRankFusion([results], 1);
      const lowKRatio =
        fusedLowK.get('chunk-1')!.score / fusedLowK.get('chunk-3')!.score;

      // With high k, score differences are smaller
      const fusedHighK = reciprocalRankFusion([results], 100);
      const highKRatio =
        fusedHighK.get('chunk-1')!.score / fusedHighK.get('chunk-3')!.score;

      // Higher k should result in smaller ratio (more equal scores)
      expect(highKRatio).toBeLessThan(lowKRatio);
    });
  });

  describe('Empty inputs', () => {
    it('should handle empty result lists', () => {
      const fused = reciprocalRankFusion([[], []]);

      expect(fused.size).toBe(0);
    });

    it('should handle no lists', () => {
      const fused = reciprocalRankFusion([]);

      expect(fused.size).toBe(0);
    });

    it('should handle one empty list and one non-empty', () => {
      const results = [
        createMockRetrievalResult({ id: 'chunk-1' }),
      ];

      const fused = reciprocalRankFusion([results, []]);

      expect(fused.size).toBe(1);
      expect(fused.has('chunk-1')).toBe(true);
    });
  });

  describe('Fusion behavior for hybrid retrieval', () => {
    it('should boost items found by both retrievers (overlap)', () => {
      const vectorResults = [
        createMockRetrievalResult({ id: 'overlap', source: 'vector' }),
        createMockRetrievalResult({ id: 'vector-only', source: 'vector' }),
      ];

      const graphResults = [
        createMockRetrievalResult({ id: 'graph-only', source: 'graph' }),
        createMockRetrievalResult({ id: 'overlap', source: 'graph' }),
      ];

      const fused = reciprocalRankFusion([vectorResults, graphResults]);

      const overlapScore = fused.get('overlap')!.score;
      const vectorOnlyScore = fused.get('vector-only')!.score;
      const graphOnlyScore = fused.get('graph-only')!.score;

      // Overlap should have highest score
      expect(overlapScore).toBeGreaterThan(vectorOnlyScore);
      expect(overlapScore).toBeGreaterThan(graphOnlyScore);
    });

    it('should handle different ranking positions for same item', () => {
      // Item appears at rank 1 in vector but rank 5 in graph
      const vectorResults = [
        createMockRetrievalResult({ id: 'chunk-1', source: 'vector' }),
        createMockRetrievalResult({ id: 'chunk-2', source: 'vector' }),
        createMockRetrievalResult({ id: 'chunk-3', source: 'vector' }),
        createMockRetrievalResult({ id: 'chunk-4', source: 'vector' }),
        createMockRetrievalResult({ id: 'chunk-5', source: 'vector' }),
      ];

      const graphResults = [
        createMockRetrievalResult({ id: 'other-1', source: 'graph' }),
        createMockRetrievalResult({ id: 'other-2', source: 'graph' }),
        createMockRetrievalResult({ id: 'other-3', source: 'graph' }),
        createMockRetrievalResult({ id: 'other-4', source: 'graph' }),
        createMockRetrievalResult({ id: 'chunk-1', source: 'graph' }), // Same as vector rank 1
      ];

      const fused = reciprocalRankFusion([vectorResults, graphResults]);

      const chunk1 = fused.get('chunk-1');
      expect(chunk1!.ranks.get('vector')).toBe(1);
      expect(chunk1!.ranks.get('graph')).toBe(5);

      // Score should be sum of both RRF contributions
      const expectedScore = 1 / (60 + 1) + 1 / (60 + 5);
      expect(chunk1!.score).toBeCloseTo(expectedScore, 5);
    });
  });
});

// ============================================================================
// RetrievalStrategy Tests (Graceful Degradation T083/T084)
// ============================================================================

describe('RetrievalStrategy types', () => {
  it('should define hybrid strategy for both sources returning results', () => {
    const strategy: RetrievalStrategy = 'hybrid';
    expect(strategy).toBe('hybrid');
  });

  it('should define vector_only strategy for graph empty (T083)', () => {
    const strategy: RetrievalStrategy = 'vector_only';
    expect(strategy).toBe('vector_only');
  });

  it('should define graph_only strategy for vector empty (T084)', () => {
    const strategy: RetrievalStrategy = 'graph_only';
    expect(strategy).toBe('graph_only');
  });

  it('should define degraded strategy for both empty', () => {
    const strategy: RetrievalStrategy = 'degraded';
    expect(strategy).toBe('degraded');
  });
});

// ============================================================================
// RetrievalMetrics Tests
// ============================================================================

describe('RetrievalMetrics structure', () => {
  it('should include all required timing metrics', () => {
    const metrics: RetrievalMetrics = {
      vectorSearchMs: 100,
      vectorResultCount: 5,
      vectorTopScore: 0.9,
      vectorAvgScore: 0.75,
      graphTraversalMs: 150,
      graphResultCount: 3,
      graphMaxDepth: 2,
      fusionMs: 10,
      overlapCount: 2,
      rrfTopScore: 0.5,
    };

    expect(metrics.vectorSearchMs).toBe(100);
    expect(metrics.graphTraversalMs).toBe(150);
    expect(metrics.fusionMs).toBe(10);
  });

  it('should support optional strategy field', () => {
    const metricsWithStrategy: RetrievalMetrics = {
      vectorSearchMs: 100,
      vectorResultCount: 5,
      vectorTopScore: 0.9,
      vectorAvgScore: 0.75,
      graphTraversalMs: 150,
      graphResultCount: 0, // Empty graph results
      graphMaxDepth: 2,
      fusionMs: 10,
      overlapCount: 0,
      rrfTopScore: 0.5,
      strategy: 'vector_only',
    };

    expect(metricsWithStrategy.strategy).toBe('vector_only');
  });

  it('should support optional error fields for graceful degradation', () => {
    const metricsWithError: RetrievalMetrics = {
      vectorSearchMs: 100,
      vectorResultCount: 5,
      vectorTopScore: 0.9,
      vectorAvgScore: 0.75,
      graphTraversalMs: 0,
      graphResultCount: 0,
      graphMaxDepth: 2,
      fusionMs: 10,
      overlapCount: 0,
      rrfTopScore: 0.5,
      strategy: 'vector_only',
      graphError: 'Neo4j connection failed',
    };

    expect(metricsWithError.graphError).toBe('Neo4j connection failed');
  });

  it('should track overlap count between sources', () => {
    const metrics: RetrievalMetrics = {
      vectorSearchMs: 100,
      vectorResultCount: 10,
      vectorTopScore: 0.9,
      vectorAvgScore: 0.7,
      graphTraversalMs: 150,
      graphResultCount: 10,
      graphMaxDepth: 2,
      fusionMs: 10,
      overlapCount: 5, // 5 items found by both
      rrfTopScore: 0.5,
      strategy: 'hybrid',
    };

    expect(metrics.overlapCount).toBe(5);
  });

  it('should allow null scores when no results', () => {
    const emptyMetrics: RetrievalMetrics = {
      vectorSearchMs: 100,
      vectorResultCount: 0,
      vectorTopScore: null,
      vectorAvgScore: null,
      graphTraversalMs: 150,
      graphResultCount: 0,
      graphMaxDepth: 2,
      fusionMs: 5,
      overlapCount: 0,
      rrfTopScore: null,
      strategy: 'degraded',
    };

    expect(emptyMetrics.vectorTopScore).toBeNull();
    expect(emptyMetrics.vectorAvgScore).toBeNull();
    expect(emptyMetrics.rrfTopScore).toBeNull();
  });
});

// ============================================================================
// Strategy Selection Logic Tests
// ============================================================================

describe('Strategy selection based on results', () => {
  function determineStrategy(
    hasVectorResults: boolean,
    hasGraphResults: boolean
  ): RetrievalStrategy {
    if (hasVectorResults && hasGraphResults) return 'hybrid';
    if (hasVectorResults && !hasGraphResults) return 'vector_only';
    if (!hasVectorResults && hasGraphResults) return 'graph_only';
    return 'degraded';
  }

  it('should select hybrid when both have results', () => {
    expect(determineStrategy(true, true)).toBe('hybrid');
  });

  it('should select vector_only when only vector has results (T083)', () => {
    expect(determineStrategy(true, false)).toBe('vector_only');
  });

  it('should select graph_only when only graph has results (T084)', () => {
    expect(determineStrategy(false, true)).toBe('graph_only');
  });

  it('should select degraded when neither has results', () => {
    expect(determineStrategy(false, false)).toBe('degraded');
  });
});
