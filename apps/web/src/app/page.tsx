'use client';

import { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, BookOpen, HelpCircle, Menu } from 'lucide-react';
import { QueryInput } from './components/QueryInput';
import { ResponseStream } from './components/ResponseStream';
import { FeedbackWidget } from './components/FeedbackWidget';
import { ThemeToggle } from './components/ThemeToggle';
import { Sidebar } from './components/Sidebar';
import type { Citation } from './components/CitationList';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface CompletedResponse {
  id: string;
  query: string;
  answer: string;
  citations: Citation[];
  metadata: {
    queryId: string;
    confidence: 'high' | 'medium' | 'low' | 'insufficient';
    latencyMs: number;
  } | null;
  timestamp: Date;
  feedbackSubmitted?: boolean;
}

export default function Home() {
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<CompletedResponse[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Convert history to sidebar conversation format
  const conversations = useMemo(() => {
    return history.map((item) => ({
      id: item.id,
      title: item.query.slice(0, 50) + (item.query.length > 50 ? '...' : ''),
      preview: item.answer.slice(0, 100) + '...',
      timestamp: item.timestamp,
      messageCount: 2, // Q + A
    }));
  }, [history]);

  const handleSubmit = useCallback((query: string) => {
    setCurrentQuery(query);
    setIsLoading(true);
    setSelectedConversationId(null);
  }, []);

  const handleComplete = useCallback(
    (response: { answer: string; citations: Citation[]; metadata: CompletedResponse['metadata'] }) => {
      if (currentQuery) {
        const newId = response.metadata?.queryId || `conv-${Date.now()}`;
        setHistory((prev) => [
          {
            id: newId,
            query: currentQuery,
            answer: response.answer,
            citations: response.citations,
            metadata: response.metadata,
            timestamp: new Date(),
          },
          ...prev,
        ]);
        setSelectedConversationId(newId);
      }
      setCurrentQuery(null);
      setIsLoading(false);
    },
    [currentQuery]
  );

  const handleError = useCallback(() => {
    setCurrentQuery(null);
    setIsLoading(false);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
  }, []);

  const handleNewChat = useCallback(() => {
    setSelectedConversationId(null);
  }, []);

  const selectedConversation = selectedConversationId
    ? history.find((h) => h.id === selectedConversationId)
    : null;

  return (
    <SidebarProvider>
      <Sidebar
        conversations={conversations}
        currentId={selectedConversationId || undefined}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
      />

      <SidebarInset>
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="flex h-14 items-center gap-4 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-6" />

            <div className="flex items-center gap-3 flex-1">
              <div className="size-9 bg-primary rounded-lg flex items-center justify-center">
                <BookOpen className="size-5 text-primary-foreground" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-semibold leading-tight">CompetitionTutor</h1>
                <p className="text-xs text-muted-foreground">
                  AI-powered Q&A for ACM-ICPC and Math Modeling
                </p>
              </div>
            </div>

            <ThemeToggle />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-3xl">
            {/* Show selected conversation or new chat interface */}
            {selectedConversation ? (
              <SelectedConversation
                response={selectedConversation}
                apiUrl={API_URL}
                onFeedbackSubmit={() => {
                  setHistory((prev) =>
                    prev.map((h) =>
                      h.id === selectedConversation.id ? { ...h, feedbackSubmitted: true } : h
                    )
                  );
                }}
                onNewQuestion={handleNewChat}
              />
            ) : (
              <>
                {/* Query input */}
                <section className="mb-8">
                  <QueryInput
                    onSubmit={handleSubmit}
                    isLoading={isLoading}
                    placeholder="Ask about algorithms, data structures, or competition strategies..."
                    maxLength={2000}
                  />
                </section>

                {/* Current streaming response */}
                {currentQuery && (
                  <section className="mb-8">
                    <div className="mb-3">
                      <h2 className="text-sm font-medium text-muted-foreground">Your question:</h2>
                      <p className="text-foreground font-medium mt-1">{currentQuery}</p>
                    </div>
                    <ResponseStream
                      query={currentQuery}
                      apiUrl={API_URL}
                      onComplete={handleComplete}
                      onError={handleError}
                    />
                  </section>
                )}

                {/* Empty state */}
                {!currentQuery && history.length === 0 && (
                  <Empty className="py-12">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HelpCircle className="size-6" />
                      </EmptyMedia>
                      <EmptyTitle>Ask your first question</EmptyTitle>
                      <EmptyDescription>
                        Get answers about algorithms, data structures, dynamic programming, graph
                        theory, and more. All responses include citations from our knowledge base.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <div className="grid gap-2 sm:grid-cols-2 w-full">
                        <ExampleQuestion
                          question="How does dynamic programming differ from divide and conquer?"
                          onClick={handleSubmit}
                          disabled={isLoading}
                        />
                        <ExampleQuestion
                          question="What is the time complexity of Dijkstra's algorithm?"
                          onClick={handleSubmit}
                          disabled={isLoading}
                        />
                        <ExampleQuestion
                          question="Explain the union-find data structure"
                          onClick={handleSubmit}
                          disabled={isLoading}
                        />
                        <ExampleQuestion
                          question="How to optimize DP solutions using space compression?"
                          onClick={handleSubmit}
                          disabled={isLoading}
                        />
                      </div>
                    </EmptyContent>
                  </Empty>
                )}

                {/* Recent history (when no conversation selected) */}
                {history.length > 0 && !currentQuery && (
                  <section>
                    <h2 className="text-lg font-semibold mb-4">Recent Questions</h2>
                    <div className="space-y-2">
                      {history.slice(0, 5).map((item) => (
                        <Card
                          key={item.id}
                          className="cursor-pointer transition-colors hover:bg-accent"
                          onClick={() => setSelectedConversationId(item.id)}
                        >
                          <CardContent className="p-4">
                            <p className="font-medium">{item.query}</p>
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                              {item.answer.slice(0, 150)}...
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t py-4 px-4 mt-auto">
          <p className="text-center text-xs text-muted-foreground">
            Powered by hybrid RAG with Qwen3 LLM. All answers are grounded in retrieved evidence.
          </p>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SelectedConversation({
  response,
  apiUrl,
  onFeedbackSubmit,
  onNewQuestion,
}: {
  response: CompletedResponse;
  apiUrl: string;
  onFeedbackSubmit: () => void;
  onNewQuestion: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Back to new question */}
      <Button variant="ghost" size="sm" onClick={onNewQuestion} className="gap-2 -ml-2">
        <ArrowLeft className="size-4" />
        New Question
      </Button>

      {/* Question */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-1">Question</h2>
        <p className="text-lg font-medium">{response.query}</p>
      </div>

      {/* Answer */}
      <Card>
        <CardContent className="p-6">
          <div className="prose dark:prose-invert max-w-none">{response.answer}</div>

          {response.citations.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Sources
                </h4>
                <div className="space-y-2">
                  {response.citations.map((citation) => (
                    <div key={citation.id} className="text-sm text-muted-foreground">
                      <span className="font-mono text-primary">[{citation.id}]</span>{' '}
                      {citation.documentTitle}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {response.metadata && (
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span>
                Confidence: <span className="capitalize">{response.metadata.confidence}</span>
              </span>
              <span>Latency: {response.metadata.latencyMs}ms</span>
            </div>
          )}

          {response.metadata?.queryId && !response.feedbackSubmitted && (
            <>
              <Separator className="my-6" />
              <FeedbackWidget
                queryId={response.metadata.queryId}
                apiUrl={apiUrl}
                onSubmit={onFeedbackSubmit}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExampleQuestion({
  question,
  onClick,
  disabled,
}: {
  question: string;
  onClick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <Button
      variant="outline"
      onClick={() => onClick(question)}
      disabled={disabled}
      className="h-auto p-3 text-left text-sm justify-start whitespace-normal"
    >
      {question}
    </Button>
  );
}
