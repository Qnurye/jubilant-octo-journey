/**
 * Markdown Document Parser
 *
 * Parses markdown documents, extracting content and metadata.
 *
 * @module @jubilant/rag/ingestion/parsers/markdown
 */

import type { ParsedDocument, DocumentParser } from './index';

/**
 * MarkdownParser - Parses markdown documents
 */
export class MarkdownParser implements DocumentParser {
  readonly format = 'markdown';

  /**
   * Parse a markdown document from URL or file path
   *
   * @param source - URL or file path
   * @returns Parsed document
   */
  async parse(source: string): Promise<ParsedDocument> {
    const content = await this.fetchContent(source);
    const metadata = this.extractMetadata(content, source);

    return {
      content: this.cleanContent(content),
      title: String(metadata.title || 'Untitled'),
      url: source,
      format: 'markdown',
      metadata,
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
   * Extract metadata from markdown content
   */
  private extractMetadata(
    content: string,
    source: string
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    // Extract YAML front matter if present
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontMatterMatch) {
      const frontMatter = frontMatterMatch[1];
      // Simple YAML parsing for common fields
      const lines = frontMatter.split('\n');
      for (const line of lines) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          metadata[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    // Extract title from first H1 if not in front matter
    if (!metadata.title) {
      const titleMatch = content.match(/^#\s+(.+?)$/m);
      if (titleMatch) {
        metadata.title = titleMatch[1].trim();
      } else {
        // Use filename as fallback
        const filename = source.split('/').pop() || 'Untitled';
        metadata.title = filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
      }
    }

    return metadata;
  }

  /**
   * Clean markdown content (remove front matter, normalize whitespace)
   */
  private cleanContent(content: string): string {
    let cleaned = content;

    // Remove YAML front matter
    cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n?/, '');

    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n');

    // Remove excessive blank lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  }
}

/**
 * Create a MarkdownParser instance
 */
export function createMarkdownParser(): MarkdownParser {
  return new MarkdownParser();
}
