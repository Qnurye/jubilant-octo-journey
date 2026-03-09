import type { Citation } from '../app/components/CitationList';

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string; // ISO date string for serialization
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
  metadata?: {
    queryId: string;
    confidence: 'high' | 'medium' | 'low' | 'insufficient';
    latencyMs: number;
    vectorResultCount: number;
    graphResultCount: number;
  };
  feedbackSubmitted?: boolean;
}
