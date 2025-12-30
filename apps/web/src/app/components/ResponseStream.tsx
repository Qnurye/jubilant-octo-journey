'use client';

import { useEffect, useRef, useState } from 'react';
import { CitationList, type Citation } from './CitationList';

interface ConfidenceInfo {
  level: 'high' | 'medium' | 'low' | 'insufficient';
  hasInsufficientEvidence: boolean;
  topScore: number;
}

interface StreamChunk {
  type: 'token' | 'citation' | 'metadata' | 'done' | 'error' | 'confidence';
  content?: string;
  citation?: Citation;
  metadata?: ResponseMetadata;
  error?: string;
  confidence?: ConfidenceInfo;
}

interface ResponseMetadata {
  queryId: string;
  totalTokens: number;
  citationCount: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  vectorResultCount: number;
  graphResultCount: number;
  latencyMs: number;
}

interface ResponseStreamProps {
  query: string;
  apiUrl: string;
  onComplete?: (response: { answer: string; citations: Citation[]; metadata: ResponseMetadata | null }) => void;
  onError?: (error: string) => void;
}

export function ResponseStream({
  query,
  apiUrl,
  onComplete,
  onError,
}: ResponseStreamProps) {
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [metadata, setMetadata] = useState<ResponseMetadata | null>(null);
  const [confidenceInfo, setConfidenceInfo] = useState<ConfidenceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function streamResponse() {
      try {
        const response = await fetch(`${apiUrl}/api/query/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            topK: 5,
            includeGraph: true,
            stream: true,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to get response');
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let fullAnswer = '';
        const collectedCitations: Citation[] = [];
        let responseMetadata: ResponseMetadata | null = null;

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const eventStr of events) {
            if (!eventStr.trim()) continue;

            const lines = eventStr.split('\n');
            let data: string | null = null;

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                data = line.slice(6);
              }
            }

            if (!data) continue;

            try {
              const chunk: StreamChunk = JSON.parse(data);

              switch (chunk.type) {
                case 'confidence':
                  if (chunk.confidence) {
                    setConfidenceInfo(chunk.confidence);
                  }
                  break;

                case 'token':
                  if (chunk.content) {
                    fullAnswer += chunk.content;
                    setAnswer(fullAnswer);
                  }
                  break;

                case 'citation':
                  if (chunk.citation) {
                    collectedCitations.push(chunk.citation);
                    setCitations([...collectedCitations]);
                  }
                  break;

                case 'metadata':
                  if (chunk.metadata) {
                    responseMetadata = chunk.metadata;
                    setMetadata(chunk.metadata);
                  }
                  break;

                case 'done':
                  setIsStreaming(false);
                  onComplete?.({
                    answer: fullAnswer,
                    citations: collectedCitations,
                    metadata: responseMetadata,
                  });
                  break;

                case 'error':
                  setError(chunk.error || 'Unknown error');
                  setIsStreaming(false);
                  onError?.(chunk.error || 'Unknown error');
                  break;
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        setIsStreaming(false);
        onError?.(errorMessage);
      }
    }

    streamResponse();

    return () => {
      abortController.abort();
    };
  }, [query, apiUrl, onComplete, onError]);

  // Auto-scroll to bottom as content streams
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [answer]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <ErrorIcon />
          <span className="font-medium">Error</span>
        </div>
        <p className="mt-2 text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Uncertainty acknowledgment banner - shown early when evidence is insufficient */}
      {confidenceInfo?.hasInsufficientEvidence && (
        <UncertaintyBanner confidenceLevel={confidenceInfo.level} />
      )}

      {/* Answer section */}
      <div
        ref={contentRef}
        className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg max-h-96 overflow-y-auto"
      >
        {answer ? (
          <div className="prose dark:prose-invert max-w-none">
            <MarkdownContent content={answer} />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <LoadingDots />
            <span>Generating response...</span>
          </div>
        )}

        {isStreaming && answer && (
          <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
        )}
      </div>

      {/* Confidence indicator */}
      {(metadata || confidenceInfo) && (
        <ConfidenceIndicator confidence={metadata?.confidence || confidenceInfo?.level || 'medium'} />
      )}

      {/* Citations */}
      {citations.length > 0 && (
        <CitationList citations={citations} />
      )}

      {/* Metadata footer */}
      {metadata && !isStreaming && (
        <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-4">
          <span>Latency: {metadata.latencyMs}ms</span>
          <span>Vector results: {metadata.vectorResultCount}</span>
          <span>Graph results: {metadata.graphResultCount}</span>
          <span>Citations: {metadata.citationCount}</span>
        </div>
      )}
    </div>
  );
}

function UncertaintyBanner({ confidenceLevel }: { confidenceLevel: string }) {
  const isInsufficient = confidenceLevel === 'insufficient';

  return (
    <div
      className={`p-4 rounded-lg border ${
        isInsufficient
          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
          : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
            isInsufficient
              ? 'bg-amber-100 dark:bg-amber-800'
              : 'bg-yellow-100 dark:bg-yellow-800'
          }`}
        >
          <WarningIcon
            className={
              isInsufficient
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-yellow-600 dark:text-yellow-400'
            }
          />
        </div>
        <div>
          <h4
            className={`font-medium ${
              isInsufficient
                ? 'text-amber-800 dark:text-amber-300'
                : 'text-yellow-800 dark:text-yellow-300'
            }`}
          >
            {isInsufficient
              ? 'Limited Information Available'
              : 'Lower Confidence Response'}
          </h4>
          <p
            className={`mt-1 text-sm ${
              isInsufficient
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-yellow-700 dark:text-yellow-400'
            }`}
          >
            {isInsufficient
              ? 'Our knowledge base has limited information on this specific topic. The response below may not fully address your question, and we recommend verifying with additional sources.'
              : 'The retrieved evidence has moderate relevance to your question. Some parts of the response may be based on partial information.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`w-4 h-4 ${className || ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function ConfidenceIndicator({ confidence }: { confidence: string }) {
  const config = {
    high: {
      label: 'High Confidence',
      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      icon: '✓',
    },
    medium: {
      label: 'Medium Confidence',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      icon: '○',
    },
    low: {
      label: 'Low Confidence',
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      icon: '△',
    },
    insufficient: {
      label: 'Limited Evidence',
      color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      icon: '!',
    },
  };

  const { label, color, icon } = config[confidence as keyof typeof config] || config.medium;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${color}`}>
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown-like rendering
  // In production, use a proper markdown library like react-markdown
  const paragraphs = content.split('\n\n');

  return (
    <>
      {paragraphs.map((paragraph, i) => {
        const trimmed = paragraph.trim();
        if (!trimmed) return null;

        // Code blocks
        if (trimmed.startsWith('```')) {
          const codeContent = trimmed.slice(3).replace(/```$/, '');
          return (
            <pre key={i} className="bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto">
              <code>{codeContent}</code>
            </pre>
          );
        }

        // Inline code and citations
        const processed = trimmed
          .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-sm">$1</code>')
          .replace(/\[(\d+)\]/g, '<sup class="text-blue-600 dark:text-blue-400 font-medium">[$1]</sup>');

        return (
          <p
            key={i}
            className="mb-3 last:mb-0"
            dangerouslySetInnerHTML={{ __html: processed }}
          />
        );
      })}
    </>
  );
}

function LoadingDots() {
  return (
    <span className="flex gap-1">
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default ResponseStream;
