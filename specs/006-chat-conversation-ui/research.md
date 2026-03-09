# Research: Chat Conversation UI

## R1: Conversation Context Injection Strategy

**Decision**: Append previous turns as `{role, content}` pairs in the LLM chat messages array, between system prompt and current user query.

**Rationale**:
- The Qwen3 LLM already supports multi-turn chat via OpenAI-compatible API
- `buildChatMessages()` in `prompts.ts` currently returns `[system, user]` — extend to `[system, ...history, user]`
- Each turn's retrieved context is embedded in its own assistant response, so the LLM naturally sees prior evidence

**Alternatives considered**:
- Summarize conversation history into a single context block → loses detail, adds summarization latency
- Only inject last N turns → chosen as truncation strategy when context budget exceeded

**Token budget**: Reserve 2048 tokens for conversation history. With avg 200 tokens/turn, supports ~10 turns before truncation.

## R2: Conversation Persistence Strategy

**Decision**: Client-side persistence via localStorage + server-side recording via existing `rag_queries` table with new `conversationId` column.

**Rationale**:
- Full message content stored client-side (localStorage) — avoids new API endpoints for conversation CRUD
- Server-side only stores query metrics (already done) + conversationId link (new column)
- No new tables needed — just add `conversationId` to `rag_queries` and optionally a `conversations` metadata table
- Privacy-preserving: server never stores full conversation text, only anonymized metrics

**Alternatives considered**:
- Full server-side conversation storage → requires new API endpoints, privacy concerns, scope creep
- IndexedDB instead of localStorage → more complex API, unnecessary for text data under 5MB

## R3: Chat Bubble UI Pattern

**Decision**: Use shadcn/ui Card variants with directional styling (user right-aligned, AI left-aligned). No external chat library.

**Rationale**:
- Project already uses shadcn/ui extensively
- Chat bubbles are simple layout components (Card + flex alignment)
- External chat UI libraries (e.g., chatscope) would add dependency bloat for minimal gain

**Implementation**:
- `ChatBubble` component with `variant: 'user' | 'assistant'` prop
- User bubble: right-aligned, primary color background
- AI bubble: left-aligned, card background, contains MarkdownRenderer + CitationList + FeedbackWidget

## R4: SSE Protocol Extension

**Decision**: No protocol changes needed. The existing StreamChunk types (`token`, `citation`, `metadata`, `done`, `error`, `confidence`) are sufficient.

**Rationale**:
- `conversationId` is passed in the request body, not the response stream
- Each follow-up is a separate SSE stream (new POST request)
- The `metadata` chunk already returns `queryId` which links to the database record

## R5: Conversation-Aware Retrieval

**Decision**: Each follow-up performs independent full retrieval. Conversation history is only used for LLM prompt context, NOT for modifying retrieval queries.

**Rationale**:
- Constitution requires hybrid RAG for every query — conversation context shouldn't bypass retrieval
- Query rewriting (using conversation history to expand the query) is a future optimization, not in scope
- Each query's retrieval metrics must be independently valid for analytics

**Future consideration**: Query rewriting (e.g., "What about its time complexity?" → "What is the time complexity of Dijkstra's algorithm?") could improve retrieval quality but is out of scope.

## R6: Database Schema Changes

**Decision**: Add `conversations` table + `conversation_id` column to `rag_queries`.

**Schema**:
```sql
conversations (
  id UUID PK DEFAULT gen_random_uuid(),
  title TEXT,           -- first message text (truncated)
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  message_count INT DEFAULT 0,
  user_hash TEXT        -- anonymized user identifier
)

-- Add to existing rag_queries:
ALTER TABLE rag_queries ADD COLUMN conversation_id UUID REFERENCES conversations(id);
```

**Rationale**:
- Minimal schema change — only 1 new table + 1 new column
- `conversations` stores lightweight metadata for analytics grouping
- No message content stored server-side (privacy)
- `user_hash` reuses existing anonymization pattern from `analyticsSessions`

## R7: Conversation History Truncation

**Decision**: Keep most recent N turns when context exceeds budget. Use simple token counting (content.length / 3 as rough estimate).

**Rationale**:
- Exact tokenization requires model-specific tokenizer — overkill for context management
- Character-based estimation (÷3 for Chinese, ÷4 for English) is sufficient
- 2048 token budget ≈ 6000 Chinese characters or 8000 English characters
- Slide window: keep system prompt + last N turns + current query with retrieved context
