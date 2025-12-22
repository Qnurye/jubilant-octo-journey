# Research: Hybrid RAG Database Systems

**Status**: Phase 0 Complete
**Date**: 2025-12-22
**Source**: `plan.md` Technical Context

## 1. Vector Database: Milvus

### Decision
Use **Milvus 2.x Standalone** mode via Docker Compose.

### Rationale
- **Simplicity**: Standalone mode avoids the complexity of managing a full cluster (Pulsar, multiple coordinators) while supporting all necessary vector search features.
- **Scale**: Sufficient for the target scale of 100K vectors (supports up to ~10M).
- **Constitution**: Explicitly mandated by the project constitution.

### Best Practices & Patterns
- **Docker Setup**:
  - Requires `etcd` and `minio` as dependencies.
  - Mount volumes for persistence: `milvus_data`, `etcd_data`, `minio_data`.
  - Expose port `19530` for gRPC and `9091` for management.
- **Client**:
  - Library: `@zilliz/milvus2-sdk-node`.
  - Connection: Implement singleton pattern to reuse the client instance.
  - Type Safety: Define schemas in TypeScript that mirror Milvus collections.
- **Indexing**:
  - Use `HNSW` index type for an optimal balance between search speed and recall accuracy.
  - Metric type: `COSINE` or `L2` depending on embedding model normalization (OpenAI typically uses Cosine/Inner Product).

### Alternatives Considered
- **Pinecone/Weaviate**: Ruled out by Constitution (mandates Milvus).
- **Milvus Embedded**: Python-only (Milvus Lite), not suitable for Node/Bun environment.
- **pgvector**: Simpler but lacks the advanced scaling and hybrid search capabilities of a dedicated Vector DB like Milvus.

## 2. Graph Database: Neo4j

### Decision
Use **Neo4j 5.x Community Edition** via Docker Compose.

### Rationale
- **Standard**: Industry standard for property graphs.
- **Compatibility**: Official drivers have excellent TypeScript support.
- **Constitution**: Explicitly mandated.

### Best Practices & Patterns
- **Docker Setup**:
  - Image: `neo4j:5-community` (or `neo4j:5` if Enterprise features aren't needed).
  - Environment: `NEO4J_AUTH=neo4j/password` (via env vars).
  - Ports: `7474` (HTTP/Browser), `7687` (Bolt).
  - Persistence: Mount `/data` volume.
- **Client**:
  - Library: `neo4j-driver`.
  - Session Management: Driver is thread-safe and long-lived; Sessions are lightweight and disposable. Create a session per request/operation.
  - Type Safety: Use generics with the driver if possible, or Zod for result validation.
- **Queries**:
  - Use parameterized Cypher queries to prevent injection and allow query plan caching.

### Alternatives Considered
- **Amazon Neptune / ArangoDB**: Ruled out by Constitution.

## 3. Relational Database: PostgreSQL

### Decision
Use **PostgreSQL 16** with **Drizzle ORM**.

### Rationale
- **Reliability**: Postgres is the bedrock of relational data.
- **ORM**: Drizzle is modern, type-safe, lightweight, and works seamlessly with Bun (unlike Prisma which can have binary compatibility issues or heavy cold starts).

### Best Practices & Patterns
- **Docker Setup**:
  - Image: `postgres:16-alpine` for minimal footprint.
  - Persistence: Mount `/var/lib/postgresql/data`.
  - Configuration: Use `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` env vars.
- **Schema Management**:
  - Use `drizzle-kit` for managing migrations (`up` workflow or `push` for prototyping).
  - Keep schema definition (`schema.ts`) in the shared `packages/database`.
- **Connection**:
  - Use `postgres` (js) or `pg` driver compatible with Drizzle.
  - Connection pooling: Configure `max` connections in the pool to prevent exhaustion.

### Alternatives Considered
- **Prisma**: Heavier, generates a binary client. Drizzle is preferred for its "close to SQL" philosophy and TypeScript performance.
- **TypeORM**: Older, decorator-based, less type inference support than Drizzle.

## 4. Orchestration & Shared Logic

### Decision
**Docker Compose** for infrastructure + **Monorepo Package** (`packages/database`) for client logic.

### Rationale
- **DX**: Docker Compose allows bringing up the entire stack with `docker compose up`.
- **Code Reuse**: Shared package prevents code duplication between API, workers, and CLI tools.

### Best Practices & Patterns
- **Health Checks**:
  - Implement a unified health check function in `packages/database` that pings all three services.
  - Docker Compose `healthcheck` definitions for services to ensure dependent services wait (using `service_healthy`).
- **Resilience**:
  - Implement **Exponential Backoff** for initial connections. Databases often take longer to start than the application code.
  - **Graceful Shutdown**: Handle `SIGTERM`/`SIGINT` to close database connections properly.
- **Configuration**:
  - Use **Zod** to validate environment variables (host, port, auth) at runtime startup. Fail fast if config is missing.
