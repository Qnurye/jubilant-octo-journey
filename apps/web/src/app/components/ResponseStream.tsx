'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Circle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { CitationList, type Citation } from './CitationList';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  onComplete?: (response: {
    answer: string;
    citations: Citation[];
    metadata: ResponseMetadata | null;
  }) => void;
  onError?: (error: string) => void;
}

export function ResponseStream({ query, apiUrl, onComplete, onError }: ResponseStreamProps) {
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
          headers: { 'Content-Type': 'application/json' },
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
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullAnswer = '';
        const collectedCitations: Citation[] = [];
        let responseMetadata: ResponseMetadata | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
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
                  if (chunk.confidence) setConfidenceInfo(chunk.confidence);
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
                  toast.error(chunk.error || 'Unknown error');
                  onError?.(chunk.error || 'Unknown error');
                  break;
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        setIsStreaming(false);
        toast.error(errorMessage);
        onError?.(errorMessage);
      }
    }

    streamResponse();
    return () => abortController.abort();
  }, [query, apiUrl, onComplete, onError]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [answer]);

  if (error) {
    return (
      <Card className="border-destructive bg-destructive/10">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-5" />
            <span className="font-medium">Error</span>
          </div>
          <p className="mt-2 text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {confidenceInfo?.hasInsufficientEvidence && (
        <UncertaintyBanner confidenceLevel={confidenceInfo.level} />
      )}

      <Card>
        <CardContent ref={contentRef} className="p-4 max-h-96 overflow-y-auto">
          {answer ? (
            <div className="prose dark:prose-invert max-w-none">
              <MarkdownRenderer content={answer} />
            </div>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {isStreaming && answer && (
            <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-0.5 align-text-bottom" />
          )}
        </CardContent>
      </Card>

      {(metadata || confidenceInfo) && (
        <ConfidenceIndicator
          confidence={metadata?.confidence || confidenceInfo?.level || 'medium'}
        />
      )}

      {citations.length > 0 && <CitationList citations={citations} />}

      {metadata && !isStreaming && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">Latency: {metadata.latencyMs}ms</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Total response time</p>
            </TooltipContent>
          </Tooltip>
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
    <Card
      className={
        isInsufficient
          ? 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20'
          : 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
      }
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={`size-5 shrink-0 ${
              isInsufficient ? 'text-orange-600 dark:text-orange-400' : 'text-yellow-600 dark:text-yellow-400'
            }`}
          />
          <div>
            <h4
              className={`font-medium ${
                isInsufficient
                  ? 'text-orange-800 dark:text-orange-300'
                  : 'text-yellow-800 dark:text-yellow-300'
              }`}
            >
              {isInsufficient ? 'Limited Information Available' : 'Lower Confidence Response'}
            </h4>
            <p
              className={`mt-1 text-sm ${
                isInsufficient
                  ? 'text-orange-700 dark:text-orange-400'
                  : 'text-yellow-700 dark:text-yellow-400'
              }`}
            >
              {isInsufficient
                ? 'Our knowledge base has limited information on this topic. Please verify with additional sources.'
                : 'The retrieved evidence has moderate relevance. Some parts may be based on partial information.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceIndicator({ confidence }: { confidence: string }) {
  const config = {
    high: { label: 'High Confidence', variant: 'default' as const, icon: CheckCircle },
    medium: { label: 'Medium Confidence', variant: 'secondary' as const, icon: Circle },
    low: { label: 'Low Confidence', variant: 'outline' as const, icon: Info },
    insufficient: { label: 'Limited Evidence', variant: 'destructive' as const, icon: AlertCircle },
  };

  const { label, variant, icon: Icon } = config[confidence as keyof typeof config] || config.medium;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant} className="gap-1 cursor-help">
          <Icon className="size-3" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>Confidence level based on retrieved evidence quality</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default ResponseStream;
