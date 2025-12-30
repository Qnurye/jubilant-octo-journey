/**
 * Streaming Tests
 *
 * Tests for FR-016: System MUST stream response tokens progressively
 *
 * @module @jubilant/rag/tests/unit/streaming
 */

import { describe, it, expect } from 'vitest';
import {
  formatSSEEvent,
  createTokenChunk,
  createCitationChunk,
  createMetadataChunk,
  createDoneChunk,
  createErrorChunk,
  createConfidenceChunk,
  parseSSEEvent,
  CitationDetector,
  StreamResponseBuilder,
  SSE_HEADERS,
} from '../../src/generation/streaming';
import type { Citation, ResponseMetadata, StreamChunk } from '../../src/types';

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    id: '[1]',
    chunkId: 'chunk-1',
    documentTitle: 'Test Document',
    documentUrl: 'https://example.com/doc',
    snippet: 'Test snippet...',
    relevanceScore: 0.85,
    ...overrides,
  };
}

function createMockMetadata(overrides: Partial<ResponseMetadata> = {}): ResponseMetadata {
  return {
    queryId: 'query-123',
    totalTokens: 500,
    citationCount: 3,
    confidence: 'high',
    vectorResultCount: 5,
    graphResultCount: 3,
    latencyMs: 1500,
    ...overrides,
  };
}

// ============================================================================
// Chunk Creation Tests
// ============================================================================

describe('createTokenChunk', () => {
  it('should create a token chunk with content', () => {
    const chunk = createTokenChunk('Hello');

    expect(chunk.type).toBe('token');
    expect(chunk).toHaveProperty('content', 'Hello');
  });

  it('should handle empty content', () => {
    const chunk = createTokenChunk('');

    expect(chunk.type).toBe('token');
    expect(chunk).toHaveProperty('content', '');
  });
});

describe('createCitationChunk', () => {
  it('should create a citation chunk', () => {
    const citation = createMockCitation();

    const chunk = createCitationChunk(citation);

    expect(chunk.type).toBe('citation');
    expect(chunk).toHaveProperty('citation');
    expect((chunk as { citation: Citation }).citation.id).toBe('[1]');
  });
});

describe('createMetadataChunk', () => {
  it('should create a metadata chunk', () => {
    const metadata = createMockMetadata();

    const chunk = createMetadataChunk(metadata);

    expect(chunk.type).toBe('metadata');
    expect(chunk).toHaveProperty('metadata');
    expect((chunk as { metadata: ResponseMetadata }).metadata.queryId).toBe('query-123');
  });
});

describe('createDoneChunk', () => {
  it('should create a done chunk', () => {
    const chunk = createDoneChunk();

    expect(chunk.type).toBe('done');
  });
});

describe('createErrorChunk', () => {
  it('should create an error chunk with message', () => {
    const chunk = createErrorChunk('Something went wrong');

    expect(chunk.type).toBe('error');
    expect(chunk).toHaveProperty('error', 'Something went wrong');
  });
});

describe('createConfidenceChunk', () => {
  it('should create a confidence chunk', () => {
    const chunk = createConfidenceChunk({
      level: 'high',
      hasInsufficientEvidence: false,
      topScore: 0.92,
    });

    expect(chunk.type).toBe('confidence');
    expect(chunk).toHaveProperty('confidence');
  });
});

// ============================================================================
// SSE Formatting Tests
// ============================================================================

describe('formatSSEEvent', () => {
  it('should format token chunk as SSE event', () => {
    const chunk = createTokenChunk('world');

    const formatted = formatSSEEvent(chunk);

    expect(formatted).toContain('event: token');
    expect(formatted).toContain('data: ');
    expect(formatted).toContain('"type":"token"');
    expect(formatted).toContain('"content":"world"');
    expect(formatted).toMatch(/\n\n$/);
  });

  it('should format citation chunk as SSE event', () => {
    const chunk = createCitationChunk(createMockCitation());

    const formatted = formatSSEEvent(chunk);

    expect(formatted).toContain('event: citation');
    expect(formatted).toContain('"type":"citation"');
  });

  it('should format done chunk as SSE event', () => {
    const chunk = createDoneChunk();

    const formatted = formatSSEEvent(chunk);

    expect(formatted).toContain('event: done');
    expect(formatted).toContain('"type":"done"');
  });

  it('should format error chunk as SSE event', () => {
    const chunk = createErrorChunk('Error message');

    const formatted = formatSSEEvent(chunk);

    expect(formatted).toContain('event: error');
    expect(formatted).toContain('"error":"Error message"');
  });
});

describe('parseSSEEvent', () => {
  it('should parse SSE event string to chunk', () => {
    const original = createTokenChunk('test');
    const sseEvent = formatSSEEvent(original);

    const parsed = parseSSEEvent(sseEvent);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('token');
    expect((parsed as { content: string }).content).toBe('test');
  });

  it('should parse citation chunk', () => {
    const citation = createMockCitation({ id: '[2]' });
    const original = createCitationChunk(citation);
    const sseEvent = formatSSEEvent(original);

    const parsed = parseSSEEvent(sseEvent);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('citation');
  });

  it('should return null for invalid SSE event', () => {
    const invalid = 'not a valid SSE event';

    const parsed = parseSSEEvent(invalid);

    expect(parsed).toBeNull();
  });

  it('should return null for SSE event without data', () => {
    const noData = 'event: token\n\n';

    const parsed = parseSSEEvent(noData);

    expect(parsed).toBeNull();
  });

  it('should handle malformed JSON', () => {
    const malformed = 'event: token\ndata: {invalid json}\n\n';

    const parsed = parseSSEEvent(malformed);

    expect(parsed).toBeNull();
  });
});

// ============================================================================
// SSE Headers Tests
// ============================================================================

describe('SSE_HEADERS', () => {
  it('should have correct content type', () => {
    expect(SSE_HEADERS['Content-Type']).toBe('text/event-stream');
  });

  it('should disable caching', () => {
    expect(SSE_HEADERS['Cache-Control']).toBe('no-cache');
  });

  it('should keep connection alive', () => {
    expect(SSE_HEADERS.Connection).toBe('keep-alive');
  });

  it('should disable nginx buffering', () => {
    expect(SSE_HEADERS['X-Accel-Buffering']).toBe('no');
  });
});

// ============================================================================
// CitationDetector Tests
// ============================================================================

describe('CitationDetector', () => {
  it('should detect citations in tokens', () => {
    const citations = [
      createMockCitation({ id: '[1]' }),
      createMockCitation({ id: '[2]' }),
    ];
    const detector = new CitationDetector(citations);

    // Simulate streaming tokens
    detector.processToken('According to ');
    const detected = detector.processToken('[1]');

    expect(detected).toHaveLength(1);
    expect(detected[0].id).toBe('[1]');
  });

  it('should not emit same citation twice', () => {
    const citations = [createMockCitation({ id: '[1]' })];
    const detector = new CitationDetector(citations);

    detector.processToken('First [1] ');
    const firstDetected = detector.processToken('and [1] again');

    // Citation already emitted, should not appear again
    expect(firstDetected).toHaveLength(0);
  });

  it('should detect multiple citations', () => {
    const citations = [
      createMockCitation({ id: '[1]' }),
      createMockCitation({ id: '[2]' }),
      createMockCitation({ id: '[3]' }),
    ];
    const detector = new CitationDetector(citations);

    detector.processToken('See [1]');
    const detected1 = detector.processToken(', [2]');
    const detected2 = detector.processToken(', and [3]');

    expect(detected1).toHaveLength(1);
    expect(detected1[0].id).toBe('[2]');
    expect(detected2).toHaveLength(1);
    expect(detected2[0].id).toBe('[3]');
  });

  it('should handle citations split across tokens', () => {
    const citations = [createMockCitation({ id: '[1]' })];
    const detector = new CitationDetector(citations);

    detector.processToken('Reference [');
    const detected = detector.processToken('1]');

    expect(detected).toHaveLength(1);
    expect(detected[0].id).toBe('[1]');
  });

  it('should ignore citations not in the provided list', () => {
    const citations = [createMockCitation({ id: '[1]' })];
    const detector = new CitationDetector(citations);

    const detected = detector.processToken('See [2] and [3]');

    expect(detected).toHaveLength(0);
  });

  it('should track emitted citation IDs', () => {
    const citations = [
      createMockCitation({ id: '[1]' }),
      createMockCitation({ id: '[2]' }),
    ];
    const detector = new CitationDetector(citations);

    detector.processToken('See [1] and [2]');

    const emitted = detector.getEmittedCitationIds();
    expect(emitted).toContain('[1]');
    expect(emitted).toContain('[2]');
  });

  it('should reset state correctly', () => {
    const citations = [createMockCitation({ id: '[1]' })];
    const detector = new CitationDetector(citations);

    detector.processToken('See [1]');
    detector.reset();

    const detected = detector.processToken('See [1] again');

    expect(detected).toHaveLength(1);
    expect(detector.getEmittedCitationIds()).toHaveLength(1);
  });
});

// ============================================================================
// StreamResponseBuilder Tests
// ============================================================================

describe('StreamResponseBuilder', () => {
  it('should accumulate tokens into text', () => {
    const builder = new StreamResponseBuilder();

    builder.addToken('Hello');
    builder.addToken(' ');
    builder.addToken('world');

    expect(builder.getText()).toBe('Hello world');
  });

  it('should collect citations', () => {
    const builder = new StreamResponseBuilder();

    builder.addCitation(createMockCitation({ id: '[1]' }));
    builder.addCitation(createMockCitation({ id: '[2]' }));

    const citations = builder.getCitations();
    expect(citations).toHaveLength(2);
    expect(citations[0].id).toBe('[1]');
    expect(citations[1].id).toBe('[2]');
  });

  it('should store metadata', () => {
    const builder = new StreamResponseBuilder();
    const metadata = createMockMetadata({ totalTokens: 1000 });

    builder.setMetadata(metadata);

    expect(builder.getMetadata()).not.toBeNull();
    expect(builder.getMetadata()!.totalTokens).toBe(1000);
  });

  it('should return null metadata when not set', () => {
    const builder = new StreamResponseBuilder();

    expect(builder.getMetadata()).toBeNull();
  });

  it('should reset all state', () => {
    const builder = new StreamResponseBuilder();

    builder.addToken('test');
    builder.addCitation(createMockCitation());
    builder.setMetadata(createMockMetadata());

    builder.reset();

    expect(builder.getText()).toBe('');
    expect(builder.getCitations()).toHaveLength(0);
    expect(builder.getMetadata()).toBeNull();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('SSE Round-Trip', () => {
  it('should preserve token content through format and parse', () => {
    const original = createTokenChunk('Test content with special chars: <>&');

    const formatted = formatSSEEvent(original);
    const parsed = parseSSEEvent(formatted);

    expect(parsed).not.toBeNull();
    expect((parsed as { content: string }).content).toBe('Test content with special chars: <>&');
  });

  it('should preserve citation details through format and parse', () => {
    const citation = createMockCitation({
      id: '[5]',
      documentTitle: 'Special "Title" with quotes',
      relevanceScore: 0.789,
    });
    const original = createCitationChunk(citation);

    const formatted = formatSSEEvent(original);
    const parsed = parseSSEEvent(formatted);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('citation');
    const parsedCitation = (parsed as { citation: Citation }).citation;
    expect(parsedCitation.id).toBe('[5]');
    expect(parsedCitation.documentTitle).toBe('Special "Title" with quotes');
    expect(parsedCitation.relevanceScore).toBe(0.789);
  });

  it('should preserve metadata through format and parse', () => {
    const metadata = createMockMetadata({
      queryId: 'test-query-456',
      latencyMs: 2345,
      confidence: 'medium',
    });
    const original = createMetadataChunk(metadata);

    const formatted = formatSSEEvent(original);
    const parsed = parseSSEEvent(formatted);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('metadata');
    const parsedMetadata = (parsed as { metadata: ResponseMetadata }).metadata;
    expect(parsedMetadata.queryId).toBe('test-query-456');
    expect(parsedMetadata.latencyMs).toBe(2345);
    expect(parsedMetadata.confidence).toBe('medium');
  });
});
