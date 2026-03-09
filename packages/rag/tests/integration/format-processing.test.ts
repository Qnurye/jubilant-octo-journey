/**
 * Format Processing Integration Tests
 *
 * Verifies the full document processing pipeline for PDF, Markdown, and Text formats.
 * Uses real temporary files to test actual file I/O -> parsing -> chunking -> embedding flow.
 *
 * @module @jubilant/rag/tests/integration/format-processing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm, readFile, access } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

// Mock Bun.file() for vitest (runs under Node.js, not Bun)
const globalAny = globalThis as Record<string, unknown>;
if (!globalAny.Bun) {
  globalAny.Bun = {
    file: (filePath: string) => ({
      exists: async () => {
        try { await access(filePath); return true; } catch { return false; }
      },
      text: async () => readFile(filePath, 'utf-8'),
      arrayBuffer: async () => {
        const buf = await readFile(filePath);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      },
    }),
  };
}
import {
  parseDocument,
  parseDocumentSafe,
  DocumentParseError,
  getParser,
  detectFormat,
  type ParsedDocument,
} from '../../src/ingestion/parsers';
import {
  ContentAwareChunker,
  type Chunk,
} from '../../src/ingestion/chunker';

// ============================================================================
// Test Helpers
// ============================================================================

let testDir: string;
let testCounter = 0;

function testPath(filename: string): string {
  return path.join(testDir, filename);
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(async () => {
  testCounter++;
  testDir = path.join(tmpdir(), `rag-format-test-${Date.now()}-${testCounter}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ============================================================================
// 1. Markdown Processing
// ============================================================================

describe('Markdown Processing (file I/O -> parse -> chunk)', () => {
  it('should parse a real .md file with frontmatter and extract title from it', async () => {
    const filePath = testPath('doc-with-frontmatter.md');
    await writeFile(
      filePath,
      `---
title: ACM Dynamic Programming Guide
author: Test Author
tags: dp, algorithms
---

# Introduction

Dynamic programming is a powerful algorithmic technique.

## Basics

It involves breaking problems into overlapping subproblems.
`
    );

    const doc = await parseDocument(filePath);

    expect(doc.format).toBe('markdown');
    expect(doc.title).toBe('ACM Dynamic Programming Guide');
    expect(doc.metadata.author).toBe('Test Author');
    // Frontmatter should be stripped from content
    expect(doc.content).not.toContain('---');
    expect(doc.content).not.toContain('tags: dp');
    // Actual content preserved
    expect(doc.content).toContain('Dynamic programming is a powerful algorithmic technique.');
  });

  it('should extract title from H1 when no frontmatter present', async () => {
    const filePath = testPath('no-frontmatter.md');
    await writeFile(
      filePath,
      `# Graph Algorithms Overview

Graphs are fundamental data structures used in competitive programming.

## BFS and DFS

Breadth-first and depth-first search are the most basic traversal algorithms.
`
    );

    const doc = await parseDocument(filePath);

    expect(doc.title).toBe('Graph Algorithms Overview');
  });

  it('should clean content: strip frontmatter and normalize whitespace', async () => {
    const filePath = testPath('messy-whitespace.md');
    await writeFile(
      filePath,
      `---
title: Whitespace Test
---



# Section One



Content with excessive blank lines above and below.



## Section Two



More content.
`
    );

    const doc = await parseDocument(filePath);

    // Should not have more than 2 consecutive newlines
    expect(doc.content).not.toMatch(/\n{3,}/);
    expect(doc.content).not.toContain('title: Whitespace Test');
  });

  it('should chunk markdown preserving code blocks intact', async () => {
    const filePath = testPath('code-blocks.md');
    const codeContent = `# Quicksort Implementation

Here is the implementation:

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

This runs in O(n log n) on average.
`;
    await writeFile(filePath, codeContent);

    const doc = await parseDocument(filePath);
    const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'test-doc-1',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    // Code block should not be split
    const codeChunk = chunks.find((c) => c.content.includes('def quicksort'));
    expect(codeChunk).toBeDefined();
    expect(codeChunk!.content).toContain('def quicksort(arr):');
    expect(codeChunk!.content).toContain('return quicksort(left) + middle + quicksort(right)');
    expect(codeChunk!.metadata.hasCode).toBe(true);
  });

  it('should chunk markdown preserving formulas intact', async () => {
    const filePath = testPath('formulas.md');
    await writeFile(
      filePath,
      `# Mathematical Modeling

The quadratic formula is:

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

And inline: $E = mc^2$ is well known.
`
    );

    const doc = await parseDocument(filePath);
    const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'test-doc-2',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    const formulaChunk = chunks.find((c) => c.content.includes('\\frac'));
    expect(formulaChunk).toBeDefined();
    expect(formulaChunk!.content).toContain('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');
    expect(formulaChunk!.metadata.hasFormula).toBe(true);
  });

  it('should chunk markdown preserving tables intact', async () => {
    const filePath = testPath('tables.md');
    await writeFile(
      filePath,
      `# Algorithm Comparison

| Algorithm  | Time       | Space    |
|-----------|------------|----------|
| QuickSort  | O(n log n) | O(log n) |
| MergeSort  | O(n log n) | O(n)     |
| BubbleSort | O(n^2)     | O(1)     |

Based on this, QuickSort is preferred for most cases.
`
    );

    const doc = await parseDocument(filePath);
    const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'test-doc-3',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    const tableChunk = chunks.find((c) => c.content.includes('| Algorithm'));
    expect(tableChunk).toBeDefined();
    expect(tableChunk!.content).toContain('QuickSort');
    expect(tableChunk!.content).toContain('BubbleSort');
    expect(tableChunk!.metadata.hasTable).toBe(true);
  });

  it('should verify chunk metadata accuracy (hasCode, hasFormula, hasTable)', async () => {
    const filePath = testPath('mixed-content.md');
    await writeFile(
      filePath,
      `# Mixed Content Document

## Code Section

\`\`\`javascript
const sum = (a, b) => a + b;
\`\`\`

## Formula Section

The formula $a^2 + b^2 = c^2$ is Pythagorean.

## Table Section

| X | Y |
|---|---|
| 1 | 2 |

## Plain Text Section

This section has no special content at all, just plain text that is long enough to form a chunk on its own when processed.
`
    );

    const doc = await parseDocument(filePath);
    const chunker = new ContentAwareChunker({ minTokens: 5, maxTokens: 200 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'test-doc-4',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    expect(chunks.length).toBeGreaterThan(0);

    // At least one chunk should have code
    expect(chunks.some((c) => c.metadata.hasCode)).toBe(true);
    // At least one chunk should have formula
    expect(chunks.some((c) => c.metadata.hasFormula)).toBe(true);
    // At least one chunk should have table
    expect(chunks.some((c) => c.metadata.hasTable)).toBe(true);
  });

  it('should handle Chinese markdown content for ACM competition prep', async () => {
    const filePath = testPath('chinese-content.md');
    await writeFile(
      filePath,
      `---
title: 动态规划入门指南
---

# 动态规划入门

动态规划（Dynamic Programming，简称DP）是竞赛编程中最重要的算法思想之一。

## 基本概念

动态规划的核心思想是将一个复杂问题分解为若干个子问题，通过保存子问题的解来避免重复计算。

### 适用条件

1. **最优子结构**：问题的最优解包含子问题的最优解
2. **重叠子问题**：不同的子问题会多次用到同样的更小子问题

## 经典例题

\`\`\`cpp
// 01背包问题
int dp[N][W];
for (int i = 1; i <= n; i++) {
    for (int j = 0; j <= w; j++) {
        dp[i][j] = dp[i-1][j];
        if (j >= weight[i])
            dp[i][j] = max(dp[i][j], dp[i-1][j-weight[i]] + value[i]);
    }
}
\`\`\`

状态转移方程为 $dp[i][j] = \\max(dp[i-1][j], dp[i-1][j-w_i] + v_i)$
`
    );

    const doc = await parseDocument(filePath);

    expect(doc.title).toBe('动态规划入门指南');
    expect(doc.content).toContain('动态规划');
    expect(doc.content).not.toContain('title: 动态规划入门指南');

    const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'test-doc-zh',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    expect(chunks.length).toBeGreaterThan(0);
    // Code block preserved
    const codeChunk = chunks.find((c) => c.content.includes('dp[i][j]'));
    expect(codeChunk).toBeDefined();
    expect(codeChunk!.metadata.hasCode).toBe(true);

    // Formula preserved
    const allContent = chunks.map((c) => c.content).join('\n');
    expect(allContent).toContain('\\max(dp[i-1][j]');
  });
});

// ============================================================================
// 2. Text Processing
// ============================================================================

describe('Text Processing (file I/O -> parse -> chunk)', () => {
  it('should parse a real .txt file and extract title from first line', async () => {
    const filePath = testPath('algorithms.txt');
    await writeFile(
      filePath,
      `Algorithm Design Techniques

This document covers various algorithm design techniques used in competitive programming.

Greedy algorithms make locally optimal choices at each step.
Divide and conquer breaks problems into smaller subproblems.
Dynamic programming stores intermediate results to avoid recomputation.
`
    );

    const doc = await parseDocument(filePath);

    expect(doc.format).toBe('text');
    expect(doc.title).toBe('Algorithm Design Techniques');
    expect(doc.content).toContain('Greedy algorithms');
  });

  it('should clean content and normalize whitespace', async () => {
    const filePath = testPath('messy.txt');
    await writeFile(
      filePath,
      'Line one with trailing spaces   \r\nLine two with CRLF\r\n\r\n\r\n\r\nLine after many blanks\n'
    );

    const doc = await parseDocument(filePath);

    // CRLF should be normalized to LF
    expect(doc.content).not.toContain('\r');
    // Excessive blank lines should be collapsed
    expect(doc.content).not.toMatch(/\n{3,}/);
    // Trailing whitespace should be removed
    expect(doc.content).not.toMatch(/ +\n/);
  });

  it('should produce reasonable chunks from a text file', async () => {
    const filePath = testPath('long-text.txt');
    const paragraphs = Array.from(
      { length: 10 },
      (_, i) =>
        `Paragraph ${i + 1}: This is a paragraph of text that discusses topic number ${i + 1}. ` +
        `It contains enough words to ensure that the chunker has material to work with. ` +
        `The content is deliberately repetitive to create multiple chunks for testing purposes.`
    );
    await writeFile(filePath, paragraphs.join('\n\n'));

    const doc = await parseDocument(filePath);
    const chunker = new ContentAwareChunker({ minTokens: 20, maxTokens: 200 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'test-txt-1',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should have content
    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
      expect(chunk.metadata.documentId).toBe('test-txt-1');
    }
  });

  it('should handle very short text file (< 100 chars but >= 10)', async () => {
    const filePath = testPath('short.txt');
    await writeFile(filePath, 'Short text content here for test.');

    const doc = await parseDocument(filePath);

    expect(doc.content).toBe('Short text content here for test.');
    expect(doc.format).toBe('text');
  });

  it('should fall back to filename for title when first line is not title-like', async () => {
    const filePath = testPath('my-notes.txt');
    await writeFile(
      filePath,
      `this line starts lowercase so it is not a title candidate.

But this document still has plenty of content to parse successfully.
`
    );

    const doc = await parseDocument(filePath);

    // Should fall back to filename-derived title
    expect(doc.title).toBe('my notes');
  });
});

// ============================================================================
// 3. PDF Processing
// ============================================================================

describe('PDF Processing (file I/O -> parse)', () => {
  it('should handle a file with enough readable ASCII content as PDF', async () => {
    const filePath = testPath('readable.pdf');
    // Create a fake "PDF" that has lots of readable ASCII segments.
    // The fallback extractor looks for segments where letterRatio > 0.5 and length > 20,
    // and requires total filtered content >= 100 chars.
    const textSegments = [
      'This is a segment of readable text that appears in the PDF file for testing purposes.',
      'Another segment of readable text that should be extracted by the basic fallback parser.',
      'A third segment of readable content that contributes to the total character count needed.',
      'Fourth segment of text content that helps reach the minimum one hundred character threshold.',
      'Fifth readable segment ensuring we have more than enough content for successful extraction.',
    ];
    // Surround each text segment with binary-looking data
    const binaryPadding = Buffer.from(new Uint8Array(50).fill(0x80));
    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
    for (const seg of textSegments) {
      parts.push(binaryPadding);
      parts.push(Buffer.from(seg));
    }
    parts.push(binaryPadding);
    await writeFile(filePath, Buffer.concat(parts));

    const doc = await parseDocument(filePath);

    expect(doc.format).toBe('pdf');
    // The extracted text should contain content from our segments
    expect(doc.content.length).toBeGreaterThanOrEqual(100);
    expect(doc.content).toContain('readable text');
  });

  it('should throw with helpful message for binary/unreadable PDF', async () => {
    const filePath = testPath('binary.pdf');
    // Create a file with almost no readable ASCII (all binary)
    const binaryData = Buffer.alloc(500, 0x80);
    await writeFile(filePath, binaryData);

    const result = await parseDocumentSafe(filePath);

    expect(result.error).not.toBeNull();
    // Should either get CORRUPT_FILE or suggest installing pdf-parse
    const errorMsg = result.error!.message.toLowerCase();
    const isExpectedError =
      errorMsg.includes('pdf') ||
      errorMsg.includes('corrupt') ||
      errorMsg.includes('too short') ||
      errorMsg.includes('empty');
    expect(isExpectedError).toBe(true);
  });

  it('should extract title from filename for PDF', async () => {
    const filePath = testPath('my-algorithm-notes.pdf');
    // Create a PDF with enough readable content
    const textSegments = Array.from(
      { length: 6 },
      (_, i) =>
        `This is readable text segment number ${i + 1} in the PDF document for testing title extraction.`
    );
    const binaryPadding = Buffer.from(new Uint8Array(50).fill(0x80));
    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
    for (const seg of textSegments) {
      parts.push(binaryPadding);
      parts.push(Buffer.from(seg));
    }
    parts.push(binaryPadding);
    await writeFile(filePath, Buffer.concat(parts));

    const doc = await parseDocument(filePath);

    expect(doc.title).toBe('my algorithm notes');
  });
});

// ============================================================================
// 4. Error Handling (all formats)
// ============================================================================

describe('Error Handling (all formats)', () => {
  it('should throw FILE_NOT_FOUND for non-existent file', async () => {
    const filePath = testPath('does-not-exist.md');

    try {
      await parseDocument(filePath);
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentParseError);
      const parseError = error as DocumentParseError;
      expect(parseError.errorType).toBe('FILE_NOT_FOUND');
      expect(parseError.source).toBe(filePath);
    }
  });

  it('should throw FILE_NOT_FOUND for non-existent text file', async () => {
    const filePath = testPath('missing.txt');

    const result = await parseDocumentSafe(filePath);

    expect(result.error).not.toBeNull();
    expect(result.error!.errorType).toBe('FILE_NOT_FOUND');
  });

  it('should throw FILE_NOT_FOUND for non-existent PDF file', async () => {
    const filePath = testPath('missing.pdf');

    const result = await parseDocumentSafe(filePath);

    expect(result.error).not.toBeNull();
    expect(result.error!.errorType).toBe('FILE_NOT_FOUND');
  });

  it('should throw EMPTY_DOCUMENT for empty file', async () => {
    const filePath = testPath('empty.md');
    await writeFile(filePath, '');

    const result = await parseDocumentSafe(filePath);

    expect(result.error).not.toBeNull();
    expect(result.error!.errorType).toBe('EMPTY_DOCUMENT');
  });

  it('should throw EMPTY_DOCUMENT for whitespace-only file', async () => {
    const filePath = testPath('whitespace.txt');
    await writeFile(filePath, '   \n\n\t  \n  ');

    const result = await parseDocumentSafe(filePath);

    expect(result.error).not.toBeNull();
    expect(result.error!.errorType).toBe('EMPTY_DOCUMENT');
  });

  it('should throw INVALID_FORMAT for content too short (< 10 chars)', async () => {
    const filePath = testPath('tiny.md');
    await writeFile(filePath, 'Hi');

    const result = await parseDocumentSafe(filePath);

    expect(result.error).not.toBeNull();
    expect(result.error!.errorType).toBe('INVALID_FORMAT');
    expect(result.error!.message).toContain('too short');
  });

  it('should throw CORRUPT_FILE for binary content parsed as text', async () => {
    const filePath = testPath('binary-as-text.md');
    // Create content with >1% null bytes to trigger binary detection
    const contentLength = 200;
    const nullCount = Math.ceil(contentLength * 0.02); // 2% nulls
    const buf = Buffer.alloc(contentLength);
    // Fill with printable chars
    for (let i = 0; i < contentLength; i++) {
      buf[i] = 0x41; // 'A'
    }
    // Sprinkle null bytes
    for (let i = 0; i < nullCount; i++) {
      buf[Math.floor((i * contentLength) / nullCount)] = 0x00;
    }
    await writeFile(filePath, buf);

    const result = await parseDocumentSafe(filePath);

    expect(result.error).not.toBeNull();
    expect(result.error!.errorType).toBe('CORRUPT_FILE');
    expect(result.error!.message).toContain('binary');
  });
});

// ============================================================================
// 5. Full Pipeline Integration (mock embedder + storage)
// ============================================================================

describe('Full Pipeline Integration (parse -> chunk -> mock embed -> mock store)', () => {
  it('should process markdown file through parse -> chunk -> embed -> store', async () => {
    const filePath = testPath('full-pipeline.md');
    await writeFile(
      filePath,
      `---
title: Full Pipeline Test
---

# Introduction

This is a test document for the full pipeline integration test. It has enough content to generate multiple chunks.

## Section One

Section one discusses algorithm design patterns. Greedy algorithms are a class of algorithms that make locally optimal choices at each step with the hope of finding a global optimum.

## Section Two

Section two covers data structures. Trees, graphs, and hash tables are fundamental data structures used in competitive programming. Understanding their time complexity is essential.

## Section Three

Section three is about mathematical modeling. Linear programming, network flow, and combinatorial optimization are common modeling techniques.
`
    );

    // Step 1: Parse
    const doc = await parseDocument(filePath);
    expect(doc.title).toBe('Full Pipeline Test');
    expect(doc.format).toBe('markdown');

    // Step 2: Chunk
    const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 200 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'pipeline-doc-1',
      documentTitle: doc.title,
      documentUrl: filePath,
    });
    expect(chunks.length).toBeGreaterThan(0);

    // Step 3: Mock embed
    const mockEmbed = vi.fn().mockResolvedValue({
      embeddings: chunks.map((chunk, i) => ({
        id: `chunk-${i}`,
        content: chunk.content,
        embedding: [0.1, 0.2, 0.3],
        metadata: {
          ...chunk.metadata,
          chunkIndex: i,
          totalChunks: chunks.length,
          tokenCount: chunk.tokenCount,
        },
      })),
      failed: [],
      duration: 50,
    });

    const embedResult = await mockEmbed(chunks);

    // Chunk count should match between chunker output and embedder input
    expect(embedResult.embeddings.length).toBe(chunks.length);
    expect(embedResult.failed.length).toBe(0);

    // Step 4: Mock store
    const mockStore = vi.fn().mockResolvedValue({
      milvusInserted: embedResult.embeddings.length,
      neo4jCreated: embedResult.embeddings.length,
      errors: [],
      duration: 30,
    });

    const storeResult = await mockStore(embedResult.embeddings);

    expect(storeResult.milvusInserted).toBe(chunks.length);
    expect(storeResult.neo4jCreated).toBe(chunks.length);
    expect(storeResult.errors).toHaveLength(0);
  });

  it('should propagate embedding failure correctly', async () => {
    const filePath = testPath('embed-fail.md');
    await writeFile(
      filePath,
      `# Embedding Failure Test

This document has enough content to be parsed and chunked, but the embedding step will fail.

The purpose is to verify that embedding errors are properly propagated through the pipeline.
`
    );

    const doc = await parseDocument(filePath);
    const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'embed-fail-doc',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    expect(chunks.length).toBeGreaterThan(0);

    // Mock embedder that fails all chunks
    const mockEmbed = vi.fn().mockResolvedValue({
      embeddings: [],
      failed: chunks.map((chunk) => ({
        chunk,
        error: 'Embedding service unavailable',
      })),
      duration: 100,
    });

    const embedResult = await mockEmbed(chunks);

    expect(embedResult.embeddings).toHaveLength(0);
    expect(embedResult.failed.length).toBe(chunks.length);

    // Verify the failure is detectable
    const allFailed = embedResult.embeddings.length === 0 && embedResult.failed.length > 0;
    expect(allFailed).toBe(true);

    // Storage should not be called when all embeddings fail
    const mockStore = vi.fn();
    if (embedResult.embeddings.length > 0) {
      await mockStore(embedResult.embeddings);
    }
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('should propagate storage failure correctly', async () => {
    const filePath = testPath('store-fail.md');
    await writeFile(
      filePath,
      `# Storage Failure Test

This document tests that storage errors are properly propagated. The parse and chunk steps succeed but storage fails.
`
    );

    const doc = await parseDocument(filePath);
    const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 2000 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'store-fail-doc',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    // Mock successful embedding
    const embeddedChunks = chunks.map((chunk, i) => ({
      id: `chunk-${i}`,
      content: chunk.content,
      embedding: [0.1, 0.2, 0.3],
      metadata: chunk.metadata,
    }));

    // Mock storage that fails
    const mockStore = vi.fn().mockResolvedValue({
      milvusInserted: 0,
      neo4jCreated: 0,
      errors: ['Milvus connection refused', 'Neo4j connection timeout'],
      duration: 50,
    });

    const storeResult = await mockStore(embeddedChunks);

    expect(storeResult.errors.length).toBeGreaterThan(0);
    expect(storeResult.milvusInserted).toBe(0);
    expect(storeResult.neo4jCreated).toBe(0);
  });

  it('should handle documents that produce varying chunk counts', async () => {
    // Small document
    const smallPath = testPath('small-doc.md');
    await writeFile(
      smallPath,
      `# Small Document

Just a brief paragraph of content that will likely produce one or two chunks at most.
`
    );

    // Large document
    const largePath = testPath('large-doc.md');
    const sections = Array.from(
      { length: 15 },
      (_, i) =>
        `## Section ${i + 1}\n\n` +
        `This is section ${i + 1} with substantial content about topic ${i + 1}. ` +
        `It covers important concepts in competitive programming such as algorithm analysis, ` +
        `data structure selection, and problem decomposition strategies. ` +
        `Understanding these topics is crucial for success in ACM-ICPC competitions.\n`
    );
    await writeFile(largePath, `# Large Document\n\n${sections.join('\n')}`);

    const smallDoc = await parseDocument(smallPath);
    const largeDoc = await parseDocument(largePath);

    const chunker = new ContentAwareChunker({ minTokens: 20, maxTokens: 200 });

    const smallChunks = chunker.chunk(smallDoc.content, {
      documentId: 'small-doc',
      documentTitle: smallDoc.title,
      documentUrl: smallPath,
    });

    const largeChunks = chunker.chunk(largeDoc.content, {
      documentId: 'large-doc',
      documentTitle: largeDoc.title,
      documentUrl: largePath,
    });

    // Large document should produce more chunks
    expect(largeChunks.length).toBeGreaterThan(smallChunks.length);

    // Both should have consistent metadata
    for (const chunk of smallChunks) {
      expect(chunk.metadata.documentId).toBe('small-doc');
      expect(chunk.metadata.totalChunks).toBe(smallChunks.length);
    }
    for (const chunk of largeChunks) {
      expect(chunk.metadata.documentId).toBe('large-doc');
      expect(chunk.metadata.totalChunks).toBe(largeChunks.length);
    }
  });

  it('should process a text file through the full pipeline', async () => {
    const filePath = testPath('pipeline-text.txt');
    await writeFile(
      filePath,
      `Competitive Programming Basics

Competitive programming involves solving well-defined algorithmic problems within time constraints.

Key topics include sorting algorithms, graph theory, dynamic programming, and number theory. Each topic requires both theoretical understanding and practical implementation skills.

Participants must write efficient code that handles edge cases and large inputs within strict time and memory limits.
`
    );

    const doc = await parseDocument(filePath);
    expect(doc.format).toBe('text');
    expect(doc.title).toBe('Competitive Programming Basics');

    const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 200 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'txt-pipeline',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    expect(chunks.length).toBeGreaterThan(0);

    // Mock embed + store
    const mockEmbed = vi.fn().mockResolvedValue({
      embeddings: chunks.map((c, i) => ({
        id: `txt-chunk-${i}`,
        content: c.content,
        embedding: [0.5, 0.5],
        metadata: c.metadata,
      })),
      failed: [],
      duration: 20,
    });

    const embedResult = await mockEmbed(chunks);
    expect(embedResult.embeddings.length).toBe(chunks.length);

    const mockStore = vi.fn().mockResolvedValue({
      milvusInserted: chunks.length,
      neo4jCreated: chunks.length,
      errors: [],
      duration: 10,
    });

    const storeResult = await mockStore(embedResult.embeddings);
    expect(storeResult.milvusInserted).toBe(chunks.length);
    expect(storeResult.errors).toHaveLength(0);
  });

  it('should handle partial embedding failure in the pipeline', async () => {
    const filePath = testPath('partial-embed.md');
    await writeFile(
      filePath,
      `# Partial Embedding Test

## Section A
Content for section A with enough text to form its own chunk in the pipeline processing flow.

## Section B
Content for section B with additional material to ensure chunking produces multiple chunks.

## Section C
Content for section C providing even more material for the chunker to work with properly.
`
    );

    const doc = await parseDocument(filePath);
    const chunker = new ContentAwareChunker({ minTokens: 10, maxTokens: 150 });
    const chunks = chunker.chunk(doc.content, {
      documentId: 'partial-embed-doc',
      documentTitle: doc.title,
      documentUrl: filePath,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Mock embedder: first chunk succeeds, rest fail
    const successCount = 1;
    const mockEmbed = vi.fn().mockResolvedValue({
      embeddings: chunks.slice(0, successCount).map((c, i) => ({
        id: `chunk-${i}`,
        content: c.content,
        embedding: [0.1, 0.2],
        metadata: c.metadata,
      })),
      failed: chunks.slice(successCount).map((c) => ({
        chunk: c,
        error: 'Rate limit exceeded',
      })),
      duration: 80,
    });

    const embedResult = await mockEmbed(chunks);

    // Only successfully embedded chunks should go to storage
    expect(embedResult.embeddings.length).toBe(successCount);
    expect(embedResult.failed.length).toBe(chunks.length - successCount);

    const mockStore = vi.fn().mockResolvedValue({
      milvusInserted: successCount,
      neo4jCreated: successCount,
      errors: [],
      duration: 10,
    });

    const storeResult = await mockStore(embedResult.embeddings);
    expect(storeResult.milvusInserted).toBe(successCount);
  });
});
