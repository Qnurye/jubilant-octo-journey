# Feature Specification: Chat Conversation UI with Multi-Turn Support

**Feature Branch**: `006-chat-conversation-ui`
**Created**: 2026-03-09
**Status**: Planning
**Input**: M3 enhancement — 对话以交互式气泡的形式实现用户界面，以允许学生追问问题；并且每一个追问的问题所匹配到的数据，都要有完整且与当前一致的记录。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Student Has a Multi-Turn Conversation (Priority: P0)

A student asks a question, receives a streaming answer, then asks a follow-up question within the same conversation. The follow-up is displayed as a new message bubble and receives its own full retrieval + generation cycle.

**Why this priority**: This is the core enhancement — transforming single-turn Q&A into interactive conversation.

**Acceptance Scenarios**:

1. **Given** a student has received an answer, **When** they type a follow-up question, **Then** it appears as a new user bubble and a new streaming AI response begins below it.

2. **Given** a multi-turn conversation, **When** the student views the chat, **Then** each message pair (Q+A) is displayed as distinct chat bubbles in chronological order.

3. **Given** a follow-up question, **When** the RAG pipeline processes it, **Then** the previous conversation context is included in the LLM prompt for coherent responses.

---

### User Story 2 - Each Follow-Up Has Complete Retrieval Records (Priority: P0)

Every follow-up question triggers its own full hybrid retrieval cycle (vector + graph), and the retrieval metadata is recorded independently in the database, linked to the conversation.

**Why this priority**: Per the user requirement, each follow-up must have complete and consistent data recording.

**Acceptance Scenarios**:

1. **Given** a follow-up question is submitted, **When** the RAG pipeline runs, **Then** a new `rag_queries` record is created with its own queryId, retrieval metrics, and citations.

2. **Given** multiple questions in one conversation, **When** viewing analytics, **Then** each query's retrieval data (milvusHits, neo4jHits, latency, confidence) is independently recorded and linked to the same conversation.

3. **Given** a conversation with 3 messages, **When** inspecting the database, **Then** there are 3 separate `rag_queries` rows all sharing the same `conversationId`.

---

### User Story 3 - Student Views Per-Message Citations and Metadata (Priority: P1)

Each AI response bubble shows its own citations, confidence indicator, and feedback widget independently.

**Acceptance Scenarios**:

1. **Given** a conversation with multiple answers, **When** viewing any answer bubble, **Then** it shows its own citation list, confidence level, and latency.

2. **Given** an answer bubble, **When** the student submits feedback, **Then** it applies only to that specific answer's queryId.

---

### User Story 4 - Student Navigates Conversation History (Priority: P1)

The sidebar shows conversations (not individual questions). Selecting a conversation restores the full multi-turn chat.

**Acceptance Scenarios**:

1. **Given** multiple conversations exist, **When** the student opens the sidebar, **Then** each entry represents a conversation with the first question as title.

2. **Given** a selected conversation, **When** it loads, **Then** all message bubbles (user + AI) are displayed in order.

---

### Edge Cases

- What if conversation context exceeds LLM token limit? Truncate oldest messages, keeping the most recent N turns.
- What if user refreshes mid-conversation? Conversations are stored client-side (localStorage) for session persistence; database stores query records server-side.
- What if a follow-up's retrieval returns no results? Handle same as single-turn: show insufficient evidence response.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-CONV-001**: UI MUST display messages as chat bubbles (user on right, AI on left).
- **FR-CONV-002**: UI MUST support follow-up questions within the same conversation.
- **FR-CONV-003**: Each follow-up MUST trigger a full hybrid retrieval cycle (vector + graph).
- **FR-CONV-004**: Each follow-up's retrieval data MUST be independently recorded in `rag_queries` and `retrieval_metrics`.
- **FR-CONV-005**: All queries in a conversation MUST share a `conversationId` for grouping.
- **FR-CONV-006**: The RAG pipeline MUST include previous conversation turns in the LLM prompt.
- **FR-CONV-007**: Each AI response bubble MUST display its own citations, confidence, and feedback widget.
- **FR-CONV-008**: Sidebar MUST show conversations (grouped by conversationId), not individual questions.
- **FR-CONV-009**: Conversation context sent to LLM MUST be truncated when exceeding token budget.
- **FR-CONV-010**: UI MUST persist conversations in localStorage for session continuity.

### Non-Functional Requirements

- **NFR-CONV-001**: Adding conversation history to prompt SHOULD NOT increase first-token latency by more than 500ms.
- **NFR-CONV-002**: Conversation with 10+ turns SHOULD remain responsive (no UI jank).
- **NFR-CONV-003**: localStorage usage SHOULD be bounded (LRU eviction at 5MB).

### Key Components (New/Modified)

- **ChatBubble** (new): Individual message bubble (user or AI variant).
- **ConversationView** (new): Renders a list of ChatBubbles with auto-scroll.
- **ConversationInput** (modified from QueryInput): Input area with conversation context.
- **page.tsx** (major refactor): From single Q&A to multi-turn conversation model.
- **Sidebar** (modified): Show conversations instead of individual questions.
- **API /api/query/stream** (modified): Accept conversationId + history, pass to RAG.
- **RAG pipeline** (modified): Accept conversation history, inject into prompt.
- **DB schema** (modified): Add `conversations` table, link `rag_queries`.

## Success Criteria *(mandatory)*

- **SC-CONV-001**: Student can ask 3+ follow-up questions in a single conversation.
- **SC-CONV-002**: Each follow-up has its own independent `rag_queries` + `retrieval_metrics` records.
- **SC-CONV-003**: All queries in a conversation share the same `conversationId`.
- **SC-CONV-004**: Chat bubbles render correctly for both user and AI messages.
- **SC-CONV-005**: Conversation history persists across page reloads (localStorage).
- **SC-CONV-006**: Follow-up responses are contextually coherent (reference previous turns).

## Constitution Compliance Check

| Principle | Compliance Status |
|-----------|------------------|
| I. Hybrid RAG | ✅ Each follow-up triggers full vector + graph retrieval independently |
| II. Anti-Hallucination | ✅ Each response has its own citations and confidence; conversation context doesn't bypass grounding |
| III. Dual-Interface | ✅ Student-only interface; no analytics exposed |
| IV. Content-Aware | ✅ Inherits existing code/formula/table rendering from M3 |
| V. Formative Assessment | ✅ conversationId enables aggregate analytics without exposing individual conversations |
