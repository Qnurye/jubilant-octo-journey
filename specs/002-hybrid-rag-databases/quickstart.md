# Quickstart: Hybrid RAG Database Systems

**Status**: Phase 1 Design
**Date**: 2025-12-22

## 1. Start Infrastructure

The database layer is containerized. Use the root-level Docker Compose file.

```bash
# From repository root
# Starts Milvus, Neo4j, and Postgres in background
docker compose -f infrastructure/docker-compose.yml up -d
```

### Verification
Check if services are running:
```bash
docker compose -f infrastructure/docker-compose.yml ps
```
You should see `milvus-standalone`, `neo4j`, and `postgres` in state `Up`.

## 2. Environment Setup

Ensure your `.env` file (or `apps/api/.env`) contains the required connection strings. Defaults for local development:

```bash
# Milvus
MILVUS_ADDRESS="localhost:19530"

# Neo4j
NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="password"

# Postgres
POSTGRES_URL="postgres://postgres:password@localhost:5432/jubilant_db"
```

## 3. Using the Client Library

The databases are accessed via the shared `@jubilant/database` package.

### Installation
(Already included in workspace, but if adding to a new app)
```bash
bun add @jubilant/database
```

### Basic Usage

```typescript
import { db } from "@jubilant/database";

async function main() {
  // 1. Connect (includes retry logic)
  await db.connect();

  // 2. Use Clients
  // Postgres (Drizzle)
  const users = await db.postgres.query.users.findMany();

  // Milvus
  const searchResults = await db.milvus.search({
    collection_name: "knowledge_chunks",
    vector: [0.1, 0.2, ...],
    limit: 5,
  });

  // Neo4j
  const session = db.neo4j.session();
  try {
    const result = await session.run("MATCH (n:Concept) RETURN n LIMIT 10");
    console.log(result.records);
  } finally {
    await session.close();
  }

  // 3. Cleanup
  await db.disconnect();
}

main();
```

## 4. Troubleshooting

- **Milvus fails to start**: Check if `etcd` and `minio` are healthy. Ensure Docker has enough memory (Milvus can be hungry).
- **Neo4j Auth Error**: If you changed the password in Docker, update `.env`. Delete the `neo4j/data` volume to reset if locked out locally.
- **Postgres Connection Refused**: Ensure port 5432 is not occupied by a local Postgres instance on your host machine.
