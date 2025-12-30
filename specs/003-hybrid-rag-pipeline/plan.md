# Implementation Plan: Hybrid Retrieval-Augmented Generation Pipeline

**Branch**: `003-hybrid-rag-pipeline` | **Date**: 2025-12-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-hybrid-rag-pipeline/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a hybrid RAG pipeline that combines vector similarity search (Milvus) with knowledge graph traversal (Neo4j) to answer student questions about ACM/ICPC and math modeling competitions. The system must:
- Execute parallel retrieval from both vector and graph databases
- Fuse results using Qwen3-Reranker-4B
- Generate grounded responses with citations using Qwen3-32B via LlamaIndex.TS
- Preserve code blocks, formulas, and tables during document ingestion
- Stream responses progressively and acknowledge uncertainty when evidence is insufficient

## Technical Context

**Language/Version**: TypeScript 5.x (Bun runtime)
**Primary Dependencies**: LlamaIndex.TS, Hono, Drizzle ORM, @zilliz/milvus2-sdk-node, neo4j-driver
**Storage**: Milvus (vector search), Neo4j (knowledge graph), PostgreSQL (application data/metrics)
**Testing**: Vitest (unit/integration tests)
**Target Platform**: Linux server / macOS (Bun runtime)
**Project Type**: Web application (monorepo with apps/api, apps/web, packages/*)
**Performance Goals**: First token latency < 3 seconds, 10-20 concurrent users
**Constraints**: 0.6 minimum reranker confidence threshold, 512-1024 token chunk size
**Scale/Scope**: Classroom scale (10-20 concurrent students), educational content corpus

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate Criteria | Status |
|-----------|---------------|--------|
| **I. Hybrid RAG Architecture** | All retrieval operations use both Milvus vector search AND Neo4j graph traversal in parallel with re-ranking fusion | ✅ PASS - FR-001 through FR-004 mandate parallel retrieval |
| **II. Anti-Hallucination First** | All responses grounded in retrieved evidence; citations required; uncertainty acknowledgment when confidence < 0.6 | ✅ PASS - FR-005 through FR-007 enforce this |
| **III. Dual-Interface Design** | Student Q&A separate from teacher analytics; no individual data exposure | ⚪ N/A - This feature is Q&A pipeline only |
| **IV. Content-Aware Processing** | Code blocks, formulas, tables preserved as atomic units; LLM-based triple extraction | ✅ PASS - FR-008 through FR-011 mandate this |
| **V. Formative Assessment Priority** | No leaderboards or individual rankings | ⚪ N/A - Analytics not in scope |
| **Technology Stack** | LlamaIndex.TS, Qwen3-32B, Qwen3-Embedding-8B, Qwen3-Reranker-4B | ✅ PASS - Specified in constitution |

**Gate Result**: ✅ PASS - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/003-hybrid-rag-pipeline/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── openapi.yaml     # RAG pipeline API specification
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/
├── api/                         # Hono backend (existing)
│   └── src/
│       ├── index.ts             # Main entry (existing, needs expansion)
│       ├── routes/
│       │   ├── query.ts         # Q&A endpoint (streaming SSE)
│       │   ├── ingest.ts        # Document ingestion endpoint
│       │   └── health.ts        # Health check endpoint
│       └── middleware/
│           └── metrics.ts       # Request timing/logging middleware
│
└── web/                         # Next.js frontend (existing)
    └── src/
        └── app/
            ├── page.tsx         # Landing/Q&A interface
            └── components/
                ├── QueryInput.tsx
                ├── ResponseStream.tsx
                └── CitationList.tsx

packages/
├── database/                    # Unified DB access (existing)
│   └── src/
│       ├── clients/             # Milvus, Neo4j, Postgres clients (existing)
│       └── schema/              # Schema definitions (existing)
│
├── rag/                         # NEW: RAG pipeline package
│   ├── src/
│   │   ├── index.ts             # Public API exports
│   │   ├── retrieval/
│   │   │   ├── vector.ts        # Milvus vector search (10 results)
│   │   │   ├── graph.ts         # Neo4j traversal (2 hops, 10 results)
│   │   │   └── hybrid.ts        # Parallel execution + fusion
│   │   ├── reranking/
│   │   │   └── reranker.ts      # Qwen3-Reranker-4B integration
│   │   ├── generation/
│   │   │   ├── llm.ts           # Qwen3-32B client
│   │   │   ├── prompts.ts       # Grounded response prompts
│   │   │   └── streaming.ts     # Token streaming utilities
│   │   ├── ingestion/
│   │   │   ├── chunker.ts       # Content-aware chunking (512-1024 tokens)
│   │   │   ├── embedder.ts      # Qwen3-Embedding-8B integration
│   │   │   └── extractor.ts     # LLM-based triple extraction
│   │   └── types.ts             # Shared types for RAG pipeline
│   └── tests/
│       ├── unit/
│       └── integration/
│
└── types/                       # Shared TypeScript types (existing)
    └── src/
        └── index.ts
```

**Structure Decision**: Monorepo structure (Option 2: Web application) using Bun workspaces. The RAG pipeline is implemented as a new `packages/rag` package that can be consumed by both `apps/api` (backend routes) and potentially `apps/web` (for type definitions). This keeps retrieval/generation logic separate from HTTP concerns while allowing the existing `packages/database` to remain focused on connection management.

## Complexity Tracking

> No constitution violations requiring justification. All gates passed.

---

## Post-Phase 1 Constitution Re-Check

*Re-evaluation after Phase 1 design artifacts are complete.*

| Principle | Design Artifact | Verification | Status |
|-----------|-----------------|--------------|--------|
| **I. Hybrid RAG Architecture** | `data-model.md` §4.1, `openapi.yaml` /query endpoint | `HybridRetriever` executes `Promise.all([vectorRetriever, graphRetriever])` with RRF fusion | ✅ COMPLIANT |
| **II. Anti-Hallucination First** | `data-model.md` §5.1 QueryContext, `openapi.yaml` QueryResponse | `hasInsufficientEvidence` flag when all scores < 0.6; citations required in response | ✅ COMPLIANT |
| **III. Dual-Interface Design** | N/A | Feature scope is Q&A pipeline only; no teacher interface implemented | ⚪ N/A |
| **IV. Content-Aware Processing** | `data-model.md` §3.1 ChunkMetadata, `research.md` §3 | `ContentAwareChunker` protects code/formula/table blocks before splitting | ✅ COMPLIANT |
| **V. Formative Assessment Priority** | N/A | No student rankings or leaderboards in design | ⚪ N/A |
| **Technology Stack** | `research.md` §5, `plan.md` Technical Context | LlamaIndex.TS with custom retrievers; Qwen3 models via OpenAI-compatible API | ✅ COMPLIANT |

**Post-Phase 1 Gate Result**: ✅ ALL GATES PASS - Ready for task generation (`/speckit.tasks`)
