# Data Model: Chat Conversation UI

## New Entity: Conversation

```
conversations
├── id: UUID (PK, auto-generated)
├── title: TEXT (first message, truncated to 100 chars)
├── createdAt: TIMESTAMP (default now)
├── updatedAt: TIMESTAMP (default now)
├── messageCount: INTEGER (default 0)
└── userHash: TEXT (anonymized, optional)
```

**Relationships**:
- conversations 1:N rag_queries (via conversationId FK)

**Validation**:
- title: max 100 chars, derived from first user message
- messageCount: incremented on each follow-up

## Modified Entity: rag_queries

**New column**:
```
rag_queries
├── ... (existing columns)
└── conversationId: UUID (FK → conversations.id, nullable)
```

**Behavior**:
- First query in conversation: creates `conversations` row, sets `conversationId`
- Follow-up queries: reuse same `conversationId`, increment `messageCount`
- Standalone queries (no conversation): `conversationId` = null (backward compatible)

## Client-Side Model: Conversation

```typescript
interface Conversation {
  id: string;                    // UUID, generated client-side
  title: string;                 // First message text (truncated)
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

interface ConversationMessage {
  id: string;                    // UUID
  role: 'user' | 'assistant';
  content: string;               // Full text content
  timestamp: Date;
  // Only for assistant messages:
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
```

**Persistence**: localStorage, keyed by `conversations:${id}`
**Eviction**: LRU when total size exceeds 4MB

## State Transitions

```
[No Conversation]
    → user submits question
    → [Conversation Created] (id generated, first message added)
    → API call with conversationId
    → [Streaming Response] (assistant message streaming)
    → stream completes
    → [Conversation Active] (both messages stored)
    → user submits follow-up
    → [Streaming Response] (new message pair)
    → ...repeat...
```

## API Request Extension

```typescript
// Extended query request
interface QueryRequest {
  query: string;
  conversationId?: string;       // NEW: links to conversation
  history?: ConversationTurn[];   // NEW: previous turns for LLM context
  topK?: number;
  includeGraph?: boolean;
  topicFilter?: string;
  stream?: boolean;
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;               // Truncated if needed
}
```
