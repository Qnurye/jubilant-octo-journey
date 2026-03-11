/**
 * Teacher Analytics Unit Tests
 *
 * Tests for the teacher analytics helper functions:
 * - parseTimeRange: time range parsing from query params
 * - computeCoverageScore: coverage score normalization
 * - determineGapIndicator: gap indicator classification
 * - Privacy invariants: verify no forbidden fields in response shapes
 *
 * @module apps/api/tests/unit/teacher
 */

import { describe, it, expect } from 'vitest';
import { parseTimeRange, computeCoverageScore, estimateTopicConfidence, determineGapIndicator } from '../../src/lib/teacher-utils';

// ============================================================================
// Helper to create a mock Hono Context with query params
// ============================================================================

function createMockContext(query: Record<string, string> = {}) {
  return {
    req: {
      query: (key: string) => query[key],
    },
  } as Parameters<typeof parseTimeRange>[0];
}

// ============================================================================
// parseTimeRange Tests
// ============================================================================

describe('parseTimeRange', () => {
  it('should default to 30 days when no params provided', () => {
    const c = createMockContext();
    const result = parseTimeRange(c);
    expect(result).not.toBeNull();
    const { from, to } = result!;

    const now = Date.now();
    const thirtyDays = 30 * 86400000;

    expect(Math.abs(to.getTime() - now)).toBeLessThan(100);
    expect(Math.abs(to.getTime() - from.getTime() - thirtyDays)).toBeLessThan(100);
  });

  it('should parse preset "7d"', () => {
    const c = createMockContext({ preset: '7d' });
    const result = parseTimeRange(c);
    expect(result).not.toBeNull();
    const { from, to } = result!;

    const diff = to.getTime() - from.getTime();
    expect(Math.abs(diff - 7 * 86400000)).toBeLessThan(100);
  });

  it('should parse preset "30d"', () => {
    const c = createMockContext({ preset: '30d' });
    const result = parseTimeRange(c);
    expect(result).not.toBeNull();
    const { from, to } = result!;

    const diff = to.getTime() - from.getTime();
    expect(Math.abs(diff - 30 * 86400000)).toBeLessThan(100);
  });

  it('should parse preset "90d"', () => {
    const c = createMockContext({ preset: '90d' });
    const result = parseTimeRange(c);
    expect(result).not.toBeNull();
    const { from, to } = result!;

    const diff = to.getTime() - from.getTime();
    expect(Math.abs(diff - 90 * 86400000)).toBeLessThan(100);
  });

  it('should fallback to 30d for unknown preset', () => {
    const c = createMockContext({ preset: '999d' });
    const result = parseTimeRange(c);
    expect(result).not.toBeNull();
    const { from, to } = result!;

    const diff = to.getTime() - from.getTime();
    expect(Math.abs(diff - 30 * 86400000)).toBeLessThan(100);
  });

  it('should parse custom from/to dates', () => {
    const fromDate = '2025-01-01T00:00:00Z';
    const toDate = '2025-01-31T23:59:59Z';
    const c = createMockContext({ from: fromDate, to: toDate });
    const result = parseTimeRange(c);
    expect(result).not.toBeNull();
    const { from, to } = result!;

    expect(from.toISOString()).toBe(new Date(fromDate).toISOString());
    expect(to.toISOString()).toBe(new Date(toDate).toISOString());
  });

  it('should use default "to" when only "from" is provided', () => {
    const fromDate = '2025-06-01T00:00:00Z';
    const c = createMockContext({ from: fromDate });
    const result = parseTimeRange(c);
    expect(result).not.toBeNull();
    const { from, to } = result!;

    expect(from.toISOString()).toBe(new Date(fromDate).toISOString());
    expect(Math.abs(to.getTime() - Date.now())).toBeLessThan(100);
  });

  it('should use default "from" when only "to" is provided', () => {
    const toDate = '2025-12-31T23:59:59Z';
    const c = createMockContext({ to: toDate });
    const result = parseTimeRange(c);
    expect(result).not.toBeNull();
    const { from, to } = result!;

    expect(to.toISOString()).toBe(new Date(toDate).toISOString());
    const now = Date.now();
    expect(Math.abs(from.getTime() - (now - 30 * 86400000))).toBeLessThan(100);
  });

  it('should prefer preset over from/to when both provided', () => {
    const c = createMockContext({
      preset: '7d',
      from: '2020-01-01',
      to: '2020-12-31',
    });
    const result = parseTimeRange(c);
    expect(result).not.toBeNull();
    const { from, to } = result!;

    const diff = to.getTime() - from.getTime();
    expect(Math.abs(diff - 7 * 86400000)).toBeLessThan(100);
  });

  it('should return null for invalid date strings', () => {
    const c = createMockContext({ from: 'not-a-date', to: '2025-01-01' });
    expect(parseTimeRange(c)).toBeNull();
  });

  it('should return null for invalid "to" date', () => {
    const c = createMockContext({ from: '2025-01-01', to: 'invalid' });
    expect(parseTimeRange(c)).toBeNull();
  });
});

// ============================================================================
// computeCoverageScore Tests
// ============================================================================

describe('computeCoverageScore', () => {
  it('should return 0 when maxChunkCount is 0', () => {
    expect(computeCoverageScore(10, 0.8, 0)).toBe(0);
  });

  it('should compute score with 60% chunk weight and 40% confidence weight', () => {
    // chunkCount=10, maxChunkCount=10 -> normalized=1.0
    // avgConfidence=1.0
    // score = 1.0 * 0.6 + 1.0 * 0.4 = 1.0
    expect(computeCoverageScore(10, 1.0, 10)).toBeCloseTo(1.0);
  });

  it('should normalize chunk count relative to max', () => {
    // chunkCount=5, maxChunkCount=10 -> normalized=0.5
    // avgConfidence=0.5
    // score = 0.5 * 0.6 + 0.5 * 0.4 = 0.3 + 0.2 = 0.5
    expect(computeCoverageScore(5, 0.5, 10)).toBeCloseTo(0.5);
  });

  it('should handle zero chunk count', () => {
    // chunkCount=0, maxChunkCount=10 -> normalized=0
    // avgConfidence=0.8
    // score = 0 * 0.6 + 0.8 * 0.4 = 0.32
    expect(computeCoverageScore(0, 0.8, 10)).toBeCloseTo(0.32);
  });

  it('should handle zero confidence', () => {
    // chunkCount=10, maxChunkCount=10 -> normalized=1.0
    // avgConfidence=0
    // score = 1.0 * 0.6 + 0 * 0.4 = 0.6
    expect(computeCoverageScore(10, 0, 10)).toBeCloseTo(0.6);
  });

  it('should return values between 0 and 1 for valid inputs', () => {
    for (let chunks = 0; chunks <= 100; chunks += 10) {
      for (let conf = 0; conf <= 1; conf += 0.1) {
        const score = computeCoverageScore(chunks, conf, 100);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ============================================================================
// estimateTopicConfidence Tests
// ============================================================================

describe('estimateTopicConfidence', () => {
  it('should return overallAvg when maxChunkCount is 0', () => {
    expect(estimateTopicConfidence('topic', 5, 0, 0.7)).toBe(0.7);
  });

  it('should produce higher confidence for deeper topics', () => {
    const deep = estimateTopicConfidence('same-topic', 10, 10, 0.7);
    const shallow = estimateTopicConfidence('same-topic', 1, 10, 0.7);
    expect(deep).toBeGreaterThan(shallow);
  });

  it('should produce different values for different concept names', () => {
    const a = estimateTopicConfidence('dynamic programming', 5, 10, 0.7);
    const b = estimateTopicConfidence('graph algorithms', 5, 10, 0.7);
    expect(a).not.toBeCloseTo(b, 2);
  });

  it('should be deterministic (same input = same output)', () => {
    const first = estimateTopicConfidence('Dijkstra', 3, 10, 0.72);
    const second = estimateTopicConfidence('Dijkstra', 3, 10, 0.72);
    expect(first).toBe(second);
  });

  it('should clamp output between 0.15 and 0.98', () => {
    // Very low overall + shallow topic
    const low = estimateTopicConfidence('x', 0, 10, 0.1);
    expect(low).toBeGreaterThanOrEqual(0.15);

    // Very high overall + deep topic
    const high = estimateTopicConfidence('x', 10, 10, 0.99);
    expect(high).toBeLessThanOrEqual(0.98);
  });

  it('should spread values across many topics', () => {
    const topics = ['DP', 'BFS', 'DFS', 'Dijkstra', 'Bellman-Ford', 'MST', 'KMP', 'DSU', 'Greedy', 'LP'];
    const values = topics.map((t, i) => estimateTopicConfidence(t, i + 1, 10, 0.7));
    const unique = new Set(values.map(v => Math.round(v * 100)));
    expect(unique.size).toBeGreaterThanOrEqual(7); // at least 7 distinct values out of 10
  });
});

// ============================================================================
// determineGapIndicator Tests
// ============================================================================

describe('determineGapIndicator', () => {
  it('should return "no-data" when queryCount is 0', () => {
    expect(determineGapIndicator(0.8, 0)).toBe('no-data');
    expect(determineGapIndicator(0.0, 0)).toBe('no-data');
    expect(determineGapIndicator(1.0, 0)).toBe('no-data');
  });

  it('should return "well-covered" when score >= 0.6 and has queries', () => {
    expect(determineGapIndicator(0.6, 10)).toBe('well-covered');
    expect(determineGapIndicator(0.8, 5)).toBe('well-covered');
    expect(determineGapIndicator(1.0, 1)).toBe('well-covered');
  });

  it('should return "low-coverage" when score < 0.6 and has queries', () => {
    expect(determineGapIndicator(0.59, 10)).toBe('low-coverage');
    expect(determineGapIndicator(0.3, 5)).toBe('low-coverage');
    expect(determineGapIndicator(0.0, 1)).toBe('low-coverage');
  });

  it('should use exact boundary at 0.6', () => {
    expect(determineGapIndicator(0.6, 1)).toBe('well-covered');
    expect(determineGapIndicator(0.5999, 1)).toBe('low-coverage');
  });
});

// ============================================================================
// Privacy Invariant Tests
// ============================================================================

describe('Privacy invariants', () => {
  const FORBIDDEN_FIELDS = [
    'queryText',
    'queryHash',
    'sessionId',
    'conversationId',
    'userId',
    'userHash',
    'content',
    'messageContent',
    'studentId',
  ];

  function assertNoForbiddenFields(obj: unknown, path = '') {
    if (obj === null || obj === undefined) return;
    if (typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => assertNoForbiddenFields(item, `${path}[${idx}]`));
      return;
    }

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_FIELDS.includes(key)) {
        throw new Error(`Forbidden field "${key}" found at "${fullPath}"`);
      }
      assertNoForbiddenFields(value, fullPath);
    }
  }

  it('should not include forbidden fields in summary response shape', () => {
    const mockSummary = {
      totalQueries: 100,
      periodQueries: 42,
      avgConfidence: 0.75,
      lowConfidenceCount: 5,
      avgResponseTimeMs: 320,
      topTopics: [{ name: 'Dynamic Programming', count: 15 }],
      feedbackSummary: { totalRatings: 20, avgRating: 4.2 },
    };

    expect(() => assertNoForbiddenFields(mockSummary)).not.toThrow();
  });

  it('should not include forbidden fields in hotspots response shape', () => {
    const mockHotspots = {
      topics: [
        {
          conceptName: 'Graph Theory',
          queryCount: 25,
          avgConfidence: 0.82,
          chunkCount: 12,
          relatedConcepts: ['BFS', 'DFS'],
        },
      ],
      totalQueries: 100,
      dateRange: { from: '2025-01-01', to: '2025-01-31' },
      belowThreshold: false,
    };

    expect(() => assertNoForbiddenFields(mockHotspots)).not.toThrow();
  });

  it('should not include forbidden fields in coverage response shape', () => {
    const mockCoverage = {
      cells: [
        {
          conceptName: 'Sorting',
          chunkCount: 8,
          queryCount: 30,
          avgConfidence: 0.7,
          coverageScore: 0.68,
          gapIndicator: 'well-covered',
        },
      ],
      totalConcepts: 50,
      totalChunks: 200,
      dateRange: { from: '2025-01-01', to: '2025-01-31' },
    };

    expect(() => assertNoForbiddenFields(mockCoverage)).not.toThrow();
  });

  it('should not include forbidden fields in trends response shape', () => {
    const mockTrends = {
      dataPoints: [
        { bucket: '2025-01-01', queryCount: 10, avgConfidence: 0.78, topTopics: [] },
      ],
      granularity: 'day',
      dateRange: { from: '2025-01-01', to: '2025-01-31' },
      comparisonPeriod: null,
    };

    expect(() => assertNoForbiddenFields(mockTrends)).not.toThrow();
  });

  it('should not include forbidden fields in topic detail response shape', () => {
    const mockTopicDetail = {
      conceptName: 'Binary Search',
      queryCount: 15,
      avgConfidence: 0.85,
      chunkCount: 6,
      relatedConcepts: [{ name: 'Sorting', relationship: 'PREREQUISITE' }],
      trendOverTime: [
        { bucket: '2025-01-15', queryCount: 3, avgConfidence: 0.9, topTopics: [] },
      ],
      feedbackAvgRating: 4.5,
    };

    expect(() => assertNoForbiddenFields(mockTopicDetail)).not.toThrow();
  });

  it('should detect forbidden fields when present', () => {
    const badResponse = {
      totalQueries: 100,
      sessionId: 'abc-123', // FORBIDDEN
    };

    expect(() => assertNoForbiddenFields(badResponse)).toThrow('Forbidden field "sessionId"');
  });

  it('should detect deeply nested forbidden fields', () => {
    const badResponse = {
      data: {
        items: [
          { name: 'test', queryHash: 'hash123' }, // FORBIDDEN
        ],
      },
    };

    expect(() => assertNoForbiddenFields(badResponse)).toThrow('Forbidden field "queryHash"');
  });
});
