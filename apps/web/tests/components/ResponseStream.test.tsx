import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ResponseStream } from '../../src/app/components/ResponseStream';

// Mock MarkdownRenderer
vi.mock('../../src/app/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

// Mock CitationList
vi.mock('../../src/app/components/CitationList', () => ({
  CitationList: ({ citations }: { citations: unknown[] }) => (
    <div data-testid="citation-list">Citations: {citations.length}</div>
  ),
}));

// Helper to create SSE response
function createSSEStream(events: string[]) {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function createSSEEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

describe('ResponseStream', () => {
  const defaultProps = {
    query: 'How does binary search work?',
    apiUrl: 'http://localhost:3001',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('FR-UI-001: Streaming Response', () => {
    it('should show loading state initially', async () => {
      const stream = createSSEStream([
        createSSEEvent({ type: 'token', content: 'Hello' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} />);

      expect(screen.getByText('Generating response...')).toBeInTheDocument();
    });

    it('should display streamed tokens', async () => {
      const stream = createSSEStream([
        createSSEEvent({ type: 'token', content: 'Binary search ' }),
        createSSEEvent({ type: 'token', content: 'is an algorithm.' }),
        createSSEEvent({ type: 'done' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        const content = screen.getByTestId('markdown-content');
        expect(content).toHaveTextContent('Binary search is an algorithm.');
      });
    });

    it('should call onComplete when streaming finishes', async () => {
      const onComplete = vi.fn();
      const stream = createSSEStream([
        createSSEEvent({ type: 'token', content: 'Answer' }),
        createSSEEvent({ type: 'done' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} onComplete={onComplete} />);

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            answer: 'Answer',
            citations: [],
          })
        );
      });
    });
  });

  describe('FR-UI-011: Citations', () => {
    it('should display citations when received', async () => {
      const citation = {
        id: '1',
        title: 'Algorithm Textbook',
        source: 'book',
        relevanceScore: 0.95,
      };

      const stream = createSSEStream([
        createSSEEvent({ type: 'token', content: 'Answer' }),
        createSSEEvent({ type: 'citation', citation }),
        createSSEEvent({ type: 'done' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('citation-list')).toHaveTextContent('Citations: 1');
      });
    });

    it('should accumulate multiple citations', async () => {
      const stream = createSSEStream([
        createSSEEvent({ type: 'token', content: 'Answer' }),
        createSSEEvent({ type: 'citation', citation: { id: '1', title: 'Source 1' } }),
        createSSEEvent({ type: 'citation', citation: { id: '2', title: 'Source 2' } }),
        createSSEEvent({ type: 'citation', citation: { id: '3', title: 'Source 3' } }),
        createSSEEvent({ type: 'done' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('citation-list')).toHaveTextContent('Citations: 3');
      });
    });
  });

  describe('FR-UI-012: Confidence Indicator', () => {
    it('should display high confidence indicator', async () => {
      const stream = createSSEStream([
        createSSEEvent({ type: 'token', content: 'Answer' }),
        createSSEEvent({
          type: 'metadata',
          metadata: {
            queryId: '123',
            confidence: 'high',
            totalTokens: 100,
            citationCount: 2,
            vectorResultCount: 5,
            graphResultCount: 3,
            latencyMs: 150,
          },
        }),
        createSSEEvent({ type: 'done' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('High Confidence')).toBeInTheDocument();
      });
    });

    it('should display low confidence indicator', async () => {
      const stream = createSSEStream([
        createSSEEvent({ type: 'token', content: 'Answer' }),
        createSSEEvent({
          type: 'confidence',
          confidence: { level: 'low', hasInsufficientEvidence: false, topScore: 0.3 },
        }),
        createSSEEvent({ type: 'done' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Low Confidence')).toBeInTheDocument();
      });
    });

    it('should show uncertainty banner for insufficient evidence', async () => {
      const stream = createSSEStream([
        createSSEEvent({
          type: 'confidence',
          confidence: { level: 'insufficient', hasInsufficientEvidence: true, topScore: 0.1 },
        }),
        createSSEEvent({ type: 'token', content: 'Answer' }),
        createSSEEvent({ type: 'done' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Limited Information Available')).toBeInTheDocument();
      });
    });
  });

  describe('FR-UI-013: Error Handling', () => {
    it('should display error from stream', async () => {
      const stream = createSSEStream([
        createSSEEvent({ type: 'error', error: 'Something went wrong' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });

    it('should call onError callback on error', async () => {
      const onError = vi.fn();
      const stream = createSSEStream([
        createSSEEvent({ type: 'error', error: 'API error' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} onError={onError} />);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('API error');
      });
    });

    it('should display error on fetch failure', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should display error on non-OK response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Bad request' }), {
          status: 400,
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Bad request')).toBeInTheDocument();
      });
    });
  });

  describe('Metadata Display', () => {
    it('should display latency after streaming completes', async () => {
      const stream = createSSEStream([
        createSSEEvent({ type: 'token', content: 'Answer' }),
        createSSEEvent({
          type: 'metadata',
          metadata: {
            queryId: '123',
            confidence: 'high',
            totalTokens: 100,
            citationCount: 2,
            vectorResultCount: 5,
            graphResultCount: 3,
            latencyMs: 250,
          },
        }),
        createSSEEvent({ type: 'done' }),
      ]);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Latency: 250ms/)).toBeInTheDocument();
        expect(screen.getByText(/Vector results: 5/)).toBeInTheDocument();
        expect(screen.getByText(/Graph results: 3/)).toBeInTheDocument();
      });
    });
  });

  describe('API Request', () => {
    it('should send correct request to API', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(createSSEStream([createSSEEvent({ type: 'done' })]), {
          status: 200,
        })
      );

      render(<ResponseStream {...defaultProps} />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          'http://localhost:3001/api/query/stream',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: expect.stringContaining('"query":"How does binary search work?"'),
          })
        );
      });
    });
  });
});
