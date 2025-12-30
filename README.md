# CompetitionTutor

A hybrid RAG intelligent Q&A system for academic competition preparation (ACM, math modeling). Uses vector search (Milvus) + knowledge graph (Neo4j) for retrieval-augmented generation with anti-hallucination guarantees.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Frontend | Next.js 16 + Tailwind + shadcn/ui + TanStack Query |
| Backend | Hono + Drizzle ORM |
| LLM | Qwen3-32B (local), Qwen3-Embedding-8B, Qwen3-Reranker-4B |
| RAG Framework | LlamaIndex.TS |
| Vector DB | Milvus |
| Graph DB | Neo4j |
| Relational DB | PostgreSQL |

## Project Structure

```
.
├── apps/
│   ├── web/                 # Next.js Frontend (@repo/web)
│   └── api/                 # Hono Backend (@repo/api)
├── packages/
│   ├── config/              # Shared Config (ESLint, Prettier, TS)
│   ├── database/            # Database clients (@jubilant/database)
│   ├── rag/                 # RAG pipeline (@jubilant/rag)
│   └── types/               # Shared Type Definitions (@repo/types)
├── infrastructure/          # Docker Compose for databases
└── specs/                   # Feature specifications
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- [Docker](https://docker.com) for databases

### Installation

```bash
git clone <repository-url>
cd jubilant-octo-journey
bun install
```

### Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

### Start Databases

```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

This starts:
- **Milvus** (port 19530) - Vector database
- **Neo4j** (ports 7474, 7687) - Graph database
- **PostgreSQL** (port 5432) - Application data

### Development

Start all applications:

```bash
bun dev
```

- **Web**: http://localhost:3000
- **API**: http://localhost:8080

### Testing

```bash
# Run all tests with environment variables
bun --env-file=.env test --recursive

# Run specific package tests
cd packages/rag && bun test           # 363 tests
cd packages/database && bun --env-file=../../.env test  # 37 tests
cd apps/api && bun test               # 23 tests
```

### Building

```bash
bun build
```

### Linting & Type Checking

```bash
bun lint
bun type-check
```

## Packages

### @jubilant/database

Unified database client for Milvus, Neo4j, and PostgreSQL.

```typescript
import { db } from '@jubilant/database';

await db.connect();
// db.milvus - Vector search
// db.neo4j - Graph queries
// db.postgres - Application data
```

### @jubilant/rag

Hybrid RAG pipeline with content-aware chunking and streaming responses.

```typescript
import { HybridRetriever, ContentAwareChunker } from '@jubilant/rag';

// Retrieval with RRF fusion
const retriever = new HybridRetriever(vectorClient, graphClient);
const results = await retriever.retrieve(query, { topK: 10 });

// Content-aware chunking (preserves code, formulas, tables)
const chunker = new ContentAwareChunker({ minTokens: 512, maxTokens: 1024 });
const chunks = chunker.chunk(document, metadata);
```

## Architecture

### Hybrid RAG Pipeline

1. **Query Processing** - Parse and embed user question
2. **Parallel Retrieval** - Vector search (Milvus) + Graph traversal (Neo4j)
3. **RRF Fusion** - Combine results using Reciprocal Rank Fusion
4. **Reranking** - Score with Qwen3-Reranker-4B
5. **Generation** - Stream response with citations using Qwen3-32B

### Content-Aware Ingestion

- Code blocks preserved as atomic units
- Mathematical formulas kept intact
- Tables not fragmented
- LLM-based triple extraction for knowledge graph

### Anti-Hallucination

- All responses grounded in retrieved evidence
- Citations link claims to source materials
- Uncertainty acknowledged when evidence insufficient (confidence < 0.6)

## Configuration

See `.env.example` for all configuration options:

- Database connections (Milvus, Neo4j, PostgreSQL)
- LLM endpoints (Qwen3-32B, embeddings, reranker)
- RAG parameters (chunk size, confidence threshold)

## License

MIT
