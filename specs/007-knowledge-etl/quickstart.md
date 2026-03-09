# Quickstart: Knowledge Base ETL

**Feature**: 007-knowledge-etl
**Date**: 2026-03-09

## Prerequisites

- Docker Compose running (Milvus, Neo4j, PostgreSQL)
- `bun install` completed
- API server running: `bun run --filter '@repo/api' dev`
- Web server running: `bun run --filter '@repo/web' dev`

## Scenario 1: Upload a Single Document

1. Navigate to `http://localhost:3000/admin`
2. Click "Upload" or drag-and-drop a PDF/Markdown file
3. Observe the progress indicator advancing through stages
4. Once complete, verify the document appears in the sources list
5. Go to the student Q&A page and ask a question related to the uploaded content
6. Verify the answer cites the uploaded document

**Expected**: Document is processed within 5 minutes, appears in sources list as "active", and its content is searchable.

## Scenario 2: Batch Upload Multiple Files

1. Navigate to `http://localhost:3000/admin`
2. Select 3-5 files (mix of PDF and Markdown)
3. All files are queued and start processing
4. Each file shows independent progress
5. View the jobs overview showing processing/queued/completed counts

**Expected**: All files are processed independently. Failed files don't block others.

## Scenario 3: Manage Knowledge Sources

1. Navigate to `http://localhost:3000/admin/sources`
2. Browse the list of ingested documents
3. Click on a document to see its details (chunk count, triples, processing time)
4. Delete an outdated document
5. Ask a question in the Q&A interface — verify deleted content is no longer cited

**Expected**: Sources list is accurate. Deletion removes all associated data from vector and graph stores.

## Scenario 4: Handle Duplicate Upload

1. Upload a PDF file successfully
2. Upload the same file again
3. System shows a duplicate warning with the existing document info
4. Choose to either cancel or force re-ingest

**Expected**: Duplicate detected by content hash. Admin can choose to proceed or cancel.

## Scenario 5: Handle Failed Ingestion

1. Upload a corrupt PDF file (or a .docx renamed to .pdf)
2. Observe the job failing with an error message
3. View the error details on the sources page
4. Either retry or delete the failed document

**Expected**: Error message is actionable (e.g., "PDF parsing failed: unable to extract text"). Retry and delete both work.

## Scenario 6: View Knowledge Base Health

1. Navigate to `http://localhost:3000/admin/health`
2. View aggregate stats: document count, chunk count, concept count
3. View topic distribution showing top concepts
4. Identify coverage gaps (topics with few chunks)

**Expected**: Stats reflect actual data in the system. Top concepts come from Neo4j knowledge graph.

## API Testing (curl)

### Upload a file
```bash
curl -X POST http://localhost:8080/api/admin/upload \
  -F "file=@./sample.pdf" \
  -F "title=Algorithm Fundamentals" \
  -F "author=CLRS"
```

### List sources
```bash
curl http://localhost:8080/api/admin/sources?page=1&pageSize=10&status=active
```

### Get source details
```bash
curl http://localhost:8080/api/admin/sources/{documentId}
```

### Delete a source
```bash
curl -X DELETE http://localhost:8080/api/admin/sources/{documentId}
```

### Check job progress
```bash
curl http://localhost:8080/api/admin/jobs/{jobId}/status
```

### Get health stats
```bash
curl http://localhost:8080/api/admin/health
```

### Retry failed ingestion
```bash
curl -X POST http://localhost:8080/api/admin/sources/{documentId}/retry
```
