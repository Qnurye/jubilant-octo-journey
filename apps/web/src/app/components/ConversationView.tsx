'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { ConversationMessage } from '@/lib/types';
import { ChatBubble } from './ChatBubble';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CitationList } from './CitationList';
import { FeedbackWidget } from './FeedbackWidget';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, Circle, Info, AlertCircle } from 'lucide-react';

interface ConversationViewProps {
  messages: ConversationMessage[];
  streamingContent?: string;
  children?: ReactNode;
  apiUrl: string;
  onFeedbackSubmit?: (messageId: string) => void;
}

export function ConversationView({
  messages,
  streamingContent,
  children,
  apiUrl,
  onFeedbackSubmit,
}: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages added or streaming content changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <div className="flex flex-col gap-4 pb-4">
      {messages.map((message) => (
        <ChatBubble
          key={message.id}
          role={message.role}
          content={message.content}
          timestamp={new Date(message.timestamp)}
        >
          {message.role === 'assistant' && (
            <div className="space-y-4">
              <div className="prose dark:prose-invert max-w-none">
                <MarkdownRenderer content={message.content} />
              </div>

              {message.citations && message.citations.length > 0 && (
                <>
                  <Separator />
                  <CitationList citations={message.citations} />
                </>
              )}

              {message.metadata && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <ConfidenceBadge confidence={message.metadata.confidence} />
                  <span>延迟：{message.metadata.latencyMs}ms</span>
                  <span>向量：{message.metadata.vectorResultCount}</span>
                  <span>图谱：{message.metadata.graphResultCount}</span>
                </div>
              )}

              {message.metadata?.queryId && !message.feedbackSubmitted && (
                <>
                  <Separator />
                  <FeedbackWidget
                    queryId={message.metadata.queryId}
                    apiUrl={apiUrl}
                    compact
                    onSubmit={() => onFeedbackSubmit?.(message.id)}
                  />
                </>
              )}
            </div>
          )}
        </ChatBubble>
      ))}

      {/* Streaming assistant message */}
      {streamingContent !== undefined && streamingContent !== null && (
        <ChatBubble role="assistant" content="">
          <div className="space-y-2">
            {streamingContent ? (
              <>
                <div className="prose dark:prose-invert max-w-none">
                  <MarkdownRenderer content={streamingContent} />
                </div>
                <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-0.5 align-text-bottom" />
              </>
            ) : (
              <div className="flex items-center gap-1 py-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </div>
            )}
          </div>
        </ChatBubble>
      )}

      <div ref={bottomRef} />

      {/* Input area at bottom */}
      {children}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const config = {
    high: { label: '高', variant: 'default' as const, icon: CheckCircle },
    medium: { label: '中', variant: 'secondary' as const, icon: Circle },
    low: { label: '低', variant: 'outline' as const, icon: Info },
    insufficient: { label: '不足', variant: 'destructive' as const, icon: AlertCircle },
  };

  const { label, variant, icon: Icon } = config[confidence as keyof typeof config] || config.medium;

  return (
    <Badge variant={variant} className="gap-1 text-[10px]">
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

export default ConversationView;
