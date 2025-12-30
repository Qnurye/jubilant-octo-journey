/**
 * Document Parser Factory
 *
 * Unified interface for parsing documents of various formats.
 * Includes error handling for malformed/corrupt documents (T082).
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

// ============================================================================
// Document Parse Errors (T082)
// ============================================================================

/**
 * Document parse error types
 */
export type DocumentParseErrorType =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_FORMAT'
  | 'CORRUPT_FILE'
  | 'ENCODING_ERROR'
  | 'EMPTY_DOCUMENT'
  | 'UNSUPPORTED_FORMAT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Custom error class for document parsing errors
 */
export class DocumentParseError extends Error {
  public readonly errorType: DocumentParseErrorType;
  public readonly source: string;
  public readonly format?: DocumentFormat;
  public readonly originalError?: Error;

  constructor(
    message: string,
    errorType: DocumentParseErrorType,
    source: string,
    options?: {
      format?: DocumentFormat;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'DocumentParseError';
    this.errorType = errorType;
    this.source = source;
    this.format = options?.format;
    this.originalError = options?.originalError;
  }
}

/**
 * Classify a parsing error into a DocumentParseErrorType
 */
export function classifyParseError(
  error: unknown,
  source: string
): {
  type: DocumentParseErrorType;
  message: string;
} {
  if (error instanceof DocumentParseError) {
    return { type: error.errorType, message: error.message };
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // File not found
  if (
    lowerMessage.includes('enoent') ||
    lowerMessage.includes('not found') ||
    lowerMessage.includes('no such file')
  ) {
    return {
      type: 'FILE_NOT_FOUND',
      message: `Document not found: ${source}`,
    };
  }

  // Permission errors
  if (
    lowerMessage.includes('eacces') ||
    lowerMessage.includes('permission denied') ||
    lowerMessage.includes('access denied')
  ) {
    return {
      type: 'PERMISSION_DENIED',
      message: `Permission denied accessing document: ${source}`,
    };
  }

  // Encoding errors
  if (
    lowerMessage.includes('encoding') ||
    lowerMessage.includes('invalid utf') ||
    lowerMessage.includes('invalid character') ||
    lowerMessage.includes('malformed')
  ) {
    return {
      type: 'ENCODING_ERROR',
      message: `Document has invalid encoding: ${source}`,
    };
  }

  // PDF-specific corruption
  if (
    lowerMessage.includes('invalid pdf') ||
    lowerMessage.includes('pdf structure') ||
    lowerMessage.includes('corrupt')
  ) {
    return {
      type: 'CORRUPT_FILE',
      message: `Document appears to be corrupted: ${source}`,
    };
  }

  // Network errors for remote files
  if (
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch failed') ||
    lowerMessage.includes('timeout')
  ) {
    return {
      type: 'NETWORK_ERROR',
      message: `Failed to fetch remote document: ${source}`,
    };
  }

  // Empty or invalid format
  if (
    lowerMessage.includes('empty') ||
    lowerMessage.includes('no content')
  ) {
    return {
      type: 'EMPTY_DOCUMENT',
      message: `Document is empty: ${source}`,
    };
  }

  // Unknown error
  return {
    type: 'UNKNOWN_ERROR',
    message: `Failed to parse document ${source}: ${errorMessage}`,
  };
}

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
 * Includes comprehensive error handling for malformed/corrupt documents (T082)
 *
 * @param source - URL or file path
 * @param format - Optional format override
 * @returns Parsed document
 * @throws DocumentParseError for parsing failures
 */
export async function parseDocument(
  source: string,
  format?: DocumentFormat
): Promise<ParsedDocument> {
  const detectedFormat = format || detectFormat(source);

  // Validate source before attempting to parse
  const validation = validateSource(source);
  if (!validation.valid) {
    throw new DocumentParseError(
      validation.error || 'Invalid source',
      'INVALID_FORMAT',
      source,
      { format: detectedFormat }
    );
  }

  try {
    const parser = getParser(detectedFormat);
    const document = await parser.parse(source);

    // Validate the parsed document
    const contentValidation = validateParsedContent(document);
    if (!contentValidation.valid) {
      throw new DocumentParseError(
        contentValidation.error || 'Invalid document content',
        contentValidation.errorType || 'INVALID_FORMAT',
        source,
        { format: detectedFormat }
      );
    }

    return document;
  } catch (error) {
    // If it's already a DocumentParseError, re-throw
    if (error instanceof DocumentParseError) {
      throw error;
    }

    // Classify and wrap other errors
    const classified = classifyParseError(error, source);
    throw new DocumentParseError(
      classified.message,
      classified.type,
      source,
      {
        format: detectedFormat,
        originalError: error instanceof Error ? error : undefined,
      }
    );
  }
}

/**
 * Parse a document with graceful error handling
 *
 * Returns null instead of throwing on parse errors
 *
 * @param source - URL or file path
 * @param format - Optional format override
 * @returns Parsed document or null with error details
 */
export async function parseDocumentSafe(
  source: string,
  format?: DocumentFormat
): Promise<{
  document: ParsedDocument | null;
  error: DocumentParseError | null;
}> {
  try {
    const document = await parseDocument(source, format);
    return { document, error: null };
  } catch (error) {
    if (error instanceof DocumentParseError) {
      return { document: null, error };
    }

    const classified = classifyParseError(error, source);
    return {
      document: null,
      error: new DocumentParseError(
        classified.message,
        classified.type,
        source,
        {
          format: format || detectFormat(source),
          originalError: error instanceof Error ? error : undefined,
        }
      ),
    };
  }
}

/**
 * Validate parsed document content
 */
function validateParsedContent(document: ParsedDocument): {
  valid: boolean;
  error?: string;
  errorType?: DocumentParseErrorType;
} {
  // Check for empty content
  if (!document.content || document.content.trim().length === 0) {
    return {
      valid: false,
      error: 'Document has no content',
      errorType: 'EMPTY_DOCUMENT',
    };
  }

  // Check for excessively short content (likely corrupt)
  if (document.content.trim().length < 10) {
    return {
      valid: false,
      error: 'Document content is too short (minimum 10 characters)',
      errorType: 'INVALID_FORMAT',
    };
  }

  // Check for binary content (non-text data)
  const nullBytes = (document.content.match(/\x00/g) || []).length;
  if (nullBytes > document.content.length * 0.01) {
    return {
      valid: false,
      error: 'Document appears to contain binary data',
      errorType: 'CORRUPT_FILE',
    };
  }

  return { valid: true };
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
