/**
 * Ingestion Pipeline Integration Tests
 *
 * Tests for User Story 3: Knowledge Base Ingestion with Content Preservation
 *
 * These tests verify the integration of ingestion pipeline components:
 * - Document parsing (FR-012)
 * - Content-aware chunking (FR-008, FR-009, FR-010, FR-015)
 * - Triple extraction (FR-011)
 * - Storage operations
 *
 * @module @jubilant/rag/tests/integration/ingestion-pipeline
 */

import { describe, it, expect } from 'vitest';
import {
  ContentAwareChunker,
  extractProtectedElements,
  restoreProtectedElements,
  countTokens,
  extractCodeBlocks,
  extractFormulas,
  extractTables,
  splitIntoSections,
} from '../../src/ingestion/chunker';
import {
  validateTriple,
  parseTriples,
  VALID_PREDICATES,
  MIN_CONFIDENCE,
} from '../../src/ingestion/extractor';
import type { KnowledgeTriple, Chunk } from '../../src/types';

// ============================================================================
// User Story 3: Knowledge Base Ingestion with Content Preservation
// ============================================================================

describe('User Story 3: Knowledge Base Ingestion with Content Preservation', () => {
  describe('Acceptance Scenario 1: Multi-line code blocks preserved (FR-008)', () => {
    it('should keep code block in single chunk', () => {
      // Given: A document containing a multi-line code block
      const content = `# Algorithm Example

Here's how to implement quicksort:

\`\`\`python
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)
\`\`\`

This algorithm has O(n log n) average complexity.`;

      const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });

      // When: The document is ingested
      const chunks = chunker.chunk(content, {
        documentId: 'doc-1',
        documentTitle: 'Quicksort',
        documentUrl: 'https://example.com/quicksort',
      });

      // Then: The code block should appear in a single chunk
      const codeChunk = chunks.find(c => c.content.includes('def quicksort'));
      expect(codeChunk).toBeDefined();
      expect(codeChunk!.content).toContain('def quicksort(arr):');
      expect(codeChunk!.content).toContain('return quicksort(left) + middle + quicksort(right)');

      // Code block should not be split across chunks
      const chunksWithQuicksort = chunks.filter(c =>
        c.content.includes('quicksort(') && c.content.includes('```')
      );
      expect(chunksWithQuicksort).toHaveLength(1);
    });

    it('should preserve code block language specifier', () => {
      const content = `\`\`\`typescript
interface User {
  name: string;
  email: string;
}
\`\`\``;

      const { content: contentWithPlaceholders, elements } = extractCodeBlocks(content);

      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('code');
      expect(elements[0].content).toContain('```typescript');

      const restored = restoreProtectedElements(contentWithPlaceholders, elements);
      expect(restored).toContain('```typescript');
      expect(restored).toContain('interface User');
    });
  });

  describe('Acceptance Scenario 2: Mathematical formulas preserved (FR-009)', () => {
    it('should preserve display math blocks', () => {
      // Given: A document containing mathematical formulas
      const content = `# Quadratic Formula

The solutions to $ax^2 + bx + c = 0$ are given by:

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

This formula is fundamental in algebra.`;

      const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });

      // When: The document is ingested
      const chunks = chunker.chunk(content, {
        documentId: 'doc-1',
        documentTitle: 'Math',
        documentUrl: 'https://example.com/math',
      });

      // Then: Each formula should be preserved intact within its chunk
      const formulaChunk = chunks.find(c => c.content.includes('\\frac'));
      expect(formulaChunk).toBeDefined();
      // Display math blocks may be normalized to single $ delimiters on separate lines
      expect(formulaChunk!.content).toMatch(/\$.*\\frac.*\$/s);
      expect(formulaChunk!.content).toContain('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
      expect(formulaChunk!.metadata.hasFormula).toBe(true);
    });

    it('should preserve inline math', () => {
      const content = 'The value $E = mc^2$ represents energy-mass equivalence.';

      const { content: contentWithPlaceholders, elements } = extractFormulas(content);

      expect(elements).toHaveLength(1);
      expect(elements[0].type).toBe('formula');
      expect(elements[0].content).toBe('$E = mc^2$');

      const restored = restoreProtectedElements(contentWithPlaceholders, elements);
      expect(restored).toContain('$E = mc^2$');
    });

    it('should handle LaTeX bracket notation', () => {
      const content = `Using LaTeX notation:
\\[
\\int_0^1 x^2 dx = \\frac{1}{3}
\\]`;

      const { elements } = extractFormulas(content);

      expect(elements.length).toBeGreaterThanOrEqual(1);
      expect(elements.some(e => e.content.includes('\\int'))).toBe(true);
    });
  });

  describe('Acceptance Scenario 3: Tables preserved (FR-010)', () => {
    it('should not fragment tables across chunks', () => {
      // Given: A document containing tables
      const content = `# Algorithm Comparison

| Algorithm | Time Complexity | Space Complexity |
|-----------|-----------------|------------------|
| QuickSort | O(n log n)      | O(log n)         |
| MergeSort | O(n log n)      | O(n)             |
| HeapSort  | O(n log n)      | O(1)             |
| BubbleSort| O(n^2)          | O(1)             |

Based on this comparison, QuickSort is often preferred.`;

      const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });

      // When: The document is ingested
      const chunks = chunker.chunk(content, {
        documentId: 'doc-1',
        documentTitle: 'Algorithms',
        documentUrl: 'https://example.com/algo',
      });

      // Then: Tables are not fragmented across chunks
      const tableChunk = chunks.find(c => c.content.includes('| Algorithm |'));
      expect(tableChunk).toBeDefined();
      expect(tableChunk!.content).toContain('| QuickSort |');
      expect(tableChunk!.content).toContain('| BubbleSort|');
      expect(tableChunk!.metadata.hasTable).toBe(true);
    });

    it('should preserve table alignment markers', () => {
      const content = `| Left | Center | Right |
|:-----|:------:|------:|
| 1    |   2    |     3 |`;

      const { elements } = extractTables(content);

      expect(elements).toHaveLength(1);
      expect(elements[0].content).toContain(':-----');
      expect(elements[0].content).toContain(':------:');
      expect(elements[0].content).toContain('------:');
    });
  });

  describe('Acceptance Scenario 4: LLM-based triple extraction (FR-011)', () => {
    it('should extract valid triples from LLM response', () => {
      // Given: An LLM response with triples
      const llmResponse = JSON.stringify([
        {
          subject: 'Dynamic Programming',
          predicate: 'PREREQUISITE',
          object: 'Recursion',
          confidence: 0.9,
        },
        {
          subject: 'Memoization',
          predicate: 'PART_OF',
          object: 'Dynamic Programming',
          confidence: 0.85,
        },
      ]);

      // When: Parsing the response
      const triples = parseTriples(llmResponse, 'chunk-123');

      // Then: Valid triples should be extracted
      expect(triples).toHaveLength(2);
      expect(triples[0].subject).toBe('Dynamic Programming');
      expect(triples[0].predicate).toBe('PREREQUISITE');
      expect(triples[0].object).toBe('Recursion');
      expect(triples[0].sourceChunkId).toBe('chunk-123');
    });

    it('should filter out low-confidence triples', () => {
      const llmResponse = JSON.stringify([
        {
          subject: 'A',
          predicate: 'RELATED_TO',
          object: 'B',
          confidence: 0.8, // Above threshold
        },
        {
          subject: 'C',
          predicate: 'RELATED_TO',
          object: 'D',
          confidence: 0.4, // Below threshold (0.5)
        },
      ]);

      const triples = parseTriples(llmResponse, 'chunk-1');

      expect(triples).toHaveLength(1);
      expect(triples[0].subject).toBe('A');
    });

    it('should validate predicate types', () => {
      // All valid predicates should pass validation
      for (const predicate of VALID_PREDICATES) {
        const triple = {
          subject: 'Subject',
          predicate,
          object: 'Object',
          confidence: 0.7,
        };
        expect(validateTriple(triple)).toBe(true);
      }

      // Invalid predicate should fail
      const invalidTriple = {
        subject: 'Subject',
        predicate: 'INVALID_RELATION',
        object: 'Object',
        confidence: 0.7,
      };
      expect(validateTriple(invalidTriple)).toBe(false);
    });

    it('should enforce minimum confidence threshold', () => {
      expect(MIN_CONFIDENCE).toBe(0.5);

      const atThreshold = {
        subject: 'A',
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 0.5,
      };
      expect(validateTriple(atThreshold)).toBe(true);

      const belowThreshold = {
        subject: 'A',
        predicate: 'RELATED_TO',
        object: 'B',
        confidence: 0.49,
      };
      expect(validateTriple(belowThreshold)).toBe(false);
    });
  });
});

// ============================================================================
// Content-Aware Chunking Tests (FR-015)
// ============================================================================

describe('Content-Aware Chunking (FR-015)', () => {
  describe('Token counting', () => {
    it('should estimate tokens for English text', () => {
      const text = 'This is a sample text for testing token counting.';
      const tokens = countTokens(text, 'en');

      // ~50 characters / 4 = ~13 tokens
      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(20);
    });

    it('should estimate tokens for Chinese text', () => {
      const text = '这是一个测试文本';
      const tokens = countTokens(text, 'zh');

      // 8 characters / 1.5 = ~5-6 tokens
      expect(tokens).toBeGreaterThan(3);
      expect(tokens).toBeLessThan(10);
    });

    it('should handle mixed language content', () => {
      const text = 'Hello 你好 World 世界';
      const tokens = countTokens(text, 'mixed');

      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('Section splitting', () => {
    it('should split content by headers', () => {
      const content = `# Introduction
This is the intro.

## Methods
Here are the methods.

### Details
More details here.`;

      const sections = splitIntoSections(content);

      expect(sections).toHaveLength(3);
      expect(sections[0].header).toBe('Introduction');
      expect(sections[1].header).toBe('Methods');
      expect(sections[2].header).toBe('Details');
    });

    it('should track header path for nested sections', () => {
      const content = `# Main
## Sub1
### Sub1.1
## Sub2`;

      const sections = splitIntoSections(content);

      const sub11 = sections.find(s => s.header === 'Sub1.1');
      expect(sub11).toBeDefined();
      expect(sub11!.headerPath).toContain('Main');
      expect(sub11!.headerPath).toContain('Sub1');
    });
  });

  describe('Chunk metadata', () => {
    it('should include document metadata in chunks', () => {
      const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 500 });
      const chunks = chunker.chunk('Some content here.', {
        documentId: 'doc-123',
        documentTitle: 'Test Document',
        documentUrl: 'https://example.com/test',
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].metadata.documentId).toBe('doc-123');
      expect(chunks[0].metadata.documentTitle).toBe('Test Document');
      expect(chunks[0].metadata.documentUrl).toBe('https://example.com/test');
    });

    it('should track content characteristics', () => {
      const content = `# Code Example

\`\`\`python
print("hello")
\`\`\`

# Math Section

The formula $x = y$ is simple.

# Data Table

| A | B |
|---|---|
| 1 | 2 |`;

      const chunker = new ContentAwareChunker({ minTokens: 5, maxTokens: 1000 });
      const chunks = chunker.chunk(content, {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com',
      });

      // Find chunks with each type
      const hasCodeChunk = chunks.some(c => c.metadata.hasCode);
      const hasFormulaChunk = chunks.some(c => c.metadata.hasFormula);
      const hasTableChunk = chunks.some(c => c.metadata.hasTable);

      expect(hasCodeChunk).toBe(true);
      expect(hasFormulaChunk).toBe(true);
      expect(hasTableChunk).toBe(true);
    });

    it('should track total chunks in each chunk metadata', () => {
      const content = `# Section 1
Content 1

# Section 2
Content 2

# Section 3
Content 3`;

      const chunker = new ContentAwareChunker({ minTokens: 1, maxTokens: 50 });
      const chunks = chunker.chunk(content, {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com',
      });

      const totalChunks = chunks.length;
      for (const chunk of chunks) {
        expect(chunk.metadata.totalChunks).toBe(totalChunks);
      }
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Ingestion Edge Cases', () => {
  describe('Empty or whitespace content', () => {
    it('should handle empty content', () => {
      const chunker = new ContentAwareChunker();
      const chunks = chunker.chunk('', {
        documentId: 'doc-1',
        documentTitle: 'Empty',
        documentUrl: 'https://example.com',
      });

      expect(chunks).toHaveLength(0);
    });

    it('should handle whitespace-only content', () => {
      const chunker = new ContentAwareChunker();
      const chunks = chunker.chunk('   \n\n\t  ', {
        documentId: 'doc-1',
        documentTitle: 'Whitespace',
        documentUrl: 'https://example.com',
      });

      expect(chunks).toHaveLength(0);
    });
  });

  describe('Complex nested structures', () => {
    it('should handle code blocks inside lists', () => {
      const content = `# List with Code

1. First item with code:

\`\`\`javascript
const x = 1;
\`\`\`

2. Second item

\`\`\`javascript
const y = 2;
\`\`\``;

      const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });
      const chunks = chunker.chunk(content, {
        documentId: 'doc-1',
        documentTitle: 'Test',
        documentUrl: 'https://example.com',
      });

      // Both code blocks should be preserved
      const allContent = chunks.map(c => c.content).join('\n');
      expect(allContent).toContain('const x = 1');
      expect(allContent).toContain('const y = 2');
    });

    it('should handle formulas in tables', () => {
      const content = `| Formula | Description |
|---------|-------------|
| $E = mc^2$ | Energy formula |
| $F = ma$ | Force formula |`;

      const { content: withPlaceholders, elements } = extractProtectedElements(content);

      // Both table and formulas should be extracted
      const tableElements = elements.filter(e => e.type === 'table');
      const formulaElements = elements.filter(e => e.type === 'formula');

      expect(tableElements.length).toBeGreaterThan(0);
      expect(formulaElements.length).toBeGreaterThan(0);
    });
  });

  describe('Malformed content', () => {
    it('should handle unclosed code blocks', () => {
      const content = `\`\`\`python
def broken():
    pass
# No closing backticks`;

      // Should not throw
      const { elements } = extractCodeBlocks(content);
      // May or may not extract, but should not crash
      expect(elements).toBeDefined();
    });

    it('should handle unbalanced formulas', () => {
      const content = 'The value $x = y is incomplete';

      // Should not throw
      const { elements } = extractFormulas(content);
      expect(elements).toBeDefined();
    });
  });
});
