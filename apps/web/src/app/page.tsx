'use client';

import { useState, useCallback, useMemo } from 'react';
import { QueryInput } from './components/QueryInput';
import { ResponseStream } from './components/ResponseStream';
import { FeedbackWidget } from './components/FeedbackWidget';
import { ThemeToggle } from './components/ThemeToggle';
import { Sidebar } from './components/Sidebar';
import type { Citation } from './components/CitationList';

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    setSidebarOpen(false);
  }, []);

  const handleNewChat = useCallback(() => {
    setSelectedConversationId(null);
    setSidebarOpen(false);
  }, []);

  const selectedConversation = selectedConversationId
    ? history.find((h) => h.id === selectedConversationId)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        currentId={selectedConversationId || undefined}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Sidebar toggle for desktop */}
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="hidden lg:flex p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Toggle sidebar"
                >
                  <MenuIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <BookIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    CompetitionTutor
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                    AI-powered Q&A for ACM-ICPC and Math Modeling
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
          {/* Show selected conversation or new chat interface */}
          {selectedConversation ? (
            <SelectedConversation
              response={selectedConversation}
              apiUrl={API_URL}
              onFeedbackSubmit={() => {
                setHistory((prev) =>
                  prev.map((h) =>
                    h.id === selectedConversation.id
                      ? { ...h, feedbackSubmitted: true }
                      : h
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
                  <div className="mb-2">
                    <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Your question:
                    </h2>
                    <p className="text-gray-900 dark:text-white font-medium">
                      {currentQuery}
                    </p>
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
                <section className="text-center py-16">
                  <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <QuestionIcon className="w-8 h-8 text-gray-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Ask your first question
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                    Get answers about algorithms, data structures, dynamic programming,
                    graph theory, and more. All responses include citations from our
                    knowledge base.
                  </p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-2 max-w-lg mx-auto">
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
                </section>
              )}

              {/* Recent history (when no conversation selected) */}
              {history.length > 0 && !currentQuery && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Recent Questions
                  </h2>
                  <div className="space-y-3">
                    {history.slice(0, 5).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedConversationId(item.id)}
                        className="w-full text-left p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
                      >
                        <p className="font-medium text-gray-900 dark:text-white">
                          {item.query}
                        </p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                          {item.answer.slice(0, 150)}...
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-200 dark:border-gray-700 py-6 mt-auto">
          <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>
              Powered by hybrid RAG with Qwen3 LLM. All answers are grounded in
              retrieved evidence.
            </p>
          </div>
        </footer>
      </div>
    </div>
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
    <div>
      {/* Back to new question */}
      <button
        onClick={onNewQuestion}
        className="mb-6 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        <span>New Question</span>
      </button>

      {/* Question */}
      <div className="mb-4">
        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
          Question
        </h2>
        <p className="text-lg font-medium text-gray-900 dark:text-white">
          {response.query}
        </p>
      </div>

      {/* Answer */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="prose dark:prose-invert max-w-none">
          {response.answer}
        </div>

        {response.citations.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Sources
            </h4>
            <div className="space-y-2">
              {response.citations.map((citation) => (
                <div
                  key={citation.id}
                  className="text-sm text-gray-600 dark:text-gray-400"
                >
                  <span className="font-mono text-blue-600 dark:text-blue-400">
                    [{citation.id}]
                  </span>{' '}
                  {citation.documentTitle}
                </div>
              ))}
            </div>
          </div>
        )}

        {response.metadata && (
          <div className="mt-4 flex gap-4 text-xs text-gray-400">
            <span>
              Confidence: <span className="capitalize">{response.metadata.confidence}</span>
            </span>
            <span>Latency: {response.metadata.latencyMs}ms</span>
          </div>
        )}

        {response.metadata?.queryId && !response.feedbackSubmitted && (
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
            <FeedbackWidget
              queryId={response.metadata.queryId}
              apiUrl={apiUrl}
              onSubmit={onFeedbackSubmit}
            />
          </div>
        )}
      </div>
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
    <button
      onClick={() => onClick(question)}
      disabled={disabled}
      className="p-3 text-left text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {question}
    </button>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

function QuestionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}
