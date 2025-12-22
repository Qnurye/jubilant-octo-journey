# CompetitionTutor Roadmap

This roadmap outlines the development milestones for CompetitionTutor, a hybrid RAG intelligent Q&A system for academic competition preparation.

## Milestone Overview

| Milestone | Status | Priority | Description |
|-----------|--------|----------|-------------|
| M0: Foundation | **Complete** | P0 | Monorepo setup and tooling |
| M1: Database Infrastructure | Pending | P0 | Milvus + Neo4j + PostgreSQL setup |
| M2: RAG Pipeline Core | Pending | P0 | Hybrid retrieval implementation |
| M3: Student Q&A Interface | Pending | P0 | Chat UI with code/formula support |
| M4: Knowledge Base ETL | Pending | P1 | Content ingestion pipeline |
| M5: Teacher Dashboard | Pending | P1 | Analytics and visualization |
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

## M1: Database Infrastructure

**Goal**: Set up the three database systems required for hybrid RAG and application data.

### Deliverables
- [ ] Docker Compose configuration for local development
  - Milvus (vector database)
  - Neo4j (graph database)
  - PostgreSQL (application data)
- [ ] Database client packages
  - `packages/db` - Drizzle ORM setup for PostgreSQL
  - `packages/vector` - Milvus client wrapper
  - `packages/graph` - Neo4j client wrapper
- [ ] Database schema design
  - User accounts and sessions
  - Question/answer logs (anonymized)
  - Knowledge source metadata
- [ ] Seed scripts for development data

### Exit Criteria
- All three databases running via `docker compose up`
- Connection health checks pass
- Basic CRUD operations work from API

### Constitution Compliance
- P1 (Hybrid RAG): Both Milvus AND Neo4j must be configured
- P5 (Formative Assessment): No individual student performance tracking in schema

---

## M2: RAG Pipeline Core

**Goal**: Implement the hybrid retrieval-augmented generation pipeline.

### Deliverables
- [ ] LLM integration package (`packages/llm`)
  - Qwen3-32B inference client
  - Qwen3-Embedding-8B for embeddings
  - Qwen3-Reranker-4B for result ranking
- [ ] Retrieval pipeline (`packages/retrieval`)
  - Vector similarity search (Milvus)
  - Graph traversal queries (Neo4j)
  - Hybrid result merging strategy
  - Re-ranking with cross-encoder
- [ ] Generation pipeline
  - Context assembly from retrieval
  - Citation tracking
  - Streaming response support
- [ ] API endpoints
  - `POST /api/chat` - Main Q&A endpoint
  - `GET /api/chat/:id` - Retrieve conversation history

### Exit Criteria
- End-to-end question answering works
- Responses include source citations
- Both vector and graph results contribute to answers

### Constitution Compliance
- P1 (Hybrid RAG): Parallel retrieval from both stores
- P2 (Anti-Hallucination): All claims must have citations
- P4 (Content-Aware): Code blocks preserved in context

---

## M3: Student Q&A Interface

**Goal**: Build the student-facing chat interface with rich content support.

### Deliverables
- [ ] Chat UI components (`apps/web`)
  - Message list with streaming support
  - Input area with submit handling
  - Conversation history sidebar
- [ ] Code block features (FR-S-02)
  - Syntax highlighting (30+ languages)
  - Language selector dropdown
  - Copy-to-clipboard button
  - Line numbers toggle
- [ ] Content rendering
  - Markdown with GFM support
  - LaTeX formula rendering (KaTeX/MathJax)
  - Table formatting
- [ ] Citation display (FR-S-03)
  - Inline reference markers
  - Source panel with links
  - Confidence indicators
- [ ] Responsive design
  - Mobile-friendly layout
  - Dark/light theme support

### Exit Criteria
- Students can ask questions and receive answers
- Code blocks render with syntax highlighting
- Mathematical formulas display correctly
- Citations link to knowledge sources

### Constitution Compliance
- P3 (Dual Interface): Student interface ONLY shows Q&A, no analytics
- P4 (Content-Aware): Formulas and code render correctly

---

## M4: Knowledge Base ETL

**Goal**: Build the pipeline for ingesting and processing educational content.

### Deliverables
- [ ] Document ingestion service (`packages/etl`)
  - PDF extraction (text + structure)
  - Markdown parsing
  - Metadata extraction
- [ ] Content-aware chunking (FR-A-01)
  - Preserve code blocks intact
  - Keep formulas together
  - Maintain table structure
  - Respect section boundaries
- [ ] Triple extraction for knowledge graph
  - Entity recognition
  - Relationship extraction
  - Graph population
- [ ] Vector embedding pipeline
  - Chunk embedding generation
  - Milvus collection management
- [ ] Admin API endpoints
  - `POST /api/admin/ingest` - Upload documents
  - `GET /api/admin/sources` - List knowledge sources
  - `DELETE /api/admin/sources/:id` - Remove source

### Exit Criteria
- PDF and Markdown files successfully ingested
- Code blocks and formulas not fragmented
- Knowledge graph populated with entities/relations
- Vector store contains searchable embeddings

### Constitution Compliance
- P4 (Content-Aware): Code/formula/table integrity preserved
- P1 (Hybrid RAG): Both vector and graph stores populated

---

## M5: Teacher Dashboard

**Goal**: Provide instructors with aggregate insights into student learning gaps.

### Deliverables
- [ ] Analytics backend (`apps/api`)
  - Aggregate question analysis
  - Topic clustering
  - Trend calculation
- [ ] Dashboard UI (`apps/web/teacher`)
  - Protected route with role check
  - Dashboard layout with widget grid
- [ ] Misconception hotspots (FR-T-01)
  - Word cloud visualization
  - Bubble chart of topic frequency
  - Filter by time range
- [ ] Knowledge coverage heatmap (FR-T-02)
  - Topic distribution visualization
  - Gap identification highlighting
  - NO individual student data
- [ ] Question trends (FR-T-03)
  - Time-series charts
  - Topic trend analysis
  - Comparison across periods

### Exit Criteria
- Teachers see aggregate misconception data
- Visualizations update based on real question data
- No individual student identification possible

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
  - Unit test setup (Vitest)
  - Integration tests for RAG pipeline
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
M1 (Database Infrastructure)                          │
       │                                              │
       ├──────────────┬───────────────┐              │
       v              v               v              │
M2 (RAG Core)    M4 (ETL)       M5 (Dashboard)      │
       │              │               │              │
       v              │               │              │
M3 (Student UI) <─────┘               │              │
       │                              │              │
       └──────────────┬───────────────┘              │
                      v                              │
               M6 (Production) <─────────────────────┘
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM response quality | High | Implement retrieval quality metrics; tune reranker |
| Knowledge graph complexity | Medium | Start with simple triples; iterate based on retrieval quality |
| Performance at scale | Medium | Load test early; implement caching layer |
| Chinese content handling | Medium | Test embedding quality for Chinese; verify tokenization |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Answer accuracy | >90% grounded | Manual evaluation of 100 Q&A pairs |
| Response latency | <3s P95 | API monitoring |
| Citation coverage | 100% claims cited | Automated check in generation |
| Teacher dashboard privacy | 0 individual exposure | Audit log review |

---

## Next Steps

1. Create feature spec for M1 (Database Infrastructure) using `/speckit.specify`
2. Set up Docker Compose with Milvus, Neo4j, PostgreSQL
3. Implement database client packages
4. Begin M2 (RAG Pipeline) in parallel with M4 (ETL)
