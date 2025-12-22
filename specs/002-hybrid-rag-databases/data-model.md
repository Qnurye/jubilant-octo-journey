# Data Model: Hybrid RAG Databases

**Status**: Phase 1 Design
**Date**: 2025-12-22
**Source**: `research.md`

## 1. Relational Schema (PostgreSQL)

Managed via **Drizzle ORM**.

### Tables

#### `analytics_sessions`
Tracks active usage sessions for aggregated reporting.
- `id`: UUID (PK)
- `started_at`: Timestamp (default: now)
- `ended_at`: Timestamp (nullable)
- `user_hash`: Varchar (anonymized user identifier)

#### `rag_queries`
Logs performance and quality metrics for RAG retrieval operations.
- `id`: UUID (PK)
- `session_id`: UUID (FK -> analytics_sessions.id)
- `timestamp`: Timestamp
- `query_hash`: Varchar (anonymized)
- `execution_time_ms`: Integer
- `milvus_hits`: Integer
- `neo4j_hits`: Integer
- `strategy_used`: Enum ('vector_only', 'graph_only', 'hybrid')

#### `feedback_events`
Stores user feedback on retrieval quality (Thumbs Up/Down).
- `id`: UUID (PK)
- `query_id`: UUID (FK -> rag_queries.id)
- `rating`: Integer (1 = bad, 5 = good, or binary)
- `comment`: Text (optional)

## 2. Vector Schema (Milvus)

### Collection: `knowledge_chunks`

Designed for semantic retrieval of educational content.

| Field Name | Type | Params | Description |
|------------|------|--------|-------------|
| `chunk_id` | Int64 | Primary Key, AutoID: False | Unique ID for the chunk (derived from content hash or sequence) |
| `vector` | FloatVector | Dim: 1536 | Embedding vector (e.g., OpenAI text-embedding-3-small) |
| `content_text` | VarChar | Max: 65535 | The actual text content of the chunk |
| `metadata` | JSON | - | Flexible metadata: `{ source_url: string, page: number, author: string }` |
| `topic_tag` | VarChar | Max: 256 | High-level topic/subject for filtering |

**Indexes**:
- `vector`: HNSW (M=16, efConstruction=200) for fast ANN search.
- `topic_tag`: Scalar index for pre-filtering.

## 3. Graph Schema (Neo4j)

Designed for structural relationship retrieval and "concept hopping".

### Node Labels

- **`Concept`**
  - Properties: `name` (String, Unique), `definition` (String)
- **`Document`**
  - Properties: `url` (String, Unique), `title` (String), `last_updated` (DateTime)
- **`Chunk`**
  - Properties: `chunk_id` (Integer, correlates with Milvus), `hash` (String)

### Relationship Types

- **`(:Concept)-[:RELATED_TO {weight: Float}]->(:Concept)`**
  - Represents semantic closeness or prerequisite relationship between topics.
- **`(:Document)-[:CONTAINS]->(:Chunk)`**
  - Hierarchy: Document owns chunks.
- **`(:Chunk)-[:MENTIONS]->(:Concept)`**
  - Links specific content to abstract concepts.

## 4. Cross-System Integrity

- **Chunk Sync**: `knowledge_chunks.chunk_id` (Milvus) <=> `Chunk.chunk_id` (Neo4j).
- **Session Sync**: No direct link required; application layer handles correlation via `rag_queries` logging.
