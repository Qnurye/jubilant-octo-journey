# Data Model: Hybrid RAG Pipeline

> **Date**: 2025-12-29
> **Feature**: 003-hybrid-rag-pipeline
> **Status**: Design Complete

---

## 1. Entity Overview

The Hybrid RAG Pipeline operates across three data stores, each optimized for its purpose:

| Store | Technology | Purpose | Key Entities |
|-------|------------|---------|--------------|
| **Vector Store** | Milvus | Semantic similarity search | Chunk embeddings |
| **Graph Store** | Neo4j | Relationship traversal | Concepts, Documents, Triples |
| **Relational Store** | PostgreSQL | Application data, metrics | Sessions, Queries, Feedback |

---

## 2. Milvus Schema (Vector Store)

### 2.1 Collection: `knowledge_chunks`

> **Existing**: Defined in `packages/database/src/schema/milvus.ts`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `chunk_id` | Int64 | Primary key, auto-generated | PK, NOT NULL |
| `vector` | FloatVector(1536) | Embedding from Qwen3-Embedding-8B | NOT NULL |
| `content_text` | VarChar(65535) | Raw chunk text content | NOT NULL |
| `metadata` | JSON | Source document info, page, author, etc. | NOT NULL |
| `topic_tag` | VarChar(256) | High-level topic for filtering | NULLABLE |

**Index Configuration**:
- **Vector Index**: HNSW (M=16, efConstruction=200, metric=COSINE)
- **Scalar Filter**: `topic_tag` for topic-based filtering

**Update for Embedding Dimension**:
The current schema uses `VECTOR_DIM = 1536`. Qwen3-Embedding-8B produces:
- **4096-dimensional** vectors by default
- Recommendation: Update `VECTOR_DIM` to 4096 or configure Qwen3-Embedding to output 1536 via Matryoshka representation learning (MRL)

### 2.2 Chunk Metadata Schema (JSON field)

```typescript
interface ChunkMetadata {
  // Source document
  documentId: string;           // UUID from PostgreSQL documents table
  documentUrl: string;          // Original source URL
  documentTitle: string;        // Document title

  // Position
  pageNumber?: number;          // For PDF documents
  sectionPath: string[];        // ["Chapter 1", "1.2 Algorithms"]
  chunkIndex: number;           // Position within document

  // Content characteristics
  hasCode: boolean;             // Contains code block
  hasFormula: boolean;          // Contains LaTeX formula
  hasTable: boolean;            // Contains table
  language: string;             // "en", "zh", etc.

  // Timestamps
  ingestedAt: string;           // ISO 8601 timestamp
  documentUpdatedAt?: string;   // Source document update time

  // Token info
  tokenCount: number;           // Actual token count (512-1024 target)
}
```

---

## 3. Neo4j Schema (Graph Store)

### 3.1 Node Labels

#### Concept
Represents a knowledge concept (algorithm, technique, theorem, etc.)

```cypher
(:Concept {
  name: String!,           // Unique name (e.g., "Dynamic Programming")
  aliases: String[],       // Alternative names
  description: String,     // Brief explanation
  category: String,        // "algorithm", "data-structure", "theorem", "technique"
  difficulty: String,      // "beginner", "intermediate", "advanced"
  tags: String[],          // ["dp", "optimization", "icpc"]
  createdAt: DateTime,
  updatedAt: DateTime
})
```

#### Document
Represents a source document in the knowledge base

```cypher
(:Document {
  url: String!,            // Unique identifier (file path or URL)
  title: String,
  format: String,          // "markdown", "pdf", "text"
  author: String,
  ingestedAt: DateTime,
  chunkCount: Integer,     // Number of chunks extracted
  status: String           // "active", "archived", "pending"
})
```

#### Chunk
Represents a document chunk (mirrors Milvus for graph traversal context)

```cypher
(:Chunk {
  chunk_id: Integer!,      // Same as Milvus chunk_id (cross-reference)
  hash: String!,           // Content hash for deduplication
  preview: String,         // First 200 chars for display
  tokenCount: Integer,
  hasCode: Boolean,
  hasFormula: Boolean,
  hasTable: Boolean
})
```

### 3.2 Relationships

```cypher
// Concept relationships
(:Concept)-[:PREREQUISITE]->(:Concept)     // A requires understanding B first
(:Concept)-[:RELATED_TO]->(:Concept)       // Related but not prerequisite
(:Concept)-[:COMPARED_TO {
  comparison: String,                       // "A is O(n) vs B is O(log n)"
  useCase: String                          // "Use A for small n, B for large n"
}]->(:Concept)
(:Concept)-[:PART_OF]->(:Concept)          // Subtopic/component relationship

// Document → Concept (mentions)
(:Document)-[:MENTIONS {
  frequency: Integer,                       // How many times concept appears
  relevance: Float                         // 0.0 - 1.0 relevance score
}]->(:Concept)

// Chunk relationships
(:Chunk)-[:FROM_DOCUMENT]->(:Document)     // Source document
(:Chunk)-[:DISCUSSES]->(:Concept)          // Concepts in this chunk
(:Chunk)-[:NEXT_CHUNK]->(:Chunk)           // Sequential ordering
(:Chunk)-[:CODE_EXAMPLE_FOR]->(:Concept)   // Chunk contains code for concept
(:Chunk)-[:FORMULA_FOR]->(:Concept)        // Chunk contains formula for concept
```

### 3.3 Constraints & Indexes

> **Existing**: Defined in `packages/database/src/schema/neo4j.ts`

```cypher
-- Uniqueness constraints (existing)
CREATE CONSTRAINT concept_name_unique IF NOT EXISTS
FOR (c:Concept) REQUIRE c.name IS UNIQUE;

CREATE CONSTRAINT document_url_unique IF NOT EXISTS
FOR (d:Document) REQUIRE d.url IS UNIQUE;

CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS
FOR (c:Chunk) REQUIRE c.chunk_id IS UNIQUE;

CREATE CONSTRAINT chunk_hash_unique IF NOT EXISTS
FOR (c:Chunk) REQUIRE c.hash IS UNIQUE;

-- Full-text indexes (new for this feature)
CREATE FULLTEXT INDEX conceptNameIndex IF NOT EXISTS
FOR (c:Concept) ON EACH [c.name, c.aliases, c.description];

CREATE FULLTEXT INDEX chunkPreviewIndex IF NOT EXISTS
FOR (c:Chunk) ON EACH [c.preview];
```

---

## 4. PostgreSQL Schema (Relational Store)

### 4.1 Existing Tables

> **Existing**: Defined in `packages/database/src/schema/postgres.ts`

#### analytics_sessions
```typescript
{
  id: uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at: timestamp NOT NULL DEFAULT now(),
  ended_at: timestamp,
  user_hash: text NOT NULL  // Anonymized user identifier
}
```

#### rag_queries
```typescript
{
  id: uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id: uuid REFERENCES analytics_sessions(id),
  timestamp: timestamp NOT NULL DEFAULT now(),
  query_hash: text,          // Anonymized query
  execution_time_ms: integer,
  milvus_hits: integer,
  neo4j_hits: integer,
  strategy_used: text        // 'vector_only', 'graph_only', 'hybrid'
}
```

#### feedback_events
```typescript
{
  id: uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_id: uuid REFERENCES rag_queries(id),
  rating: integer,           // 1-5 or binary 0/1
  comment: text,
  created_at: timestamp DEFAULT now()
}
```

### 4.2 New Tables for RAG Pipeline

#### documents (source document registry)
```typescript
import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  url: text('url').notNull().unique(),        // File path or URL
  title: text('title').notNull(),
  format: text('format').notNull(),           // 'markdown', 'pdf', 'text'
  author: text('author'),
  fileHash: text('file_hash'),                // For change detection
  fileSize: integer('file_size'),             // Bytes
  chunkCount: integer('chunk_count').default(0),
  status: text('status').default('pending'),  // 'pending', 'processing', 'active', 'failed'
  errorMessage: text('error_message'),        // If status = 'failed'
  metadata: jsonb('metadata'),                // Additional document metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  ingestedAt: timestamp('ingested_at'),       // When fully processed
});
```

#### ingestion_jobs (async job tracking)
```typescript
export const ingestionJobs = pgTable('ingestion_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id),
  status: text('status').default('queued'),   // 'queued', 'chunking', 'embedding', 'extracting', 'complete', 'failed'
  currentStep: text('current_step'),
  progress: integer('progress').default(0),   // 0-100 percentage
  totalChunks: integer('total_chunks'),
  processedChunks: integer('processed_chunks').default(0),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

#### retrieval_metrics (per-query detailed metrics)
```typescript
export const retrievalMetrics = pgTable('retrieval_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  queryId: uuid('query_id').references(() => ragQueries.id),

  // Vector retrieval metrics
  vectorSearchMs: integer('vector_search_ms'),
  vectorResultCount: integer('vector_result_count'),
  vectorTopScore: real('vector_top_score'),      // Best similarity score
  vectorAvgScore: real('vector_avg_score'),      // Average of top-10

  // Graph retrieval metrics
  graphTraversalMs: integer('graph_traversal_ms'),
  graphResultCount: integer('graph_result_count'),
  graphMaxDepth: integer('graph_max_depth'),     // Deepest traversal
  conceptsFound: integer('concepts_found'),      // Distinct concepts

  // Fusion metrics
  fusionMs: integer('fusion_ms'),
  overlapCount: integer('overlap_count'),        // Results in both vector & graph
  rrfTopScore: real('rrf_top_score'),

  // Reranking metrics
  rerankMs: integer('rerank_ms'),
  rerankTopScore: real('rerank_top_score'),
  confidenceThresholdMet: boolean('confidence_threshold_met'),  // >= 0.6

  // Final context
  finalContextTokens: integer('final_context_tokens'),
  citationCount: integer('citation_count'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

---

## 5. TypeScript Type Definitions

### 5.1 Core Pipeline Types

```typescript
// packages/rag/src/types.ts

/** A chunk with its embedding, ready for storage */
export interface EmbeddedChunk {
  id: string;                    // Generated UUID
  content: string;               // Raw text content
  embedding: number[];           // Qwen3-Embedding-8B vector
  metadata: ChunkMetadata;
}

/** Metadata attached to each chunk */
export interface ChunkMetadata {
  documentId: string;
  documentUrl: string;
  documentTitle: string;
  pageNumber?: number;
  sectionPath: string[];
  chunkIndex: number;
  hasCode: boolean;
  hasFormula: boolean;
  hasTable: boolean;
  language: string;
  ingestedAt: string;
  tokenCount: number;
}

/** A knowledge triple extracted from content */
export interface KnowledgeTriple {
  subject: string;               // Entity name
  predicate: string;             // Relationship type
  object: string;                // Target entity name
  confidence: number;            // Extraction confidence (0-1)
  sourceChunkId: string;         // Reference to source chunk
}

/** Retrieval result with score and source */
export interface RetrievalResult {
  chunkId: string;
  content: string;
  metadata: ChunkMetadata;
  score: number;                 // Similarity/relevance score
  source: 'vector' | 'graph';    // Which retriever found it
}

/** Fused result after RRF combination */
export interface FusedResult {
  chunkId: string;
  content: string;
  metadata: ChunkMetadata;
  rrfScore: number;              // Combined RRF score
  vectorRank?: number;           // Rank from vector search
  graphRank?: number;            // Rank from graph traversal
  inBothSources: boolean;        // Found by both retrievers
}

/** Reranked result with confidence */
export interface RankedResult {
  chunkId: string;
  content: string;
  metadata: ChunkMetadata;
  relevanceScore: number;        // From Qwen3-Reranker-4B
  isAboveThreshold: boolean;     // >= 0.6
}

/** Citation for response grounding */
export interface Citation {
  id: string;                    // Reference ID (e.g., "[1]")
  chunkId: string;
  documentTitle: string;
  documentUrl: string;
  snippet: string;               // Relevant excerpt
  relevanceScore: number;
}

/** Complete query context for generation */
export interface QueryContext {
  query: string;
  rankedResults: RankedResult[];
  citations: Citation[];
  hasInsufficientEvidence: boolean;  // All scores < 0.6
  totalTokens: number;           // Context window usage
}

/** Streaming response chunk */
export interface StreamChunk {
  type: 'token' | 'citation' | 'metadata' | 'done' | 'error';
  content?: string;              // For 'token' type
  citation?: Citation;           // For 'citation' type
  metadata?: ResponseMetadata;   // For 'metadata' type
  error?: string;                // For 'error' type
}

/** Response metadata for analytics */
export interface ResponseMetadata {
  queryId: string;
  totalTokens: number;
  citationCount: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  vectorResultCount: number;
  graphResultCount: number;
  latencyMs: number;
}
```

### 5.2 API Request/Response Types

```typescript
// Query endpoint
export interface QueryRequest {
  query: string;
  sessionId?: string;            // For conversation continuity
  topK?: number;                 // Max results (default: 5)
  includeGraph?: boolean;        // Include graph traversal (default: true)
  topicFilter?: string;          // Filter by topic_tag
}

export interface QueryResponse {
  queryId: string;
  answer: string;                // Generated response
  citations: Citation[];
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  metadata: ResponseMetadata;
}

// Streaming query (SSE)
export interface StreamQueryRequest extends QueryRequest {
  stream: true;
}
// Response is Server-Sent Events with StreamChunk payloads

// Ingestion endpoint
export interface IngestRequest {
  documentUrl: string;           // URL or file path
  title?: string;                // Override auto-detected title
  format?: 'markdown' | 'pdf' | 'text';
  metadata?: Record<string, unknown>;
}

export interface IngestResponse {
  jobId: string;
  documentId: string;
  status: 'queued';
  estimatedChunks?: number;
}

// Ingestion status
export interface IngestStatusResponse {
  jobId: string;
  documentId: string;
  status: 'queued' | 'chunking' | 'embedding' | 'extracting' | 'complete' | 'failed';
  progress: number;              // 0-100
  totalChunks?: number;
  processedChunks?: number;
  errorMessage?: string;
}

// Feedback endpoint
export interface FeedbackRequest {
  queryId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}
```

---

## 6. State Transitions

### 6.1 Document Ingestion States

```
┌────────┐    upload    ┌───────────┐   start    ┌───────────┐
│ (none) │ ──────────▶ │  pending  │ ─────────▶ │ chunking  │
└────────┘              └───────────┘            └───────────┘
                              │                       │
                              │ error                 │ success
                              ▼                       ▼
                        ┌───────────┐          ┌───────────┐
                        │  failed   │          │ embedding │
                        └───────────┘          └───────────┘
                              ▲                       │
                              │ error                 │ success
                              │                       ▼
                              │                ┌────────────┐
                              └──────────────  │ extracting │
                                               └────────────┘
                                                     │ success
                                                     ▼
                                               ┌───────────┐
                                               │  active   │
                                               └───────────┘
```

### 6.2 Query Processing Pipeline

```
Query Input
     │
     ▼
┌──────────────────────────────────────┐
│ 1. Embedding                         │ ─ Qwen3-Embedding-8B
└──────────────────────────────────────┘
     │
     ├───────────────┬───────────────┐
     ▼               ▼               │
┌─────────┐   ┌──────────────┐       │
│ Milvus  │   │    Neo4j     │       │  Parallel
│ Search  │   │  Traversal   │       │
└─────────┘   └──────────────┘       │
     │               │               │
     └───────┬───────┘               │
             ▼                       │
     ┌───────────────┐               │
     │  RRF Fusion   │ ◀─────────────┘
     └───────────────┘
             │
             ▼
     ┌───────────────┐
     │   Reranking   │ ─ Qwen3-Reranker-4B
     └───────────────┘
             │
             ▼
     ┌───────────────┐
     │ Threshold?    │ ─ Check if max score >= 0.6
     └───────────────┘
        │         │
    >= 0.6     < 0.6
        │         │
        ▼         ▼
   ┌────────┐  ┌──────────────────┐
   │Generate│  │ Acknowledge      │
   │Response│  │ Insufficient     │
   └────────┘  │ Evidence         │
        │      └──────────────────┘
        ▼
   ┌────────┐
   │ Stream │ ─ SSE with tokens + citations
   └────────┘
```

---

## 7. Validation Rules

### 7.1 Chunk Validation

| Rule | Constraint | Error Message |
|------|-----------|---------------|
| Non-empty content | `content.length > 0` | "Chunk content cannot be empty" |
| Token limit | `tokenCount >= 100 && tokenCount <= 2000` | "Chunk must be 100-2000 tokens" |
| Valid embedding | `embedding.length === 4096` | "Embedding must be 4096 dimensions" |
| Document exists | `documentId EXISTS` | "Document not found" |

### 7.2 Query Validation

| Rule | Constraint | Error Message |
|------|-----------|---------------|
| Non-empty query | `query.trim().length > 0` | "Query cannot be empty" |
| Query length | `query.length <= 2000` | "Query exceeds maximum length" |
| Valid topK | `topK >= 1 && topK <= 20` | "topK must be between 1 and 20" |

### 7.3 Triple Extraction Validation

| Rule | Constraint | Error Message |
|------|-----------|---------------|
| Valid subject | `subject.length > 0` | "Subject cannot be empty" |
| Valid predicate | `predicate IN valid_predicates` | "Invalid predicate type" |
| Valid object | `object.length > 0` | "Object cannot be empty" |
| Confidence threshold | `confidence >= 0.5` | "Triple confidence too low" |

**Valid Predicates**:
- `PREREQUISITE` - Concept A requires Concept B
- `RELATED_TO` - General relationship
- `COMPARED_TO` - Comparison between concepts
- `PART_OF` - Hierarchy/composition
- `USES` - Algorithm uses technique/data structure
- `IMPLEMENTS` - Code implements algorithm
- `EXAMPLE_OF` - Instance/example relationship

---

## 8. Cross-Store Consistency

### 8.1 Chunk ID Synchronization

Chunk IDs must be consistent across Milvus and Neo4j:

1. **Generation**: UUIDs generated in application code, not by database
2. **Storage Order**:
   - First: PostgreSQL documents table (get document ID)
   - Second: Milvus (insert vectors with chunk_id)
   - Third: Neo4j (create Chunk nodes with same chunk_id)
3. **Deletion**: When deleting a document:
   - Delete from Milvus first (vector index)
   - Delete Chunk nodes from Neo4j
   - Update PostgreSQL document status to 'archived'

### 8.2 Transaction Boundaries

```typescript
async function ingestDocument(doc: IngestRequest): Promise<void> {
  // Phase 1: PostgreSQL (document registration)
  const documentId = await db.postgres
    .insert(documents)
    .values({ url: doc.documentUrl, status: 'processing' })
    .returning({ id: documents.id });

  try {
    // Phase 2: Chunking (in-memory)
    const chunks = await chunker.process(doc);

    // Phase 3: Embedding (batched API calls)
    const embeddings = await embedder.batchEmbed(chunks);

    // Phase 4: Milvus insertion (transactional within Milvus)
    await db.milvus.insert({
      collection_name: COLLECTION_NAME,
      data: embeddings.map(e => ({
        chunk_id: e.id,
        vector: e.embedding,
        content_text: e.content,
        metadata: e.metadata,
      })),
    });

    // Phase 5: Neo4j (graph updates)
    await graphIngester.ingestChunks(chunks, documentId);

    // Phase 6: PostgreSQL (completion)
    await db.postgres
      .update(documents)
      .set({ status: 'active', chunkCount: chunks.length })
      .where(eq(documents.id, documentId));

  } catch (error) {
    // Rollback: Mark document as failed (Milvus/Neo4j cleanup async)
    await db.postgres
      .update(documents)
      .set({ status: 'failed', errorMessage: error.message })
      .where(eq(documents.id, documentId));

    throw error;
  }
}
```

---

## 9. Migration Notes

### 9.1 Milvus Collection Update

If changing `VECTOR_DIM` from 1536 to 4096:

```typescript
// Option 1: Drop and recreate (if no existing data)
await client.dropCollection({ collection_name: COLLECTION_NAME });
// Then run initMilvusCollection() with new VECTOR_DIM

// Option 2: Create new collection with version suffix
const NEW_COLLECTION = 'knowledge_chunks_v2';
// Migrate data from old to new, then alias swap
```

### 9.2 PostgreSQL Migrations

New tables required for this feature:
1. `documents` - Source document registry
2. `ingestion_jobs` - Async job tracking
3. `retrieval_metrics` - Detailed query metrics

Generate migrations:
```bash
cd packages/database
bun run generate  # Creates migration SQL
bun run migrate   # Applies migrations
```

### 9.3 Neo4j Index Creation

Run once on deployment:
```cypher
CREATE FULLTEXT INDEX conceptNameIndex IF NOT EXISTS
FOR (c:Concept) ON EACH [c.name, c.aliases, c.description];

CREATE FULLTEXT INDEX chunkPreviewIndex IF NOT EXISTS
FOR (c:Chunk) ON EACH [c.preview];
```
