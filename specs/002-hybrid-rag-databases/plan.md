# Implementation Plan: Hybrid RAG Database Systems Setup

**Branch**: `002-hybrid-rag-databases` | **Date**: 2025-12-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-hybrid-rag-databases/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Set up the three database systems required for hybrid RAG and application data persistence: Milvus (vector database for semantic search), Neo4j (graph database for knowledge relationships), and PostgreSQL (relational database for application data). This feature delivers containerized infrastructure with Docker Compose, connection configuration, health checks, and base schema initialization.

## Technical Context

**Language/Version**: TypeScript (Bun runtime, per constitution)
**Primary Dependencies**: Docker, Docker Compose, Milvus 2.x, Neo4j 5.x, PostgreSQL 16
**Storage**: Milvus (vectors), Neo4j (graph), PostgreSQL (relational)
**Testing**: Vitest (connection tests, health check verification)
**Target Platform**: Local development (Docker), production-ready containers
**Project Type**: Infrastructure (database layer for web application)
**Performance Goals**: Connection <5s, vector query <500ms, graph query <500ms, SQL <100ms
**Constraints**: Development setup <5min, data persistence across restarts, exponential backoff retry (max 3, 30s cap)
**Scale/Scope**: 100K vectors, 10K graph nodes, classroom-scale users (10-20 concurrent)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Verification |
|-----------|--------|--------------|
| I. Hybrid RAG Architecture | ✅ PASS | Provides both Milvus (vector) and Neo4j (graph) as mandated for dual-retrieval |
| II. Anti-Hallucination First | ✅ PASS | Infrastructure enables evidence-based retrieval; no generation logic in scope |
| III. Dual-Interface Design | ✅ PASS | PostgreSQL schema designed for aggregated analytics only (no individual conversation storage) |
| IV. Content-Aware Processing | ✅ PASS | Vector collection metadata supports chunk_id and content_hash for semantic boundary tracking |
| V. Formative Assessment Priority | ✅ PASS | Analytics schema focuses on topic distribution, not individual student rankings |

**Technology Stack Compliance:**
- ✅ Milvus: Constitution-specified vector DB
- ✅ Neo4j: Constitution-specified graph DB
- ✅ PostgreSQL: Relational DB for application data (Drizzle ORM compatible)
- ✅ Bun/TypeScript: Constitution-specified runtime

**Gate Result: PASS** — Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/002-hybrid-rag-databases/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
infrastructure/
├── docker-compose.yml           # All three databases orchestration
├── docker-compose.dev.yml       # Development overrides (no auth)
├── docker-compose.prod.yml      # Production overrides (with auth)
├── milvus/
│   └── milvus.yaml              # Milvus configuration
├── neo4j/
│   └── neo4j.conf               # Neo4j configuration
└── postgres/
    └── init.sql                 # Initial schema for PostgreSQL

packages/database/
├── src/
│   ├── clients/
│   │   ├── milvus.ts            # Milvus client wrapper
│   │   ├── neo4j.ts             # Neo4j client wrapper
│   │   └── postgres.ts          # PostgreSQL client (Drizzle)
│   ├── config/
│   │   └── index.ts             # Environment-based configuration
│   ├── health/
│   │   └── index.ts             # Health check for all databases
│   ├── retry/
│   │   └── index.ts             # Exponential backoff retry logic
│   ├── schema/
│   │   └── postgres.ts          # Drizzle schema definitions
│   └── index.ts                 # Package exports
├── tests/
│   ├── integration/
│   │   ├── milvus.test.ts
│   │   ├── neo4j.test.ts
│   │   └── postgres.test.ts
│   └── unit/
│       ├── config.test.ts
│       ├── health.test.ts
│       └── retry.test.ts
├── package.json
└── tsconfig.json
```

**Structure Decision**: Infrastructure-focused monorepo package. Database configuration lives in `/infrastructure` for container orchestration. TypeScript client code lives in `/packages/database` as a shared package for backend consumption.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. All design choices align with constitution requirements.
