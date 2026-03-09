# Implementation Plan: Chat Conversation UI

**Branch**: `006-chat-conversation-ui` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-chat-conversation-ui/spec.md`

## Summary

Transform the current single-turn Q&A interface into an interactive chat bubble UI supporting multi-turn conversations with follow-up questions. Each follow-up triggers independent hybrid retrieval (vector + graph) with complete per-query data recording. Conversation history is injected into the LLM prompt for contextual coherence while maintaining independent retrieval metrics for every message.

## Technical Context

**Language/Version**: TypeScript 5.x (Bun runtime)
**Primary Dependencies**: Next.js 16, Hono, shadcn/ui, Drizzle ORM, Qwen3 LLM (OpenAI-compatible API)
**Storage**: PostgreSQL (conversations + query metrics), localStorage (client-side message content), Milvus (vectors), Neo4j (graph)
**Testing**: Vitest (unit + integration), bun test
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Monorepo (apps/web frontend, apps/api backend, packages/rag pipeline, packages/database schema)
**Performance Goals**: First token latency < 3s, conversation history injection adds < 500ms
**Constraints**: 2048 token budget for conversation history in LLM prompt, localStorage bounded at 4MB
**Scale/Scope**: 10-20 concurrent users (classroom scale), conversations up to ~20 turns

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-Design | Post-Design |
|-----------|-----------|-------------|
| I. Hybrid RAG | ✅ Each follow-up triggers full vector + graph retrieval independently | ✅ Confirmed: retrieval is NOT modified by conversation history |
| II. Anti-Hallucination | ✅ Each response grounded in its own retrieved evidence with citations | ✅ Confirmed: conversation context is prompt-only, not a retrieval bypass |
| III. Dual-Interface | ✅ Student-only interface; conversationId enables analytics grouping without exposing content | ✅ Confirmed: no message content stored server-side |
| IV. Content-Aware | ✅ Inherits existing code/formula/table rendering | ✅ No changes to content processing pipeline |
| V. Formative Assessment | ✅ Conversation metrics aggregatable; no individual exposure | ✅ userHash anonymization preserved |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-chat-conversation-ui/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity models and state transitions
├── quickstart.md        # Implementation guide
├── contracts/
│   └── api.yaml         # API contract changes
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/database/
├── src/schema/postgres.ts          # ADD: conversations table, conversationId FK
└── drizzle/                        # Migration files (auto-generated)

packages/rag/
├── src/types.ts                    # MODIFY: Add history to QueryRequest
└── src/generation/prompts.ts       # MODIFY: Inject conversation history into chat messages

apps/api/
├── src/routes/query.ts             # MODIFY: Accept conversationId/history, log conversation link
└── src/routes/conversations.ts     # NEW: POST /api/conversations endpoint

apps/web/
├── src/app/page.tsx                # MAJOR REFACTOR: Multi-turn conversation model
├── src/app/components/
│   ├── ChatBubble.tsx              # NEW: Message bubble (user/assistant variants)
│   ├── ConversationView.tsx        # NEW: Multi-turn message list with auto-scroll
│   ├── ResponseStream.tsx          # MODIFY: Work within conversation context
│   └── Sidebar.tsx                 # MODIFY: Show conversations, not individual Qs
└── src/lib/
    └── conversations.ts            # NEW: localStorage persistence, LRU eviction
```

**Structure Decision**: Monorepo with changes across 4 packages. No new packages — all changes fit within existing workspace structure.

## Implementation Phases

### Phase 1: Database Schema (packages/database)

**Goal**: Add conversation tracking to PostgreSQL.

**Changes**:
1. Add `conversations` table to `packages/database/src/schema/postgres.ts`:
   - `id` (UUID, PK), `title` (text), `createdAt`, `updatedAt`, `messageCount` (int), `userHash` (text)
2. Add `conversationId` column to `ragQueries` table (nullable FK → conversations)
3. Generate Drizzle migration
4. Export new table + types from package index

**Testing**: Database integration tests for new table, FK constraints.

### Phase 2: RAG Pipeline Context Injection (packages/rag)

**Goal**: Enable conversation-aware LLM responses without modifying retrieval.

**Changes**:
1. Extend `QueryRequest` in `types.ts` with optional `history: ConversationTurn[]`
2. Modify `buildChatMessages()` in `prompts.ts`:
   - Insert history turns between system prompt and current user message
   - Truncate history to 2048 token budget (char-based estimation)
3. Add `truncateHistory()` utility function

**Key constraint**: Retrieval (`HybridRetriever.retrieve()`) is NOT modified — only prompt construction changes.

**Testing**: Unit tests for prompt construction with history, truncation logic.

### Phase 3: API Extension (apps/api)

**Goal**: Accept conversation context in query requests, record conversation links.

**Changes**:
1. Extend request validation in `query.ts` to accept `conversationId` (UUID) and `history` (array of {role, content})
2. Create `POST /api/conversations` endpoint in new `conversations.ts` route
3. Pass `history` to RAG pipeline's `queryStream()`
4. In `logQueryMetrics()`: record `conversationId` in `rag_queries`, update conversation `messageCount`

**Testing**: API unit tests for new validation, conversation creation endpoint.

### Phase 4: Frontend Chat UI (apps/web)

**Goal**: Transform UI from single-turn Q&A to interactive chat bubble conversation.

**Changes**:
1. **ChatBubble component** (new): Renders user or assistant message as styled bubble
   - User variant: right-aligned, primary color
   - Assistant variant: left-aligned, card style, includes MarkdownRenderer, CitationList, FeedbackWidget
2. **ConversationView component** (new): Scrollable list of ChatBubbles with auto-scroll on new messages
3. **page.tsx refactor**: Replace single-Q&A state model with conversation model
   - State: `conversations[]`, `activeConversationId`, `isStreaming`
   - New conversation = generates conversationId, calls POST /api/conversations
   - Follow-up = appends to existing conversation, sends history in request
4. **Sidebar update**: Group by conversation (title = first message), show message count
5. **localStorage persistence**: Save/load conversations, LRU eviction at 4MB
6. **ResponseStream update**: Accept callback per-message instead of per-page

**Testing**: Component unit tests for ChatBubble, ConversationView; integration test for multi-turn flow.

## Complexity Tracking

> No constitution violations — table not needed.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Conversation history bloats LLM prompt | Slow responses, token overflow | 2048 token budget with truncation |
| localStorage quota exceeded | Lost conversations | LRU eviction, 4MB cap, clear old data |
| Breaking existing single-turn flow | Regression | Backward-compatible API (conversationId optional) |
| Follow-up retrieval quality poor without query rewriting | Irrelevant results for ambiguous follow-ups | Out of scope; students can rephrase; future query rewriting optimization |
