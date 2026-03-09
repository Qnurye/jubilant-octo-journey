# Research: Knowledge Base ETL

**Feature**: 007-knowledge-etl
**Date**: 2026-03-09

## R1: File Upload in Hono

**Decision**: Use Hono's built-in `c.req.parseBody()` for multipart form data handling.

**Rationale**: Hono 4.x natively supports multipart parsing without additional dependencies. The `parseBody()` method returns `File` objects (Web API standard) which can be converted to `Buffer` or `ArrayBuffer` for processing.

**Alternatives considered**:
- `busboy` / `formidable`: Unnecessary — Hono's built-in support is sufficient for our file size limit (10MB)
- `@hono/multipart`: Doesn't exist as a separate package; Hono includes multipart natively

**Implementation pattern**:
```typescript
const body = await c.req.parseBody();
const file = body['file'] as File;
const buffer = Buffer.from(await file.arrayBuffer());
```

## R2: File-to-Parser Integration

**Decision**: Write uploaded files to a temporary directory, then pass the file path to existing parsers. Clean up after processing completes or fails.

**Rationale**: The existing parsers (`MarkdownParser`, `PDFParser`, `TextParser`) all accept file paths or URLs via `parse(source: string)`. Modifying the parser interface would require changes across the entire RAG pipeline and its tests. Writing to a temp file is simpler and uses the existing, well-tested code path.

**Alternatives considered**:
- Add `Buffer` overload to parser interface: Higher risk — touches core RAG abstractions, requires updating all parsers and tests
- In-memory only: Not feasible for PDF parsing which may need file system access

**Temp file strategy**:
- Directory: OS temp dir (`os.tmpdir()`) + `/competitiontutor-uploads/`
- Naming: `{uuid}-{originalFilename}` to avoid collisions
- Cleanup: `finally` block in upload handler removes the temp file

## R3: Real-Time Progress Updates

**Decision**: Use polling via the existing `GET /api/ingest/:jobId/status` endpoint. The admin UI polls every 2 seconds while jobs are active.

**Rationale**: The existing job status endpoint already returns progress percentage and current stage. SSE would add complexity for minimal benefit — ingestion jobs update status at stage boundaries (5-6 updates total per document), not continuously. Polling at 2s intervals is sufficient.

**Alternatives considered**:
- Server-Sent Events (SSE): Overkill for 5-6 status updates per job; adds connection management complexity
- WebSocket: Even more overhead; no existing WebSocket infrastructure in the project

## R4: Content Hash for Deduplication

**Decision**: Use SHA-256 hash of file content, stored in the existing `fileHash` column on the `documents` table.

**Rationale**: The `documents` table already has a `fileHash` column (currently unused). SHA-256 is fast enough for files up to 10MB and provides reliable dedup detection. Hash before processing to catch duplicates early.

**Alternatives considered**:
- URL-based only (current approach): Doesn't catch same content uploaded from different sources
- MD5: Less collision-resistant; no meaningful performance advantage at our file sizes
- perceptual/fuzzy hashing: Unnecessary complexity for exact-match dedup

## R5: Admin Route Strategy

**Decision**: Create admin pages under `apps/web/src/app/admin/` using Next.js route groups. No authentication for now (deferred to M6).

**Rationale**: Next.js App Router naturally supports route-based separation. The `/admin` path prefix clearly separates admin pages from student-facing pages. Constitution Principle III (Dual Interface) is satisfied by URL-based separation. Authentication is out of scope per spec assumptions.

**Alternatives considered**:
- Separate admin app: Overkill — the admin UI is a few pages, not a separate product
- Middleware-based access control: Deferred to M6 (Production Readiness)

## R6: Knowledge Base Health Stats

**Decision**: Query existing data from PostgreSQL (`documents`, `ingestionJobs` tables) and Neo4j (concept node counts) via new API endpoints. No new tables needed.

**Rationale**: All required health metrics can be derived from existing data:
- Document/chunk counts: `SELECT count(*), sum(chunk_count) FROM documents WHERE status = 'active'`
- Triple counts: Neo4j `MATCH (c:Concept) RETURN count(c)`
- Top concepts: Neo4j `MATCH (c:Concept)-[:MENTIONED_IN]->(ch:Chunk) RETURN c.name, count(ch) ORDER BY count(ch) DESC LIMIT 20`

**Alternatives considered**:
- Materialized view / cache table: Premature optimization — stats queries are simple aggregations on small datasets
- Periodic background job: Unnecessary until document count exceeds thousands

## R7: Existing Infrastructure Reuse

**Key finding**: The existing codebase already provides:

| Component | Location | Status |
|-----------|----------|--------|
| Document parsers (PDF, MD, text) | `packages/rag/src/ingestion/parsers/` | Complete |
| Content-aware chunker | `packages/rag/src/ingestion/chunker.ts` | Complete |
| Batch embedder | `packages/rag/src/ingestion/embedder.ts` | Complete |
| Triple extractor | `packages/rag/src/ingestion/extractor.ts` | Complete |
| Ingestion pipeline orchestrator | `packages/rag/src/ingestion/pipeline.ts` | Complete |
| Milvus + Neo4j chunk storage | `packages/rag/src/ingestion/storage.ts` | Complete |
| `documents` table | `packages/database/src/schema/postgres.ts` | Complete (has unused `fileHash`, `fileSize` fields) |
| `ingestionJobs` table | `packages/database/src/schema/postgres.ts` | Complete |
| POST /api/ingest (URL-based) | `apps/api/src/routes/ingest.ts` | Complete |
| GET /api/ingest/:jobId/status | `apps/api/src/routes/ingest.ts` | Complete |
| DELETE /api/ingest/:documentId | `apps/api/src/routes/ingest.ts` | Complete |

**New work needed**:
1. **API**: File upload endpoint (multipart), document list endpoint, stats endpoints, retry endpoint
2. **Web**: Admin pages (upload, sources list, source detail, health overview)
3. **Integration**: Populate `fileHash` and `fileSize` during upload, temp file handling
