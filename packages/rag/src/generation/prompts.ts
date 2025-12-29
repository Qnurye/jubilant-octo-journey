/**
 * Prompt Templates for Grounded Response Generation
 *
 * Templates ensure responses are grounded in retrieved evidence
 * with proper citations and uncertainty acknowledgment.
 *
 * @module @jubilant/rag/generation/prompts
 */

import type { RankedResult, Citation } from '../types';

/**
 * Confidence level based on reranker scores
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

/**
 * Calculate confidence level from reranker score
 *
 * @param topScore - The highest reranker score
 * @returns Confidence level
 */
export function getConfidenceLevel(topScore: number): ConfidenceLevel {
  if (topScore >= 0.8) return 'high';
  if (topScore >= 0.6) return 'medium';
  if (topScore >= 0.4) return 'low';
  return 'insufficient';
}

/**
 * Check if evidence is sufficient (confidence threshold met)
 *
 * @param topScore - The highest reranker score
 * @param threshold - Confidence threshold (default 0.6)
 * @returns Whether evidence is sufficient
 */
export function hasInsufficientEvidence(
  topScore: number,
  threshold: number = 0.6
): boolean {
  return topScore < threshold;
}

/**
 * Format context chunks for LLM prompt
 *
 * @param results - Ranked retrieval results
 * @param citations - Citation references
 * @returns Formatted context string
 */
export function formatContext(
  results: RankedResult[],
  citations: Citation[]
): string {
  const contextParts: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const citation = citations[i];

    contextParts.push(`[${citation.id}] Source: ${citation.documentTitle}
${result.content}
---`);
  }

  return contextParts.join('\n\n');
}

/**
 * System prompt for grounded response generation
 */
export const GROUNDED_RESPONSE_SYSTEM_PROMPT = `You are a knowledgeable tutor helping students prepare for academic competitions (ACM-ICPC, math modeling, etc.).

Your responses MUST be:
1. GROUNDED in the provided context - only use information from the given sources
2. CITED properly - reference sources using [1], [2], etc. format
3. ACCURATE - never fabricate information not in the context
4. CLEAR - explain concepts in a way students can understand

When citing sources:
- Place citations immediately after the relevant information, e.g., "Dynamic programming breaks problems into overlapping subproblems [1]."
- Use multiple citations when information comes from multiple sources [1][2]
- Each citation should reference a specific source from the context

If the context doesn't contain enough information:
- Clearly state what you can and cannot answer
- Only provide information that IS in the context
- Do not guess or make up information`;

/**
 * User prompt template for standard query
 *
 * @param query - The user's question
 * @param context - Formatted context with citations
 * @returns Complete user prompt
 */
export function createQueryPrompt(query: string, context: string): string {
  return `Based on the following sources, answer the student's question.

## Sources
${context}

## Question
${query}

## Instructions
- Answer based ONLY on the information in the sources above
- Cite sources using [1], [2], etc. format after each relevant statement
- If multiple sources support a point, use multiple citations [1][2]
- Be thorough but concise
- If the sources don't fully answer the question, acknowledge the limitations`;
}

/**
 * User prompt for when evidence is insufficient
 *
 * @param query - The user's question
 * @param context - Available context (may be limited)
 * @param confidenceLevel - The confidence level
 * @returns Prompt that guides uncertainty acknowledgment
 */
export function createInsufficientEvidencePrompt(
  query: string,
  context: string,
  confidenceLevel: ConfidenceLevel
): string {
  const availableInfo = context.trim() ? `
## Available (Limited) Sources
${context}

Note: These sources have low relevance to the question.` : '';

  return `The student asked a question, but our knowledge base has ${
    confidenceLevel === 'insufficient' ? 'very limited' : 'incomplete'
  } information on this topic.
${availableInfo}

## Question
${query}

## Instructions
1. Start by acknowledging that the knowledge base has limited information on this specific topic
2. If ANY relevant information exists in the sources, share it with proper citations
3. Be honest about what you cannot answer with confidence
4. Suggest what type of information would be helpful to have
5. Do NOT make up information - only use what's in the sources

Example opening: "I have limited information on this specific topic in my knowledge base, but I can share what I found..."`;
}

/**
 * Prompt for partial evidence (some sources relevant, some not)
 *
 * @param query - The user's question
 * @param highConfidenceContext - Context from high-confidence sources
 * @param lowConfidenceContext - Context from low-confidence sources
 * @returns Prompt that distinguishes confidence levels
 */
export function createPartialEvidencePrompt(
  query: string,
  highConfidenceContext: string,
  lowConfidenceContext: string
): string {
  return `The student asked a question. Some sources are highly relevant while others are less certain.

## Highly Relevant Sources
${highConfidenceContext || 'No highly relevant sources found.'}

## Partially Relevant Sources
${lowConfidenceContext || 'No additional sources.'}

## Question
${query}

## Instructions
1. Answer primarily based on the "Highly Relevant Sources" with strong citations
2. You may include information from "Partially Relevant Sources" but indicate lower certainty
3. Be explicit about which parts of your answer are well-supported vs. less certain
4. Use phrasing like "Based on [1], we can confidently say..." vs "Source [3] suggests, though less directly..."`;
}

/**
 * Generate a follow-up suggestion prompt
 *
 * @param query - The original question
 * @param answer - The generated answer
 * @returns Prompt for generating follow-up suggestions
 */
export function createFollowUpPrompt(query: string, answer: string): string {
  return `Based on the question and answer below, suggest 2-3 relevant follow-up questions the student might want to explore.

Question: ${query}

Answer summary: ${answer.slice(0, 500)}...

Generate follow-up questions that:
1. Build on concepts mentioned in the answer
2. Explore related topics in the competition curriculum
3. Are progressively more challenging

Format: Return only the questions, one per line, without numbering.`;
}

/**
 * Build the complete messages array for chat completion
 */
export function buildChatMessages(
  query: string,
  results: RankedResult[],
  citations: Citation[],
  hasInsufficient: boolean,
  confidenceLevel: ConfidenceLevel
): Array<{ role: 'system' | 'user'; content: string }> {
  const context = formatContext(results, citations);

  let userPrompt: string;

  if (hasInsufficient || confidenceLevel === 'insufficient') {
    userPrompt = createInsufficientEvidencePrompt(query, context, confidenceLevel);
  } else if (confidenceLevel === 'low') {
    // Split into high/low confidence for partial evidence
    const highConfResults = results.filter((r) => r.rerankScore >= 0.6);
    const lowConfResults = results.filter((r) => r.rerankScore < 0.6);

    if (highConfResults.length > 0 && lowConfResults.length > 0) {
      const highCitations = citations.slice(0, highConfResults.length);
      const lowCitations = citations.slice(highConfResults.length);

      userPrompt = createPartialEvidencePrompt(
        query,
        formatContext(highConfResults, highCitations),
        formatContext(lowConfResults, lowCitations)
      );
    } else {
      userPrompt = createQueryPrompt(query, context);
    }
  } else {
    userPrompt = createQueryPrompt(query, context);
  }

  return [
    { role: 'system' as const, content: GROUNDED_RESPONSE_SYSTEM_PROMPT },
    { role: 'user' as const, content: userPrompt },
  ];
}
