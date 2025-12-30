/**
 * SSE Streaming Utilities
 *
 * Server-Sent Events (SSE) utilities for streaming RAG responses.
 *
 * @module @jubilant/rag/generation/streaming
 */

import type { StreamChunk, Citation, ResponseMetadata, ConfidenceInfo } from '../types';

/**
 * Format a stream chunk as an SSE event
 *
 * @param chunk - The stream chunk to format
 * @returns SSE-formatted string
 */
export function formatSSEEvent(chunk: StreamChunk): string {
  const eventType = chunk.type;
  const data = JSON.stringify(chunk);

  return `event: ${eventType}\ndata: ${data}\n\n`;
}

/**
 * Create a token stream chunk
 */
export function createTokenChunk(content: string): StreamChunk {
  return {
    type: 'token',
    content,
  };
}

/**
 * Create a citation stream chunk
 */
export function createCitationChunk(citation: Citation): StreamChunk {
  return {
    type: 'citation',
    citation,
  };
}

/**
 * Create a metadata stream chunk
 */
export function createMetadataChunk(metadata: ResponseMetadata): StreamChunk {
  return {
    type: 'metadata',
    metadata,
  };
}

/**
 * Create a done stream chunk
 */
export function createDoneChunk(): StreamChunk {
  return {
    type: 'done',
  };
}

/**
 * Create an error stream chunk
 */
export function createErrorChunk(error: string): StreamChunk {
  return {
    type: 'error',
    error,
  };
}

/**
 * Create a confidence stream chunk
 *
 * Emitted early in the stream to inform the UI about evidence quality.
 */
export function createConfidenceChunk(confidence: ConfidenceInfo): StreamChunk {
  return {
    type: 'confidence',
    confidence,
  };
}

/**
 * SSE headers for response
 */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // Disable nginx buffering
};

/**
 * Create a streaming response transformer
 *
 * This creates a TransformStream that converts StreamChunks to SSE format.
 *
 * @returns TransformStream for SSE
 */
export function createSSETransformStream(): TransformStream<StreamChunk, string> {
  return new TransformStream<StreamChunk, string>({
    transform(chunk, controller) {
      controller.enqueue(formatSSEEvent(chunk));
    },
  });
}

/**
 * Create a readable stream from an async generator
 *
 * @param generator - Async generator producing stream chunks
 * @returns ReadableStream of SSE-formatted strings
 */
export function createSSEStream(
  generator: AsyncGenerator<StreamChunk>
): ReadableStream<string> {
  return new ReadableStream<string>({
    async pull(controller) {
      try {
        const { value, done } = await generator.next();

        if (done) {
          controller.enqueue(formatSSEEvent(createDoneChunk()));
          controller.close();
        } else {
          controller.enqueue(formatSSEEvent(value));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown streaming error';
        controller.enqueue(formatSSEEvent(createErrorChunk(errorMessage)));
        controller.close();
      }
    },
    cancel() {
      // Generator will be garbage collected
    },
  });
}

/**
 * Citation detector for streaming responses
 *
 * Detects citation references [1], [2], etc. in streaming text
 * and emits citation events when detected.
 */
export class CitationDetector {
  private buffer: string = '';
  private emittedCitations: Set<string> = new Set();
  private citations: Citation[];

  constructor(citations: Citation[]) {
    this.citations = citations;
  }

  /**
   * Process a token and return any detected citations
   *
   * @param token - The new token to process
   * @returns Array of newly detected citations
   */
  processToken(token: string): Citation[] {
    this.buffer += token;
    const detected: Citation[] = [];

    // Look for citation patterns
    const citationRegex = /\[(\d+)\]/g;
    let match;

    while ((match = citationRegex.exec(this.buffer)) !== null) {
      const citationId = `[${match[1]}]`;

      if (!this.emittedCitations.has(citationId)) {
        const citation = this.citations.find((c) => c.id === citationId);
        if (citation) {
          detected.push(citation);
          this.emittedCitations.add(citationId);
        }
      }
    }

    // Keep only the last few characters in buffer to avoid memory growth
    if (this.buffer.length > 100) {
      this.buffer = this.buffer.slice(-50);
    }

    return detected;
  }

  /**
   * Reset the detector state
   */
  reset(): void {
    this.buffer = '';
    this.emittedCitations.clear();
  }

  /**
   * Get all emitted citation IDs
   */
  getEmittedCitationIds(): string[] {
    return Array.from(this.emittedCitations);
  }
}

/**
 * Stream response builder
 *
 * Collects streamed tokens and builds the complete response.
 */
export class StreamResponseBuilder {
  private tokens: string[] = [];
  private citations: Citation[] = [];
  private metadata: ResponseMetadata | null = null;

  /**
   * Add a token to the response
   */
  addToken(content: string): void {
    this.tokens.push(content);
  }

  /**
   * Add a citation
   */
  addCitation(citation: Citation): void {
    this.citations.push(citation);
  }

  /**
   * Set the response metadata
   */
  setMetadata(metadata: ResponseMetadata): void {
    this.metadata = metadata;
  }

  /**
   * Get the complete response text
   */
  getText(): string {
    return this.tokens.join('');
  }

  /**
   * Get all citations
   */
  getCitations(): Citation[] {
    return this.citations;
  }

  /**
   * Get the metadata
   */
  getMetadata(): ResponseMetadata | null {
    return this.metadata;
  }

  /**
   * Reset the builder
   */
  reset(): void {
    this.tokens = [];
    this.citations = [];
    this.metadata = null;
  }
}

/**
 * Parse an SSE event from a string
 *
 * @param eventStr - The SSE event string
 * @returns Parsed StreamChunk or null if invalid
 */
export function parseSSEEvent(eventStr: string): StreamChunk | null {
  const lines = eventStr.split('\n');
  let data: string | null = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      data = line.slice(6);
    }
  }

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as StreamChunk;
  } catch {
    return null;
  }
}

/**
 * Create an async iterator for parsing SSE events from a Response
 *
 * @param response - The fetch Response with SSE stream
 * @returns Async generator of StreamChunks
 */
export async function* parseSSEResponse(
  response: Response
): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Split by double newline (SSE event separator)
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // Keep incomplete event in buffer

      for (const eventStr of events) {
        if (eventStr.trim()) {
          const chunk = parseSSEEvent(eventStr);
          if (chunk) {
            yield chunk;

            if (chunk.type === 'done' || chunk.type === 'error') {
              return;
            }
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const chunk = parseSSEEvent(buffer);
      if (chunk) {
        yield chunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
