/**
 * Document Parser Factory
 *
 * Unified interface for parsing documents of various formats.
 *
 * @module @jubilant/rag/ingestion/parsers
 */

import { MarkdownParser, createMarkdownParser } from './markdown';
import { PDFParser, createPDFParser } from './pdf';
import { TextParser, createTextParser } from './text';

// Re-export individual parsers
export { MarkdownParser, createMarkdownParser } from './markdown';
export { PDFParser, createPDFParser } from './pdf';
export { TextParser, createTextParser } from './text';

/**
 * Supported document formats
 */
export type DocumentFormat = 'markdown' | 'pdf' | 'text';

/**
 * Parsed document structure
 */
export interface ParsedDocument {
  /** Raw text content of the document */
  content: string;
  /** Document title */
  title: string;
  /** Source URL or file path */
  url: string;
  /** Document format */
  format: DocumentFormat;
  /** Additional metadata extracted from the document */
  metadata: Record<string, unknown>;
}

/**
 * Document parser interface
 */
export interface DocumentParser {
  /** The format this parser handles */
  readonly format: DocumentFormat;

  /**
   * Parse a document from URL or file path
   *
   * @param source - URL or file path
   * @returns Parsed document
   */
  parse(source: string): Promise<ParsedDocument>;
}

/**
 * Registry of available parsers
 */
const parserRegistry = new Map<DocumentFormat, () => DocumentParser>();
parserRegistry.set('markdown', createMarkdownParser);
parserRegistry.set('pdf', createPDFParser);
parserRegistry.set('text', createTextParser);

/**
 * Get a parser for the specified format
 *
 * @param format - Document format
 * @returns Parser instance
 * @throws Error if format is not supported
 */
export function getParser(format: DocumentFormat): DocumentParser {
  const factory = parserRegistry.get(format);
  if (!factory) {
    throw new Error(`Unsupported document format: ${format}`);
  }
  return factory();
}

/**
 * Check if a format is supported
 *
 * @param format - Format to check
 * @returns Whether the format is supported
 */
export function isFormatSupported(format: string): format is DocumentFormat {
  return parserRegistry.has(format as DocumentFormat);
}

/**
 * Get list of supported formats
 *
 * @returns Array of supported format names
 */
export function getSupportedFormats(): DocumentFormat[] {
  return Array.from(parserRegistry.keys());
}

/**
 * Detect document format from URL/path
 *
 * @param source - URL or file path
 * @returns Detected format or 'text' as default
 */
export function detectFormat(source: string): DocumentFormat {
  const ext = source.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'pdf':
      return 'pdf';
    case 'txt':
    case 'text':
    default:
      return 'text';
  }
}

/**
 * Parse a document, auto-detecting format if not specified
 *
 * @param source - URL or file path
 * @param format - Optional format override
 * @returns Parsed document
 */
export async function parseDocument(
  source: string,
  format?: DocumentFormat
): Promise<ParsedDocument> {
  const detectedFormat = format || detectFormat(source);
  const parser = getParser(detectedFormat);
  return await parser.parse(source);
}

/**
 * Register a custom parser
 *
 * @param format - Format name
 * @param factory - Parser factory function
 */
export function registerParser(
  format: DocumentFormat,
  factory: () => DocumentParser
): void {
  parserRegistry.set(format, factory);
}

/**
 * Validate a document source
 *
 * @param source - URL or file path
 * @returns Validation result
 */
export function validateSource(source: string): {
  valid: boolean;
  format: DocumentFormat | null;
  error?: string;
} {
  if (!source || typeof source !== 'string') {
    return { valid: false, format: null, error: 'Source must be a non-empty string' };
  }

  // Check URL format
  if (source.startsWith('http://') || source.startsWith('https://')) {
    try {
      new URL(source);
    } catch {
      return { valid: false, format: null, error: 'Invalid URL format' };
    }
  }

  const format = detectFormat(source);
  if (!isFormatSupported(format)) {
    return { valid: false, format: null, error: `Unsupported format: ${format}` };
  }

  return { valid: true, format };
}
