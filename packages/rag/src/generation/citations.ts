/**
 * Citation Extraction and Formatting
 *
 * Utilities for creating and managing citations from ranked results.
 *
 * @module @jubilant/rag/generation/citations
 */

import type { RankedResult, Citation } from '../types';

/**
 * Configuration for citation generation
 */
export interface CitationConfig {
  /** Maximum length of snippet */
  maxSnippetLength: number;
  /** Whether to include relevance scores */
  includeScores: boolean;
}

/**
 * Default citation configuration
 */
const DEFAULT_CONFIG: CitationConfig = {
  maxSnippetLength: 300,
  includeScores: true,
};

/**
 * Create citations from ranked results
 *
 * @param results - Ranked retrieval results
 * @param config - Citation configuration
 * @returns Array of citations
 */
export function createCitations(
  results: RankedResult[],
  config: Partial<CitationConfig> = {}
): Citation[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return results.map((result, index) => {
    const id = `[${index + 1}]`;
    const snippet = extractSnippet(result.content, cfg.maxSnippetLength);

    return {
      id,
      chunkId: result.id,
      documentTitle: result.metadata.documentTitle,
      documentUrl: result.metadata.documentUrl,
      snippet,
      relevanceScore: result.rerankScore,
    };
  });
}

/**
 * Extract a meaningful snippet from content
 *
 * Tries to extract complete sentences up to the max length.
 *
 * @param content - The full content text
 * @param maxLength - Maximum snippet length
 * @returns Extracted snippet
 */
export function extractSnippet(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content.trim();
  }

  // Try to break at sentence boundary
  const truncated = content.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclamation = truncated.lastIndexOf('!');

  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);

  if (lastSentenceEnd > maxLength * 0.5) {
    // Use sentence boundary if it's at least halfway through
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }

  // Otherwise, break at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace).trim() + '...';
  }

  return truncated.trim() + '...';
}

/**
 * Extract citation IDs from generated text
 *
 * Finds all [1], [2], etc. references in the text.
 *
 * @param text - Generated response text
 * @returns Array of citation IDs found
 */
export function extractCitationIds(text: string): string[] {
  const citationRegex = /\[(\d+)\]/g;
  const matches = text.matchAll(citationRegex);
  const ids = new Set<string>();

  for (const match of matches) {
    ids.add(`[${match[1]}]`);
  }

  return Array.from(ids).sort((a, b) => {
    const numA = parseInt(a.slice(1, -1));
    const numB = parseInt(b.slice(1, -1));
    return numA - numB;
  });
}

/**
 * Filter citations to only those actually used in the response
 *
 * @param citations - All available citations
 * @param responseText - The generated response
 * @returns Citations that are referenced in the response
 */
export function filterUsedCitations(
  citations: Citation[],
  responseText: string
): Citation[] {
  const usedIds = new Set(extractCitationIds(responseText));
  return citations.filter((c) => usedIds.has(c.id));
}

/**
 * Renumber citations to be sequential in the response
 *
 * If the response only uses [1] and [3], this renumbers them to [1] and [2].
 *
 * @param responseText - The generated response
 * @param citations - Original citations
 * @returns Object with updated text and citations
 */
export function renumberCitations(
  responseText: string,
  citations: Citation[]
): { text: string; citations: Citation[] } {
  const usedIds = extractCitationIds(responseText);

  if (usedIds.length === 0) {
    return { text: responseText, citations: [] };
  }

  // Create mapping from old ID to new ID
  const idMapping = new Map<string, string>();
  const usedCitations: Citation[] = [];

  usedIds.forEach((oldId, index) => {
    const newId = `[${index + 1}]`;
    idMapping.set(oldId, newId);

    // Find and update the citation
    const citation = citations.find((c) => c.id === oldId);
    if (citation) {
      usedCitations.push({
        ...citation,
        id: newId,
      });
    }
  });

  // Replace IDs in text
  let newText = responseText;
  for (const [oldId, newId] of idMapping) {
    if (oldId !== newId) {
      // Need to replace all occurrences
      const regex = new RegExp(oldId.replace(/[[\]]/g, '\\$&'), 'g');
      newText = newText.replace(regex, newId);
    }
  }

  return { text: newText, citations: usedCitations };
}

/**
 * Format citation for display
 *
 * @param citation - The citation to format
 * @param includeScore - Whether to include relevance score
 * @returns Formatted citation string
 */
export function formatCitation(
  citation: Citation,
  includeScore: boolean = false
): string {
  let formatted = `${citation.id} ${citation.documentTitle}`;

  if (includeScore) {
    formatted += ` (relevance: ${(citation.relevanceScore * 100).toFixed(0)}%)`;
  }

  return formatted;
}

/**
 * Create a citation reference section for the response
 *
 * @param citations - Citations to include
 * @param includeSnippets - Whether to include snippet previews
 * @returns Formatted references section
 */
export function createReferencesSection(
  citations: Citation[],
  includeSnippets: boolean = false
): string {
  if (citations.length === 0) {
    return '';
  }

  const lines = ['', '---', '**References:**'];

  for (const citation of citations) {
    let line = `${citation.id} ${citation.documentTitle}`;

    if (citation.documentUrl) {
      line += ` - ${citation.documentUrl}`;
    }

    lines.push(line);

    if (includeSnippets && citation.snippet) {
      lines.push(`   > ${citation.snippet.slice(0, 100)}...`);
    }
  }

  return lines.join('\n');
}

/**
 * Validate that all citations in text have corresponding citation objects
 *
 * @param text - Response text with citations
 * @param citations - Available citations
 * @returns Validation result with any missing citations
 */
export function validateCitations(
  text: string,
  citations: Citation[]
): { valid: boolean; missing: string[] } {
  const usedIds = extractCitationIds(text);
  const availableIds = new Set(citations.map((c) => c.id));

  const missing = usedIds.filter((id) => !availableIds.has(id));

  return {
    valid: missing.length === 0,
    missing,
  };
}
