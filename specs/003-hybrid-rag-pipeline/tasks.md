# Tasks: Hybrid RAG Pipeline

**Input**: Design documents from `/specs/003-hybrid-rag-pipeline/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml

**Tests**: Not explicitly requested in feature specification. Test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure (monorepo with Bun workspaces):
- **API Backend**: `apps/api/src/`
- **Web Frontend**: `apps/web/src/`
- **RAG Package**: `packages/rag/src/`
- **Database Package**: `packages/database/src/`
- **Shared Types**: `packages/types/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the packages/rag package and configure project dependencies

- [x] T001 Create packages/rag directory structure per plan.md (src/retrieval/, src/reranking/, src/generation/, src/ingestion/, tests/)
- [x] T002 Initialize packages/rag/package.json with name @jubilant/rag, dependencies (llamaindex, @llamaindex/openai)
- [x] T003 [P] Create packages/rag/tsconfig.json extending root TypeScript config
- [x] T004 [P] Add @jubilant/rag as workspace dependency in apps/api/package.json
- [x] T005 [P] Configure environment variables in .env.example (LLM_BASE_URL, EMBEDDING_BASE_URL, RERANKER_BASE_URL, RAG_* settings)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

### Database Schema Extensions

- [x] T006 Add documents table schema in packages/database/src/schema/postgres.ts (id, url, title, format, status, chunkCount, metadata)
- [x] T007 [P] Add ingestionJobs table schema in packages/database/src/schema/postgres.ts (id, documentId, status, progress, errorMessage)
- [x] T008 [P] Add retrievalMetrics table schema in packages/database/src/schema/postgres.ts (vectorSearchMs, graphTraversalMs, rerankMs, etc.)
- [x] T009 Generate and run PostgreSQL migrations in packages/database/ using drizzle-kit
- [x] T010 Add Neo4j fulltext indexes (conceptNameIndex, chunkPreviewIndex) in packages/database/src/schema/neo4j.ts

### Core Type Definitions

- [x] T011 [P] Create packages/rag/src/types.ts with ChunkMetadata, EmbeddedChunk, KnowledgeTriple interfaces
- [x] T012 [P] Add RetrievalResult, FusedResult, RankedResult types to packages/rag/src/types.ts
- [x] T013 [P] Add Citation, QueryContext, StreamChunk, ResponseMetadata types to packages/rag/src/types.ts
- [x] T014 [P] Add API request/response types (QueryRequest, QueryResponse, IngestRequest, etc.) to packages/rag/src/types.ts

### LLM Client Infrastructure

- [x] T015 Implement Qwen3Embedding class extending BaseEmbedding in packages/rag/src/generation/embedder.ts
- [x] T016 [P] Implement Qwen3Reranker class extending BaseNodePostprocessor in packages/rag/src/reranking/reranker.ts
- [x] T017 [P] Configure OpenAI-compatible LLM client for Qwen3-32B in packages/rag/src/generation/llm.ts
- [x] T018 Create LLM health check utilities in packages/rag/src/generation/health.ts

### API Route Infrastructure

- [x] T019 Create apps/api/src/routes/ directory structure
- [x] T020 [P] Implement health check route in apps/api/src/routes/health.ts (/api/health, /api/health/ready, /api/health/live)
- [x] T021 [P] Create metrics middleware in apps/api/src/middleware/metrics.ts for request timing
- [x] T022 Update apps/api/src/index.ts to import and mount all routes

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Student Asks a Competition Question (Priority: P1)

**Goal**: Students can submit questions and receive grounded, citation-backed answers from the hybrid RAG pipeline

**Independent Test**: Submit a question about dynamic programming to /api/query and verify response includes citations and information from both vector and graph sources

### Retrieval Layer

- [x] T023 [US1] Implement MilvusRetriever class extending BaseRetriever in packages/rag/src/retrieval/vector.ts
- [x] T024 [US1] Implement Neo4jGraphRetriever class for prerequisite/relationship traversal in packages/rag/src/retrieval/graph.ts
- [x] T025 [US1] Implement reciprocalRankFusion function in packages/rag/src/retrieval/hybrid.ts
- [x] T026 [US1] Implement HybridRetriever class combining vector + graph with RRF in packages/rag/src/retrieval/hybrid.ts

### Reranking Layer

- [x] T027 [US1] Integrate Qwen3Reranker into query pipeline in packages/rag/src/reranking/reranker.ts (depends on T016)
- [x] T028 [US1] Add confidence threshold logic (0.6) and confidence level calculation (high/medium/low/insufficient)

### Generation Layer

- [x] T029 [US1] Create grounded response prompt templates in packages/rag/src/generation/prompts.ts
- [x] T030 [US1] Implement citation extraction and formatting in packages/rag/src/generation/citations.ts
- [x] T031 [US1] Implement streaming utilities (SSE format) in packages/rag/src/generation/streaming.ts

### Query Pipeline Integration

- [x] T032 [US1] Create RAGPipeline class orchestrating retrieval → rerank → generate in packages/rag/src/pipeline.ts
- [x] T033 [US1] Export public API from packages/rag/src/index.ts (RAGPipeline, types)

### API Endpoints

- [x] T034 [US1] Implement POST /api/query endpoint in apps/api/src/routes/query.ts
- [x] T035 [US1] Implement POST /api/query/stream endpoint with SSE in apps/api/src/routes/query.ts
- [x] T036 [US1] Add query validation (non-empty, max length 2000, valid topK 1-20)
- [x] T037 [US1] Log query metrics to retrievalMetrics table via packages/database

### Frontend Components

- [x] T038 [P] [US1] Create QueryInput component in apps/web/src/app/components/QueryInput.tsx
- [x] T039 [P] [US1] Create ResponseStream component for SSE consumption in apps/web/src/app/components/ResponseStream.tsx
- [x] T040 [P] [US1] Create CitationList component in apps/web/src/app/components/CitationList.tsx
- [x] T041 [US1] Update apps/web/src/app/page.tsx to integrate Q&A interface components

**Checkpoint**: User Story 1 complete - students can ask questions and receive grounded answers with citations

---

## Phase 4: User Story 2 - System Handles Insufficient Evidence (Priority: P1)

**Goal**: When evidence is insufficient (confidence < 0.6), the system explicitly acknowledges uncertainty rather than fabricating

**Independent Test**: Ask about a topic not in the knowledge base and verify the response explicitly states uncertainty

### Uncertainty Handling

- [x] T042 [US2] Add hasInsufficientEvidence flag to QueryContext in packages/rag/src/types.ts
- [x] T043 [US2] Create uncertainty acknowledgment prompt template in packages/rag/src/generation/prompts.ts
- [x] T044 [US2] Implement confidence-based response branching in RAGPipeline (packages/rag/src/pipeline.ts)
- [x] T045 [US2] Add partial evidence handling (indicate which parts are well-supported vs limited evidence)

### API Response Updates

- [x] T046 [US2] Update QueryResponse to include confidence level in apps/api/src/routes/query.ts
- [x] T047 [US2] Add appropriate messaging when confidence is 'insufficient' in streaming response

### Frontend Updates

- [x] T048 [US2] Add confidence indicator styling to ResponseStream component
- [x] T049 [US2] Display uncertainty acknowledgment message in UI when confidence is low/insufficient

**Checkpoint**: User Story 2 complete - system properly acknowledges when it doesn't have sufficient evidence

---

## Phase 5: User Story 3 - Knowledge Base Ingestion with Content Preservation (Priority: P2)

**Goal**: Documents with code, formulas, and tables can be ingested while preserving semantic boundaries

**Independent Test**: Ingest a markdown document containing code blocks, LaTeX formulas, and tables; verify chunks don't split these elements

### Content-Aware Chunking

- [x] T050 [US3] Implement protected element extraction (code blocks, LaTeX, tables) in packages/rag/src/ingestion/chunker.ts
- [x] T051 [US3] Implement header-based section splitting in packages/rag/src/ingestion/chunker.ts
- [x] T052 [US3] Implement semantic chunking within sections (512-1024 token target) in packages/rag/src/ingestion/chunker.ts
- [x] T053 [US3] Create ContentAwareChunker class combining all chunking strategies in packages/rag/src/ingestion/chunker.ts
- [x] T054 [US3] Add token counting utility (supporting English and Chinese) in packages/rag/src/ingestion/chunker.ts

### Embedding and Storage

- [x] T055 [US3] Implement batch embedding with Qwen3Embedding in packages/rag/src/ingestion/embedder.ts
- [x] T056 [US3] Implement Milvus chunk insertion in packages/rag/src/ingestion/storage.ts
- [x] T057 [US3] Implement Neo4j Chunk node creation and relationships in packages/rag/src/ingestion/storage.ts

### Knowledge Graph Triple Extraction

- [x] T058 [US3] Implement LLM-based triple extraction prompts in packages/rag/src/ingestion/extractor.ts
- [x] T059 [US3] Create triple validation (valid predicates, confidence >= 0.5) in packages/rag/src/ingestion/extractor.ts
- [x] T060 [US3] Implement Neo4j triple storage (Concepts, relationships) in packages/rag/src/ingestion/extractor.ts

### Ingestion Pipeline

- [x] T061 [US3] Create IngestionPipeline class orchestrating chunk → embed → store → extract in packages/rag/src/ingestion/pipeline.ts
- [x] T062 [US3] Implement async job tracking with ingestionJobs table in packages/rag/src/ingestion/pipeline.ts
- [x] T063 [US3] Add document status state machine (pending → chunking → embedding → extracting → active/failed)

### API Endpoints

- [x] T064 [US3] Implement POST /api/ingest endpoint in apps/api/src/routes/ingest.ts
- [x] T065 [US3] Implement GET /api/ingest/{jobId}/status endpoint in apps/api/src/routes/ingest.ts
- [x] T066 [US3] Add document validation (URL format, supported formats: markdown, pdf, text)
- [x] T067 [US3] Add conflict detection for duplicate documents (409 response)

### Document Format Support

- [x] T068 [P] [US3] Implement Markdown document parser in packages/rag/src/ingestion/parsers/markdown.ts
- [x] T069 [P] [US3] Implement PDF document parser in packages/rag/src/ingestion/parsers/pdf.ts
- [x] T070 [P] [US3] Implement plain text document parser in packages/rag/src/ingestion/parsers/text.ts
- [x] T071 [US3] Create unified document parser factory in packages/rag/src/ingestion/parsers/index.ts

**Checkpoint**: User Story 3 complete - documents can be ingested with code/formula/table preservation

---

## Phase 6: User Story 4 - Retrieval Quality Feedback Loop (Priority: P3)

**Goal**: System tracks retrieval quality metrics for each query to enable continuous improvement

**Independent Test**: Run several queries and verify metrics are logged to PostgreSQL retrievalMetrics table

### Metrics Collection

- [x] T072 [US4] Implement detailed retrieval metrics collection in packages/rag/src/retrieval/metrics.ts
- [x] T073 [US4] Add timing instrumentation for vector search, graph traversal, fusion, reranking
- [x] T074 [US4] Track overlap count (results found by both retrievers)
- [x] T075 [US4] Calculate and log aggregated statistics (vectorTopScore, vectorAvgScore, etc.)

### Feedback Collection

- [x] T076 [US4] Implement POST /api/feedback endpoint in apps/api/src/routes/feedback.ts
- [x] T077 [US4] Add feedback validation (valid queryId, rating 1-5)
- [x] T078 [US4] Store feedback in feedbackEvents table linked to ragQueries

### Frontend Feedback UI

- [x] T079 [P] [US4] Create FeedbackWidget component in apps/web/src/app/components/FeedbackWidget.tsx
- [x] T080 [US4] Integrate FeedbackWidget into Q&A page after response is displayed

**Checkpoint**: User Story 4 complete - retrieval metrics are logged and feedback can be collected

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, edge cases, and quality improvements

### Error Handling

- [x] T081 Implement graceful error handling for LLM service unavailability in packages/rag/src/generation/llm.ts
- [x] T082 [P] Add error handling for malformed/corrupt documents in ingestion pipeline
- [x] T083 [P] Implement graceful degradation when graph returns empty but vector has results
- [x] T084 [P] Implement graceful degradation when vector returns empty but graph has results

### Edge Cases

- [x] T085 Handle extremely long documents exceeding context limits in packages/rag/src/ingestion/pipeline.ts
- [x] T086 Add request timeout handling (3 second first token target) in apps/api/src/routes/query.ts

### Performance & Concurrency

- [x] T087 Verify concurrent query handling (10-20 concurrent requests) in apps/api/
- [x] T088 Add request queue/throttling if needed for LLM endpoint

### Documentation

- [x] T089 Validate quickstart.md end-to-end (all steps work)
- [x] T090 Export RAG package types for apps/web type checking

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ← BLOCKS all user stories
    ↓
    ├── Phase 3 (US1: Q&A) ← MVP
    │       ↓
    ├── Phase 4 (US2: Uncertainty) ← Extends US1
    │       ↓
    ├── Phase 5 (US3: Ingestion) ← Independent of US1/US2
    │       ↓
    └── Phase 6 (US4: Metrics) ← Extends US1
            ↓
        Phase 7 (Polish)
```

### User Story Dependencies

| Story | Depends On | Notes |
|-------|------------|-------|
| US1 (Q&A) | Foundational | Core pipeline - can be tested with seed data |
| US2 (Uncertainty) | US1 | Extends US1 with confidence handling |
| US3 (Ingestion) | Foundational | Independent - provides data for US1 |
| US4 (Metrics) | US1 | Extends US1 with metrics logging |

### Parallel Opportunities

**Within Phase 2 (Foundational)**:
```
Parallel group 1: T006, T007, T008 (schema tables)
Parallel group 2: T011, T012, T013, T014 (type definitions)
Parallel group 3: T015, T016, T017 (LLM clients)
Parallel group 4: T020, T021 (API routes)
```

**Within Phase 3 (US1)**:
```
Parallel group 1: T023, T024 (retrievers)
Parallel group 2: T038, T039, T040 (frontend components)
```

**Within Phase 5 (US3)**:
```
Parallel group 1: T068, T069, T070 (document parsers)
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1 (Q&A)
4. Complete Phase 4: User Story 2 (Uncertainty handling)
5. **STOP and VALIDATE**: Test Q&A with sample questions
6. Deploy/demo MVP

### Full Feature Delivery

1. MVP (above)
2. Add Phase 5: User Story 3 (Ingestion) - enables self-service content upload
3. Add Phase 6: User Story 4 (Metrics) - enables quality monitoring
4. Complete Phase 7: Polish

### Parallel Team Strategy

With 2+ developers after Phase 2:
- **Developer A**: US1 → US2 (Q&A flow)
- **Developer B**: US3 (Ingestion) → can work in parallel

---

## Summary

| Phase | User Story | Priority | Tasks | Parallel Tasks |
|-------|-----------|----------|-------|----------------|
| 1 | Setup | - | 5 | 3 |
| 2 | Foundational | - | 17 | 11 |
| 3 | US1: Q&A | P1 | 19 | 6 |
| 4 | US2: Uncertainty | P1 | 8 | 0 |
| 5 | US3: Ingestion | P2 | 22 | 4 |
| 6 | US4: Metrics | P3 | 9 | 1 |
| 7 | Polish | - | 10 | 4 |
| **Total** | | | **90** | **29** |

**MVP Scope**: Phase 1 + 2 + 3 + 4 = **49 tasks** (User Stories 1 & 2)
