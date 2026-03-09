# Data Model: Knowledge Base ETL

**Feature**: 007-knowledge-etl
**Date**: 2026-03-09

## Entities

### Document (existing: `documents` table)

Represents a source document uploaded into the knowledge base.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| url | text | unique, not null | For uploads: `upload://{filename}` |
| title | text | not null | Derived from filename if not provided |
| format | text | not null | `markdown`, `pdf`, `text` |
| author | text | nullable | Optional, provided by admin |
| fileHash | text | nullable | SHA-256 of file content (for dedup) |
| fileSize | integer | nullable | File size in bytes |
| chunkCount | integer | default 0 | Updated after chunking completes |
| status | text | default 'pending' | See state machine below |
| errorMessage | text | nullable | Set when status = 'failed' |
| metadata | jsonb | nullable | Additional user-provided metadata |
| createdAt | timestamp | not null, auto | |
| updatedAt | timestamp | not null, auto | |
| ingestedAt | timestamp | nullable | Set when processing completes |

**Status state machine**:
```
pending → processing → active
  │          │
  └──────────┴──→ failed ──→ pending (retry)
                      │
                      └──→ archived (delete)
```

**Changes needed**: None — schema already exists. Just need to populate `fileHash` and `fileSize` during file upload.

### IngestionJob (existing: `ingestion_jobs` table)

Tracks the progress of a document processing pipeline run.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | |
| documentId | UUID | FK → documents.id | |
| status | text | default 'queued' | See stages below |
| currentStep | text | nullable | Human-readable step description |
| progress | integer | default 0 | 0-100 percentage |
| totalChunks | integer | nullable | Set during chunking |
| processedChunks | integer | default 0 | Updated during embedding |
| errorMessage | text | nullable | Set on failure |
| startedAt | timestamp | nullable | |
| completedAt | timestamp | nullable | |
| createdAt | timestamp | not null, auto | |

**Job stages**: `queued → chunking → embedding → extracting → complete`
Any stage can transition to `failed`.

**Changes needed**: None — schema already exists.

### KnowledgeChunk (existing: Milvus collection + Neo4j nodes)

A portion of a document, stored in both vector and graph databases.

- **Milvus**: `knowledge_chunks` collection with embedding vector, documentId, content, metadata
- **Neo4j**: `Chunk` nodes linked to `Document` and `Concept` nodes

**Changes needed**: None.

### Concept (existing: Neo4j nodes)

A knowledge concept extracted via triple extraction.

- **Neo4j**: `Concept` nodes with `name` property, linked via typed relationships (PREREQUISITE, RELATED_TO, COMPARED_TO, etc.)

**Changes needed**: None.

## Relationships

```
Document 1──* IngestionJob     (one document can be re-ingested)
Document 1──* KnowledgeChunk   (one document produces many chunks)
Concept  *──* KnowledgeChunk   (concepts linked to chunks via MENTIONED_IN)
Concept  *──* Concept          (inter-concept relationships)
```

## New API Data Contracts

### Upload Request (multipart form data)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| file | File | yes | PDF, MD, or TXT, max 10MB |
| title | string | no | Defaults to filename |
| author | string | no | Optional metadata |

### Document List Response

| Field | Type | Notes |
|-------|------|-------|
| documents | array | List of document summaries |
| total | integer | Total count for pagination |
| page | integer | Current page |
| pageSize | integer | Items per page |

Each document summary:

| Field | Type | Notes |
|-------|------|-------|
| id | string | UUID |
| title | string | |
| format | string | markdown/pdf/text |
| fileSize | integer | bytes |
| chunkCount | integer | |
| status | string | pending/processing/active/failed |
| createdAt | string | ISO 8601 |
| ingestedAt | string | ISO 8601, nullable |

### Health Stats Response

| Field | Type | Notes |
|-------|------|-------|
| totalDocuments | integer | Active documents count |
| totalChunks | integer | Sum of all chunk counts |
| totalConcepts | integer | Neo4j concept node count |
| avgChunksPerDocument | number | |
| documentsByFormat | object | `{ pdf: 5, markdown: 12, text: 3 }` |
| documentsByStatus | object | `{ active: 15, processing: 2, failed: 1 }` |
| topConcepts | array | `[{ name, chunkCount }]` top 20 |
