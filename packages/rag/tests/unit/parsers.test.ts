/**
 * Document Parser Tests
 *
 * Tests for FR-012: Support document ingestion for common formats
 * Tests for T082: Error handling for malformed/corrupt documents
 *
 * @module @jubilant/rag/tests/unit/parsers
 */

import { describe, it, expect } from 'vitest';
import {
  DocumentParseError,
  classifyParseError,
  detectFormat,
  validateSource,
  isFormatSupported,
  getSupportedFormats,
  getParser,
  type DocumentFormat,
  type DocumentParseErrorType,
} from '../../src/ingestion/parsers';

// ============================================================================
// DocumentParseError Tests
// ============================================================================

describe('DocumentParseError', () => {
  it('should create an error with type and message', () => {
    const error = new DocumentParseError(
      'File not found',
      'FILE_NOT_FOUND',
      '/path/to/file.pdf'
    );

    expect(error.message).toBe('File not found');
    expect(error.errorType).toBe('FILE_NOT_FOUND');
    expect(error.source).toBe('/path/to/file.pdf');
    expect(error.name).toBe('DocumentParseError');
  });

  it('should accept optional format', () => {
    const error = new DocumentParseError(
      'Parse error',
      'INVALID_FORMAT',
      'file.md',
      { format: 'markdown' }
    );

    expect(error.format).toBe('markdown');
  });

  it('should accept optional originalError', () => {
    const originalError = new Error('Original');
    const error = new DocumentParseError(
      'Wrapped error',
      'UNKNOWN_ERROR',
      'file.txt',
      { originalError }
    );

    expect(error.originalError).toBe(originalError);
  });

  it('should extend Error class', () => {
    const error = new DocumentParseError('Test', 'UNKNOWN_ERROR', 'file');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DocumentParseError);
  });
});

// ============================================================================
// classifyParseError Tests
// ============================================================================

describe('classifyParseError', () => {
  describe('File not found errors', () => {
    it('should classify ENOENT as FILE_NOT_FOUND', () => {
      const error = new Error('ENOENT: no such file or directory');
      const result = classifyParseError(error, 'missing.txt');

      expect(result.type).toBe('FILE_NOT_FOUND');
      expect(result.message).toContain('not found');
    });

    it('should classify "not found" as FILE_NOT_FOUND', () => {
      const error = new Error('Resource not found');
      const result = classifyParseError(error, 'resource');

      expect(result.type).toBe('FILE_NOT_FOUND');
    });

    it('should classify "no such file" as FILE_NOT_FOUND', () => {
      const error = new Error('no such file exists');
      const result = classifyParseError(error, 'file.pdf');

      expect(result.type).toBe('FILE_NOT_FOUND');
    });
  });

  describe('Permission errors', () => {
    it('should classify EACCES as PERMISSION_DENIED', () => {
      const error = new Error('EACCES: permission denied');
      const result = classifyParseError(error, 'protected.pdf');

      expect(result.type).toBe('PERMISSION_DENIED');
      expect(result.message).toContain('Permission denied');
    });

    it('should classify "access denied" as PERMISSION_DENIED', () => {
      const error = new Error('Access denied to resource');
      const result = classifyParseError(error, 'file');

      expect(result.type).toBe('PERMISSION_DENIED');
    });
  });

  describe('Encoding errors', () => {
    it('should classify encoding issues as ENCODING_ERROR', () => {
      const error = new Error('Invalid UTF-8 encoding');
      const result = classifyParseError(error, 'file.txt');

      expect(result.type).toBe('ENCODING_ERROR');
    });

    it('should classify malformed content as ENCODING_ERROR', () => {
      const error = new Error('malformed data in file');
      const result = classifyParseError(error, 'file');

      expect(result.type).toBe('ENCODING_ERROR');
    });

    it('should classify invalid character as ENCODING_ERROR', () => {
      const error = new Error('Invalid character in input');
      const result = classifyParseError(error, 'file');

      expect(result.type).toBe('ENCODING_ERROR');
    });
  });

  describe('Corrupt file errors', () => {
    it('should classify invalid PDF as CORRUPT_FILE', () => {
      const error = new Error('Invalid PDF structure');
      const result = classifyParseError(error, 'bad.pdf');

      expect(result.type).toBe('CORRUPT_FILE');
      expect(result.message).toContain('corrupted');
    });

    it('should classify corrupt files as CORRUPT_FILE', () => {
      const error = new Error('File appears to be corrupt');
      const result = classifyParseError(error, 'file.pdf');

      expect(result.type).toBe('CORRUPT_FILE');
    });
  });

  describe('Network errors', () => {
    it('should classify ECONNREFUSED as NETWORK_ERROR', () => {
      const error = new Error('connect ECONNREFUSED');
      const result = classifyParseError(error, 'http://example.com/file');

      expect(result.type).toBe('NETWORK_ERROR');
    });

    it('should classify fetch failures as NETWORK_ERROR', () => {
      const error = new Error('fetch failed');
      const result = classifyParseError(error, 'https://example.com');

      expect(result.type).toBe('NETWORK_ERROR');
    });

    it('should classify timeout as NETWORK_ERROR', () => {
      const error = new Error('Request timeout');
      const result = classifyParseError(error, 'http://slow.server');

      expect(result.type).toBe('NETWORK_ERROR');
    });
  });

  describe('Empty document errors', () => {
    it('should classify empty content as EMPTY_DOCUMENT', () => {
      const error = new Error('Document is empty');
      const result = classifyParseError(error, 'empty.txt');

      expect(result.type).toBe('EMPTY_DOCUMENT');
    });

    it('should classify no content as EMPTY_DOCUMENT', () => {
      const error = new Error('No content found');
      const result = classifyParseError(error, 'blank.md');

      expect(result.type).toBe('EMPTY_DOCUMENT');
    });
  });

  describe('Unknown errors', () => {
    it('should classify unrecognized errors as UNKNOWN_ERROR', () => {
      const error = new Error('Some random error');
      const result = classifyParseError(error, 'file');

      expect(result.type).toBe('UNKNOWN_ERROR');
      expect(result.message).toContain('Some random error');
    });

    it('should handle non-Error objects', () => {
      const result = classifyParseError('string error', 'file');

      expect(result.type).toBe('UNKNOWN_ERROR');
    });
  });

  describe('Already classified errors', () => {
    it('should return existing classification for DocumentParseError', () => {
      const existingError = new DocumentParseError(
        'Custom message',
        'CORRUPT_FILE',
        'source'
      );

      const result = classifyParseError(existingError, 'other');

      expect(result.type).toBe('CORRUPT_FILE');
      expect(result.message).toBe('Custom message');
    });
  });
});

// ============================================================================
// detectFormat Tests
// ============================================================================

describe('detectFormat', () => {
  it('should detect markdown from .md extension', () => {
    expect(detectFormat('document.md')).toBe('markdown');
  });

  it('should detect markdown from .markdown extension', () => {
    expect(detectFormat('document.markdown')).toBe('markdown');
  });

  it('should detect PDF from .pdf extension', () => {
    expect(detectFormat('document.pdf')).toBe('pdf');
  });

  it('should detect text from .txt extension', () => {
    expect(detectFormat('document.txt')).toBe('text');
  });

  it('should default to text for unknown extensions', () => {
    expect(detectFormat('document.xyz')).toBe('text');
    expect(detectFormat('document')).toBe('text');
  });

  it('should handle file paths with directories', () => {
    expect(detectFormat('/path/to/document.md')).toBe('markdown');
    expect(detectFormat('folder/subfolder/file.pdf')).toBe('pdf');
  });

  it('should handle URLs', () => {
    expect(detectFormat('https://example.com/doc.md')).toBe('markdown');
    expect(detectFormat('https://example.com/file.pdf')).toBe('pdf');
  });

  it('should be case-insensitive', () => {
    expect(detectFormat('document.MD')).toBe('markdown');
    expect(detectFormat('document.PDF')).toBe('pdf');
  });
});

// ============================================================================
// validateSource Tests
// ============================================================================

describe('validateSource', () => {
  it('should validate valid file paths', () => {
    const result = validateSource('/path/to/document.md');

    expect(result.valid).toBe(true);
    expect(result.format).toBe('markdown');
  });

  it('should validate valid URLs', () => {
    const result = validateSource('https://example.com/doc.pdf');

    expect(result.valid).toBe(true);
    expect(result.format).toBe('pdf');
  });

  it('should reject empty sources', () => {
    const result = validateSource('');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty string');
  });

  it('should reject invalid URLs', () => {
    const result = validateSource('http://[invalid url');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  it('should accept relative paths', () => {
    const result = validateSource('docs/readme.md');

    expect(result.valid).toBe(true);
    expect(result.format).toBe('markdown');
  });
});

// ============================================================================
// Format Support Tests (FR-012)
// ============================================================================

describe('FR-012: Supported Document Formats', () => {
  describe('isFormatSupported', () => {
    it('should support markdown format', () => {
      expect(isFormatSupported('markdown')).toBe(true);
    });

    it('should support PDF format', () => {
      expect(isFormatSupported('pdf')).toBe(true);
    });

    it('should support text format', () => {
      expect(isFormatSupported('text')).toBe(true);
    });

    it('should reject unsupported formats', () => {
      expect(isFormatSupported('docx')).toBe(false);
      expect(isFormatSupported('html')).toBe(false);
    });
  });

  describe('getSupportedFormats', () => {
    it('should return all three required formats', () => {
      const formats = getSupportedFormats();

      expect(formats).toContain('markdown');
      expect(formats).toContain('pdf');
      expect(formats).toContain('text');
      expect(formats).toHaveLength(3);
    });
  });

  describe('getParser', () => {
    it('should return a parser for markdown', () => {
      const parser = getParser('markdown');

      expect(parser.format).toBe('markdown');
      expect(typeof parser.parse).toBe('function');
    });

    it('should return a parser for PDF', () => {
      const parser = getParser('pdf');

      expect(parser.format).toBe('pdf');
      expect(typeof parser.parse).toBe('function');
    });

    it('should return a parser for text', () => {
      const parser = getParser('text');

      expect(parser.format).toBe('text');
      expect(typeof parser.parse).toBe('function');
    });

    it('should throw for unsupported formats', () => {
      expect(() => getParser('docx' as DocumentFormat)).toThrow(
        'Unsupported document format'
      );
    });
  });
});

// ============================================================================
// Error Type Coverage Tests
// ============================================================================

describe('DocumentParseErrorType coverage', () => {
  const allErrorTypes: DocumentParseErrorType[] = [
    'FILE_NOT_FOUND',
    'PERMISSION_DENIED',
    'INVALID_FORMAT',
    'CORRUPT_FILE',
    'ENCODING_ERROR',
    'EMPTY_DOCUMENT',
    'UNSUPPORTED_FORMAT',
    'NETWORK_ERROR',
    'UNKNOWN_ERROR',
  ];

  it('should have 9 error types', () => {
    expect(allErrorTypes).toHaveLength(9);
  });

  it('should be able to create DocumentParseError with each type', () => {
    for (const errorType of allErrorTypes) {
      const error = new DocumentParseError(`Test ${errorType}`, errorType, 'source');
      expect(error.errorType).toBe(errorType);
    }
  });
});

// ============================================================================
// T082: Malformed/Corrupt Document Handling Tests
// ============================================================================

describe('T082: Malformed/Corrupt Document Error Handling', () => {
  it('should provide user-friendly message for file not found', () => {
    const result = classifyParseError(new Error('ENOENT'), '/missing/file.pdf');

    expect(result.message).toContain('not found');
    expect(result.message).toContain('/missing/file.pdf');
  });

  it('should provide user-friendly message for corrupt files', () => {
    const result = classifyParseError(new Error('Invalid PDF structure'), 'bad.pdf');

    expect(result.message).toContain('corrupt');
  });

  it('should provide user-friendly message for permission errors', () => {
    const result = classifyParseError(new Error('EACCES'), '/protected/file');

    expect(result.message).toContain('Permission denied');
  });

  it('should provide user-friendly message for encoding errors', () => {
    const result = classifyParseError(new Error('Invalid UTF-8'), 'binary.dat');

    expect(result.message).toContain('encoding');
  });

  it('should preserve original error for debugging', () => {
    const originalError = new Error('Original error');
    const error = new DocumentParseError(
      'Wrapped',
      'UNKNOWN_ERROR',
      'source',
      { originalError }
    );

    expect(error.originalError).toBe(originalError);
    expect(error.originalError?.message).toBe('Original error');
  });
});
