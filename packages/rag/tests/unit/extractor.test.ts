/**
 * Triple Extractor Tests
 *
 * Tests for FR-011: System MUST use LLM-based semantic analysis for knowledge
 * graph triple extraction, not rule-based patterns.
 *
 * @module @jubilant/rag/tests/unit/extractor
 */

import { describe, it, expect } from 'vitest';
import {
  VALID_PREDICATES,
  MIN_CONFIDENCE,
  validateTriple,
  parseTriples,
  createTripleExtractionPrompt,
  TRIPLE_EXTRACTION_SYSTEM_PROMPT,
} from '../../src/ingestion/extractor';
import type { KnowledgeTriple } from '../../src/types';

// ============================================================================
// VALID_PREDICATES Tests
// ============================================================================

describe('VALID_PREDICATES', () => {
  it('should include all required predicate types', () => {
    expect(VALID_PREDICATES).toContain('PREREQUISITE');
    expect(VALID_PREDICATES).toContain('RELATED_TO');
    expect(VALID_PREDICATES).toContain('COMPARED_TO');
    expect(VALID_PREDICATES).toContain('PART_OF');
    expect(VALID_PREDICATES).toContain('USES');
    expect(VALID_PREDICATES).toContain('IMPLEMENTS');
    expect(VALID_PREDICATES).toContain('EXAMPLE_OF');
  });

  it('should have exactly 7 predicates', () => {
    expect(VALID_PREDICATES).toHaveLength(7);
  });
});

// ============================================================================
// MIN_CONFIDENCE Tests
// ============================================================================

describe('MIN_CONFIDENCE', () => {
  it('should be 0.5 per spec requirement', () => {
    expect(MIN_CONFIDENCE).toBe(0.5);
  });
});

// ============================================================================
// validateTriple Tests
// ============================================================================

describe('validateTriple', () => {
  describe('Valid triples', () => {
    it('should accept a valid triple', () => {
      const triple = {
        subject: 'Dynamic Programming',
        predicate: 'PREREQUISITE',
        object: 'Recursion',
        confidence: 0.8,
      };

      expect(validateTriple(triple)).toBe(true);
    });

    it('should accept triples at minimum confidence', () => {
      const triple = {
        subject: 'A',
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 0.5, // Minimum
      };

      expect(validateTriple(triple)).toBe(true);
    });

    it('should accept triples with maximum confidence', () => {
      const triple = {
        subject: 'A',
        predicate: 'USES',
        object: 'B',
        confidence: 1.0,
      };

      expect(validateTriple(triple)).toBe(true);
    });

    it('should accept all valid predicates', () => {
      for (const predicate of VALID_PREDICATES) {
        const triple = {
          subject: 'Subject',
          predicate,
          object: 'Object',
          confidence: 0.7,
        };
        expect(validateTriple(triple)).toBe(true);
      }
    });
  });

  describe('Invalid triples', () => {
    it('should reject null input', () => {
      expect(validateTriple(null)).toBe(false);
    });

    it('should reject undefined input', () => {
      expect(validateTriple(undefined)).toBe(false);
    });

    it('should reject non-object input', () => {
      expect(validateTriple('string')).toBe(false);
      expect(validateTriple(123)).toBe(false);
      expect(validateTriple([])).toBe(false);
    });

    it('should reject empty subject', () => {
      const triple = {
        subject: '',
        predicate: 'RELATED_TO',
        object: 'Valid',
        confidence: 0.7,
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject empty object', () => {
      const triple = {
        subject: 'Valid',
        predicate: 'RELATED_TO',
        object: '',
        confidence: 0.7,
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject invalid predicate', () => {
      const triple = {
        subject: 'A',
        predicate: 'INVALID_PREDICATE',
        object: 'B',
        confidence: 0.7,
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject confidence below minimum (0.5)', () => {
      const triple = {
        subject: 'A',
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 0.49,
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject confidence above maximum (1.0)', () => {
      const triple = {
        subject: 'A',
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 1.1,
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject missing subject', () => {
      const triple = {
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 0.7,
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject missing predicate', () => {
      const triple = {
        subject: 'A',
        object: 'B',
        confidence: 0.7,
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject missing object', () => {
      const triple = {
        subject: 'A',
        predicate: 'RELATED_TO',
        confidence: 0.7,
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject missing confidence', () => {
      const triple = {
        subject: 'A',
        predicate: 'RELATED_TO',
        object: 'B',
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject non-string subject', () => {
      const triple = {
        subject: 123,
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 0.7,
      };

      expect(validateTriple(triple)).toBe(false);
    });

    it('should reject non-number confidence', () => {
      const triple = {
        subject: 'A',
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 'high',
      };

      expect(validateTriple(triple)).toBe(false);
    });
  });
});

// ============================================================================
// parseTriples Tests
// ============================================================================

describe('parseTriples', () => {
  const sourceChunkId = 'chunk-123';

  it('should parse valid JSON array of triples', () => {
    const response = JSON.stringify([
      {
        subject: 'Binary Search',
        predicate: 'PREREQUISITE',
        object: 'Sorted Array',
        confidence: 0.9,
      },
    ]);

    const triples = parseTriples(response, sourceChunkId);

    expect(triples).toHaveLength(1);
    expect(triples[0].subject).toBe('Binary Search');
    expect(triples[0].predicate).toBe('PREREQUISITE');
    expect(triples[0].object).toBe('Sorted Array');
    expect(triples[0].confidence).toBe(0.9);
    expect(triples[0].sourceChunkId).toBe(sourceChunkId);
  });

  it('should parse multiple triples', () => {
    const response = JSON.stringify([
      {
        subject: 'A',
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 0.8,
      },
      {
        subject: 'C',
        predicate: 'USES',
        object: 'D',
        confidence: 0.7,
      },
    ]);

    const triples = parseTriples(response, sourceChunkId);

    expect(triples).toHaveLength(2);
  });

  it('should filter out invalid triples', () => {
    const response = JSON.stringify([
      {
        subject: 'Valid',
        predicate: 'RELATED_TO',
        object: 'Triple',
        confidence: 0.8,
      },
      {
        subject: '', // Invalid: empty subject
        predicate: 'RELATED_TO',
        object: 'Triple',
        confidence: 0.8,
      },
      {
        subject: 'Low',
        predicate: 'RELATED_TO',
        object: 'Confidence',
        confidence: 0.3, // Invalid: below minimum
      },
    ]);

    const triples = parseTriples(response, sourceChunkId);

    expect(triples).toHaveLength(1);
    expect(triples[0].subject).toBe('Valid');
  });

  it('should trim whitespace from subject and object', () => {
    const response = JSON.stringify([
      {
        subject: '  Padded Subject  ',
        predicate: 'RELATED_TO',
        object: '  Padded Object  ',
        confidence: 0.7,
      },
    ]);

    const triples = parseTriples(response, sourceChunkId);

    expect(triples[0].subject).toBe('Padded Subject');
    expect(triples[0].object).toBe('Padded Object');
  });

  it('should extract JSON from markdown code block', () => {
    const response = `Here are the triples:

\`\`\`json
[
  {
    "subject": "QuickSort",
    "predicate": "USES",
    "object": "Divide and Conquer",
    "confidence": 0.85
  }
]
\`\`\``;

    const triples = parseTriples(response, sourceChunkId);

    expect(triples).toHaveLength(1);
    expect(triples[0].subject).toBe('QuickSort');
  });

  it('should return empty array for invalid JSON', () => {
    const response = 'Not valid JSON at all';

    const triples = parseTriples(response, sourceChunkId);

    expect(triples).toHaveLength(0);
  });

  it('should return empty array for non-array JSON', () => {
    const response = JSON.stringify({
      subject: 'A',
      predicate: 'RELATED_TO',
      object: 'B',
      confidence: 0.7,
    });

    const triples = parseTriples(response, sourceChunkId);

    expect(triples).toHaveLength(0);
  });

  it('should return empty array for empty array response', () => {
    const response = '[]';

    const triples = parseTriples(response, sourceChunkId);

    expect(triples).toHaveLength(0);
  });

  it('should add sourceChunkId to all triples', () => {
    const response = JSON.stringify([
      {
        subject: 'A',
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 0.8,
      },
      {
        subject: 'C',
        predicate: 'USES',
        object: 'D',
        confidence: 0.7,
      },
    ]);

    const chunkId = 'test-chunk-456';
    const triples = parseTriples(response, chunkId);

    expect(triples[0].sourceChunkId).toBe(chunkId);
    expect(triples[1].sourceChunkId).toBe(chunkId);
  });
});

// ============================================================================
// createTripleExtractionPrompt Tests
// ============================================================================

describe('createTripleExtractionPrompt', () => {
  it('should include the chunk content', () => {
    const content = 'Binary search requires a sorted array.';
    const prompt = createTripleExtractionPrompt(content);

    expect(prompt).toContain(content);
  });

  it('should specify expected output format', () => {
    const prompt = createTripleExtractionPrompt('test content');

    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('subject');
    expect(prompt).toContain('predicate');
    expect(prompt).toContain('object');
    expect(prompt).toContain('confidence');
  });

  it('should list all valid predicates', () => {
    const prompt = createTripleExtractionPrompt('test content');

    for (const predicate of VALID_PREDICATES) {
      expect(prompt).toContain(predicate);
    }
  });

  it('should specify confidence range', () => {
    const prompt = createTripleExtractionPrompt('test content');

    expect(prompt).toContain('0.0 to 1.0');
  });

  it('should mention handling of empty results', () => {
    const prompt = createTripleExtractionPrompt('test content');

    expect(prompt).toContain('empty array');
  });
});

// ============================================================================
// TRIPLE_EXTRACTION_SYSTEM_PROMPT Tests
// ============================================================================

describe('TRIPLE_EXTRACTION_SYSTEM_PROMPT', () => {
  it('should describe the extraction task', () => {
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('knowledge extraction');
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('triple');
  });

  it('should list all valid predicates with descriptions', () => {
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('PREREQUISITE');
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('RELATED_TO');
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('COMPARED_TO');
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('PART_OF');
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('USES');
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('IMPLEMENTS');
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('EXAMPLE_OF');
  });

  it('should emphasize explicit relationships', () => {
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('EXPLICIT');
  });

  it('should mention confidence scoring', () => {
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('confidence');
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('0.0 to 1.0');
  });

  it('should provide guidance on concept naming', () => {
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('capitalization');
  });

  it('should mention handling code examples', () => {
    expect(TRIPLE_EXTRACTION_SYSTEM_PROMPT).toContain('code');
  });
});
