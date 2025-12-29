/**
 * Plain Text Document Parser
 *
 * Parses plain text documents (.txt files).
 *
 * @module @jubilant/rag/ingestion/parsers/text
 */

import type { ParsedDocument, DocumentParser } from './index';

/**
 * TextParser - Parses plain text documents
 */
export class TextParser implements DocumentParser {
  readonly format = 'text';

  /**
   * Parse a text document from URL or file path
   *
   * @param source - URL or file path
   * @returns Parsed document
   */
  async parse(source: string): Promise<ParsedDocument> {
    const content = await this.fetchContent(source);
    const title = this.extractTitle(source, content);

    return {
      content: this.cleanContent(content),
      title,
      url: source,
      format: 'text',
      metadata: {
        title,
        characterCount: content.length,
        lineCount: content.split('\n').length,
      },
    };
  }

  /**
   * Fetch content from URL or file
   */
  private async fetchContent(source: string): Promise<string> {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${source}: ${response.statusText}`);
      }
      return await response.text();
    }

    // Local file
    const file = Bun.file(source);
    if (!(await file.exists())) {
      throw new Error(`File not found: ${source}`);
    }
    return await file.text();
  }

  /**
   * Extract title from source path or content
   */
  private extractTitle(source: string, content: string): string {
    // Try first line as title if it looks like a title
    const firstLine = content.split('\n')[0]?.trim();
    if (
      firstLine &&
      firstLine.length > 0 &&
      firstLine.length < 100 &&
      !firstLine.includes('  ') &&
      /^[A-Z]/.test(firstLine)
    ) {
      return firstLine;
    }

    // Fall back to filename
    const filename = source.split('/').pop() || 'Untitled';
    return filename.replace(/\.txt$/i, '').replace(/[-_]/g, ' ');
  }

  /**
   * Clean text content
   */
  private cleanContent(content: string): string {
    let cleaned = content;

    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/\r/g, '\n');

    // Remove excessive blank lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Remove trailing whitespace from lines
    cleaned = cleaned
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');

    return cleaned.trim();
  }
}

/**
 * Create a TextParser instance
 */
export function createTextParser(): TextParser {
  return new TextParser();
}
