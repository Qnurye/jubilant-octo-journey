/**
 * PDF Document Parser
 *
 * Parses PDF documents, extracting text content.
 * Uses pdf-parse for text extraction.
 *
 * @module @jubilant/rag/ingestion/parsers/pdf
 */

import type { ParsedDocument, DocumentParser } from './index';

/**
 * PDFParser - Parses PDF documents
 *
 * Note: This is a basic implementation. For production use,
 * consider using pdf-parse or similar library for better extraction.
 */
export class PDFParser implements DocumentParser {
  readonly format = 'pdf';

  /**
   * Parse a PDF document from URL or file path
   *
   * @param source - URL or file path
   * @returns Parsed document
   */
  async parse(source: string): Promise<ParsedDocument> {
    const buffer = await this.fetchContent(source);
    const content = await this.extractText(buffer);
    const title = this.extractTitle(source);

    return {
      content,
      title,
      url: source,
      format: 'pdf',
      metadata: {
        title,
        pageCount: this.estimatePageCount(content),
      },
    };
  }

  /**
   * Fetch PDF content from URL or file
   */
  private async fetchContent(source: string): Promise<ArrayBuffer> {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${source}: ${response.statusText}`);
      }
      return await response.arrayBuffer();
    }

    // Local file
    const file = Bun.file(source);
    if (!(await file.exists())) {
      throw new Error(`File not found: ${source}`);
    }
    return await file.arrayBuffer();
  }

  /**
   * Extract text from PDF buffer
   *
   * This is a placeholder implementation.
   * In production, use a proper PDF parsing library like pdf-parse.
   */
  private async extractText(buffer: ArrayBuffer): Promise<string> {
    // Try to use pdf-parse if available
    try {
      // Dynamic import to handle cases where pdf-parse isn't installed
      // Note: pdf-parse is an optional dependency for better PDF support
      const pdfParseModule = await import('pdf-parse' as string).catch(() => null);

      if (pdfParseModule) {
        const pdfParse = pdfParseModule.default || pdfParseModule;
        const data = await pdfParse(Buffer.from(buffer));
        return data.text;
      }
    } catch {
      // Fall through to basic extraction
    }

    // Basic text extraction from PDF (very limited)
    // This attempts to extract readable ASCII text from the PDF
    const bytes = new Uint8Array(buffer);
    const text: string[] = [];
    let currentText = '';

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      // Only keep printable ASCII characters and common whitespace
      if (
        (byte >= 32 && byte <= 126) ||
        byte === 10 ||
        byte === 13 ||
        byte === 9
      ) {
        currentText += String.fromCharCode(byte);
      } else if (currentText.length > 0) {
        // End of text segment
        if (currentText.trim().length > 10) {
          text.push(currentText.trim());
        }
        currentText = '';
      }
    }

    if (currentText.trim().length > 10) {
      text.push(currentText.trim());
    }

    // Filter out binary garbage and join
    const filtered = text
      .filter((t) => {
        // Keep segments that look like actual text
        const letterRatio = (t.match(/[a-zA-Z]/g) || []).length / t.length;
        return letterRatio > 0.5 && t.length > 20;
      })
      .join('\n\n');

    if (filtered.length < 100) {
      throw new Error(
        'PDF text extraction failed. Please install pdf-parse for better PDF support: bun add pdf-parse'
      );
    }

    return filtered;
  }

  /**
   * Extract title from source path
   */
  private extractTitle(source: string): string {
    const filename = source.split('/').pop() || 'Untitled';
    return filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  }

  /**
   * Estimate page count from content length
   */
  private estimatePageCount(content: string): number {
    // Rough estimate: ~3000 characters per page
    return Math.max(1, Math.ceil(content.length / 3000));
  }
}

/**
 * Create a PDFParser instance
 */
export function createPDFParser(): PDFParser {
  return new PDFParser();
}
