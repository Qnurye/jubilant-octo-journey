# Tasks: Hybrid RAG Database Systems Setup

**Branch**: `002-hybrid-rag-databases` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Implementation Strategy

This feature will be implemented in layers:
1.  **Infrastructure**: Docker Compose configuration for all three databases (Milvus, Neo4j, Postgres).
2.  **Foundation**: Shared `database` package setup with configuration and retry logic.
3.  **Vertical Integration**: For each database (User Stories 1-3), implement the client wrapper, schema definitions, and connection logic.
4.  **Unification**: Combine all clients into a single `DatabaseManager` (User Story 4) with unified health checks.

**MVP Scope**: A working `packages/database` library that can connect to all three locally running Docker containers and perform basic health checks.

## Phase 1: Setup

Goal: Initialize the monorepo package structure and container orchestration.

- [x] T001 Create database package directory structure and package.json in `packages/database/package.json`
- [x] T002 Create TypeScript configuration for the package in `packages/database/tsconfig.json`
- [x] T003 Create root infrastructure directory and empty config folders in `infrastructure/`

## Phase 2: Foundational

Goal: Establish shared utilities for configuration validation and connection resilience.

- [x] T004 Implement environment configuration with Zod validation in `packages/database/src/config/index.ts`
- [x] T005 Implement exponential backoff retry utility in `packages/database/src/retry/index.ts`
- [x] T006 [P] Create Docker Compose base configuration in `infrastructure/docker-compose.yml`
- [x] T007 [P] Create Docker Compose overrides for dev and prod in `infrastructure/docker-compose.dev.yml` and `infrastructure/docker-compose.prod.yml`

## Phase 3: User Story 1 - Vector Similarity Search (Milvus)

Goal: Enable semantic search capabilities via Milvus integration.
**Priority**: P1

- [x] T008 [US1] Create Milvus configuration file in `infrastructure/milvus/milvus.yaml`
- [x] T009 [US1] Implement Milvus client wrapper in `packages/database/src/clients/milvus.ts`
- [x] T010 [US1] Implement `initMilvusCollection` with `knowledge_chunks` schema in `packages/database/src/schema/milvus.ts`
- [x] T011 [US1] Create integration test for Milvus connection and vector insertion in `packages/database/tests/integration/milvus.test.ts`

## Phase 4: User Story 2 - Knowledge Graph Traversal (Neo4j)

Goal: Enable relationship-based retrieval via Neo4j integration.
**Priority**: P1

- [x] T012 [US2] Create Neo4j configuration file in `infrastructure/neo4j/neo4j.conf`
- [x] T013 [US2] Implement Neo4j client wrapper in `packages/database/src/clients/neo4j.ts`
- [x] T014 [US2] Implement `initGraphConstraints` for Concept/Document uniqueness in `packages/database/src/schema/neo4j.ts`
- [x] T015 [US2] Create integration test for Neo4j connection and query in `packages/database/tests/integration/neo4j.test.ts`

## Phase 5: User Story 3 - Application Data Persistence (Postgres)

Goal: Enable structured data persistence via PostgreSQL and Drizzle ORM.
**Priority**: P1

- [x] T016 [US3] Create initial SQL initialization script in `infrastructure/postgres/init.sql`
- [x] T017 [US3] Define Drizzle schema (sessions, queries, feedback) in `packages/database/src/schema/postgres.ts`
- [x] T018 [US3] Implement Postgres client with Drizzle in `packages/database/src/clients/postgres.ts`
- [x] T019 [US3] Configure Drizzle Kit in `packages/database/drizzle.config.ts`
- [x] T020 [US3] Create integration test for Postgres connection and CRUD in `packages/database/tests/integration/postgres.test.ts`

## Phase 6: User Story 4 - Unified Database Connectivity

Goal: Provide a single entry point for managing all database connections and health.
**Priority**: P2

- [ ] T021 [US4] Implement `DatabaseManager` class orchestrating all clients in `packages/database/src/index.ts`
- [ ] T022 [US4] Implement unified `healthCheck` logic in `packages/database/src/health/index.ts`
- [ ] T023 [US4] Create unit test for configuration validation in `packages/database/tests/unit/config.test.ts`
- [ ] T024 [US4] Create unit test for health check aggregation in `packages/database/tests/unit/health.test.ts`

## Phase 7: Polish

Goal: Finalize documentation and verify full system stability.

- [ ] T025 Create usage documentation and README in `packages/database/README.md`
- [ ] T026 Run full package test suite to ensure all integrations pass in `packages/database/`

## Dependencies

1. **Infrastructure** (Phase 1/2) must be ready before running integration tests in Phases 3, 4, 5.
2. **Retry Logic** (T005) is required by all client wrappers (T009, T013, T018).
3. **DatabaseManager** (Phase 6) depends on all individual client wrappers.

## Parallel Execution Opportunities

- **Phase 3 (Milvus)**, **Phase 4 (Neo4j)**, and **Phase 5 (Postgres)** are largely independent and can be implemented in parallel once Phase 2 is complete.
- **Docker Configuration** (T006, T007) can be done in parallel with **Code Foundation** (T004, T005).
