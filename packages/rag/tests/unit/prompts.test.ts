/**
 * Prompts Tests
 *
 * Tests for FR-007: System MUST acknowledge uncertainty when retrieved
 * evidence is insufficient (reranker confidence score below 0.6)
 *
 * @module @jubilant/rag/tests/unit/prompts
 */

import { describe, it, expect } from 'vitest';
import {
  getConfidenceLevel,
  hasInsufficientEvidence,
  formatContext,
  createQueryPrompt,
  createInsufficientEvidencePrompt,
  createPartialEvidencePrompt,
  buildChatMessages,
  GROUNDED_RESPONSE_SYSTEM_PROMPT,
} from '../../src/generation/prompts';
import type { RankedResult, Citation } from '../../src/types';

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockRankedResult(overrides: Partial<RankedResult> = {}): RankedResult {
  return {
    id: 'chunk-1',
    content: 'This is the content of the chunk.',
    metadata: {
      documentId: 'doc-1',
      documentTitle: 'Test Document',
      documentUrl: 'https://example.com/doc',
      chunkIndex: 0,
    },
    rerankScore: 0.85,
    originalScore: 0.75,
    source: 'vector',
    ...overrides,
  };
}

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

// ============================================================================
// getConfidenceLevel Tests (FR-007)
// ============================================================================

describe('getConfidenceLevel', () => {
  it('should return "high" for scores >= 0.8', () => {
    expect(getConfidenceLevel(0.8)).toBe('high');
    expect(getConfidenceLevel(0.9)).toBe('high');
    expect(getConfidenceLevel(1.0)).toBe('high');
  });

  it('should return "medium" for scores >= 0.6 and < 0.8', () => {
    expect(getConfidenceLevel(0.6)).toBe('medium');
    expect(getConfidenceLevel(0.7)).toBe('medium');
    expect(getConfidenceLevel(0.79)).toBe('medium');
  });

  it('should return "low" for scores >= 0.4 and < 0.6', () => {
    expect(getConfidenceLevel(0.4)).toBe('low');
    expect(getConfidenceLevel(0.5)).toBe('low');
    expect(getConfidenceLevel(0.59)).toBe('low');
  });

  it('should return "insufficient" for scores < 0.4', () => {
    expect(getConfidenceLevel(0.3)).toBe('insufficient');
    expect(getConfidenceLevel(0.1)).toBe('insufficient');
    expect(getConfidenceLevel(0.0)).toBe('insufficient');
  });

  it('should handle edge cases', () => {
    expect(getConfidenceLevel(0.39)).toBe('insufficient');
    expect(getConfidenceLevel(0.4)).toBe('low');
    expect(getConfidenceLevel(0.59)).toBe('low');
    expect(getConfidenceLevel(0.6)).toBe('medium');
    expect(getConfidenceLevel(0.79)).toBe('medium');
    expect(getConfidenceLevel(0.8)).toBe('high');
  });
});

// ============================================================================
// hasInsufficientEvidence Tests (FR-007)
// ============================================================================

describe('hasInsufficientEvidence', () => {
  describe('with default threshold (0.6)', () => {
    it('should return true when score is below threshold', () => {
      expect(hasInsufficientEvidence(0.5)).toBe(true);
      expect(hasInsufficientEvidence(0.3)).toBe(true);
      expect(hasInsufficientEvidence(0.0)).toBe(true);
      expect(hasInsufficientEvidence(0.59)).toBe(true);
    });

    it('should return false when score meets or exceeds threshold', () => {
      expect(hasInsufficientEvidence(0.6)).toBe(false);
      expect(hasInsufficientEvidence(0.7)).toBe(false);
      expect(hasInsufficientEvidence(0.9)).toBe(false);
      expect(hasInsufficientEvidence(1.0)).toBe(false);
    });
  });

  describe('with custom threshold', () => {
    it('should use custom threshold for comparison', () => {
      // With threshold of 0.8
      expect(hasInsufficientEvidence(0.7, 0.8)).toBe(true);
      expect(hasInsufficientEvidence(0.79, 0.8)).toBe(true);
      expect(hasInsufficientEvidence(0.8, 0.8)).toBe(false);
      expect(hasInsufficientEvidence(0.9, 0.8)).toBe(false);
    });

    it('should work with threshold of 0', () => {
      expect(hasInsufficientEvidence(-0.1, 0)).toBe(true);
      expect(hasInsufficientEvidence(0, 0)).toBe(false);
      expect(hasInsufficientEvidence(0.1, 0)).toBe(false);
    });
  });
});

// ============================================================================
// formatContext Tests
// ============================================================================

describe('formatContext', () => {
  it('should format results with citations', () => {
    const results = [
      createMockRankedResult({ content: 'First content' }),
      createMockRankedResult({ content: 'Second content' }),
    ];
    const citations = [
      createMockCitation({ id: '[1]', documentTitle: 'Doc 1' }),
      createMockCitation({ id: '[2]', documentTitle: 'Doc 2' }),
    ];

    const formatted = formatContext(results, citations);

    expect(formatted).toContain('[[1]] Source: Doc 1');
    expect(formatted).toContain('First content');
    expect(formatted).toContain('[[2]] Source: Doc 2');
    expect(formatted).toContain('Second content');
    expect(formatted).toContain('---');
  });

  it('should handle empty results', () => {
    const formatted = formatContext([], []);

    expect(formatted).toBe('');
  });

  it('should handle single result', () => {
    const results = [createMockRankedResult({ content: 'Only content' })];
    const citations = [createMockCitation({ id: '[1]', documentTitle: 'Only Doc' })];

    const formatted = formatContext(results, citations);

    expect(formatted).toContain('[[1]] Source: Only Doc');
    expect(formatted).toContain('Only content');
  });
});

// ============================================================================
// createQueryPrompt Tests
// ============================================================================

describe('createQueryPrompt', () => {
  it('should create a prompt with query and context', () => {
    const query = 'What is dynamic programming?';
    const context = '[[1]] Source: Algorithm Book\nDynamic programming is...';

    const prompt = createQueryPrompt(query, context);

    expect(prompt).toContain('## Sources');
    expect(prompt).toContain(context);
    expect(prompt).toContain('## Question');
    expect(prompt).toContain(query);
    expect(prompt).toContain('## Instructions');
  });

  it('should include citation instructions', () => {
    const prompt = createQueryPrompt('test query', 'test context');

    expect(prompt).toContain('Cite sources using [1], [2], etc.');
    expect(prompt).toContain('ONLY on the information in the sources');
  });

  it('should mention acknowledging limitations', () => {
    const prompt = createQueryPrompt('test query', 'test context');

    expect(prompt).toContain('acknowledge the limitations');
  });
});

// ============================================================================
// createInsufficientEvidencePrompt Tests (FR-007)
// ============================================================================

describe('createInsufficientEvidencePrompt', () => {
  it('should indicate very limited information for insufficient confidence', () => {
    const prompt = createInsufficientEvidencePrompt(
      'What is X?',
      'Some context',
      'insufficient'
    );

    expect(prompt).toContain('very limited');
  });

  it('should indicate incomplete information for low confidence', () => {
    const prompt = createInsufficientEvidencePrompt(
      'What is X?',
      'Some context',
      'low'
    );

    expect(prompt).toContain('incomplete');
  });

  it('should include available sources when present', () => {
    const prompt = createInsufficientEvidencePrompt(
      'What is X?',
      'Some available context here',
      'insufficient'
    );

    expect(prompt).toContain('## Available (Limited) Sources');
    expect(prompt).toContain('Some available context here');
    expect(prompt).toContain('low relevance');
  });

  it('should handle empty context', () => {
    const prompt = createInsufficientEvidencePrompt(
      'What is X?',
      '',
      'insufficient'
    );

    expect(prompt).not.toContain('## Available (Limited) Sources');
    expect(prompt).toContain('What is X?');
  });

  it('should include honesty instructions', () => {
    const prompt = createInsufficientEvidencePrompt(
      'What is X?',
      'context',
      'insufficient'
    );

    expect(prompt).toContain('acknowledging');
    expect(prompt).toContain('Do NOT make up information');
  });

  it('should provide example opening', () => {
    const prompt = createInsufficientEvidencePrompt(
      'What is X?',
      'context',
      'insufficient'
    );

    expect(prompt).toContain('Example opening');
    expect(prompt).toContain('limited information');
  });
});

// ============================================================================
// createPartialEvidencePrompt Tests
// ============================================================================

describe('createPartialEvidencePrompt', () => {
  it('should separate high and low confidence sources', () => {
    const prompt = createPartialEvidencePrompt(
      'What is X?',
      'High confidence content',
      'Low confidence content'
    );

    expect(prompt).toContain('## Highly Relevant Sources');
    expect(prompt).toContain('High confidence content');
    expect(prompt).toContain('## Partially Relevant Sources');
    expect(prompt).toContain('Low confidence content');
  });

  it('should handle missing high confidence sources', () => {
    const prompt = createPartialEvidencePrompt(
      'What is X?',
      '',
      'Low confidence content'
    );

    expect(prompt).toContain('No highly relevant sources found');
    expect(prompt).toContain('Low confidence content');
  });

  it('should handle missing low confidence sources', () => {
    const prompt = createPartialEvidencePrompt(
      'What is X?',
      'High confidence content',
      ''
    );

    expect(prompt).toContain('High confidence content');
    expect(prompt).toContain('No additional sources');
  });

  it('should include certainty guidance', () => {
    const prompt = createPartialEvidencePrompt(
      'What is X?',
      'High',
      'Low'
    );

    expect(prompt).toContain('well-supported vs. less certain');
    expect(prompt).toContain('confidently say');
  });
});

// ============================================================================
// buildChatMessages Tests
// ============================================================================

describe('buildChatMessages', () => {
  it('should include system prompt as first message', () => {
    const messages = buildChatMessages(
      'What is X?',
      [createMockRankedResult()],
      [createMockCitation()],
      false,
      'high'
    );

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toBe(GROUNDED_RESPONSE_SYSTEM_PROMPT);
  });

  it('should use standard query prompt for high confidence', () => {
    const messages = buildChatMessages(
      'What is X?',
      [createMockRankedResult()],
      [createMockCitation()],
      false,
      'high'
    );

    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('## Sources');
    expect(messages[1].content).toContain('## Question');
  });

  it('should use insufficient evidence prompt when hasInsufficient is true', () => {
    const messages = buildChatMessages(
      'What is X?',
      [createMockRankedResult()],
      [createMockCitation()],
      true,
      'medium'
    );

    expect(messages[1].content).toContain('limited information');
  });

  it('should use insufficient evidence prompt for insufficient confidence', () => {
    const messages = buildChatMessages(
      'What is X?',
      [createMockRankedResult({ rerankScore: 0.3 })],
      [createMockCitation()],
      false,
      'insufficient'
    );

    expect(messages[1].content).toContain('very limited');
  });

  it('should use partial evidence prompt for low confidence with mixed results', () => {
    const results = [
      createMockRankedResult({ id: 'high', rerankScore: 0.7 }),
      createMockRankedResult({ id: 'low', rerankScore: 0.5 }),
    ];
    const citations = [
      createMockCitation({ id: '[1]' }),
      createMockCitation({ id: '[2]' }),
    ];

    const messages = buildChatMessages(
      'What is X?',
      results,
      citations,
      false,
      'low'
    );

    expect(messages[1].content).toContain('Highly Relevant Sources');
    expect(messages[1].content).toContain('Partially Relevant Sources');
  });
});

// ============================================================================
// GROUNDED_RESPONSE_SYSTEM_PROMPT Tests
// ============================================================================

describe('GROUNDED_RESPONSE_SYSTEM_PROMPT', () => {
  it('should emphasize grounding in context', () => {
    expect(GROUNDED_RESPONSE_SYSTEM_PROMPT).toContain('GROUNDED');
    expect(GROUNDED_RESPONSE_SYSTEM_PROMPT).toContain('provided context');
  });

  it('should require citations', () => {
    expect(GROUNDED_RESPONSE_SYSTEM_PROMPT).toContain('CITED');
    expect(GROUNDED_RESPONSE_SYSTEM_PROMPT).toContain('[1], [2]');
  });

  it('should prohibit fabrication', () => {
    expect(GROUNDED_RESPONSE_SYSTEM_PROMPT).toContain('never fabricate');
    expect(GROUNDED_RESPONSE_SYSTEM_PROMPT).toContain('not guess');
  });

  it('should mention academic competition context', () => {
    expect(GROUNDED_RESPONSE_SYSTEM_PROMPT).toContain('academic competitions');
    expect(GROUNDED_RESPONSE_SYSTEM_PROMPT).toContain('ACM-ICPC');
  });
});
