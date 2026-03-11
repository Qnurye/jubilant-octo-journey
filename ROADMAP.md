# CompetitionTutor Roadmap

This roadmap outlines the development milestones for CompetitionTutor, a hybrid RAG intelligent Q&A system for academic competition preparation.

## Milestone Overview

| Milestone | Status | Priority | Description |
|-----------|--------|----------|-------------|
| M0: Foundation | **Complete** | P0 | Monorepo setup and tooling |
| M1: Database Infrastructure | **Complete** | P0 | Milvus + Neo4j + PostgreSQL setup |
| M2: RAG Pipeline Core | **Complete** | P0 | Hybrid retrieval implementation |
| M3: Student Q&A Interface | **Complete** | P0 | Chat UI with code/formula support |
| M4: Knowledge Base ETL | **Complete** | P1 | Content ingestion pipeline + admin tools |
| M5: Teacher Dashboard | **Complete** | P1 | Analytics and visualization |
| M6: Production Readiness | Pending | P2 | CI/CD, monitoring, deployment |

---

## M0: Foundation (Complete)

**Goal**: Establish monorepo infrastructure and development environment.

### Deliverables
- [x] Bun monorepo with workspace configuration
- [x] Shared TypeScript configuration
- [x] Shared ESLint + Prettier configuration
- [x] Next.js 14 frontend skeleton (`apps/web`)
- [x] Hono API backend skeleton (`apps/api`)
- [x] Shared types package (`@repo/types`)
- [x] Development scripts (`dev`, `build`, `lint`, `type-check`)

### Exit Criteria
- All packages build successfully
- `bun dev` starts both apps concurrently
- Type sharing works across workspaces

---

## M1: Database Infrastructure (Complete)

**Goal**: Set up the three database systems required for hybrid RAG and application data.

### Deliverables
- [x] Docker Compose configuration for local development
  - Milvus (vector database)
  - Neo4j (graph database)
  - PostgreSQL (application data)
- [x] Unified database client package (`@jubilant/database`)
  - Milvus client wrapper with HNSW indexing
  - Neo4j client wrapper with constraint initialization
  - PostgreSQL via Drizzle ORM
- [x] Database schema design
  - `knowledge_chunks` collection (Milvus)
  - Concept/Document/Chunk nodes (Neo4j)
  - Analytics tables (PostgreSQL)
- [x] Health check and retry logic
- [x] Integration tests (37 tests passing)

### Exit Criteria
- All three databases running via `docker compose up`
- Connection health checks pass
- Basic CRUD operations work from API

### Constitution Compliance
- P1 (Hybrid RAG): Both Milvus AND Neo4j configured
- P5 (Formative Assessment): No individual student performance tracking in schema

---

## M2: RAG Pipeline Core (Complete)

**Goal**: Implement the hybrid retrieval-augmented generation pipeline.

### Deliverables
- [x] RAG pipeline package (`@jubilant/rag`)
  - Vector similarity search (Milvus integration)
  - Graph traversal queries (Neo4j integration)
  - Reciprocal Rank Fusion (RRF) for result merging
  - Qwen3-Reranker-4B integration
- [x] Content-aware chunking
  - Code block preservation (FR-008)
  - Formula preservation (FR-009)
  - Table preservation (FR-010)
  - 512-1024 token targeting (FR-015)
- [x] Generation pipeline
  - Citation tracking and formatting (FR-006)
  - Confidence thresholds (0.6 for insufficient evidence) (FR-007)
  - SSE streaming support (FR-016)
  - Error handling with user-friendly messages (FR-014)
- [x] LLM-based triple extraction (FR-011)
- [x] Document parsers (Markdown, PDF, text) (FR-012)
- [x] API endpoints with throttling (10-20 concurrent) (SC-005)
- [x] Comprehensive test suite (363 tests passing)

### Exit Criteria
- End-to-end question answering works
- Responses include source citations
- Both vector and graph results contribute to answers
- All 16 functional requirements validated

### Constitution Compliance
- P1 (Hybrid RAG): Parallel retrieval from both stores
- P2 (Anti-Hallucination): All claims must have citations
- P4 (Content-Aware): Code blocks preserved in context

---

## M3: Student Q&A Interface (Complete)

**Goal**: Build the student-facing chat interface with rich content support.

### Deliverables
- [x] Chat UI components (`apps/web`)
  - Message list with SSE streaming support
  - Input area with submit handling
  - Conversation history sidebar with create/delete
  - Multi-turn conversation support
- [x] Code block features (FR-S-02)
  - Syntax highlighting (30+ languages)
  - Copy-to-clipboard button
- [x] Content rendering
  - Markdown with GFM support
  - LaTeX formula rendering (KaTeX)
  - Table formatting
- [x] Citation display (FR-S-03)
  - Inline reference markers
  - Citation list component
  - Confidence indicators
- [x] Responsive design
  - Mobile-friendly layout
  - shadcn/ui component library
- [x] Feedback widget for answer quality

### Exit Criteria
- ~~Students can ask questions and receive answers~~ **Done**
- ~~Code blocks render with syntax highlighting~~ **Done**
- ~~Mathematical formulas display correctly~~ **Done**
- ~~Citations link to knowledge sources~~ **Done**

### Constitution Compliance
- P3 (Dual Interface): Student interface ONLY shows Q&A, no analytics
- P4 (Content-Aware): Formulas and code render correctly

---

## M4: Knowledge Base ETL (Complete)

**Goal**: Build the pipeline for ingesting and processing educational content.

### Deliverables
- [x] Document ingestion service (extends `@jubilant/rag`)
  - Markdown parsing with metadata extraction
  - PDF extraction (text + structure)
  - Content-aware processing pipeline
- [x] Content-aware chunking (FR-A-01)
  - Preserve code blocks intact
  - Keep formulas together
  - Maintain table structure
  - Respect section boundaries
- [x] Triple extraction for knowledge graph
  - LLM-based entity/relationship extraction (7 predicate types)
  - DISCUSSES relationship derivation (Chunk→Concept)
  - Batch Neo4j graph population with APOC fallback
- [x] Vector embedding pipeline
  - Multi-provider support: OpenAI-compatible (Ollama/Qwen3) + Vertex AI native
  - Configurable dimensions via `EMBEDDING_DIMENSIONS` env var
  - Parallel Milvus + Neo4j storage via `Promise.allSettled`
- [x] Admin API endpoints
  - `POST /api/admin/upload` - Upload documents
  - `GET /api/admin/sources` - List knowledge sources
  - `GET /api/admin/jobs` - ETL job tracking
  - `GET /api/admin/chunks` - Browse chunks with search/filter
  - `GET /api/admin/graph` - Knowledge graph data
  - `GET /api/admin/health` - System health check
  - `DELETE /api/admin/sources/:id` - Remove source
- [x] Admin dashboard UI
  - ETL management page (upload, job status, source list)
  - Chunks index page (search, filter by document/concept, pagination)
  - Knowledge graph visualization (force-directed SVG, hover tooltips, click-to-navigate)
  - Navigation breadcrumbs and active filter badges
- [x] Multi-provider LLM/embedding support
  - Vertex AI (Gemini 2.5 Flash LLM + text-multilingual-embedding-002)
  - OpenAI-compatible (Ollama/Qwen3 local models)
  - Configurable reranker (enable/disable, multiple providers)
  - Google Cloud ADC authentication

### Exit Criteria
- ~~PDF and Markdown files successfully ingested~~ **Done**
- ~~Code blocks and formulas not fragmented~~ **Done**
- ~~Knowledge graph populated with entities/relations~~ **Done**
- ~~Vector store contains searchable embeddings~~ **Done**

### Constitution Compliance
- P4 (Content-Aware): Code/formula/table integrity preserved
- P1 (Hybrid RAG): Both vector and graph stores populated

---

## M5: Teacher Dashboard (Complete)

**Goal**: Provide instructors with aggregate insights into student learning gaps.

### Deliverables
- [x] Analytics backend (`apps/api`)
  - Aggregate question analysis
  - Topic clustering
  - Trend calculation
- [x] Dashboard UI (`apps/web/teacher`)
  - Teacher layout with navigation (overview, hotspots, coverage, trends)
  - Dashboard overview with stat cards (queries, confidence, response time, feedback)
- [x] Misconception hotspots (FR-T-01)
  - Bubble chart of topic frequency vs confidence
  - Topic list with query count and confidence badges
  - Filter by time range (7d/30d/90d)
  - Topic detail panel (related concepts, trend chart, feedback rating)
- [x] Knowledge coverage heatmap (FR-T-02)
  - Coverage heatmap grid with gap indicators (well-covered/low-coverage/no-data)
  - Summary stats (total concepts, total chunks, coverage distribution)
  - NO individual student data
- [x] Question trends (FR-T-03)
  - Time-series area charts (Recharts)
  - Day/week granularity toggle
  - Topic filtering
  - Period comparison mode
- [x] Full Chinese localization (all UI text)

### Exit Criteria
- ~~Teachers see aggregate misconception data~~ **Done**
- ~~Visualizations update based on real question data~~ **Done**
- ~~No individual student identification possible~~ **Done**

### Constitution Compliance
- P3 (Dual Interface): Strict separation from student interface
- P5 (Formative Assessment): Aggregate data ONLY, no rankings

---

## M6: Production Readiness

**Goal**: Prepare the application for production deployment.

### Deliverables
- [ ] CI/CD pipeline
  - GitHub Actions workflows
  - Automated testing on PR
  - Build verification
- [ ] Testing infrastructure
  - Unit test setup (Vitest) - **Done: 490+ tests**
  - Integration tests for RAG pipeline - **Done**
  - E2E tests for critical paths (Playwright)
- [ ] Containerization
  - Dockerfile for API
  - Dockerfile for Web
  - Production Docker Compose
- [ ] Monitoring and observability
  - Structured logging
  - Health check endpoints
  - Error tracking integration
- [ ] Documentation
  - API documentation (OpenAPI)
  - Deployment guide
  - Operations runbook

### Exit Criteria
- All tests pass in CI
- Applications deploy via containers
- Monitoring dashboards operational
- Documentation complete for handoff

---

## Feature Dependency Graph

```
M0 (Foundation) ─────────────────────────────────────┐
       │                                              │
       v                                              │
M1 (Database Infrastructure) ✓                        │
       │                                              │
       ├──────────────┬───────────────┐              │
       v              v               v              │
M2 (RAG Core) ✓   M4 (ETL) ✓     M5 (Dashboard) ✓     │
       │              │               │              │
       v              │               │              │
M3 (Student UI) ✓ <───┘               │              │
       │                              │              │
       └──────────────┬───────────────┘              │
                      v                              │
               M6 (Production) <─────────────────────┘
```

---

## Risk Mitigation

| Risk | Impact | Mitigation | Status |
|------|--------|------------|--------|
| LLM response quality | High | Implement retrieval quality metrics; tune reranker | Reranker configurable; Vertex AI supported |
| Knowledge graph complexity | Medium | Start with simple triples; iterate based on retrieval quality | 7 predicate types working |
| Performance at scale | Medium | Load test early; implement caching layer | Parallel storage; configurable timeouts |
| Chinese content handling | Medium | Test embedding quality for Chinese; verify tokenization | Multilingual embedding model deployed |
| Cloud API cost/latency | Medium | Configurable providers; local fallback available | Multi-provider architecture in place |

---

## Success Metrics

| Metric | Target | Current Status |
|--------|--------|----------------|
| Answer accuracy | >90% grounded | Ready for validation |
| Response latency | <3s P95 | Streaming implemented |
| Citation coverage | 100% claims cited | Implemented |
| Teacher dashboard privacy | 0 individual exposure | Implemented — aggregate only |
| Test coverage | >400 tests | **490+ tests passing** |

---

## Next Steps

1. ~~Create feature spec for M1 (Database Infrastructure)~~ **Complete**
2. ~~Set up Docker Compose with Milvus, Neo4j, PostgreSQL~~ **Complete**
3. ~~Implement database client packages~~ **Complete**
4. ~~Implement M2 (RAG Pipeline)~~ **Complete**
5. ~~Implement M3 (Student Q&A Interface)~~ **Complete**
6. ~~Implement M4 (Knowledge Base ETL)~~ **Complete**
7. ~~Implement M5 (Teacher Dashboard)~~ **Complete**
8. Begin M6 (Production Readiness) — CI/CD, containerization, monitoring
