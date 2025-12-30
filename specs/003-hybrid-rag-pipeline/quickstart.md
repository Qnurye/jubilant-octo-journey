# Quickstart: Hybrid RAG Pipeline

> **Feature**: 003-hybrid-rag-pipeline
> **Date**: 2025-12-29

This guide walks through the minimal steps to run the Hybrid RAG Pipeline locally.

---

## Prerequisites

### Required Software

| Component | Version | Purpose |
|-----------|---------|---------|
| Bun | 1.0+ | Runtime |
| Docker | 24.0+ | Database containers |
| Docker Compose | 2.20+ | Multi-container orchestration |

### Hardware Requirements

For local development with local LLMs:
- **RAM**: 64GB+ (Qwen3-32B requires ~40GB for inference)
- **GPU**: NVIDIA GPU with 24GB+ VRAM (A100/H100 for production)
- **Storage**: 100GB+ for models and data

For development with remote LLM endpoints:
- **RAM**: 16GB
- **Storage**: 20GB

---

## 1. Start Infrastructure

```bash
# Start all databases (Milvus, Neo4j, PostgreSQL)
docker compose -f infrastructure/docker-compose.yml up -d

# Verify containers are running
docker compose -f infrastructure/docker-compose.yml ps
```

Expected output:
```
NAME                    STATUS
jubilant-etcd-1         Up (healthy)
jubilant-minio-1        Up (healthy)
jubilant-milvus-1       Up
jubilant-neo4j-1        Up
jubilant-postgres-1     Up
```

### Default Ports

| Service | Port | Credentials |
|---------|------|-------------|
| Milvus | 19530 | No auth (dev) |
| Neo4j | 7687 (Bolt), 7474 (HTTP) | neo4j/password |
| PostgreSQL | 5432 | postgres/password |

---

## 2. Start LLM Services

### Option A: Local vLLM (Recommended for Production)

```bash
# Terminal 1: Start Qwen3-32B LLM
vllm serve Qwen/Qwen3-32B \
  --port 8000 \
  --max-model-len 32768 \
  --tensor-parallel-size 2  # For multi-GPU

# Terminal 2: Start Qwen3-Embedding-8B
vllm serve Qwen/Qwen3-Embedding-8B \
  --port 8001 \
  --task embed

# Terminal 3: Start Qwen3-Reranker-4B
vllm serve Qwen/Qwen3-Reranker-4B \
  --port 8002 \
  --task rerank
```

### Option B: Ollama (Easier Setup)

```bash
# Pull models
ollama pull qwen3:32b
ollama pull qwen3-embedding:8b

# Start Ollama server (default port 11434)
ollama serve
```

### Option C: Remote Endpoints

Configure environment variables for remote LLM services:

```bash
# .env
LLM_BASE_URL=https://your-llm-endpoint.com/v1
LLM_API_KEY=your-api-key
EMBEDDING_BASE_URL=https://your-embedding-endpoint.com/v1
EMBEDDING_API_KEY=your-api-key
RERANKER_BASE_URL=https://your-reranker-endpoint.com/v1
RERANKER_API_KEY=your-api-key
```

---

## 3. Configure Environment

Create `.env` file in project root:

```bash
# Database connections
MILVUS_HOST=localhost
MILVUS_PORT=19530
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
POSTGRES_URL=postgres://postgres:password@localhost:5432/jubilant_db

# LLM endpoints (adjust based on your setup)
LLM_BASE_URL=http://localhost:8000/v1
LLM_MODEL=Qwen/Qwen3-32B
EMBEDDING_BASE_URL=http://localhost:8001/v1
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
RERANKER_BASE_URL=http://localhost:8002/v1
RERANKER_MODEL=Qwen/Qwen3-Reranker-4B

# RAG configuration
RAG_VECTOR_TOP_K=10
RAG_GRAPH_MAX_HOPS=2
RAG_RERANK_TOP_K=5
RAG_CONFIDENCE_THRESHOLD=0.6
RAG_CHUNK_SIZE=768
RAG_CHUNK_OVERLAP=64
```

---

## 4. Install Dependencies

```bash
# Install all workspace dependencies
bun install

# Install the new RAG package dependencies (after package creation)
cd packages/rag
bun install
```

---

## 5. Initialize Databases

```bash
# Run database migrations
cd packages/database

# PostgreSQL migrations
bun run migrate

# Initialize Milvus collection and Neo4j constraints
bun run -e "
import { db, initMilvusCollection, initGraphConstraints } from './src';
await db.connect();
await initMilvusCollection(db.milvus);
await initGraphConstraints(db.neo4j);
console.log('Database initialization complete');
"
```

---

## 6. Start Development Servers

```bash
# From project root - starts all apps
bun dev

# Or start individually:
# Terminal 1: API server (http://localhost:8080)
bun run --filter '@repo/api' dev

# Terminal 2: Web frontend (http://localhost:3000)
bun run --filter '@repo/web' dev
```

---

## 7. Verify Installation

### Health Check

```bash
curl http://localhost:8080/api/health | jq
```

Expected response:
```json
{
  "healthy": true,
  "components": {
    "milvus": { "healthy": true, "latencyMs": 5 },
    "neo4j": { "healthy": true, "latencyMs": 8 },
    "postgres": { "healthy": true, "latencyMs": 2 },
    "llm": { "healthy": true, "latencyMs": 150 },
    "embedding": { "healthy": true, "latencyMs": 50 },
    "reranker": { "healthy": true, "latencyMs": 30 }
  },
  "timestamp": "2025-12-29T10:00:00Z"
}
```

### Test Query (After Ingesting Content)

```bash
curl -X POST http://localhost:8080/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is dynamic programming?"}' | jq
```

---

## 8. Ingest Sample Documents

### Via API

```bash
# Ingest a markdown document
curl -X POST http://localhost:8080/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "documentUrl": "/path/to/dp-algorithms.md",
    "title": "Dynamic Programming Tutorial"
  }' | jq

# Check ingestion status
curl http://localhost:8080/api/ingest/{jobId}/status | jq
```

### Via Script (Bulk Ingestion)

```bash
# Create sample data directory
mkdir -p data/documents

# Add sample markdown files with competition content
# Then run bulk ingestion script (to be implemented)
bun run scripts/ingest-documents.ts data/documents/
```

---

## 9. Test Streaming Query

```bash
# Streaming query with curl
curl -N -X POST http://localhost:8080/api/query/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"query": "Explain the difference between BFS and DFS", "stream": true}'
```

Expected output (SSE format):
```
event: token
data: {"type": "token", "content": "BFS (Breadth-First Search) and DFS (Depth-First Search) are"}

event: token
data: {"type": "token", "content": " fundamental graph traversal algorithms"}

event: citation
data: {"type": "citation", "citation": {"id": "[1]", "documentTitle": "Graph Algorithms", ...}}

...

event: metadata
data: {"type": "metadata", "metadata": {"queryId": "...", "latencyMs": 1250, ...}}

event: done
data: {"type": "done"}
```

---

## 10. Run Tests

```bash
# Unit tests
cd packages/rag
bun run test

# Integration tests (requires running databases)
bun run test:integration

# All workspace tests
cd ../.. # back to root
bun test
```

---

## Common Issues

### Milvus Connection Failed

```
Error: Failed to connect to Milvus at localhost:19530
```

**Solution**: Ensure etcd and minio containers are healthy before Milvus:
```bash
docker compose -f infrastructure/docker-compose.yml logs milvus
docker compose -f infrastructure/docker-compose.yml restart milvus
```

### Neo4j Authentication Error

```
Error: Neo4j authentication failed
```

**Solution**: Reset Neo4j password:
```bash
docker compose -f infrastructure/docker-compose.yml exec neo4j \
  neo4j-admin dbms set-initial-password password
```

### LLM Endpoint Timeout

```
Error: LLM request timed out
```

**Solution**: Check vLLM/Ollama is running and model is loaded:
```bash
# For vLLM
curl http://localhost:8000/v1/models

# For Ollama
curl http://localhost:11434/api/tags
```

### Out of Memory (OOM)

If running local LLMs with insufficient VRAM:

**Solution**: Use quantized models or remote endpoints:
```bash
# Use 4-bit quantized model
vllm serve Qwen/Qwen3-32B-AWQ --quantization awq

# Or use remote API
export LLM_BASE_URL=https://api.together.xyz/v1
export LLM_API_KEY=your-key
```

---

## Next Steps

1. **Ingest your knowledge base**: Add ACM/ICPC and math modeling materials
2. **Configure topic filters**: Tag content by topic for filtered retrieval
3. **Set up analytics**: Review PostgreSQL retrieval metrics
4. **Tune parameters**: Adjust chunk size, top-k, and confidence threshold
5. **Deploy to production**: See deployment documentation

---

## Architecture Diagram

```
                                 ┌─────────────────┐
                                 │   Next.js Web   │
                                 │   (port 3000)   │
                                 └────────┬────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Hono API (port 8080)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ /query   │  │ /ingest  │  │ /health  │  │ /feedback        │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
└───────┼─────────────┼─────────────┼─────────────────┼────────────┘
        │             │             │                 │
        ▼             ▼             ▼                 ▼
┌───────────────────────────────────────────────────────────────────┐
│                        packages/rag                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Retrieval  │  │  Ingestion   │  │      Generation          │  │
│  │  - Vector   │  │  - Chunker   │  │  - LLM (Qwen3-32B)       │  │
│  │  - Graph    │  │  - Embedder  │  │  - Prompts               │  │
│  │  - Hybrid   │  │  - Extractor │  │  - Streaming             │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────────────┘  │
└─────────┼────────────────┼────────────────────────────────────────┘
          │                │
          ▼                ▼
┌───────────────────────────────────────────────────────────────────┐
│                     packages/database                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │    Milvus    │  │    Neo4j     │  │      PostgreSQL          │ │
│  │  (port 19530)│  │  (port 7687) │  │      (port 5432)         │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
          │                │                       │
          ▼                ▼                       ▼
    ┌───────────┐    ┌───────────┐         ┌───────────────┐
    │ Vector    │    │ Knowledge │         │ Analytics &   │
    │ Embeddings│    │ Graph     │         │ Documents     │
    └───────────┘    └───────────┘         └───────────────┘
```
