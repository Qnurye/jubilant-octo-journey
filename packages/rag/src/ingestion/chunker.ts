/**
 * Content-Aware Chunker
 *
 * Implements intelligent document chunking that preserves semantic boundaries:
 * - Protected elements (code blocks, LaTeX formulas, tables) are never split
 * - Header-based section splitting for document structure
 * - Semantic chunking within sections (512-1024 token target)
 *
 * @module @jubilant/rag/ingestion/chunker
 */

import type { ChunkMetadata } from '../types';

/**
 * A protected element that should not be split
 */
export interface ProtectedElement {
  type: 'code' | 'formula' | 'table';
  content: string;
  startIndex: number;
  endIndex: number;
  placeholder: string;
}

/**
 * A section of a document with its header hierarchy
 */
export interface Section {
  level: number;
  header: string;
  content: string;
  headerPath: string[];
}

/**
 * A document chunk with metadata
 */
export interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
  metadata: Partial<ChunkMetadata>;
}

/**
 * Configuration for ContentAwareChunker
 */
export interface ChunkerConfig {
  /** Target minimum tokens per chunk */
  minTokens: number;
  /** Target maximum tokens per chunk */
  maxTokens: number;
  /** Overlap tokens between chunks for context continuity */
  overlapTokens: number;
  /** Language for token counting heuristics */
  language: 'en' | 'zh' | 'mixed';
}

const DEFAULT_CONFIG: ChunkerConfig = {
  minTokens: 512,
  maxTokens: 1024,
  overlapTokens: 50,
  language: 'mixed',
};

// ============================================================================
// Token Counting Utilities (T054)
// ============================================================================

/**
 * Estimate token count for text
 *
 * Uses heuristics based on language:
 * - English: ~4 characters per token
 * - Chinese: ~1.5 characters per token
 * - Mixed: weighted average based on content analysis
 *
 * @param text - The text to count tokens for
 * @param language - Language hint for counting
 * @returns Estimated token count
 */
export function countTokens(
  text: string,
  language: 'en' | 'zh' | 'mixed' = 'mixed'
): number {
  if (!text) return 0;

  if (language === 'en') {
    // English: approximately 4 characters per token
    return Math.ceil(text.length / 4);
  }

  if (language === 'zh') {
    // Chinese: approximately 1.5 characters per token
    return Math.ceil(text.length / 1.5);
  }

  // Mixed: analyze content and weight accordingly
  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const totalChars = text.length;

  if (totalChars === 0) return 0;

  const chineseRatio = chineseChars / totalChars;
  const englishRatio = 1 - chineseRatio;

  // Weighted token estimation
  const chineseTokens = chineseChars / 1.5;
  const englishChars = totalChars - chineseChars;
  const englishTokens = englishChars / 4;

  return Math.ceil(chineseTokens + englishTokens);
}

/**
 * Check if text exceeds token limit
 */
export function exceedsTokenLimit(
  text: string,
  limit: number,
  language: 'en' | 'zh' | 'mixed' = 'mixed'
): boolean {
  return countTokens(text, language) > limit;
}

// ============================================================================
// Protected Element Extraction (T050)
// ============================================================================

const PLACEHOLDER_PREFIX = '<<<PROTECTED_';
const PLACEHOLDER_SUFFIX = '>>>';

/**
 * Generate a unique placeholder for a protected element
 */
function generatePlaceholder(type: string, index: number): string {
  return `${PLACEHOLDER_PREFIX}${type.toUpperCase()}_${index}${PLACEHOLDER_SUFFIX}`;
}

/**
 * Extract code blocks from markdown content
 *
 * Matches both fenced code blocks (```) and indented code blocks
 */
export function extractCodeBlocks(content: string): {
  content: string;
  elements: ProtectedElement[];
} {
  const elements: ProtectedElement[] = [];
  let result = content;
  let index = 0;

  // Fenced code blocks (```language ... ```)
  const fencedCodeRegex = /```[\w]*\n[\s\S]*?\n```/g;
  let match;

  while ((match = fencedCodeRegex.exec(content)) !== null) {
    const placeholder = generatePlaceholder('code', index++);
    elements.push({
      type: 'code',
      content: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      placeholder,
    });
  }

  // Sort by start index descending to replace from end first
  elements.sort((a, b) => b.startIndex - a.startIndex);

  for (const element of elements) {
    result =
      result.slice(0, element.startIndex) +
      element.placeholder +
      result.slice(element.endIndex);
  }

  // Re-sort by original position
  elements.sort((a, b) => a.startIndex - b.startIndex);

  return { content: result, elements };
}

/**
 * Extract LaTeX formulas from content
 *
 * Matches:
 * - Display math: $$ ... $$ or \[ ... \]
 * - Inline math: $ ... $ (but not escaped \$)
 */
export function extractFormulas(content: string): {
  content: string;
  elements: ProtectedElement[];
} {
  const elements: ProtectedElement[] = [];
  let result = content;
  let index = 0;

  // Display math blocks: $$ ... $$ or \[ ... \]
  const displayMathPatterns = [
    /\$\$[\s\S]*?\$\$/g,
    /\\\[[\s\S]*?\\\]/g,
  ];

  for (const pattern of displayMathPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const placeholder = generatePlaceholder('formula', index++);
      elements.push({
        type: 'formula',
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        placeholder,
      });
    }
  }

  // Inline math: $ ... $ (not escaped and not empty)
  const inlineMathRegex = /(?<!\\)\$(?!\$)([^\$\n]+?)(?<!\\)\$/g;
  let match;
  while ((match = inlineMathRegex.exec(content)) !== null) {
    const placeholder = generatePlaceholder('formula', index++);
    elements.push({
      type: 'formula',
      content: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      placeholder,
    });
  }

  // Sort by start index descending to replace from end first
  elements.sort((a, b) => b.startIndex - a.startIndex);

  for (const element of elements) {
    result =
      result.slice(0, element.startIndex) +
      element.placeholder +
      result.slice(element.endIndex);
  }

  // Re-sort by original position
  elements.sort((a, b) => a.startIndex - b.startIndex);

  return { content: result, elements };
}

/**
 * Extract tables from markdown content
 *
 * Matches markdown tables (pipe-delimited)
 */
export function extractTables(content: string): {
  content: string;
  elements: ProtectedElement[];
} {
  const elements: ProtectedElement[] = [];
  let result = content;
  let index = 0;

  // Markdown table: lines starting with | and containing |
  // Match consecutive lines that form a table
  const tableRegex = /(?:^\|[^\n]+\|\n)+(?:^\|[-:| ]+\|\n)?(?:^\|[^\n]+\|\n)*/gm;

  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    // Verify it's a valid table (has at least header and separator)
    const lines = match[0].trim().split('\n');
    if (lines.length >= 2) {
      const placeholder = generatePlaceholder('table', index++);
      elements.push({
        type: 'table',
        content: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        placeholder,
      });
    }
  }

  // Sort by start index descending to replace from end first
  elements.sort((a, b) => b.startIndex - a.startIndex);

  for (const element of elements) {
    result =
      result.slice(0, element.startIndex) +
      element.placeholder +
      result.slice(element.endIndex);
  }

  // Re-sort by original position
  elements.sort((a, b) => a.startIndex - b.startIndex);

  return { content: result, elements };
}

/**
 * Extract all protected elements from content
 */
export function extractProtectedElements(content: string): {
  content: string;
  elements: ProtectedElement[];
} {
  const allElements: ProtectedElement[] = [];
  let result = content;

  // Extract in order: code blocks, then formulas, then tables
  const codeResult = extractCodeBlocks(result);
  result = codeResult.content;
  allElements.push(...codeResult.elements);

  const formulaResult = extractFormulas(result);
  result = formulaResult.content;
  allElements.push(...formulaResult.elements);

  const tableResult = extractTables(result);
  result = tableResult.content;
  allElements.push(...tableResult.elements);

  return { content: result, elements: allElements };
}

/**
 * Restore protected elements in content
 */
export function restoreProtectedElements(
  content: string,
  elements: ProtectedElement[]
): string {
  let result = content;

  for (const element of elements) {
    result = result.replace(element.placeholder, element.content);
  }

  return result;
}

// ============================================================================
// Header-Based Section Splitting (T051)
// ============================================================================

/**
 * Parse headers from markdown content
 *
 * Supports ATX-style headers (# to ######)
 */
export function parseHeaders(content: string): Array<{
  level: number;
  text: string;
  index: number;
}> {
  const headers: Array<{ level: number; text: string; index: number }> = [];
  const headerRegex = /^(#{1,6})\s+(.+?)$/gm;

  let match;
  while ((match = headerRegex.exec(content)) !== null) {
    headers.push({
      level: match[1].length,
      text: match[2].trim(),
      index: match.index,
    });
  }

  return headers;
}

/**
 * Split content into sections based on headers
 */
export function splitIntoSections(content: string): Section[] {
  const headers = parseHeaders(content);
  const sections: Section[] = [];

  if (headers.length === 0) {
    // No headers - treat entire content as one section
    return [
      {
        level: 0,
        header: '',
        content: content.trim(),
        headerPath: [],
      },
    ];
  }

  // Build header path stack
  const pathStack: Array<{ level: number; text: string }> = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const nextIndex = i < headers.length - 1 ? headers[i + 1].index : content.length;

    // Update path stack
    while (pathStack.length > 0 && pathStack[pathStack.length - 1].level >= header.level) {
      pathStack.pop();
    }
    pathStack.push({ level: header.level, text: header.text });

    // Extract content between this header and the next
    const sectionStart = header.index;
    const sectionEnd = nextIndex;
    const sectionContent = content.slice(sectionStart, sectionEnd).trim();

    // Remove the header line from content
    const contentWithoutHeader = sectionContent
      .replace(/^#{1,6}\s+.+?\n?/, '')
      .trim();

    sections.push({
      level: header.level,
      header: header.text,
      content: contentWithoutHeader,
      headerPath: pathStack.map((p) => p.text),
    });
  }

  // Handle content before first header
  if (headers.length > 0 && headers[0].index > 0) {
    const preambleContent = content.slice(0, headers[0].index).trim();
    if (preambleContent) {
      sections.unshift({
        level: 0,
        header: '',
        content: preambleContent,
        headerPath: [],
      });
    }
  }

  return sections;
}

// ============================================================================
// Semantic Chunking (T052)
// ============================================================================

/**
 * Split text into semantic chunks based on token limits
 *
 * Uses paragraph boundaries preferentially, then sentence boundaries
 */
export function chunkText(
  text: string,
  config: ChunkerConfig
): string[] {
  const chunks: string[] = [];
  const { minTokens, maxTokens, overlapTokens, language } = config;

  // Split into paragraphs first
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  let currentChunk = '';
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = countTokens(paragraph, language);

    // If paragraph alone exceeds max, split it further
    if (paragraphTokens > maxTokens) {
      // Save current chunk if non-empty
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentTokens = 0;
      }

      // Split paragraph by sentences
      const sentences = splitIntoSentences(paragraph);
      for (const sentence of sentences) {
        const sentenceTokens = countTokens(sentence, language);

        if (currentTokens + sentenceTokens <= maxTokens) {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
          currentTokens += sentenceTokens;
        } else {
          // Save current chunk and start new one
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = sentence;
          currentTokens = sentenceTokens;
        }
      }
    } else if (currentTokens + paragraphTokens <= maxTokens) {
      // Add paragraph to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentTokens += paragraphTokens;
    } else {
      // Save current chunk and start new one with this paragraph
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
      currentTokens = paragraphTokens;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // Merge small chunks if they're below minimum
  return mergeSmallChunks(chunks, minTokens, maxTokens, language);
}

/**
 * Split text into sentences
 *
 * Handles multiple languages and edge cases
 */
function splitIntoSentences(text: string): string[] {
  // Pattern for sentence boundaries
  // Handles: .!? followed by space or end, Chinese periods, etc.
  const sentencePattern = /[.!?。！？]+[\s\n]+|[.!?。！？]+$/g;

  const sentences: string[] = [];
  let lastIndex = 0;

  let match;
  while ((match = sentencePattern.exec(text)) !== null) {
    const sentence = text.slice(lastIndex, match.index + match[0].length).trim();
    if (sentence) {
      sentences.push(sentence);
    }
    lastIndex = match.index + match[0].length;
  }

  // Handle remaining text
  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    sentences.push(remaining);
  }

  return sentences.length > 0 ? sentences : [text];
}

/**
 * Merge chunks that are too small
 */
function mergeSmallChunks(
  chunks: string[],
  minTokens: number,
  maxTokens: number,
  language: 'en' | 'zh' | 'mixed'
): string[] {
  if (chunks.length <= 1) return chunks;

  const merged: string[] = [];
  let current = chunks[0];

  for (let i = 1; i < chunks.length; i++) {
    const currentTokens = countTokens(current, language);
    const nextTokens = countTokens(chunks[i], language);

    if (currentTokens < minTokens && currentTokens + nextTokens <= maxTokens) {
      // Merge with next chunk
      current = current + '\n\n' + chunks[i];
    } else {
      // Push current and start new
      merged.push(current);
      current = chunks[i];
    }
  }

  // Don't forget the last one
  merged.push(current);

  return merged;
}

// ============================================================================
// ContentAwareChunker Class (T053)
// ============================================================================

/**
 * ContentAwareChunker - Intelligent document chunking
 *
 * Combines protected element extraction, header-based splitting,
 * and semantic chunking to create high-quality document chunks.
 */
export class ContentAwareChunker {
  private config: ChunkerConfig;

  constructor(config: Partial<ChunkerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Chunk a document into content-aware pieces
   *
   * @param content - The document content to chunk
   * @param documentMetadata - Metadata to attach to chunks
   * @returns Array of chunks with metadata
   */
  chunk(
    content: string,
    documentMetadata: {
      documentId: string;
      documentTitle: string;
      documentUrl: string;
    }
  ): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    // Step 1: Extract protected elements
    const { content: contentWithPlaceholders, elements } =
      extractProtectedElements(content);

    // Step 2: Split into sections
    const sections = splitIntoSections(contentWithPlaceholders);

    // Step 3: Chunk each section
    for (const section of sections) {
      if (!section.content.trim()) continue;

      // Chunk the section content
      const sectionChunks = chunkText(section.content, this.config);

      for (const chunkContent of sectionChunks) {
        // Restore protected elements in this chunk
        const restoredContent = restoreProtectedElements(chunkContent, elements);

        // Detect content characteristics
        const hasCode = restoredContent.includes('```') || elements.some(
          (e) => e.type === 'code' && chunkContent.includes(e.placeholder)
        );
        const hasFormula = restoredContent.includes('$') || restoredContent.includes('\\[') || elements.some(
          (e) => e.type === 'formula' && chunkContent.includes(e.placeholder)
        );
        const hasTable = restoredContent.includes('|') && restoredContent.includes('\n|') || elements.some(
          (e) => e.type === 'table' && chunkContent.includes(e.placeholder)
        );

        const tokenCount = countTokens(restoredContent, this.config.language);

        chunks.push({
          content: restoredContent,
          index: chunkIndex++,
          tokenCount,
          metadata: {
            ...documentMetadata,
            sectionHeader: section.header || undefined,
            chunkIndex: chunkIndex - 1,
            hasCode,
            hasFormula,
            hasTable,
            tokenCount,
          },
        });
      }
    }

    // Add total chunks count to metadata
    for (const chunk of chunks) {
      chunk.metadata.totalChunks = chunks.length;
    }

    return chunks;
  }

  /**
   * Update chunker configuration
   */
  setConfig(config: Partial<ChunkerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ChunkerConfig {
    return { ...this.config };
  }
}

/**
 * Create a ContentAwareChunker with default configuration
 */
export function createChunker(config?: Partial<ChunkerConfig>): ContentAwareChunker {
  return new ContentAwareChunker(config);
}
