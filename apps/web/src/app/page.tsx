'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { BookOpen, HelpCircle } from 'lucide-react';
import { QueryInput } from './components/QueryInput';
import { ThemeToggle } from './components/ThemeToggle';
import { Sidebar } from './components/Sidebar';
import { ConversationView } from './components/ConversationView';
import type { Citation } from './components/CitationList';
import type { Conversation, ConversationMessage } from '@/lib/types';
import {
  saveConversation,
  loadConversation,
  listConversations,
  deleteConversation,
} from '@/lib/conversations';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
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

function generateId(): string {
  return crypto.randomUUID();
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Restore conversations from localStorage on mount
  useEffect(() => {
    const index = listConversations();
    const loaded: Conversation[] = [];
    for (const entry of index) {
      const conv = loadConversation(entry.id);
      if (conv) loaded.push(conv);
    }
    setConversations(loaded);
    // Optionally set most recent as active
    if (loaded.length > 0) {
      setActiveConversationId(loaded[0].id);
    }
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  // Persist conversation to localStorage
  const persistConversation = useCallback((conv: Conversation) => {
    saveConversation(conv);
  }, []);

  // Update a conversation in state and persist
  const updateConversation = useCallback(
    (id: string, updater: (conv: Conversation) => Conversation) => {
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== id) return c;
          const newConv = updater(c);
          persistConversation(newConv);
          return newConv;
        });
        return updated;
      });
    },
    [persistConversation]
  );

  // Stream a response from the API
  const streamResponse = useCallback(
    async (conversationId: string, query: string, history: { role: string; content: string }[]) => {
      setIsStreaming(true);
      setStreamingContent('');

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(`${API_URL}/api/query/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            conversationId,
            history,
            topK: 5,
            includeGraph: true,
            stream: true,
          }),
          signal: controller.signal,
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
        let responseMetadata: ConversationMessage['metadata'] | undefined;

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
              const chunk = JSON.parse(data);

              switch (chunk.type) {
                case 'token':
                  if (chunk.content) {
                    fullAnswer += chunk.content;
                    setStreamingContent(fullAnswer);
                  }
                  break;
                case 'citation':
                  if (chunk.citation) {
                    collectedCitations.push(chunk.citation);
                  }
                  break;
                case 'metadata':
                  if (chunk.metadata) {
                    responseMetadata = {
                      queryId: chunk.metadata.queryId,
                      confidence: chunk.metadata.confidence,
                      latencyMs: chunk.metadata.latencyMs,
                      vectorResultCount: chunk.metadata.vectorResultCount,
                      graphResultCount: chunk.metadata.graphResultCount,
                    };
                  }
                  break;
                case 'done': {
                  // Create assistant message and add to conversation
                  const assistantMessage: ConversationMessage = {
                    id: generateId(),
                    role: 'assistant',
                    content: fullAnswer,
                    timestamp: new Date().toISOString(),
                    citations: collectedCitations.length > 0 ? collectedCitations : undefined,
                    metadata: responseMetadata,
                  };

                  updateConversation(conversationId, (conv) => ({
                    ...conv,
                    messages: [...conv.messages, assistantMessage],
                    updatedAt: new Date().toISOString(),
                  }));

                  setIsStreaming(false);
                  setStreamingContent('');
                  break;
                }
                case 'error':
                  setIsStreaming(false);
                  setStreamingContent('');
                  break;
              }
            } catch {
              // parse error, skip
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setIsStreaming(false);
        setStreamingContent('');
      }
    },
    [updateConversation]
  );

  // Handle submitting a question (new conversation or follow-up)
  const handleSubmit = useCallback(
    (query: string) => {
      const now = new Date().toISOString();
      const userMessage: ConversationMessage = {
        id: generateId(),
        role: 'user',
        content: query,
        timestamp: now,
      };

      if (activeConversationId && activeConversation) {
        // Follow-up: append to existing conversation
        const history = activeConversation.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        updateConversation(activeConversationId, (conv) => ({
          ...conv,
          messages: [...conv.messages, userMessage],
          updatedAt: now,
        }));

        streamResponse(activeConversationId, query, history);
      } else {
        // New conversation
        const convId = generateId();
        const title = query.slice(0, 50) + (query.length > 50 ? '...' : '');
        const newConv: Conversation = {
          id: convId,
          title,
          messages: [userMessage],
          createdAt: now,
          updatedAt: now,
        };

        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(convId);
        persistConversation(newConv);

        // Create conversation record server-side, then start streaming
        fetch(`${API_URL}/api/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: convId, title }),
        })
          .then(() => streamResponse(convId, query, []))
          .catch(() => {
            // If conversation creation fails, stream anyway (metrics logging will skip FK)
            streamResponse(convId, query, []);
          });
      }
    },
    [activeConversationId, activeConversation, updateConversation, streamResponse, persistConversation]
  );

  const handleSelectConversation = useCallback(
    (id: string) => {
      // If not in memory, try to load from localStorage
      const inMemory = conversations.find((c) => c.id === id);
      if (!inMemory) {
        const fromStorage = loadConversation(id);
        if (fromStorage) {
          setConversations((prev) => [fromStorage, ...prev]);
        }
      }
      setActiveConversationId(id);
    },
    [conversations]
  );

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    // Abort any ongoing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStreamingContent('');
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    [activeConversationId]
  );

  const handleFeedbackSubmit = useCallback(
    (messageId: string) => {
      if (!activeConversationId) return;
      updateConversation(activeConversationId, (conv) => ({
        ...conv,
        messages: conv.messages.map((m) =>
          m.id === messageId ? { ...m, feedbackSubmitted: true } : m
        ),
        updatedAt: new Date().toISOString(),
      }));
    },
    [activeConversationId, updateConversation]
  );

  // Convert conversations to sidebar format
  const sidebarItems = conversations.map((conv) => ({
    id: conv.id,
    title: conv.title,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
  }));

  return (
    <SidebarProvider>
      <Sidebar
        conversations={sidebarItems}
        currentId={activeConversationId || undefined}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConversation}
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
            {activeConversation ? (
              <ConversationView
                messages={activeConversation.messages}
                streamingContent={isStreaming ? streamingContent : undefined}
                apiUrl={API_URL}
                onFeedbackSubmit={handleFeedbackSubmit}
              >
                {/* Follow-up input at bottom of conversation */}
                {!isStreaming && (
                  <div className="pt-4">
                    <QueryInput
                      onSubmit={handleSubmit}
                      isLoading={isStreaming}
                      placeholder="Ask a follow-up question..."
                      maxLength={2000}
                    />
                  </div>
                )}
              </ConversationView>
            ) : (
              <>
                {/* Query input for new conversation */}
                <section className="mb-8">
                  <QueryInput
                    onSubmit={handleSubmit}
                    isLoading={isStreaming}
                    placeholder="Ask about algorithms, data structures, or competition strategies..."
                    maxLength={2000}
                  />
                </section>

                {/* Empty state */}
                {conversations.length === 0 && (
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
                          disabled={isStreaming}
                        />
                        <ExampleQuestion
                          question="What is the time complexity of Dijkstra's algorithm?"
                          onClick={handleSubmit}
                          disabled={isStreaming}
                        />
                        <ExampleQuestion
                          question="Explain the union-find data structure"
                          onClick={handleSubmit}
                          disabled={isStreaming}
                        />
                        <ExampleQuestion
                          question="How to optimize DP solutions using space compression?"
                          onClick={handleSubmit}
                          disabled={isStreaming}
                        />
                      </div>
                    </EmptyContent>
                  </Empty>
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
