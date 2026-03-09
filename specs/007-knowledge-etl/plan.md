# Implementation Plan: Knowledge Base ETL

**Branch**: `007-knowledge-etl` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-knowledge-etl/spec.md`

## Summary

Build the admin-facing knowledge base management experience on top of the existing ETL pipeline from M2. The core pipeline (parsing, chunking, embedding, triple extraction, storage) is complete. This milestone adds: file upload via multipart form data, source browsing/management, ingestion progress monitoring, duplicate detection, and knowledge base health overview. All admin functionality lives under `/admin` routes, separated from the student Q&A interface per Constitution Principle III.

## Technical Context

**Language/Version**: TypeScript 5.x (Bun runtime)
**Primary Dependencies**: Next.js 16 (frontend), Hono (backend), shadcn/ui (components), Drizzle ORM, TanStack Query (data fetching), `@jubilant/rag` (ETL pipeline)
**Storage**: PostgreSQL (documents, jobs), Milvus (vectors), Neo4j (graph)
**Testing**: Vitest (unit/integration)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Monorepo (apps/web, apps/api, packages/*)
**Performance Goals**: 5 min ingestion for 50-page documents, 2s source list load, 3s progress update latency
**Constraints**: 10MB max file size, 10 files max batch upload, existing parser interface (file path based)
**Scale/Scope**: ~100 documents, single admin user (no auth until M6)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Compliance | Notes |
|-----------|----------|------------|-------|
| I. Hybrid RAG | Yes | PASS | Existing pipeline stores in both Milvus AND Neo4j. No changes to retrieval path. |
| II. Anti-Hallucination | No | N/A | ETL ingests content; doesn't generate answers. |
| III. Dual Interface | Yes | PASS | Admin pages under `/admin` route, completely separate from student Q&A. |
| IV. Content-Aware Processing | Yes | PASS | Existing `ContentAwareChunker` preserves code blocks, formulas, tables. No changes needed. |
| V. Formative Assessment | No | N/A | No student analytics in admin ETL interface. |

**Gate result**: PASS — no violations.

**Post-design re-check**: PASS — all new API endpoints are under `/api/admin/`, admin UI under `/admin/`. No student data exposed.

## Project Structure

### Documentation (this feature)

```text
specs/007-knowledge-etl/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.yaml         # OpenAPI spec for admin endpoints
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (from /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── routes/
│   ├── admin.ts         # NEW: Admin route aggregator
│   └── ingest.ts        # EXISTING: Extended with admin endpoints
├── middleware/
│   └── ...              # Existing middleware
└── index.ts             # MODIFIED: Register admin routes

apps/web/src/app/
├── admin/               # NEW: Admin pages
│   ├── page.tsx         # Admin dashboard (upload + recent jobs)
│   ├── sources/
│   │   ├── page.tsx     # Source list with filters
│   │   └── [id]/
│   │       └── page.tsx # Source detail view
│   └── health/
│       └── page.tsx     # Knowledge base health overview
├── components/          # Existing student components
└── page.tsx             # Existing student Q&A

packages/database/       # NO CHANGES (schema already complete)
packages/rag/            # NO CHANGES (pipeline already complete)
```

**Structure Decision**: Extends existing monorepo structure. Admin routes use Next.js App Router file-based routing under `app/admin/`. API admin endpoints are grouped under `/api/admin/` prefix. No new packages needed — all admin logic is in the apps layer.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
