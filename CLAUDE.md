This file provides guidance to agents when working with code in this repository.

## Project Overview

CompetitionTutor: A hybrid RAG intelligent Q&A system for academic competition preparation (ACM, math modeling). Uses vector search (Milvus) + knowledge graph (Neo4j) for retrieval-augmented generation with anti-hallucination guarantees.

## Commands

```bash
# Install dependencies
bun install

# Development (starts all apps)
bun dev
# Web: http://localhost:3000 | API: http://localhost:8080

# Run specific workspace
bun run --filter '@repo/web' dev
bun run --filter '@repo/api' dev

# Build/lint/type-check all workspaces
bun build
bun lint
bun type-check

# Database package tests
cd packages/database && bun run test

# Start databases (Milvus, Neo4j, PostgreSQL)
docker compose -f infrastructure/docker-compose.yml up -d
```

## Architecture

### Monorepo Structure (Bun Workspaces)

- **apps/web** (`@repo/web`): Next.js 16 frontend with Tailwind CSS
- **apps/api** (`@repo/api`): Hono backend running on Bun
- **packages/database** (`@jubilant/database`): Unified database access layer
- **packages/types** (`@repo/types`): Shared TypeScript types
- **packages/config** (`@repo/config`): Shared ESLint/Prettier/TS configs

### Database Layer (`packages/database`)

`DatabaseManager` class provides unified access to all three databases:
- **Milvus**: Vector similarity search for semantic retrieval
- **Neo4j**: Knowledge graph for entity relationships (prerequisites, comparisons)
- **PostgreSQL**: Application data via Drizzle ORM

```typescript
import { db } from '@jubilant/database';
await db.connect();
// db.milvus, db.neo4j, db.postgres
```

### Constitution-Driven Development

`.specify/memory/constitution.md` defines binding architectural principles:
- **Hybrid RAG**: All retrieval MUST use both vector AND graph search in parallel
- **Anti-Hallucination**: All responses must cite source material; no fabricated content
- **Dual Interface**: Student Q&A and teacher analytics are strictly separated
- **Content-Aware Processing**: Code blocks, formulas, and tables must not be fragmented during chunking

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Frontend | Next.js + Tailwind + shadcn/ui + TanStack Query |
| Backend | Hono + Drizzle ORM |
| LLM | Qwen3-32B (local), Qwen3-Embedding-8B, Qwen3-Reranker-4B |
| RAG Framework | LlamaIndex.TS |
| Vector DB | Milvus |
| Graph DB | Neo4j |
| Relational DB | PostgreSQL |

## Speckit Workflow

This project uses speckit for feature development. Available skills:
- `/speckit.specify` - Create feature specs
- `/speckit.plan` - Generate implementation plans
- `/speckit.tasks` - Generate task lists
- `/speckit.implement` - Execute implementation
- `/speckit.clarify` - Identify underspecified areas
- `/speckit.analyze` - Cross-artifact consistency check

## Active Technologies
- TypeScript 5.x (Bun runtime) + LlamaIndex.TS, Hono, Drizzle ORM, @zilliz/milvus2-sdk-node, neo4j-driver (003-hybrid-rag-pipeline)
- Milvus (vector search), Neo4j (knowledge graph), PostgreSQL (application data/metrics) (003-hybrid-rag-pipeline)

## Recent Changes
- 003-hybrid-rag-pipeline: Added TypeScript 5.x (Bun runtime) + LlamaIndex.TS, Hono, Drizzle ORM, @zilliz/milvus2-sdk-node, neo4j-driver
