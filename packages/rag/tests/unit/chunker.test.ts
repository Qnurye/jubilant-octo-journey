/**
 * Content-Aware Chunker Tests
 *
 * Tests for FR-008: Code blocks preserved as atomic units
 * Tests for FR-009: Mathematical formulas preserved as atomic units
 * Tests for FR-010: Tables preserved as atomic units
 * Tests for FR-015: Chunk sizes of 512-1024 tokens with flexibility for atomic content
 *
 * @module @jubilant/rag/tests/unit/chunker
 */

import { describe, it, expect } from 'vitest';
import {
  ContentAwareChunker,
  createChunker,
  countTokens,
  extractProtectedElements,
  restoreProtectedElements,
  extractCodeBlocks,
  extractFormulas,
  extractTables,
  splitIntoSections,
  chunkText,
} from '../../src/ingestion/chunker';

// ============================================================================
// Token Counting Tests
// ============================================================================

describe('countTokens', () => {
  describe('English text', () => {
    it('should estimate ~4 characters per token for English', () => {
      const text = 'Hello world';
      const tokens = countTokens(text, 'en');
      // 11 characters / 4 = ~3 tokens
      expect(tokens).toBe(3);
    });

    it('should handle empty string', () => {
      expect(countTokens('', 'en')).toBe(0);
    });

    it('should handle longer English text', () => {
      const text = 'This is a longer sentence with more words to test the token estimation.';
      const tokens = countTokens(text, 'en');
      // 72 characters / 4 = 18 tokens
      expect(tokens).toBe(18);
    });
  });

  describe('Chinese text', () => {
    it('should estimate ~1.5 characters per token for Chinese', () => {
      const text = '你好世界';
      const tokens = countTokens(text, 'zh');
      // 4 characters / 1.5 = ~3 tokens
      expect(tokens).toBe(3);
    });
  });

  describe('Mixed text', () => {
    it('should use weighted estimation for mixed content', () => {
      const text = 'Hello 你好';
      const tokens = countTokens(text, 'mixed');
      // Should be somewhere between pure English and pure Chinese estimation
      expect(tokens).toBeGreaterThan(0);
    });

    it('should handle text with no Chinese characters as English-like', () => {
      const text = 'This is purely English text';
      const tokens = countTokens(text, 'mixed');
      expect(tokens).toBe(countTokens(text, 'en'));
    });
  });
});

// ============================================================================
// Protected Element Extraction Tests (FR-008, FR-009, FR-010)
// ============================================================================

describe('extractCodeBlocks (FR-008)', () => {
  it('should extract fenced code blocks', () => {
    const content = `Some text before

\`\`\`javascript
function hello() {
  console.log('world');
}
\`\`\`

Some text after`;

    const result = extractCodeBlocks(content);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].type).toBe('code');
    expect(result.elements[0].content).toContain('function hello()');
    expect(result.content).not.toContain('function hello()');
    expect(result.content).toContain('<<<PROTECTED_CODE_0>>>');
  });

  it('should extract multiple code blocks', () => {
    const content = `\`\`\`python
def foo():
    pass
\`\`\`

Middle text

\`\`\`javascript
const bar = 1;
\`\`\``;

    const result = extractCodeBlocks(content);

    expect(result.elements).toHaveLength(2);
    expect(result.elements[0].content).toContain('def foo()');
    expect(result.elements[1].content).toContain('const bar');
  });

  it('should preserve code block language specifier', () => {
    const content = `\`\`\`typescript
interface User {
  name: string;
}
\`\`\``;

    const result = extractCodeBlocks(content);

    expect(result.elements[0].content).toContain('```typescript');
  });

  it('should handle code blocks with empty language specifier', () => {
    const content = `\`\`\`
plain code
\`\`\``;

    const result = extractCodeBlocks(content);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].content).toContain('plain code');
  });
});

describe('extractFormulas (FR-009)', () => {
  it('should extract display math blocks with $$', () => {
    const content = `The quadratic formula is:

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

This gives us the roots.`;

    const result = extractFormulas(content);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].type).toBe('formula');
    expect(result.elements[0].content).toContain('\\frac{-b');
    expect(result.content).not.toContain('\\frac');
    expect(result.content).toContain('<<<PROTECTED_FORMULA_0>>>');
  });

  it('should extract display math blocks with \\[...\\]', () => {
    const content = `The formula:

\\[
E = mc^2
\\]

is famous.`;

    const result = extractFormulas(content);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].content).toContain('E = mc^2');
  });

  it('should extract inline math with single $', () => {
    const content = 'The value $x + y = z$ is important.';

    const result = extractFormulas(content);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].content).toBe('$x + y = z$');
  });

  it('should extract multiple formulas', () => {
    const content = `First formula: $a = b$ and second formula: $c = d$.

$$
x^2 + y^2 = z^2
$$`;

    const result = extractFormulas(content);

    expect(result.elements).toHaveLength(3);
  });
});

describe('extractTables (FR-010)', () => {
  it('should extract markdown tables', () => {
    const content = `Here is a table:

| Name | Age |
|------|-----|
| John | 30  |
| Jane | 25  |

End of table.`;

    const result = extractTables(content);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].type).toBe('table');
    expect(result.elements[0].content).toContain('| Name | Age |');
    expect(result.elements[0].content).toContain('| John | 30  |');
  });

  it('should extract tables with alignment markers', () => {
    const content = `| Left | Center | Right |
|:-----|:------:|------:|
| 1    |   2    |     3 |`;

    const result = extractTables(content);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].content).toContain(':-----');
  });

  it('should handle multiple tables', () => {
    const content = `| A | B |
|---|---|
| 1 | 2 |

Some text

| C | D |
|---|---|
| 3 | 4 |`;

    const result = extractTables(content);

    expect(result.elements).toHaveLength(2);
  });
});

describe('extractProtectedElements', () => {
  it('should extract all types of protected elements', () => {
    const content = `# Document

Here is some code:

\`\`\`python
print('hello')
\`\`\`

And a formula: $E = mc^2$

| Name | Value |
|------|-------|
| X    | 1     |

The end.`;

    const result = extractProtectedElements(content);

    expect(result.elements.length).toBeGreaterThanOrEqual(3);

    const types = result.elements.map((e) => e.type);
    expect(types).toContain('code');
    expect(types).toContain('formula');
    expect(types).toContain('table');
  });
});

describe('restoreProtectedElements', () => {
  it('should restore all protected elements', () => {
    const original = `Code: \`\`\`js
console.log('test')
\`\`\`

Formula: $a = b$`;

    const { content, elements } = extractProtectedElements(original);
    const restored = restoreProtectedElements(content, elements);

    expect(restored).toContain("console.log('test')");
    expect(restored).toContain('$a = b$');
  });

  it('should handle empty elements array', () => {
    const content = 'No protected elements here';
    const restored = restoreProtectedElements(content, []);
    expect(restored).toBe(content);
  });
});

// ============================================================================
// Section Splitting Tests
// ============================================================================

describe('splitIntoSections', () => {
  it('should split content by headers', () => {
    const content = `# Introduction

This is the intro.

## Methods

Here are the methods.

### Subsection

Details here.`;

    const sections = splitIntoSections(content);

    expect(sections).toHaveLength(3);
    expect(sections[0].header).toBe('Introduction');
    expect(sections[0].level).toBe(1);
    expect(sections[1].header).toBe('Methods');
    expect(sections[1].level).toBe(2);
    expect(sections[2].header).toBe('Subsection');
    expect(sections[2].level).toBe(3);
  });

  it('should build header path for nested sections', () => {
    const content = `# Main

## Sub

### SubSub`;

    const sections = splitIntoSections(content);

    expect(sections[2].headerPath).toContain('Main');
    expect(sections[2].headerPath).toContain('Sub');
    expect(sections[2].headerPath).toContain('SubSub');
  });

  it('should handle content without headers', () => {
    const content = 'Just plain text without any headers.';

    const sections = splitIntoSections(content);

    expect(sections).toHaveLength(1);
    expect(sections[0].header).toBe('');
    expect(sections[0].level).toBe(0);
  });

  it('should handle content before first header', () => {
    const content = `Some preamble text.

# First Section

Section content.`;

    const sections = splitIntoSections(content);

    expect(sections[0].header).toBe('');
    expect(sections[0].content).toContain('Some preamble text');
  });
});

// ============================================================================
// Text Chunking Tests (FR-015)
// ============================================================================

describe('chunkText', () => {
  const defaultConfig = {
    minTokens: 100,
    maxTokens: 200,
    overlapTokens: 20,
    language: 'en' as const,
  };

  it('should chunk text based on paragraphs', () => {
    // Create text with multiple paragraphs that exceeds maxTokens
    const paragraph = 'This is a sentence with enough words to make it substantial. ' .repeat(20);
    const content = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;

    const chunks = chunkText(content, defaultConfig);

    // With 60 sentences (20x3) of ~12 words each = ~720 words ~= 180 tokens each paragraph
    // Total ~540 tokens, should create at least 2 chunks with maxTokens=200
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should not split short text', () => {
    const content = 'Short text that fits in one chunk.';

    const chunks = chunkText(content, defaultConfig);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(content);
  });

  it('should merge small chunks below minimum', () => {
    const config = {
      minTokens: 50,
      maxTokens: 200,
      overlapTokens: 10,
      language: 'en' as const,
    };

    // Small paragraphs that should be merged
    const content = 'Small.\n\nAlso small.\n\nTiny.';

    const chunks = chunkText(content, config);

    // Should merge into one chunk since all are below minimum
    expect(chunks).toHaveLength(1);
  });
});

// ============================================================================
// ContentAwareChunker Integration Tests
// ============================================================================

describe('ContentAwareChunker', () => {
  it('should create chunks with metadata', () => {
    const chunker = createChunker({ minTokens: 10, maxTokens: 100 });

    const content = `# Title

Some content here.

## Section

More content.`;

    const metadata = {
      documentId: 'doc-1',
      documentTitle: 'Test Document',
      documentUrl: 'https://example.com/doc',
    };

    const chunks = chunker.chunk(content, metadata);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata.documentId).toBe('doc-1');
    expect(chunks[0].metadata.documentTitle).toBe('Test Document');
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  it('should preserve code blocks in chunks (FR-008)', () => {
    const chunker = createChunker({ minTokens: 10, maxTokens: 1000 });

    const content = `# Code Example

Here is a function:

\`\`\`python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
\`\`\`

This calculates factorial.`;

    const chunks = chunker.chunk(content, {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com',
    });

    // Find chunk with code
    const codeChunk = chunks.find((c) => c.content.includes('def factorial'));

    expect(codeChunk).toBeDefined();
    expect(codeChunk!.content).toContain('return n * factorial(n - 1)');
    expect(codeChunk!.metadata.hasCode).toBe(true);
  });

  it('should preserve formulas in chunks (FR-009)', () => {
    const chunker = createChunker({ minTokens: 10, maxTokens: 1000 });

    const content = `# Math

The quadratic formula:

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

Used to solve equations.`;

    const chunks = chunker.chunk(content, {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com',
    });

    const formulaChunk = chunks.find((c) => c.content.includes('\\frac'));

    expect(formulaChunk).toBeDefined();
    expect(formulaChunk!.metadata.hasFormula).toBe(true);
  });

  it('should preserve tables in chunks (FR-010)', () => {
    const chunker = createChunker({ minTokens: 10, maxTokens: 1000 });

    const content = `# Data

| Algorithm | Complexity |
|-----------|------------|
| QuickSort | O(n log n) |
| BubbleSort | O(n^2) |

Performance comparison.`;

    const chunks = chunker.chunk(content, {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com',
    });

    const tableChunk = chunks.find((c) => c.content.includes('| Algorithm |'));

    expect(tableChunk).toBeDefined();
    expect(tableChunk!.content).toContain('| QuickSort |');
    expect(tableChunk!.content).toContain('| BubbleSort |');
    expect(tableChunk!.metadata.hasTable).toBe(true);
  });

  it('should track total chunks in metadata', () => {
    const chunker = createChunker({ minTokens: 10, maxTokens: 50 });

    const content = `# Section 1

Content for section one is here.

# Section 2

Content for section two is here.

# Section 3

Content for section three is here.`;

    const chunks = chunker.chunk(content, {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com',
    });

    // All chunks should have the same totalChunks value
    const totalChunks = chunks[0].metadata.totalChunks;
    expect(totalChunks).toBe(chunks.length);

    for (const chunk of chunks) {
      expect(chunk.metadata.totalChunks).toBe(totalChunks);
    }
  });

  it('should include section header in metadata', () => {
    const chunker = createChunker({ minTokens: 10, maxTokens: 1000 });

    const content = `# Introduction

The introduction text.

## Methods

The methods section.`;

    const chunks = chunker.chunk(content, {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com',
    });

    const introChunk = chunks.find((c) => c.metadata.sectionHeader === 'Introduction');
    const methodsChunk = chunks.find((c) => c.metadata.sectionHeader === 'Methods');

    expect(introChunk).toBeDefined();
    expect(methodsChunk).toBeDefined();
  });

  it('should allow configuration updates', () => {
    const chunker = createChunker({ minTokens: 100 });

    expect(chunker.getConfig().minTokens).toBe(100);

    chunker.setConfig({ minTokens: 200 });

    expect(chunker.getConfig().minTokens).toBe(200);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty content', () => {
    const chunker = createChunker();

    const chunks = chunker.chunk('', {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com',
    });

    expect(chunks).toHaveLength(0);
  });

  it('should handle content with only whitespace', () => {
    const chunker = createChunker();

    const chunks = chunker.chunk('   \n\n   ', {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com',
    });

    expect(chunks).toHaveLength(0);
  });

  it('should handle nested code blocks in lists', () => {
    const chunker = createChunker({ minTokens: 10, maxTokens: 1000 });

    const content = `# List with Code

1. First item with code:

\`\`\`python
x = 1
\`\`\`

2. Second item with code:

\`\`\`python
y = 2
\`\`\``;

    const chunks = chunker.chunk(content, {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com',
    });

    // Both code blocks should be preserved
    const allContent = chunks.map((c) => c.content).join('\n');
    expect(allContent).toContain('x = 1');
    expect(allContent).toContain('y = 2');
  });

  it('should handle mixed language content', () => {
    const chunker = createChunker({ language: 'mixed' });

    const content = `# 标题 (Title)

This is English text mixed with 中文内容.

## 算法 (Algorithm)

The algorithm works by 计算每个节点的值.`;

    const chunks = chunker.chunk(content, {
      documentId: 'doc-1',
      documentTitle: 'Test',
      documentUrl: 'https://example.com',
    });

    expect(chunks.length).toBeGreaterThan(0);
    const allContent = chunks.map((c) => c.content).join(' ');
    expect(allContent).toContain('中文内容');
    expect(allContent).toContain('English text');
  });
});
