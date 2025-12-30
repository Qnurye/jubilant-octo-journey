# @jubilant/database

Unified database client library for the Jubilant RAG application. Provides connections to:

- **Milvus** - Vector similarity search
- **Neo4j** - Knowledge graph traversal
- **PostgreSQL** - Application data persistence (via Drizzle ORM)

## Installation

```bash
bun add @jubilant/database
```

## Prerequisites

Start the database infrastructure (from repository root):

```bash
# Development (with exposed ports for local access)
docker-compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.dev.yml up -d

# Production (no exposed ports, internal network only)
docker-compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.prod.yml up -d
```

## Configuration

Set the following environment variables (or use defaults for local development):

```bash
# Milvus
MILVUS_HOST="localhost"        # default: localhost
MILVUS_PORT="19530"            # default: 19530
MILVUS_USER=""                 # optional
MILVUS_PASSWORD=""             # optional

# Neo4j
NEO4J_URI="bolt://localhost:7687"  # default: bolt://localhost:7687
NEO4J_USER="neo4j"                  # default: neo4j
NEO4J_PASSWORD="password"           # required

# PostgreSQL
POSTGRES_HOST="localhost"      # default: localhost
POSTGRES_PORT="5432"           # default: 5432
POSTGRES_USER="postgres"       # default: postgres
POSTGRES_PASSWORD="password"   # required
POSTGRES_DB="jubilant_db"      # default: jubilant_db

# Environment
NODE_ENV="development"         # development | production | test
```

## Usage

### Basic Usage with Singleton

```typescript
import { db } from '@jubilant/database';

async function main() {
  // Connect to all databases
  await db.connect();

  // Check health
  const health = await db.healthCheck();
  console.log('All healthy:', health.healthy);

  // Use Milvus for vector search
  const searchResult = await db.milvus.search({
    collection_name: 'knowledge_chunks',
    vector: [0.1, 0.2, ...], // 1536-dim embedding
    limit: 5,
  });

  // Use Neo4j for graph queries
  const session = db.neo4j.session();
  try {
    const result = await session.run(
      'MATCH (c:Concept {name: $name})-[:RELATED_TO]->(related) RETURN related',
      { name: 'Machine Learning' }
    );
    console.log(result.records);
  } finally {
    await session.close();
  }

  // Use PostgreSQL with Drizzle
  const sessions = await db.postgres.query.analyticsSessions.findMany({
    limit: 10,
  });

  // Disconnect when done
  await db.disconnect();
}
```

### Custom Instance

```typescript
import { DatabaseManager } from '@jubilant/database';

const manager = new DatabaseManager();
await manager.connect();
// ... use manager.milvus, manager.neo4j, manager.postgres
await manager.disconnect();
```

### Schema Initialization

```typescript
import { db, initMilvusCollection, initGraphConstraints } from '@jubilant/database';

await db.connect();

// Initialize Milvus collection with HNSW index
await initMilvusCollection(db.milvus);

// Initialize Neo4j constraints
await initGraphConstraints(db.neo4j);
```

### Health Checks

```typescript
import { db } from '@jubilant/database';

await db.connect();

const health = await db.healthCheck();
// {
//   milvus: true,
//   neo4j: true,
//   postgres: true,
//   healthy: true
// }

if (!health.healthy) {
  console.error('Some databases are unhealthy:', health);
}
```

### Retry Logic

The library includes built-in exponential backoff for connection resilience:

```typescript
import { withRetry } from '@jubilant/database';

const result = await withRetry(
  () => someUnreliableOperation(),
  {
    maxRetries: 3,      // default: 3
    initialDelayMs: 1000, // default: 1000
    maxDelayMs: 30000,    // default: 30000
    factor: 2,            // default: 2
  }
);
```

## Schemas

### PostgreSQL (Drizzle)

```typescript
import { postgresSchema } from '@jubilant/database';

// Available tables:
// - analyticsSessions
// - ragQueries
// - feedbackEvents
```

### Milvus Collection

The `knowledge_chunks` collection schema:

| Field | Type | Description |
|-------|------|-------------|
| `chunk_id` | Int64 (PK) | Unique chunk identifier |
| `vector` | FloatVector[1536] | Embedding vector |
| `content_text` | VarChar | Text content |
| `metadata` | JSON | Source URL, page, author |
| `topic_tag` | VarChar | Topic for filtering |

### Neo4j Graph

Node labels:
- `Concept` - `{name, definition}`
- `Document` - `{url, title, last_updated}`
- `Chunk` - `{chunk_id, hash}`

Relationships:
- `(:Concept)-[:RELATED_TO]->(:Concept)`
- `(:Document)-[:CONTAINS]->(:Chunk)`
- `(:Chunk)-[:MENTIONS]->(:Concept)`

## Testing

```bash
# Run all tests (requires running databases and .env file)
bun --env-file=../../.env test

# Run unit tests only
bun --env-file=../../.env test tests/unit

# Run integration tests (requires running databases)
bun --env-file=../../.env test tests/integration
```

**Note**: Tests require Docker containers running and environment variables set. From the repository root:

```bash
# Start databases
docker compose -f infrastructure/docker-compose.yml up -d

# Run tests
cd packages/database && bun --env-file=../../.env test
```

## API Reference

### DatabaseManager

```typescript
class DatabaseManager {
  // Connect to all databases with retry logic
  connect(): Promise<void>;

  // Disconnect from all databases
  disconnect(): Promise<void>;

  // Check health of all databases
  healthCheck(): Promise<HealthStatus>;

  // Client accessors (throw if not connected)
  get milvus(): MilvusClient;
  get neo4j(): Driver;
  get postgres(): PostgresJsDatabase;

  // Connection status
  get isConnected(): boolean;
}
```

### HealthStatus

```typescript
interface HealthStatus {
  milvus: boolean;
  neo4j: boolean;
  postgres: boolean;
  healthy: boolean; // true only if all are healthy
}
```
