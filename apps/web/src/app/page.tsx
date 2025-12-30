'use client';

import { useState, useCallback } from 'react';
import { QueryInput } from './components/QueryInput';
import { ResponseStream } from './components/ResponseStream';
import { FeedbackWidget } from './components/FeedbackWidget';
import type { Citation } from './components/CitationList';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface CompletedResponse {
  query: string;
  answer: string;
  citations: Citation[];
  metadata: {
    queryId: string;
    confidence: 'high' | 'medium' | 'low' | 'insufficient';
    latencyMs: number;
  } | null;
  /** Track whether feedback has been submitted for this response */
  feedbackSubmitted?: boolean;
}

export default function Home() {
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<CompletedResponse[]>([]);

  const handleSubmit = useCallback((query: string) => {
    setCurrentQuery(query);
    setIsLoading(true);
  }, []);

  const handleComplete = useCallback(
    (response: { answer: string; citations: Citation[]; metadata: CompletedResponse['metadata'] }) => {
      if (currentQuery) {
        setHistory((prev) => [
          {
            query: currentQuery,
            answer: response.answer,
            citations: response.citations,
            metadata: response.metadata,
          },
          ...prev,
        ]);
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <BookIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                CompetitionTutor
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI-powered Q&A for ACM-ICPC and Math Modeling
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
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

        {/* History */}
        {history.length > 0 && !currentQuery && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Previous Questions
            </h2>
            <div className="space-y-6">
              {history.map((item, index) => (
                <HistoryItem
                  key={item.metadata?.queryId || index}
                  response={item}
                  apiUrl={API_URL}
                  onFeedbackSubmit={() => {
                    setHistory((prev) =>
                      prev.map((h, i) =>
                        i === index ? { ...h, feedbackSubmitted: true } : h
                      )
                    );
                  }}
                />
              ))}
            </div>
          </section>
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

function HistoryItem({
  response,
  apiUrl,
  onFeedbackSubmit,
}: {
  response: CompletedResponse;
  apiUrl: string;
  onFeedbackSubmit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-start justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-750"
      >
        <div className="flex-1">
          <p className="font-medium text-gray-900 dark:text-white">
            {response.query}
          </p>
          {!expanded && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {response.answer.slice(0, 200)}...
            </p>
          )}
        </div>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          <div className="pt-4 prose dark:prose-invert max-w-none text-sm">
            {response.answer}
          </div>

          {response.citations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Sources
              </h4>
              <div className="space-y-1">
                {response.citations.slice(0, 3).map((citation) => (
                  <div
                    key={citation.id}
                    className="text-xs text-gray-600 dark:text-gray-400"
                  >
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      {citation.id}
                    </span>{' '}
                    {citation.documentTitle}
                  </div>
                ))}
              </div>
            </div>
          )}

          {response.metadata && (
            <div className="mt-3 flex gap-4 text-xs text-gray-400">
              <span>
                Confidence:{' '}
                <span className="capitalize">{response.metadata.confidence}</span>
              </span>
              <span>Latency: {response.metadata.latencyMs}ms</span>
            </div>
          )}

          {/* Feedback Widget (T080) */}
          {response.metadata?.queryId && !response.feedbackSubmitted && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <FeedbackWidget
                queryId={response.metadata.queryId}
                apiUrl={apiUrl}
                onSubmit={onFeedbackSubmit}
                compact
              />
            </div>
          )}
        </div>
      )}
    </div>
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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
