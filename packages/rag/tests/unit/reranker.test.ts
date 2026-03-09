/**
 * Reranker Tests
 *
 * Tests for the Qwen3Reranker implementation
 * - FR-004: Fusion of results using re-ranking
 * - FR-007: Confidence threshold handling (0.6)
 *
 * @module @jubilant/rag/tests/unit/reranker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Qwen3Reranker, createReranker } from '../../src/reranking/reranker';

// ============================================================================
// Qwen3Reranker Tests
// ============================================================================

describe('Qwen3Reranker', () => {
  describe('constructor', () => {
    it('should use default configuration', () => {
      const reranker = new Qwen3Reranker();

      expect(reranker.confidenceThreshold).toBe(0.6);
      expect(reranker.topN).toBe(5);
    });

    it('should accept custom configuration', () => {
      const reranker = new Qwen3Reranker({
        confidenceThreshold: 0.7,
        topN: 10,
      });

      expect(reranker.confidenceThreshold).toBe(0.7);
      expect(reranker.topN).toBe(10);
    });

    it('should merge custom config with defaults', () => {
      const reranker = new Qwen3Reranker({
        topN: 3,
      });

      expect(reranker.topN).toBe(3);
      expect(reranker.confidenceThreshold).toBe(0.6); // Default
    });
  });

  describe('getConfidenceLevel', () => {
    it('should return high for scores >= 0.8', () => {
      expect(Qwen3Reranker.getConfidenceLevel(0.8)).toBe('high');
      expect(Qwen3Reranker.getConfidenceLevel(0.95)).toBe('high');
      expect(Qwen3Reranker.getConfidenceLevel(1.0)).toBe('high');
    });

    it('should return medium for scores >= 0.6', () => {
      expect(Qwen3Reranker.getConfidenceLevel(0.6)).toBe('medium');
      expect(Qwen3Reranker.getConfidenceLevel(0.7)).toBe('medium');
      expect(Qwen3Reranker.getConfidenceLevel(0.79)).toBe('medium');
    });

    it('should return low for scores >= 0.4', () => {
      expect(Qwen3Reranker.getConfidenceLevel(0.4)).toBe('low');
      expect(Qwen3Reranker.getConfidenceLevel(0.5)).toBe('low');
      expect(Qwen3Reranker.getConfidenceLevel(0.59)).toBe('low');
    });

    it('should return insufficient for scores < 0.4', () => {
      expect(Qwen3Reranker.getConfidenceLevel(0.39)).toBe('insufficient');
      expect(Qwen3Reranker.getConfidenceLevel(0.2)).toBe('insufficient');
      expect(Qwen3Reranker.getConfidenceLevel(0)).toBe('insufficient');
    });
  });

  describe('rerank with mocked API', () => {
    let originalFetch: typeof global.fetch;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      originalFetch = global.fetch;
      mockFetch = vi.fn();
      global.fetch = mockFetch as unknown as typeof fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.clearAllMocks();
    });

    it('should return empty array for empty documents', async () => {
      const reranker = new Qwen3Reranker();
      const results = await reranker.rerank('test query', []);

      expect(results).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call reranker API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 0, relevance_score: 0.9 },
            { index: 1, relevance_score: 0.7 },
          ],
          model: 'Qwen/Qwen3-Reranker-4B',
        }),
      });

      const reranker = new Qwen3Reranker({
        baseUrl: 'http://test:8002/v1',
        model: 'test-model',
        topN: 5,
      });

      await reranker.rerank('What is DP?', ['doc1 content', 'doc2 content']);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test:8002/v1/rerank',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.query).toBe('What is DP?');
      expect(callBody.documents).toEqual(['doc1 content', 'doc2 content']);
      expect(callBody.model).toBe('test-model');
      expect(callBody.top_n).toBe(5);
    });

    it('should return reranked results sorted by score', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 2, relevance_score: 0.5 },
            { index: 0, relevance_score: 0.9 },
            { index: 1, relevance_score: 0.7 },
          ],
          model: 'Qwen/Qwen3-Reranker-4B',
        }),
      });

      const reranker = new Qwen3Reranker({ topN: 10 });
      const results = await reranker.rerank('query', ['doc0', 'doc1', 'doc2']);

      expect(results).toHaveLength(3);
      expect(results[0].score).toBe(0.9);
      expect(results[0].content).toBe('doc0');
      expect(results[1].score).toBe(0.7);
      expect(results[1].content).toBe('doc1');
      expect(results[2].score).toBe(0.5);
      expect(results[2].content).toBe('doc2');
    });

    it('should mark results above/below confidence threshold', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 0, relevance_score: 0.8 },
            { index: 1, relevance_score: 0.5 },
          ],
          model: 'test',
        }),
      });

      const reranker = new Qwen3Reranker({ confidenceThreshold: 0.6 });
      const results = await reranker.rerank('query', ['high conf', 'low conf']);

      expect(results[0].isAboveThreshold).toBe(true);
      expect(results[1].isAboveThreshold).toBe(false);
    });

    it('should limit results to topN', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 0, relevance_score: 0.9 },
            { index: 1, relevance_score: 0.8 },
            { index: 2, relevance_score: 0.7 },
            { index: 3, relevance_score: 0.6 },
            { index: 4, relevance_score: 0.5 },
          ],
          model: 'test',
        }),
      });

      const reranker = new Qwen3Reranker({ topN: 3 });
      const results = await reranker.rerank('query', ['0', '1', '2', '3', '4']);

      expect(results).toHaveLength(3);
      expect(results[0].score).toBe(0.9);
      expect(results[2].score).toBe(0.7);
    });

    it('should gracefully degrade on API failure with mock scores', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const reranker = new Qwen3Reranker();
      const results = await reranker.rerank('query', ['doc']);

      // callRerankerAPI catches errors and returns mock scores for robustness
      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should include API key in headers when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ index: 0, relevance_score: 0.9 }],
          model: 'test',
        }),
      });

      const reranker = new Qwen3Reranker({
        apiKey: 'test-api-key',
      });

      await reranker.rerank('query', ['doc']);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });
  });

  describe('healthCheck', () => {
    let originalFetch: typeof global.fetch;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      originalFetch = global.fetch;
      mockFetch = vi.fn();
      global.fetch = mockFetch as unknown as typeof fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should return healthy when API responds', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ index: 0, relevance_score: 1.0 }],
          model: 'test',
        }),
      });

      const reranker = new Qwen3Reranker();
      const health = await reranker.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy with message on failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const reranker = new Qwen3Reranker();
      const health = await reranker.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('Connection refused');
    });
  });
});

// ============================================================================
// Multi-provider Tests
// ============================================================================

describe('Multi-provider support', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('should send default request format for provider=default', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ index: 0, relevance_score: 0.9 }],
        model: 'test',
      }),
    });

    const reranker = new Qwen3Reranker({ provider: 'default', topN: 5 });
    await reranker.rerank('query', ['doc']);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.return_documents).toBeUndefined();
    expect(body.top_n).toBe(5);
  });

  it('should send default request format for provider=jina', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ index: 0, relevance_score: 0.9 }],
        model: 'test',
      }),
    });

    const reranker = new Qwen3Reranker({ provider: 'jina', topN: 5 });
    await reranker.rerank('query', ['doc']);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.return_documents).toBeUndefined();
  });

  it('should include return_documents for provider=cohere', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ index: 0, relevance_score: 0.9, document: { text: 'doc' } }],
        model: 'test',
      }),
    });

    const reranker = new Qwen3Reranker({ provider: 'cohere', topN: 5 });
    await reranker.rerank('query', ['doc']);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.return_documents).toBe(true);
  });

  it('should normalize response with "score" field instead of "relevance_score"', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { index: 0, score: 0.85 },
          { index: 1, score: 0.65 },
        ],
        model: 'test',
      }),
    });

    const reranker = new Qwen3Reranker({ topN: 10 });
    const results = await reranker.rerank('query', ['doc0', 'doc1']);

    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0.85);
    expect(results[1].score).toBe(0.65);
  });

  it('should prefer relevance_score over score when both present', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { index: 0, relevance_score: 0.9, score: 0.5 },
        ],
        model: 'test',
      }),
    });

    const reranker = new Qwen3Reranker({ topN: 10 });
    const results = await reranker.rerank('query', ['doc0']);

    expect(results[0].score).toBe(0.9);
  });

  it('should handle cohere response with document field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { index: 0, relevance_score: 0.95, document: { text: 'returned doc' } },
        ],
        model: 'cohere-rerank',
      }),
    });

    const reranker = new Qwen3Reranker({ provider: 'cohere', topN: 5 });
    const results = await reranker.rerank('query', ['original doc']);

    // Content should come from original documents array, not response
    expect(results[0].content).toBe('original doc');
    expect(results[0].score).toBe(0.95);
  });

  it('should default score to 0 when neither relevance_score nor score present', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ index: 0 }],
        model: 'test',
      }),
    });

    const reranker = new Qwen3Reranker({ topN: 10 });
    const results = await reranker.rerank('query', ['doc']);

    expect(results[0].score).toBe(0);
  });
});

// ============================================================================
// createReranker Factory Tests
// ============================================================================

describe('createReranker', () => {
  it('should create a Qwen3Reranker instance', () => {
    const reranker = createReranker();

    expect(reranker).toBeInstanceOf(Qwen3Reranker);
  });

  it('should pass configuration to the instance', () => {
    const reranker = createReranker({
      topN: 8,
      confidenceThreshold: 0.75,
    });

    expect(reranker.topN).toBe(8);
    expect(reranker.confidenceThreshold).toBe(0.75);
  });
});

// ============================================================================
// Confidence Threshold Tests (FR-007)
// ============================================================================

// ============================================================================
// Disabled Reranker Tests
// ============================================================================

describe('Reranker disabled (enabled=false)', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('should return documents as-is without calling API when disabled', async () => {
    const reranker = new Qwen3Reranker({ enabled: false, topN: 5 });
    const results = await reranker.rerank('query', ['doc0', 'doc1', 'doc2']);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(results).toHaveLength(3);
    expect(results[0].content).toBe('doc0');
    expect(results[1].content).toBe('doc1');
    expect(results[2].content).toBe('doc2');
  });

  it('should assign decreasing scores preserving original order', async () => {
    const reranker = new Qwen3Reranker({ enabled: false, topN: 10 });
    const results = await reranker.rerank('query', ['a', 'b', 'c']);

    expect(results[0].score).toBe(1.0);
    expect(results[1].score).toBe(0.99);
    expect(results[2].score).toBe(0.98);
  });

  it('should mark all results as above threshold when disabled', async () => {
    const reranker = new Qwen3Reranker({ enabled: false, topN: 10 });
    const results = await reranker.rerank('query', ['a', 'b']);

    expect(results.every((r) => r.isAboveThreshold)).toBe(true);
  });

  it('should respect topN limit even when disabled', async () => {
    const reranker = new Qwen3Reranker({ enabled: false, topN: 2 });
    const results = await reranker.rerank('query', ['a', 'b', 'c', 'd']);

    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('a');
    expect(results[1].content).toBe('b');
  });

  it('should return empty array for empty documents when disabled', async () => {
    const reranker = new Qwen3Reranker({ enabled: false });
    const results = await reranker.rerank('query', []);

    expect(results).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should report healthy with zero latency when disabled', async () => {
    const reranker = new Qwen3Reranker({ enabled: false });
    const health = await reranker.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBe(0);
    expect(health.message).toBe('Reranker disabled');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should expose enabled=false via getter', () => {
    const reranker = new Qwen3Reranker({ enabled: false });
    expect(reranker.enabled).toBe(false);
  });

  it('should default to enabled=true', () => {
    const reranker = new Qwen3Reranker();
    expect(reranker.enabled).toBe(true);
  });
});

describe('FR-007: Confidence Threshold 0.6', () => {
  it('should use 0.6 as default confidence threshold', () => {
    const reranker = new Qwen3Reranker();
    expect(reranker.confidenceThreshold).toBe(0.6);
  });

  it('should classify 0.6 as medium confidence', () => {
    expect(Qwen3Reranker.getConfidenceLevel(0.6)).toBe('medium');
  });

  it('should classify below 0.6 as low or insufficient', () => {
    expect(Qwen3Reranker.getConfidenceLevel(0.59)).toBe('low');
    expect(Qwen3Reranker.getConfidenceLevel(0.39)).toBe('insufficient');
  });
});
