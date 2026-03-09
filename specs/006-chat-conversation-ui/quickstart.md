# Quickstart: Chat Conversation UI

## Implementation Order

### Phase 1: Database Schema (packages/database)
1. Add `conversations` table to Drizzle schema
2. Add `conversationId` column to `ragQueries` table
3. Generate and run migration
4. Export new schema types

### Phase 2: API Extension (apps/api)
1. Add `conversationId` and `history` to query request validation
2. Create `POST /api/conversations` endpoint
3. Pass `history` through to RAG pipeline
4. Record `conversationId` in query metrics logging
5. Update/increment conversation messageCount on each query

### Phase 3: RAG Pipeline Context Injection (packages/rag)
1. Extend `QueryRequest` type with `history` field
2. Modify `buildChatMessages()` in prompts.ts to inject conversation turns
3. Add conversation history truncation (2048 token budget)
4. Ensure retrieval remains independent (no history-based query modification)

### Phase 4: Frontend Chat UI (apps/web)
1. Create `ChatBubble` component (user + assistant variants)
2. Create `ConversationView` component (message list with auto-scroll)
3. Refactor `page.tsx` from single-Q&A to multi-turn conversation model
4. Modify `ResponseStream` to work within conversation context
5. Update `Sidebar` to show conversations instead of individual questions
6. Add localStorage persistence for conversations
7. Wire up conversationId in API requests

## Key Files to Modify

| File | Change |
|------|--------|
| `packages/database/src/schema/postgres.ts` | Add conversations table, conversationId FK |
| `packages/rag/src/types.ts` | Add history to QueryRequest |
| `packages/rag/src/generation/prompts.ts` | Inject conversation history into chat messages |
| `apps/api/src/routes/query.ts` | Accept conversationId/history, log conversation link |
| `apps/web/src/app/page.tsx` | Major refactor to conversation model |
| `apps/web/src/app/components/ResponseStream.tsx` | Accept messageId, work in conversation context |
| `apps/web/src/app/components/Sidebar.tsx` | Show conversations instead of questions |

## New Files

| File | Purpose |
|------|---------|
| `apps/web/src/app/components/ChatBubble.tsx` | Chat message bubble component |
| `apps/web/src/app/components/ConversationView.tsx` | Multi-turn conversation renderer |
| `apps/api/src/routes/conversations.ts` | Conversation CRUD endpoint |

## Testing Strategy

- **Unit tests**: ChatBubble rendering, conversation history truncation
- **Integration tests**: Multi-turn conversation flow with mocked API
- **Database tests**: conversations table, conversationId FK constraint
- **RAG tests**: Prompt construction with conversation history

## Dev Workflow

```bash
# 1. Schema changes
cd packages/database
# Edit schema, generate migration
bun --env-file=../../.env test

# 2. RAG changes
cd packages/rag
# Edit types + prompts
bun test

# 3. API changes
cd apps/api
# Add routes + validation
bun test

# 4. Frontend
cd apps/web
# Build components, refactor page
bun test
```
