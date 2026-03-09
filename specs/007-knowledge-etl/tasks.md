# Tasks: Knowledge Base ETL

**Input**: Design documents from `/specs/007-knowledge-etl/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api.yaml, research.md, quickstart.md

**Tests**: Not explicitly requested in spec. Test tasks omitted.

**Organization**: Tasks grouped by user story. US1+US2 (both P0) form the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: Verify branch, install dependencies, ensure builds pass

- [x] T001 Verify all packages build cleanly on `007-knowledge-etl` branch (`bun build` from repo root)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared API infrastructure and utility functions needed by all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create admin route aggregator in `apps/api/src/routes/admin.ts` — new Hono router that will mount all admin sub-routes under `/api/admin/`
- [x] T003 Register admin routes in `apps/api/src/index.ts` — mount the admin router at `/api/admin`
- [x] T004 [P] Create file upload utility in `apps/api/src/lib/upload.ts` — functions: `saveUploadToTemp(file: File): Promise<{path, hash, size}>` (writes to OS temp dir, computes SHA-256 hash), `cleanupTempFile(path: string): Promise<void>`, `detectFormat(filename: string): 'pdf' | 'markdown' | 'text' | null`
- [x] T005 [P] Create admin layout page in `apps/web/src/app/admin/layout.tsx` — admin shell with navigation links (Upload, Sources, Health), separate from student layout
- [x] T006 [P] Create TanStack Query hooks file in `apps/web/src/lib/admin-api.ts` — base URL config and typed fetch wrappers for admin API endpoints (will be populated in later tasks)

**Checkpoint**: Admin route infrastructure ready. File upload utility available. Admin UI shell exists.

---

## Phase 3: User Story 1 — Upload and Ingest Documents (Priority: P0) 🎯 MVP

**Goal**: Admin can upload PDF/Markdown/text files through the web UI, triggering the existing ETL pipeline. Each upload shows processing progress.

**Independent Test**: Upload a PDF and a Markdown file via the admin UI. After processing, ask a question in the student Q&A that requires content from the uploaded documents. The answer should cite the uploaded sources.

### Implementation for User Story 1

- [x] T007 [US1] Create `POST /api/admin/upload` endpoint in `apps/api/src/routes/admin.ts` — accept multipart form data (`file`, optional `title`, optional `author`), validate file format and size (10MB max), save to temp dir via upload utility, compute SHA-256 hash, check for duplicate via `fileHash` in `documents` table, insert document record with `fileHash` and `fileSize` populated, call existing `ingestionPipeline.startIngestion()` with the temp file path, return 202 with `{documentId, jobId, title, format, fileSize}`. Clean up temp file in `finally` block.
- [x] T008 [US1] Add duplicate detection to upload endpoint in `apps/api/src/routes/admin.ts` — before starting ingestion, query `documents` table by `fileHash`. If match found with status `active`, return 409 with `{error: 'DUPLICATE_DOCUMENT', existingDocumentId, existingTitle}`. Add `POST /api/admin/upload/force` endpoint that skips the duplicate check.
- [x] T009 [US1] Create `GET /api/admin/jobs/{jobId}/status` endpoint in `apps/api/src/routes/admin.ts` — proxy to existing job status data from `ingestionJobs` table. Return `{id, documentId, status, currentStep, progress, totalChunks, processedChunks, errorMessage, startedAt, completedAt}`.
- [x] T010 [P] [US1] Create upload page in `apps/web/src/app/admin/page.tsx` — drag-and-drop zone (using shadcn/ui Card) + file picker button. Accept PDF, .md, .txt files. Max 10 files at once. On drop/select, upload each file to `POST /api/admin/upload`. Show per-file upload status (uploading/queued/processing/done/failed/duplicate).
- [x] T011 [US1] Add TanStack Query mutations and queries for upload in `apps/web/src/lib/admin-api.ts` — `useUploadDocument()` mutation (multipart POST), `useJobStatus(jobId)` query with 2-second polling interval (enabled while job is not complete/failed), `useUploadForce()` mutation for duplicate override.
- [x] T012 [US1] Create `UploadProgress` component in `apps/web/src/app/admin/components/UploadProgress.tsx` — shows each file's progress: filename, format icon, current stage (parsing/chunking/embedding/extracting), progress bar (0-100%), status badge. Polls job status every 2 seconds while active. Shows error message for failed jobs.
- [x] T013 [US1] Add duplicate confirmation dialog in `apps/web/src/app/admin/page.tsx` — when upload returns 409, show shadcn/ui AlertDialog with existing document info and options: "Cancel" or "Upload Anyway" (calls force upload endpoint).

**Checkpoint**: Admin can upload files via drag-and-drop, see real-time processing progress, and handle duplicates. Uploaded documents become searchable for students.

---

## Phase 4: User Story 2 — Browse and Manage Knowledge Sources (Priority: P0) 🎯 MVP

**Goal**: Admin can view all ingested documents in a browsable list, see details, delete outdated sources, and retry failed ingestions.

**Independent Test**: After ingesting 3 documents, view the sources list showing all 3 with correct metadata. Delete one, confirm its content is no longer searchable.

### Implementation for User Story 2

- [x] T014 [US2] Create `GET /api/admin/sources` endpoint in `apps/api/src/routes/admin.ts` — query `documents` table with pagination (`page`, `pageSize` default 20), optional filters (`status`, `format`, `search` by title ILIKE), sorting (`sortBy`: createdAt/title/chunkCount/fileSize, `sortOrder`: asc/desc). Return `{documents: DocumentSummary[], total, page, pageSize}`.
- [x] T015 [US2] Create `GET /api/admin/sources/:documentId` endpoint in `apps/api/src/routes/admin.ts` — query `documents` table by ID, join with `ingestionJobs` for processing history. Return full `DocumentDetail` including jobs array.
- [x] T016 [US2] Create `DELETE /api/admin/sources/:documentId` endpoint in `apps/api/src/routes/admin.ts` — delegate to existing delete logic in `apps/api/src/routes/ingest.ts` (or reuse the pipeline's delete functionality). Must remove chunks from Milvus and Neo4j. Return `{message, deletedChunks}`.
- [x] T017 [US2] Create `POST /api/admin/sources/:documentId/retry` endpoint in `apps/api/src/routes/admin.ts` — validate document status is `failed`, reset status to `pending`, create new ingestion job, call `ingestionPipeline.startIngestion()`. Return 202 with `{jobId, message}`. Return 400 if document is not in failed state.
- [x] T018 [P] [US2] Add TanStack Query hooks for sources in `apps/web/src/lib/admin-api.ts` — `useSources(params)` query with pagination/filter params, `useSourceDetail(id)` query, `useDeleteSource()` mutation with cache invalidation, `useRetryIngestion()` mutation.
- [x] T019 [US2] Create sources list page in `apps/web/src/app/admin/sources/page.tsx` — shadcn/ui DataTable showing documents with columns: title, format badge, chunk count, status badge (color-coded), file size, ingested date. Include filter dropdowns (status, format), search input, pagination controls, and sort controls.
- [x] T020 [US2] Create source detail page in `apps/web/src/app/admin/sources/[id]/page.tsx` — show full document metadata (title, format, author, file size, file hash, chunk count, status, error message if failed, created/updated/ingested timestamps). Show processing history as a timeline of jobs. Include "Delete" button with confirmation dialog and "Retry" button (visible only for failed documents).
- [x] T021 [US2] Add delete confirmation dialog in `apps/web/src/app/admin/sources/[id]/page.tsx` — shadcn/ui AlertDialog warning that deletion removes all chunks from vector and graph stores. On confirm, call delete mutation, redirect to sources list.

**Checkpoint**: Admin can browse all sources with filtering/sorting/search, view detailed document info with processing history, delete outdated sources, and retry failed ingestions.

---

## Phase 5: User Story 3 — Monitor Ingestion Progress (Priority: P1)

**Goal**: Admin sees real-time overview of all ingestion jobs without refreshing.

**Independent Test**: Upload a large PDF, observe the progress indicator advancing through stages in real time. View the jobs overview showing processing/queued/completed/failed counts.

### Implementation for User Story 3

- [x] T022 [US3] Create `GET /api/admin/jobs` endpoint in `apps/api/src/routes/admin.ts` — query `ingestionJobs` table joined with `documents` for title. Accept optional `status` filter and `limit` (default 20). Return `{jobs: JobSummary[], summary: {processing, queued, completed, failed}}`.
- [x] T023 [P] [US3] Add TanStack Query hooks for jobs in `apps/web/src/lib/admin-api.ts` — `useJobs(params)` query with 2-second polling interval (enabled when any job is not terminal), `useJobsSummary()` for the overview counts.
- [x] T024 [US3] Add jobs overview section to admin dashboard in `apps/web/src/app/admin/page.tsx` — show summary cards (processing count, queued count, completed count, failed count) at the top of the page above the upload zone. Show a list of recent/active jobs below the upload area with real-time progress bars. Use TanStack Query polling for auto-refresh.
- [x] T025 [US3] Create `JobCard` component in `apps/web/src/app/admin/components/JobCard.tsx` — shows document title, current stage label, progress bar with percentage, elapsed time, status badge. For failed jobs, shows error message and retry link.

**Checkpoint**: Admin sees real-time ingestion overview with auto-refreshing job statuses and summary counts.

---

## Phase 6: User Story 4 — Knowledge Base Health Overview (Priority: P2)

**Goal**: Admin sees aggregate stats about the knowledge base to guide content planning.

**Independent Test**: After ingesting documents covering different topics, view health dashboard showing document count, chunk count, and topic distribution from the knowledge graph.

### Implementation for User Story 4

- [x] T026 [US4] Create `GET /api/admin/health` endpoint in `apps/api/src/routes/admin.ts` — aggregate stats from PostgreSQL (`SELECT count(*), sum(chunk_count) FROM documents WHERE status = 'active'`, group by format, group by status) and Neo4j (`MATCH (c:Concept) RETURN count(c)`, top 20 concepts by chunk connections). Return `HealthStats` schema.
- [x] T027 [P] [US4] Add TanStack Query hook for health in `apps/web/src/lib/admin-api.ts` — `useHealthStats()` query with 30-second stale time (no need for frequent refresh).
- [x] T028 [US4] Create health overview page in `apps/web/src/app/admin/health/page.tsx` — stat cards (total documents, total chunks, total concepts, avg chunks/doc), document breakdown by format (bar chart or badges), document breakdown by status, top concepts list (name + chunk count).

**Checkpoint**: Admin can see knowledge base health at a glance and identify content gaps.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span multiple user stories

- [x] T029 Add admin navigation breadcrumbs in `apps/web/src/app/admin/layout.tsx` — show current page path (Admin > Sources > Document Title)
- [x] T030 Add empty states to all admin pages — upload page (no jobs yet), sources page (no documents), health page (no data)
- [x] T031 Ensure mobile responsiveness for admin pages — test at 375px and 768px widths, adjust layouts
- [x] T032 Add loading skeletons for all admin pages using shadcn/ui Skeleton components
- [x] T033 Run `bun type-check` and `bun lint` across all modified packages, fix any errors
- [x] T034 Run existing test suites (`packages/rag`, `packages/database`, `apps/api`) to verify no regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core upload functionality
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1
- **US3 (Phase 5)**: Depends on US1 (reuses upload page, job polling infra)
- **US4 (Phase 6)**: Depends on Phase 2 only — can run in parallel with US1/US2
- **Polish (Phase 7)**: Depends on all user stories

### User Story Dependencies

```
Phase 2 (Foundational)
    ├── US1 (P0): Upload & Ingest ──── US3 (P1): Job Monitoring
    ├── US2 (P0): Source Management    (extends US1's admin page)
    └── US4 (P2): Health Overview

Phase 7 (Polish) ← depends on all above
```

### Within Each Phase

- Tasks marked [P] can run in parallel (different files, no dependencies)
- Sequential tasks depend on the prior task's output
- API endpoints before UI pages, hooks before components

### Parallel Opportunities

**Phase 2 (Foundational)**:
```
Sequential: T002 → T003
Parallel: T004 || T005 || T006 (different files)
```

**Phase 3 (US1)**:
```
Sequential: T007 → T008 (same file, dedup builds on upload)
Then: T009 (same file, adds job status)
Parallel: T010 || T011 (page.tsx vs admin-api.ts)
Then: T012 (depends on T011 for hooks)
Then: T013 (depends on T010 + T008 for duplicate flow)
```

**Phase 4 (US2)**:
```
Sequential: T014 → T015 → T016 → T017 (all same file, building API)
Parallel: T018 (hooks, different file, can start after T014-T017 are defined)
Then: T019 → T020 → T021 (UI pages, sequential)
```

**Phase 5 + Phase 6 can run in parallel** (US3 extends admin page, US4 is health page — minimal overlap)

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (admin routes + upload utility + UI shell)
3. Complete Phase 3: US1 (File upload with progress tracking)
4. Complete Phase 4: US2 (Source browsing and management)
5. **STOP and VALIDATE**: Upload documents, verify they're searchable, browse/delete sources

### Incremental Delivery

1. Setup + Foundational → Admin infrastructure ready
2. US1 → Upload works → **Demo: upload a PDF, see it processed**
3. US2 → Source management → **Demo: browse, filter, delete sources**
4. US3 → Real-time monitoring → **Polish: job dashboard with auto-refresh**
5. US4 → Health overview → **Polish: knowledge base stats**
6. Phase 7 → Edge cases, mobile, loading states → **Ship-ready**

---

## Summary

| Metric | Count |
|--------|-------|
| Total tasks | 34 |
| Phase 1 (Setup) | 1 |
| Phase 2 (Foundational) | 5 |
| Phase 3 (US1) | 7 |
| Phase 4 (US2) | 8 |
| Phase 5 (US3) | 4 |
| Phase 6 (US4) | 3 |
| Phase 7 (Polish) | 6 |
| Parallel opportunities | 8 tasks marked [P] |
| MVP scope | Phases 1–4 (21 tasks) |
