# Tasks: Chat Conversation UI

**Input**: Design documents from `/specs/006-chat-conversation-ui/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api.yaml, research.md, quickstart.md

**Tests**: Not explicitly requested in spec. Test tasks omitted.

**Organization**: Tasks grouped by user story. US1+US2 (both P0) form the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: Ensure branch and workspace are ready

- [x] T001 Verify all packages build cleanly on `006-chat-conversation-ui` branch (`bun build` from repo root)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, RAG types, and API plumbing shared by ALL user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Add `conversations` table to Drizzle schema in `packages/database/src/schema/postgres.ts` with columns: id (UUID PK), title (text, max 100), createdAt (timestamp), updatedAt (timestamp), messageCount (integer default 0), userHash (text nullable)
- [x] T003 Add nullable `conversationId` column (UUID FK → conversations.id) to `ragQueries` table in `packages/database/src/schema/postgres.ts`
- [x] T004 Export new `conversations` table and inferred types from `packages/database/src/schema/index.ts` (or existing barrel export)
- [x] T005 Generate Drizzle migration for the new `conversations` table and `conversationId` FK column
- [x] T006 [P] Add `ConversationTurn` type (`{role: 'user'|'assistant', content: string}`) and optional `history: ConversationTurn[]` + `conversationId?: string` fields to `QueryRequest` in `packages/rag/src/types.ts`
- [x] T007 [P] Add `truncateHistory(history: ConversationTurn[], maxTokens: number): ConversationTurn[]` utility in `packages/rag/src/generation/prompts.ts` — keeps most recent turns within 2048-token budget using char-based estimation (÷3 for CJK, ÷4 for Latin)
- [x] T008 Modify `buildChatMessages()` in `packages/rag/src/generation/prompts.ts` to insert truncated conversation history turns between system prompt and current user message
- [x] T009 Extend request body validation in `apps/api/src/routes/query.ts` to accept optional `conversationId` (UUID format) and `history` (array of `{role, content}`, maxItems 20, content maxLength 4000)
- [x] T010 Create `POST /api/conversations` endpoint in new file `apps/api/src/routes/conversations.ts` — accepts `{title: string}`, inserts into `conversations` table, returns `{id, title, createdAt}` with status 201
- [x] T011 Register conversations route in `apps/api/src/index.ts` (or existing router setup file)
- [x] T012 Pass `history` field from validated request through to `RAGPipeline.queryStream()` in `apps/api/src/routes/query.ts`
- [x] T013 Update `logQueryMetrics()` in `apps/api/src/routes/query.ts` to write `conversationId` to `rag_queries` row; if conversationId provided, also increment `messageCount` and update `updatedAt` on the `conversations` row

**Checkpoint**: Backend fully supports conversation context — API accepts conversationId/history, RAG injects history into prompt, DB records conversation links. All existing single-turn flows remain backward compatible.

---

## Phase 3: User Story 1 — Student Has a Multi-Turn Conversation (Priority: P0) 🎯 MVP

**Goal**: Transform UI from single-turn Q&A to interactive chat bubble conversation with follow-up support.

**Independent Test**: Submit a question, receive streaming answer in a chat bubble, then submit a follow-up — it appears as a new bubble pair and the AI response references the prior context.

### Implementation for User Story 1

- [x] T014 [P] [US1] Create `ChatBubble` component in `apps/web/src/app/components/ChatBubble.tsx` — two variants: user (right-aligned, primary bg) and assistant (left-aligned, card bg). Assistant variant renders children slot for MarkdownRenderer/citations. Accept props: `role`, `content`, `timestamp`, `children`.
- [x] T015 [P] [US1] Create `Conversation` and `ConversationMessage` TypeScript interfaces in `apps/web/src/lib/types.ts` matching the client-side model from data-model.md (id, title, messages[], createdAt, updatedAt)
- [x] T016 [P] [US1] Create localStorage persistence module in `apps/web/src/lib/conversations.ts` — functions: `saveConversation(conv)`, `loadConversation(id)`, `listConversations()`, `deleteConversation(id)`, with LRU eviction when total size exceeds 4MB
- [x] T017 [US1] Create `ConversationView` component in `apps/web/src/app/components/ConversationView.tsx` — renders array of `ConversationMessage` as `ChatBubble` list with auto-scroll to bottom on new messages. Assistant bubbles include `MarkdownRenderer` for content.
- [x] T018 [US1] Refactor `apps/web/src/app/page.tsx` state model: replace `currentQuery`/`history`/`selectedConversationId` with `conversations: Conversation[]`, `activeConversationId: string|null`, `isStreaming: boolean`. New conversation generates UUID, calls `POST /api/conversations`, adds to state.
- [x] T019 [US1] Modify `ResponseStream` usage in `apps/web/src/app/page.tsx` (or `ResponseStream.tsx` if needed): on stream completion, append assistant message to active conversation's messages array; pass `conversationId` and `history` (prior messages) in the POST body to `/api/query/stream`
- [x] T020 [US1] Implement follow-up input: after a streaming response completes, show `QueryInput` at the bottom of `ConversationView` so the student can type a follow-up. On submit, append user message to conversation, trigger new stream with full history.
- [x] T021 [US1] Persist active conversation to localStorage on every state change (new message, stream complete) using the module from T016

**Checkpoint**: Student can start a conversation, ask follow-ups, see chat bubbles, and the AI uses prior context. Conversations persist across page reloads.

---

## Phase 4: User Story 2 — Each Follow-Up Has Complete Retrieval Records (Priority: P0) 🎯 MVP

**Goal**: Verify and ensure each follow-up creates independent retrieval records in the database, all linked by conversationId.

**Independent Test**: Submit 3 questions in one conversation. Check that `rag_queries` has 3 rows with the same `conversationId`, each with independent `milvusHits`, `neo4jHits`, `executionTimeMs`, and `strategyUsed`.

### Implementation for User Story 2

- [x] T022 [US2] Verify that `apps/api/src/routes/query.ts` streaming handler creates a **new** `queryId` (UUID) for every request regardless of `conversationId` — ensure no ID reuse across follow-ups. Trace through `logQueryMetrics()` and `logDetailedRetrievalMetrics()`.
- [x] T023 [US2] Verify that `conversationId` is correctly written to the `rag_queries` row in `logQueryMetrics()` (from T013). Add a log statement confirming `queryId` + `conversationId` pair on each query for debugging.
- [x] T024 [US2] Verify that `retrieval_metrics` rows are independently created per query (existing behavior via `logDetailedRetrievalMetrics()` keyed by `queryId`). No changes expected — confirm existing code handles follow-ups correctly since each has a unique queryId.

**Checkpoint**: Each follow-up in a conversation produces independent, complete records in `rag_queries` and `retrieval_metrics`, all grouped under the same `conversationId`.

---

## Phase 5: User Story 3 — Per-Message Citations and Metadata (Priority: P1)

**Goal**: Each AI response bubble independently shows its own citations, confidence indicator, and feedback widget.

**Independent Test**: In a 3-turn conversation, each AI bubble shows different citation lists, confidence levels, and an independent feedback button that submits to its own queryId.

### Implementation for User Story 3

- [x] T025 [P] [US3] Extend `ConversationMessage` type in `apps/web/src/lib/types.ts` to include `citations: Citation[]`, `metadata: {queryId, confidence, latencyMs, vectorResultCount, graphResultCount}`, and `feedbackSubmitted: boolean` fields (if not already present from T015)
- [x] T026 [US3] Update assistant `ChatBubble` rendering in `apps/web/src/app/components/ConversationView.tsx` to display `CitationList` below markdown content, confidence badge, and latency info — all sourced from the message's own `metadata`
- [x] T027 [US3] Add `FeedbackWidget` inside each assistant `ChatBubble` in `ConversationView.tsx` — pass the message's `metadata.queryId` as the feedback target. On submit, mark that specific message's `feedbackSubmitted` flag and persist to localStorage.
- [x] T028 [US3] Update stream completion handler in `apps/web/src/app/page.tsx`: when `ResponseStream` calls `onComplete`, store `citations`, `metadata` (queryId, confidence, latency, vectorResultCount, graphResultCount) on the assistant `ConversationMessage`

**Checkpoint**: Each AI bubble in a conversation independently shows its citations, confidence, and feedback widget tied to its own queryId.

---

## Phase 6: User Story 4 — Conversation History Navigation (Priority: P1)

**Goal**: Sidebar shows conversations (not individual questions). Selecting a conversation restores the full multi-turn chat.

**Independent Test**: Create 3 conversations with different topics. Sidebar shows 3 entries with first-question titles. Clicking one loads all its messages as chat bubbles.

### Implementation for User Story 4

- [x] T029 [US4] Update `Sidebar` component in `apps/web/src/app/components/Sidebar.tsx` — change data source from individual Q&A history to `conversations[]`. Each sidebar item shows: conversation title (first message, truncated), message count, last updated timestamp.
- [x] T030 [US4] Implement conversation selection in `apps/web/src/app/page.tsx`: when sidebar item clicked, set `activeConversationId`, load conversation from state (or localStorage via T016), render in `ConversationView`
- [x] T031 [US4] Implement "New Chat" action: clear `activeConversationId`, show empty `ConversationView` with `QueryInput` ready for first question
- [x] T032 [US4] On page load, restore conversation list from localStorage using `listConversations()` from T016. Set `activeConversationId` to the most recent conversation (or null if empty).

**Checkpoint**: Sidebar shows conversation-level entries. Clicking loads full multi-turn chat. "New Chat" starts fresh. State survives page reload.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span multiple user stories

- [x] T033 Add empty state to `ConversationView` in `apps/web/src/app/components/ConversationView.tsx` — show example questions (migrated from current page.tsx `ExampleQuestion` grid) when no messages exist
- [x] T034 Ensure mobile responsiveness: chat bubbles stack correctly on small viewports, sidebar overlay works with conversation model in `apps/web/src/app/page.tsx`
- [x] T035 Add loading/streaming indicator inside assistant `ChatBubble` during active stream (pulsing dots or skeleton) in `apps/web/src/app/components/ChatBubble.tsx`
- [x] T036 Handle edge case: conversation context exceeds 2048 token budget — verify `truncateHistory()` from T007 correctly drops oldest turns and log a warning when truncation occurs in `packages/rag/src/generation/prompts.ts`
- [x] T037 Run `bun type-check` and `bun lint` across all modified packages, fix any errors
- [x] T038 Run existing test suites (`packages/rag`, `packages/database`, `apps/api`) to verify no regressions from schema and type changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core conversation UI
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1 (verification-focused)
- **US3 (Phase 5)**: Depends on US1 (needs chat bubbles to attach citations/feedback to)
- **US4 (Phase 6)**: Depends on US1 (needs conversation model in page.tsx)
- **Polish (Phase 7)**: Depends on all user stories

### User Story Dependencies

```
Phase 2 (Foundational)
    ├── US1 (P0): Multi-Turn Chat ──┬── US3 (P1): Per-Message Citations
    │                                └── US4 (P1): History Navigation
    └── US2 (P0): Retrieval Records (parallel with US1)

Phase 7 (Polish) ← depends on all above
```

### Within Each Phase

- Tasks marked [P] can run in parallel (different files)
- Sequential tasks depend on the prior task's output
- Models/types before services, services before UI integration

### Parallel Opportunities

**Phase 2 (Foundational)**:
```
Parallel group 1: T002 + T003 (same file, sequential) then T004 + T005
Parallel group 2: T006 || T007 (different files: types.ts vs prompts.ts)
Then: T008 (depends on T006 for types)
Parallel group 3: T009 + T010 || T011 (different files)
Then: T012, T013 (depend on T008, T009)
```

**Phase 3 (US1)**:
```
Parallel: T014 || T015 || T016 (all different files)
Then: T017 (depends on T014, T015)
Then: T018 (depends on T015, T016, T017)
Then: T019, T020, T021 (sequential, all touch page.tsx)
```

**Phase 5 + Phase 6 can run in parallel** (US3 and US4 touch different files — ConversationView.tsx vs Sidebar.tsx/page.tsx — though US4 T030 touches page.tsx which overlaps with US3 T028)

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (DB + RAG + API)
3. Complete Phase 3: US1 (Chat bubble UI + multi-turn)
4. Complete Phase 4: US2 (Verify retrieval records)
5. **STOP and VALIDATE**: Test multi-turn conversation end-to-end. Each follow-up should produce independent DB records.

### Incremental Delivery

1. Setup + Foundational → Backend ready
2. US1 → Chat bubbles work, follow-ups work → **Demo: multi-turn conversation**
3. US2 → Verify data integrity → **Confidence: analytics-ready**
4. US3 → Per-message citations/feedback → **Polish: rich per-message metadata**
5. US4 → Sidebar navigation → **Polish: conversation management**
6. Phase 7 → Edge cases, mobile, loading states → **Ship-ready**

---

## Summary

| Metric | Count |
|--------|-------|
| Total tasks | 38 |
| Phase 1 (Setup) | 1 |
| Phase 2 (Foundational) | 12 |
| Phase 3 (US1) | 8 |
| Phase 4 (US2) | 3 |
| Phase 5 (US3) | 4 |
| Phase 6 (US4) | 4 |
| Phase 7 (Polish) | 6 |
| Parallel opportunities | 11 tasks marked [P] |
| MVP scope | Phases 1–4 (24 tasks) |
