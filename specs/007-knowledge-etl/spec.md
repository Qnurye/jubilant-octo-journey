# Feature Specification: Knowledge Base ETL

**Feature Branch**: `007-knowledge-etl`
**Created**: 2026-03-09
**Status**: Draft
**Input**: User description: "M4: Knowledge Base ETL pipeline"

## Context

The core ETL pipeline (document parsing, content-aware chunking, embedding, triple extraction, storage) already exists in `@jubilant/rag` from M2. The existing API supports URL-based ingestion via `POST /api/ingest` with job tracking. This milestone focuses on building the **admin-facing experience** for managing the knowledge base: file uploads, source browsing, batch operations, ingestion monitoring, and content health visibility.

## User Scenarios & Testing

### User Story 1 - Upload and Ingest Documents (Priority: P0)

A teacher or admin uploads educational documents (PDF textbooks, Markdown solution writeups) through a web interface. The system processes each document through the existing ETL pipeline (parse, chunk, embed, extract triples) and makes the content searchable for students.

**Why this priority**: Without document ingestion, the knowledge base is empty and the entire Q&A system has no content to retrieve from.

**Independent Test**: Upload a PDF file and a Markdown file through the admin UI. After processing completes, ask a question in the student Q&A interface that requires content from the uploaded documents. The answer should cite the uploaded sources.

**Acceptance Scenarios**:

1. **Given** the admin is on the knowledge base page, **When** they drag-and-drop a PDF file (under 10MB), **Then** the file is uploaded, a processing job starts, and a progress indicator shows the current stage (parsing, chunking, embedding, extracting).
2. **Given** the admin is on the knowledge base page, **When** they select multiple files (mix of PDF and Markdown), **Then** each file is queued for processing independently, and the admin can see the status of each job.
3. **Given** a document has been successfully ingested, **When** a student asks a question related to that document's content, **Then** the answer includes citations referencing that document.
4. **Given** the admin uploads a file that is already ingested (duplicate content hash), **Then** the system warns about the duplicate and asks for confirmation before re-ingesting.

---

### User Story 2 - Browse and Manage Knowledge Sources (Priority: P0)

A teacher views all ingested knowledge sources in a browsable list, seeing document titles, ingestion dates, chunk counts, and processing status. They can delete sources that are outdated or incorrect, which removes the document's chunks from both vector and graph stores.

**Why this priority**: Without source management, admins cannot verify what's in the knowledge base or remove incorrect content that could cause wrong answers.

**Independent Test**: After ingesting 3 documents, view the sources list. Verify all 3 appear with correct metadata. Delete one source, then confirm its chunks are no longer returned in search results.

**Acceptance Scenarios**:

1. **Given** 5 documents have been ingested, **When** the admin opens the sources page, **Then** they see a list showing each document's title, format, ingestion date, chunk count, and status (active/failed/processing).
2. **Given** the admin views the sources list, **When** they click on a source, **Then** they see details including: original filename, file size, number of chunks, number of extracted triples, and processing duration.
3. **Given** an active source exists, **When** the admin deletes it, **Then** all associated chunks are removed from Milvus and Neo4j, and the source no longer appears in the list.
4. **Given** a document failed during processing, **When** the admin views its status, **Then** they see the error reason (e.g., "PDF parsing failed: corrupt file") and can retry or delete the failed job.

---

### User Story 3 - Monitor Ingestion Progress (Priority: P1)

While documents are being processed, the admin sees real-time progress updates without refreshing the page. Each stage of the pipeline (parsing, chunking, embedding, triple extraction) shows its progress, and the admin is notified when processing completes or fails.

**Why this priority**: Large documents take time to process. Without progress visibility, admins don't know if the system is working or stuck.

**Independent Test**: Upload a large PDF (5+ pages). Watch the progress indicator advance through each stage in real time. Verify the UI updates without manual refresh.

**Acceptance Scenarios**:

1. **Given** a document is being processed, **When** the admin views the job status, **Then** they see which stage is active (parsing/chunking/embedding/extracting) and percentage progress within each stage.
2. **Given** multiple documents are queued, **When** the admin views the ingestion page, **Then** they see an overview: X processing, Y queued, Z completed, W failed.
3. **Given** a document finishes processing, **When** the admin is on the ingestion page, **Then** the status updates automatically from "processing" to "active" without page refresh.

---

### User Story 4 - Knowledge Base Health Overview (Priority: P2)

A teacher views an overview of the knowledge base health: total documents, total chunks, topic distribution (from knowledge graph), and coverage gaps. This helps them decide what content to add next.

**Why this priority**: Valuable for content planning but not blocking core functionality.

**Independent Test**: After ingesting documents covering different topics, view the health dashboard. Verify it shows document count, chunk count, and a topic distribution derived from the knowledge graph.

**Acceptance Scenarios**:

1. **Given** documents have been ingested, **When** the admin opens the health overview, **Then** they see: total documents, total chunks, total triples, and average chunks per document.
2. **Given** the knowledge graph has concept nodes, **When** the admin views topic distribution, **Then** they see the top concepts and how many chunks relate to each.

---

### Edge Cases

- What happens when a file exceeds the 10MB size limit? The system rejects the upload with a clear error message before processing begins.
- What happens when the PDF parser fails on a corrupt file? The job is marked as "failed" with the parse error reason, and the admin can retry or delete.
- What happens when embedding generation fails mid-batch? Already-processed chunks are stored; the job is marked as "partially failed" with details on what succeeded.
- What happens when two admins upload the same file simultaneously? The duplicate detection (content hash check) prevents double ingestion; the second upload receives a conflict warning.
- What happens when an admin deletes a source while it's being queried? The deletion is eventual — active queries complete with stale data, and subsequent queries exclude the deleted source.
- What happens when the admin uploads a non-supported format (e.g., .docx)? The system rejects the upload with a clear message listing supported formats (PDF, Markdown, plain text).

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow admins to upload files via drag-and-drop or file picker, supporting PDF, Markdown (.md), and plain text (.txt) formats up to 10MB per file.
- **FR-002**: System MUST process uploaded files through the existing ETL pipeline (parse, chunk, embed, store, extract triples) without requiring the admin to configure pipeline parameters.
- **FR-003**: System MUST display a list of all knowledge sources with: title, format, ingestion date, chunk count, status, and file size.
- **FR-004**: System MUST allow admins to delete a knowledge source, removing all associated chunks from Milvus and all associated nodes/relationships from Neo4j.
- **FR-005**: System MUST show real-time processing progress for each ingestion job, including current pipeline stage and percentage within that stage.
- **FR-006**: System MUST detect duplicate documents (by content hash) and warn the admin before re-ingesting.
- **FR-007**: System MUST support batch file uploads (up to 10 files at once), processing each independently and showing individual status for each.
- **FR-008**: System MUST show failed jobs with actionable error messages and allow retry or deletion.
- **FR-009**: System MUST provide a knowledge base overview showing: total documents, total chunks, total triples, and top concepts by chunk count.
- **FR-010**: System MUST restrict the admin knowledge base interface to an admin route, separate from the student Q&A interface.
- **FR-011**: System MUST accept file uploads via multipart form data, storing files temporarily for processing then cleaning up after completion or failure.
- **FR-012**: System MUST allow admins to view source details including: original filename, file size, chunk count, triple count, and processing duration.

### Key Entities

- **KnowledgeSource**: A document uploaded into the knowledge base. Has title, format, file size, status (pending/processing/active/failed), ingestion timestamp, chunk count, triple count, processing duration, and content hash for dedup.
- **IngestionJob**: A processing task for a single document. Tracks current stage, progress percentage, start time, completion time, and error details if failed.
- **KnowledgeChunk**: An existing entity — a portion of a document stored in Milvus (vector) and Neo4j (graph). Linked to its parent KnowledgeSource.
- **KnowledgeConcept**: An existing entity — a concept extracted via triple extraction, stored as a node in Neo4j. Connected to chunks and other concepts via relationships.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Admins can upload a document and have it fully searchable by students within 5 minutes (for documents under 50 pages).
- **SC-002**: The sources list loads and displays up to 100 sources within 2 seconds.
- **SC-003**: Progress updates appear in the UI within 3 seconds of a stage transition in the pipeline.
- **SC-004**: Deleting a source removes all associated data within 30 seconds, and subsequent queries return no results from that source.
- **SC-005**: 100% of failed ingestions show an actionable error message that helps the admin understand what went wrong.
- **SC-006**: Duplicate detection catches at least 95% of re-uploaded identical documents.

## Assumptions

- The existing ETL pipeline (`@jubilant/rag` ingestion module) is stable and production-ready for the supported formats.
- File storage is local/temporary — files are processed and then deleted. No permanent file storage is needed (chunks and embeddings are the persistent form).
- The admin role is implicit for now — anyone accessing the admin route can manage the knowledge base. Authentication/authorization is deferred to M6 (Production Readiness).
- The knowledge base health overview (US4) uses existing Neo4j concept nodes — no new analytics aggregation is needed beyond querying the graph.
- The student Q&A interface (M3) already works with the existing retrieval pipeline — ingested documents become searchable automatically once stored in Milvus and Neo4j.
