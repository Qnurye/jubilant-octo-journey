/**
 * Admin Routes
 *
 * Endpoints for knowledge base administration:
 * - POST /api/admin/upload - Upload and ingest a document
 * - POST /api/admin/upload/force - Force upload (skip duplicate check)
 * - GET /api/admin/sources - List all knowledge sources
 * - GET /api/admin/sources/:documentId - Get source details
 * - DELETE /api/admin/sources/:documentId - Delete a source
 * - POST /api/admin/sources/:documentId/retry - Retry failed ingestion
 * - GET /api/admin/jobs - List ingestion jobs
 * - GET /api/admin/jobs/:jobId/status - Get job progress
 * - GET /api/admin/health - Knowledge base health overview
 * - GET /api/admin/chunks - List chunks with pagination/search/filtering
 * - GET /api/admin/graph - Knowledge graph data for visualization
 *
 * @module apps/api/routes/admin
 */

import { Hono, type Context } from 'hono';
import { db, postgresSchema, COLLECTION_NAME, eq, ilike, sql, and, neo4jInt } from '@jubilant/database';
import {
  createIngestionPipeline,
  type DatabaseOperations,
  type IngestionJob,
  type DocumentRecord,
  type ErrorResponse,
} from '@jubilant/rag';
import {
  saveUploadToTemp,
  cleanupTempFile,
  detectFormat,
  MAX_FILE_SIZE,
} from '../lib/upload';

const admin = new Hono();

// ============================================================================
// Shared Helpers
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

function errorJson(c: Context, error: string, message: string, status: 400 | 404 | 409 | 500) {
  const body: ErrorResponse = { error, message };
  return c.json(body, status);
}

// ============================================================================
// Pipeline Initialization (mirrors ingest.ts pattern)
// ============================================================================

let pipeline: ReturnType<typeof createIngestionPipeline> | null = null;

function createDatabaseOperations(): DatabaseOperations {
  return {
    async insertDocument(doc) {
      await db.postgres.insert(postgresSchema.documents).values({
        id: doc.id,
        url: doc.url,
        title: doc.title,
        format: doc.format,
        status: doc.status,
        metadata: doc.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },
    async insertJob(job) {
      await db.postgres.insert(postgresSchema.ingestionJobs).values({
        id: job.id,
        documentId: job.documentId,
        status: job.status,
        progress: job.progress,
        processedChunks: 0,
        createdAt: new Date(),
      });
    },
    async getJob(jobId: string): Promise<IngestionJob | null> {
      const jobs = await db.postgres
        .select()
        .from(postgresSchema.ingestionJobs)
        .where(eq(postgresSchema.ingestionJobs.id, jobId))
        .limit(1);
      if (jobs.length === 0) return null;
      const job = jobs[0];
      return {
        id: job.id,
        documentId: job.documentId ?? '',
        status: (job.status ?? 'pending') as IngestionJob['status'],
        currentStep: job.currentStep ?? null,
        progress: job.progress ?? 0,
        totalChunks: job.totalChunks ?? null,
        processedChunks: job.processedChunks ?? 0,
        errorMessage: job.errorMessage ?? null,
        startedAt: job.startedAt ?? null,
        completedAt: job.completedAt ?? null,
        createdAt: job.createdAt,
      };
    },
    async getDocument(documentId: string): Promise<DocumentRecord | null> {
      const docs = await db.postgres
        .select()
        .from(postgresSchema.documents)
        .where(eq(postgresSchema.documents.id, documentId))
        .limit(1);
      if (docs.length === 0) return null;
      const doc = docs[0];
      return {
        id: doc.id,
        url: doc.url,
        title: doc.title || 'Untitled',
        format: doc.format || 'text',
        status: (doc.status ?? 'pending') as DocumentRecord['status'],
        chunkCount: doc.chunkCount ?? 0,
        errorMessage: doc.errorMessage ?? null,
      };
    },
    async updateJob(jobId: string, updates: Partial<IngestionJob>) {
      await db.postgres
        .update(postgresSchema.ingestionJobs)
        .set(updates as Record<string, unknown>)
        .where(eq(postgresSchema.ingestionJobs.id, jobId));
    },
    async updateDocument(documentId: string, updates: Partial<DocumentRecord>) {
      await db.postgres
        .update(postgresSchema.documents)
        .set({ ...updates, updatedAt: new Date() } as Record<string, unknown>)
        .where(eq(postgresSchema.documents.id, documentId));
    },
  };
}

function getOrCreatePipeline() {
  if (!pipeline) {
    if (!db.isConnected) {
      throw new Error('Database not connected. Call db.connect() first.');
    }
    pipeline = createIngestionPipeline(db.milvus, db.neo4j);
    pipeline.setDatabase(createDatabaseOperations());
  }
  return pipeline;
}

// ============================================================================
// Upload Core Logic
// ============================================================================

/**
 * Shared upload handler used by both /upload and /upload/force
 */
async function handleUpload(
  c: Context,
  skipDuplicateCheck: boolean
) {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  let tempPath: string | null = null;

  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    // Validate file presence
    if (!file || !(file instanceof File)) {
      return errorJson(c, 'MISSING_FILE', 'A file must be provided in the "file" field', 400);
    }

    // Validate file size
    if (file.size === 0) {
      return errorJson(c, 'EMPTY_FILE', 'Uploaded file is empty', 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return errorJson(
        c,
        'FILE_TOO_LARGE',
        `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum of 10MB`,
        400
      );
    }

    // Detect format
    const format = detectFormat(file.name);
    if (!format) {
      return errorJson(
        c,
        'UNSUPPORTED_FORMAT',
        `File "${file.name}" has an unsupported format. Supported: .pdf, .md, .markdown, .txt, .text`,
        400
      );
    }

    // Save to temp and compute hash
    const saved = await saveUploadToTemp(file);
    tempPath = saved.path;

    // Duplicate check (unless force)
    if (!skipDuplicateCheck) {
      const existing = await db.postgres
        .select({
          id: postgresSchema.documents.id,
          title: postgresSchema.documents.title,
        })
        .from(postgresSchema.documents)
        .where(eq(postgresSchema.documents.fileHash, saved.hash))
        .limit(1);

      if (existing.length > 0) {
        return c.json(
          {
            error: 'DUPLICATE_DOCUMENT',
            message: 'A document with identical content already exists',
            existingDocumentId: existing[0].id,
            existingTitle: existing[0].title,
          },
          409
        );
      }
    }

    // Extract optional metadata from form body
    const title = typeof body['title'] === 'string' && body['title'].length > 0
      ? body['title'].slice(0, 200)
      : file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const author = typeof body['author'] === 'string' && body['author'].length > 0
      ? body['author'].slice(0, 100)
      : null;

    // Insert document record directly (so we can populate fileHash and fileSize)
    // Use try/catch for race condition on concurrent duplicate uploads (CRITICAL-03)
    const documentId = crypto.randomUUID();
    const jobId = crypto.randomUUID();

    try {
      await db.postgres.insert(postgresSchema.documents).values({
        id: documentId,
        url: `upload://${documentId}/${file.name}`,
        title,
        format,
        author,
        fileHash: saved.hash,
        fileSize: saved.size,
        status: 'pending',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (insertError: unknown) {
      // Handle unique constraint violation (concurrent duplicate upload)
      const errMsg = insertError instanceof Error ? insertError.message : '';
      if (errMsg.includes('unique') || errMsg.includes('duplicate')) {
        return c.json(
          {
            error: 'DUPLICATE_DOCUMENT',
            message: 'A document with identical content was uploaded concurrently',
          },
          409
        );
      }
      throw insertError;
    }

    await db.postgres.insert(postgresSchema.ingestionJobs).values({
      id: jobId,
      documentId,
      status: 'queued',
      progress: 0,
      processedChunks: 0,
      createdAt: new Date(),
    });

    // Start ingestion in background using the temp file path
    const ingestionPipeline = getOrCreatePipeline();

    // Update the document URL to temp path so the parser can read it
    await db.postgres
      .update(postgresSchema.documents)
      .set({ url: saved.path, updatedAt: new Date() })
      .where(eq(postgresSchema.documents.id, documentId));

    setImmediate(async () => {
      try {
        await ingestionPipeline.processJob(jobId);
      } catch (error) {
        console.error(`Ingestion job ${jobId} failed:`, error);
        // WARN-01: Update job status to 'failed' so it doesn't appear stuck
        try {
          await db.postgres
            .update(postgresSchema.ingestionJobs)
            .set({
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              completedAt: new Date(),
            })
            .where(eq(postgresSchema.ingestionJobs.id, jobId));
          await db.postgres
            .update(postgresSchema.documents)
            .set({ status: 'failed', errorMessage: error instanceof Error ? error.message : 'Unknown error', updatedAt: new Date() })
            .where(eq(postgresSchema.documents.id, documentId));
        } catch (dbError) {
          console.error(`Failed to update job ${jobId} status:`, dbError);
        }
      } finally {
        if (tempPath) {
          await cleanupTempFile(tempPath);
        }
      }
    });

    // Don't clean up tempPath in the request's finally — background job needs it
    tempPath = null;

    return c.json(
      {
        documentId,
        jobId,
        title,
        format,
        fileSize: saved.size,
        message: 'Upload accepted, processing started',
      },
      202
    );
  } catch (error) {
    console.error('Upload error:', error);
    return errorJson(
      c,
      'UPLOAD_ERROR',
      error instanceof Error ? error.message : 'Failed to process upload',
      500
    );
  } finally {
    // Clean up temp file if we still own it (i.e. error before handing to background)
    if (tempPath) {
      await cleanupTempFile(tempPath);
    }
  }
}

// ============================================================================
// Upload Endpoints (T007, T008)
// ============================================================================

/**
 * POST /api/admin/upload
 *
 * Upload and ingest a document. Checks for duplicate content via SHA-256.
 */
admin.post('/upload', async (c) => {
  return handleUpload(c, false);
});

/**
 * POST /api/admin/upload/force
 *
 * Upload and ingest a document, bypassing duplicate detection.
 */
admin.post('/upload/force', async (c) => {
  return handleUpload(c, true);
});

// ============================================================================
// Job Endpoints (T009, T022)
// ============================================================================

/**
 * GET /api/admin/jobs/:jobId/status
 *
 * Get detailed status of a single ingestion job.
 */
admin.get('/jobs/:jobId/status', async (c) => {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  const jobId = c.req.param('jobId');
  if (!isValidUUID(jobId)) {
    return errorJson(c, 'INVALID_JOB_ID', 'Job ID must be a valid UUID', 400);
  }

  try {
    const jobs = await db.postgres
      .select()
      .from(postgresSchema.ingestionJobs)
      .where(eq(postgresSchema.ingestionJobs.id, jobId))
      .limit(1);

    if (jobs.length === 0) {
      return errorJson(c, 'JOB_NOT_FOUND', `Job ${jobId} not found`, 404);
    }

    const job = jobs[0];
    return c.json(
      {
        id: job.id,
        documentId: job.documentId,
        status: job.status,
        currentStep: job.currentStep ?? null,
        progress: job.progress ?? 0,
        totalChunks: job.totalChunks ?? null,
        processedChunks: job.processedChunks ?? 0,
        errorMessage: job.errorMessage ?? null,
        startedAt: job.startedAt ?? null,
        completedAt: job.completedAt ?? null,
        createdAt: job.createdAt,
      },
      200
    );
  } catch (error) {
    console.error('Job status error:', error);
    return errorJson(c, 'JOB_STATUS_ERROR', error instanceof Error ? error.message : 'Failed to get job status', 500);
  }
});

/**
 * GET /api/admin/jobs
 *
 * List ingestion jobs with optional status filter.
 * Returns jobs and a summary of counts by status.
 */
admin.get('/jobs', async (c) => {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  try {
    const statusFilter = c.req.query('status');
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20', 10) || 20, 1), 50);

    // Build conditions
    const conditions = [];
    if (statusFilter) {
      conditions.push(eq(postgresSchema.ingestionJobs.status, statusFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Query jobs joined with documents for title
    const jobs = await db.postgres
      .select({
        id: postgresSchema.ingestionJobs.id,
        documentId: postgresSchema.ingestionJobs.documentId,
        documentTitle: postgresSchema.documents.title,
        status: postgresSchema.ingestionJobs.status,
        currentStep: postgresSchema.ingestionJobs.currentStep,
        progress: postgresSchema.ingestionJobs.progress,
        totalChunks: postgresSchema.ingestionJobs.totalChunks,
        processedChunks: postgresSchema.ingestionJobs.processedChunks,
        startedAt: postgresSchema.ingestionJobs.startedAt,
        completedAt: postgresSchema.ingestionJobs.completedAt,
      })
      .from(postgresSchema.ingestionJobs)
      .leftJoin(
        postgresSchema.documents,
        eq(postgresSchema.ingestionJobs.documentId, postgresSchema.documents.id)
      )
      .where(whereClause)
      .orderBy(sql`${postgresSchema.ingestionJobs.createdAt} DESC`)
      .limit(limit);

    // Summary counts
    const summaryRows = await db.postgres
      .select({
        status: postgresSchema.ingestionJobs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(postgresSchema.ingestionJobs)
      .groupBy(postgresSchema.ingestionJobs.status);

    const summary: Record<string, number> = { processing: 0, queued: 0, completed: 0, failed: 0 };
    for (const row of summaryRows) {
      const status = row.status ?? '';
      if (status === 'complete') {
        summary.completed += row.count;
      } else if (['chunking', 'embedding', 'extracting'].includes(status)) {
        summary.processing += row.count;
      } else if (status === 'queued') {
        summary.queued += row.count;
      } else if (status === 'failed') {
        summary.failed += row.count;
      }
    }

    return c.json({ jobs, summary }, 200);
  } catch (error) {
    console.error('List jobs error:', error);
    return errorJson(c, 'LIST_JOBS_ERROR', error instanceof Error ? error.message : 'Failed to list jobs', 500);
  }
});

// ============================================================================
// Source Management Endpoints (T014, T015, T016, T017)
// ============================================================================

/**
 * GET /api/admin/sources
 *
 * List knowledge sources with pagination, filtering, and sorting.
 */
admin.get('/sources', async (c) => {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  try {
    const page = Math.max(parseInt(c.req.query('page') || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(c.req.query('pageSize') || '20', 10) || 20, 1), 100);
    const statusFilter = c.req.query('status');
    const formatFilter = c.req.query('format');
    const search = c.req.query('search');
    const sortBy = c.req.query('sortBy') || 'createdAt';
    const sortOrder = c.req.query('sortOrder') || 'desc';

    // Build WHERE conditions — exclude archived by default (CRITICAL-04)
    const conditions = [];
    if (statusFilter) {
      conditions.push(eq(postgresSchema.documents.status, statusFilter));
    } else {
      conditions.push(sql`${postgresSchema.documents.status} != 'archived'`);
    }
    if (formatFilter) {
      conditions.push(eq(postgresSchema.documents.format, formatFilter));
    }
    if (search) {
      // Escape ILIKE wildcards to prevent pattern injection (CRITICAL-01)
      const escapedSearch = search.slice(0, 200).replace(/%/g, '\\%').replace(/_/g, '\\_');
      conditions.push(ilike(postgresSchema.documents.title, `%${escapedSearch}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort column
    const sortColumnMap: Record<string, unknown> = {
      createdAt: postgresSchema.documents.createdAt,
      title: postgresSchema.documents.title,
      chunkCount: postgresSchema.documents.chunkCount,
      fileSize: postgresSchema.documents.fileSize,
    };
    const sortColumn = sortColumnMap[sortBy] || postgresSchema.documents.createdAt;
    const orderClause = sortOrder === 'asc'
      ? sql`${sortColumn} ASC`
      : sql`${sortColumn} DESC`;

    // Count total
    const countResult = await db.postgres
      .select({ count: sql<number>`count(*)::int` })
      .from(postgresSchema.documents)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Query documents
    const offset = (page - 1) * pageSize;
    const documents = await db.postgres
      .select({
        id: postgresSchema.documents.id,
        title: postgresSchema.documents.title,
        format: postgresSchema.documents.format,
        fileSize: postgresSchema.documents.fileSize,
        chunkCount: postgresSchema.documents.chunkCount,
        status: postgresSchema.documents.status,
        createdAt: postgresSchema.documents.createdAt,
        ingestedAt: postgresSchema.documents.ingestedAt,
      })
      .from(postgresSchema.documents)
      .where(whereClause)
      .orderBy(orderClause)
      .limit(pageSize)
      .offset(offset);

    return c.json({ documents, total, page, pageSize }, 200);
  } catch (error) {
    console.error('List sources error:', error);
    return errorJson(c, 'LIST_SOURCES_ERROR', error instanceof Error ? error.message : 'Failed to list sources', 500);
  }
});

/**
 * GET /api/admin/sources/:documentId
 *
 * Get detailed information about a specific document including processing history.
 */
admin.get('/sources/:documentId', async (c) => {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  const documentId = c.req.param('documentId');
  if (!isValidUUID(documentId)) {
    return errorJson(c, 'INVALID_DOCUMENT_ID', 'Document ID must be a valid UUID', 400);
  }

  try {
    // Get document
    const docs = await db.postgres
      .select()
      .from(postgresSchema.documents)
      .where(eq(postgresSchema.documents.id, documentId))
      .limit(1);

    if (docs.length === 0) {
      return errorJson(c, 'DOCUMENT_NOT_FOUND', `Document ${documentId} not found`, 404);
    }

    const doc = docs[0];

    // Get processing history (jobs for this document)
    const jobs = await db.postgres
      .select({
        id: postgresSchema.ingestionJobs.id,
        documentId: postgresSchema.ingestionJobs.documentId,
        status: postgresSchema.ingestionJobs.status,
        currentStep: postgresSchema.ingestionJobs.currentStep,
        progress: postgresSchema.ingestionJobs.progress,
        totalChunks: postgresSchema.ingestionJobs.totalChunks,
        processedChunks: postgresSchema.ingestionJobs.processedChunks,
        startedAt: postgresSchema.ingestionJobs.startedAt,
        completedAt: postgresSchema.ingestionJobs.completedAt,
      })
      .from(postgresSchema.ingestionJobs)
      .where(eq(postgresSchema.ingestionJobs.documentId, documentId))
      .orderBy(sql`${postgresSchema.ingestionJobs.createdAt} DESC`);

    return c.json(
      {
        id: doc.id,
        title: doc.title,
        format: doc.format,
        author: doc.author ?? null,
        fileSize: doc.fileSize ?? null,
        fileHash: doc.fileHash ?? null,
        chunkCount: doc.chunkCount ?? 0,
        status: doc.status,
        errorMessage: doc.errorMessage ?? null,
        metadata: doc.metadata ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        ingestedAt: doc.ingestedAt ?? null,
        jobs: jobs.map((j) => ({
          ...j,
          documentTitle: doc.title,
          currentStep: j.currentStep ?? null,
          progress: j.progress ?? 0,
          totalChunks: j.totalChunks ?? null,
          processedChunks: j.processedChunks ?? 0,
          startedAt: j.startedAt ?? null,
          completedAt: j.completedAt ?? null,
        })),
      },
      200
    );
  } catch (error) {
    console.error('Source detail error:', error);
    return errorJson(c, 'SOURCE_DETAIL_ERROR', error instanceof Error ? error.message : 'Failed to get source details', 500);
  }
});

/**
 * DELETE /api/admin/sources/:documentId
 *
 * Delete a knowledge source and all associated data (Milvus + Neo4j + Postgres).
 */
admin.delete('/sources/:documentId', async (c) => {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  const documentId = c.req.param('documentId');
  if (!isValidUUID(documentId)) {
    return errorJson(c, 'INVALID_DOCUMENT_ID', 'Document ID must be a valid UUID', 400);
  }

  try {
    // Get document
    const docs = await db.postgres
      .select({
        id: postgresSchema.documents.id,
        url: postgresSchema.documents.url,
        chunkCount: postgresSchema.documents.chunkCount,
      })
      .from(postgresSchema.documents)
      .where(eq(postgresSchema.documents.id, documentId))
      .limit(1);

    if (docs.length === 0) {
      return errorJson(c, 'DOCUMENT_NOT_FOUND', `Document ${documentId} not found`, 404);
    }

    const doc = docs[0];
    const ingestionPipeline = getOrCreatePipeline();

    // Delete chunks from Milvus and Neo4j
    await ingestionPipeline.getStorage().deleteChunks(doc.url, documentId);

    // Archive document record
    await db.postgres
      .update(postgresSchema.documents)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(postgresSchema.documents.id, documentId));

    return c.json(
      {
        message: `Document ${documentId} deleted`,
        deletedChunks: doc.chunkCount ?? 0,
      },
      200
    );
  } catch (error) {
    console.error('Delete source error:', error);
    return errorJson(c, 'DELETE_ERROR', error instanceof Error ? error.message : 'Failed to delete source', 500);
  }
});

/**
 * POST /api/admin/sources/:documentId/retry
 *
 * Retry ingestion for a failed document. Only works when status is 'failed'.
 */
admin.post('/sources/:documentId/retry', async (c) => {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  const documentId = c.req.param('documentId');
  if (!isValidUUID(documentId)) {
    return errorJson(c, 'INVALID_DOCUMENT_ID', 'Document ID must be a valid UUID', 400);
  }

  try {
    // Get document
    const docs = await db.postgres
      .select()
      .from(postgresSchema.documents)
      .where(eq(postgresSchema.documents.id, documentId))
      .limit(1);

    if (docs.length === 0) {
      return errorJson(c, 'DOCUMENT_NOT_FOUND', `Document ${documentId} not found`, 404);
    }

    const doc = docs[0];

    if (doc.status !== 'failed') {
      return errorJson(
        c,
        'INVALID_STATE',
        `Document is in "${doc.status}" state. Only failed documents can be retried.`,
        400
      );
    }

    // CRITICAL-05: Check if the source file still exists (temp files are cleaned up after processing)
    const docUrl = doc.url;
    if (docUrl && !docUrl.startsWith('http://') && !docUrl.startsWith('https://')) {
      try {
        const { access: fsAccess } = await import('fs/promises');
        await fsAccess(docUrl);
      } catch {
        return errorJson(
          c,
          'SOURCE_FILE_MISSING',
          'The original uploaded file has been cleaned up. Please re-upload the document instead of retrying.',
          400
        );
      }
    }

    // Reset document to pending
    await db.postgres
      .update(postgresSchema.documents)
      .set({
        status: 'pending',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(postgresSchema.documents.id, documentId));

    // Create a new job
    const jobId = crypto.randomUUID();
    await db.postgres.insert(postgresSchema.ingestionJobs).values({
      id: jobId,
      documentId,
      status: 'queued',
      progress: 0,
      processedChunks: 0,
      createdAt: new Date(),
    });

    // Start processing in background
    const ingestionPipeline = getOrCreatePipeline();
    setImmediate(async () => {
      try {
        await ingestionPipeline.processJob(jobId);
      } catch (error) {
        console.error(`Retry job ${jobId} failed:`, error);
        try {
          await db.postgres
            .update(postgresSchema.ingestionJobs)
            .set({ status: 'failed', errorMessage: error instanceof Error ? error.message : 'Unknown error', completedAt: new Date() })
            .where(eq(postgresSchema.ingestionJobs.id, jobId));
          await db.postgres
            .update(postgresSchema.documents)
            .set({ status: 'failed', errorMessage: error instanceof Error ? error.message : 'Unknown error', updatedAt: new Date() })
            .where(eq(postgresSchema.documents.id, documentId));
        } catch (dbError) {
          console.error(`Failed to update retry job ${jobId} status:`, dbError);
        }
      }
    });

    return c.json(
      {
        jobId,
        message: 'Retry started',
      },
      202
    );
  } catch (error) {
    console.error('Retry error:', error);
    return errorJson(c, 'RETRY_ERROR', error instanceof Error ? error.message : 'Failed to retry ingestion', 500);
  }
});

// ============================================================================
// Health Endpoint (T026)
// ============================================================================

/**
 * GET /api/admin/health
 *
 * Knowledge base health overview with aggregate statistics.
 */
admin.get('/health', async (c) => {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  try {
    // PostgreSQL aggregations
    const docStats = await db.postgres
      .select({
        totalDocuments: sql<number>`count(*)::int`,
        totalChunks: sql<number>`coalesce(sum(${postgresSchema.documents.chunkCount}), 0)::int`,
      })
      .from(postgresSchema.documents)
      .where(sql`${postgresSchema.documents.status} != 'archived'`);

    const { totalDocuments, totalChunks } = docStats[0] ?? { totalDocuments: 0, totalChunks: 0 };
    const avgChunksPerDocument = totalDocuments > 0
      ? Math.round((totalChunks / totalDocuments) * 100) / 100
      : 0;

    // Documents by format
    const formatRows = await db.postgres
      .select({
        format: postgresSchema.documents.format,
        count: sql<number>`count(*)::int`,
      })
      .from(postgresSchema.documents)
      .where(sql`${postgresSchema.documents.status} != 'archived'`)
      .groupBy(postgresSchema.documents.format);

    const documentsByFormat: Record<string, number> = { pdf: 0, markdown: 0, text: 0 };
    for (const row of formatRows) {
      if (row.format && row.format in documentsByFormat) {
        documentsByFormat[row.format] = row.count;
      }
    }

    // Documents by status
    const statusRows = await db.postgres
      .select({
        status: postgresSchema.documents.status,
        count: sql<number>`count(*)::int`,
      })
      .from(postgresSchema.documents)
      .where(sql`${postgresSchema.documents.status} != 'archived'`)
      .groupBy(postgresSchema.documents.status);

    const documentsByStatus: Record<string, number> = {
      active: 0,
      processing: 0,
      failed: 0,
      pending: 0,
    };
    for (const row of statusRows) {
      if (row.status && row.status in documentsByStatus) {
        documentsByStatus[row.status] = row.count;
      }
    }

    // Neo4j concept counts and top concepts
    let totalConcepts = 0;
    let topConcepts: Array<{ name: string; chunkCount: number }> = [];

    try {
      const session = db.neo4j.session();
      try {
        // Total concept count
        const countResult = await session.run('MATCH (c:Concept) RETURN count(c) AS total');
        totalConcepts = countResult.records[0]?.get('total')?.toNumber?.() ?? 0;

        // Top 20 concepts by chunk connections
        const topResult = await session.run(
          'MATCH (c:Concept)-[:MENTIONED_IN]->(ch:Chunk) ' +
          'RETURN c.name AS name, count(ch) AS chunkCount ' +
          'ORDER BY chunkCount DESC LIMIT 20'
        );
        topConcepts = topResult.records.map((record) => ({
          name: record.get('name') as string,
          chunkCount: record.get('chunkCount')?.toNumber?.() ?? 0,
        }));
      } finally {
        await session.close();
      }
    } catch (neo4jError) {
      console.warn('Neo4j health query failed (non-fatal):', neo4jError);
      // Continue with zero values — Neo4j may not be available
    }

    return c.json(
      {
        totalDocuments,
        totalChunks,
        totalConcepts,
        avgChunksPerDocument,
        documentsByFormat,
        documentsByStatus,
        topConcepts,
      },
      200
    );
  } catch (error) {
    console.error('Health stats error:', error);
    return errorJson(c, 'HEALTH_ERROR', error instanceof Error ? error.message : 'Failed to get health stats', 500);
  }
});

// ============================================================================
// Chunk Browsing Endpoint
// ============================================================================

/**
 * GET /api/admin/chunks
 *
 * List all chunks with pagination, search, and filtering.
 * Queries Milvus for chunk data and enriches with Neo4j concept names.
 */
admin.get('/chunks', async (c) => {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  try {
    const page = Math.max(parseInt(c.req.query('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20', 10) || 20, 1), 100);
    const search = c.req.query('search');
    const documentId = c.req.query('documentId');
    const topicTag = c.req.query('topicTag');
    const concept = c.req.query('concept');

    // If concept filter is provided, query Neo4j for matching chunk UUIDs,
    // then look up their chunkIndex + documentUrl to filter Milvus results
    let conceptChunkKeys: Set<string> | null = null; // "docUrl:chunkIndex" keys
    if (concept) {
      try {
        const session = db.neo4j.session();
        try {
          const result = await session.run(
            'MATCH (c:Concept {name: $concept})<-[:DISCUSSES]-(chunk:Chunk)-[:FROM_DOCUMENT]->(d:Document) ' +
            'RETURN d.url AS docUrl, chunk.chunkIndex AS chunkIndex',
            { concept }
          );
          conceptChunkKeys = new Set(
            result.records.map((r) => {
              const docUrl = r.get('docUrl') as string;
              const idx = r.get('chunkIndex')?.toNumber?.() ?? r.get('chunkIndex');
              return `${docUrl}:${idx}`;
            })
          );
        } finally {
          await session.close();
        }
      } catch (neo4jError) {
        console.warn('Neo4j concept filter query failed (non-fatal):', neo4jError);
        conceptChunkKeys = new Set();
      }

      if (conceptChunkKeys.size === 0) {
        return c.json(
          { chunks: [], pagination: { page, limit, total: 0, totalPages: 0 } },
          200
        );
      }
    }

    // Milvus v2.3 has limited filter support (no like on VarChar, no JSON path).
    // Fetch a large batch and filter in application code for search/documentId/concept.
    const needsAppFilter = !!(search || documentId || concept);
    const fetchLimit = needsAppFilter ? 16384 : limit;
    const fetchOffset = needsAppFilter ? 0 : (page - 1) * limit;

    // Only use topicTag as Milvus filter (scalar index, works reliably)
    let filterExpr = '';
    if (topicTag) {
      const escapedTag = topicTag.replace(/"/g, '\\"');
      filterExpr = `topic_tag == "${escapedTag}"`;
    }

    const queryResult = await db.milvus.query({
      collection_name: COLLECTION_NAME,
      filter: filterExpr || undefined,
      output_fields: ['chunk_id', 'content_text', 'metadata', 'topic_tag'],
      limit: fetchLimit,
      offset: fetchOffset,
    });

    let allChunks = (queryResult.data ?? []) as Array<Record<string, unknown>>;

    // Application-level filtering
    if (needsAppFilter) {
      const searchLower = search?.toLowerCase();

      allChunks = allChunks.filter((chunk) => {
        // Parse metadata once per chunk
        let meta: Record<string, unknown> = {};
        if (typeof chunk.metadata === 'string') {
          try { meta = JSON.parse(chunk.metadata as string); } catch { /* skip */ }
        } else if (chunk.metadata && typeof chunk.metadata === 'object') {
          meta = chunk.metadata as Record<string, unknown>;
        }

        // Search filter: case-insensitive content match
        if (searchLower) {
          const content = ((chunk.content_text as string) ?? '').toLowerCase();
          if (!content.includes(searchLower)) return false;
        }

        // DocumentId filter
        if (documentId && meta.documentId !== documentId) return false;

        // Concept filter: match by docUrl:chunkIndex key
        if (conceptChunkKeys) {
          const key = `${meta.documentUrl}:${meta.chunkIndex}`;
          if (!conceptChunkKeys.has(key)) return false;
        }

        return true;
      });
    }

    const total = allChunks.length;

    // Apply pagination on filtered results
    const paginatedChunks = needsAppFilter
      ? allChunks.slice((page - 1) * limit, page * limit)
      : allChunks;
    const chunks = paginatedChunks;

    // Enrich chunks with concepts from Neo4j
    // Neo4j uses UUID chunk_ids while Milvus uses numeric hashes,
    // so we match via chunkIndex + document URL from the chunk's metadata
    let conceptMap: Record<string, string[]> = {}; // key: "docUrl:chunkIndex"
    if (chunks.length > 0) {
      try {
        // Collect unique document URLs from chunk metadata
        const docUrls = new Set<string>();
        for (const chunk of chunks) {
          let meta: Record<string, unknown> = {};
          if (typeof chunk.metadata === 'string') {
            try { meta = JSON.parse(chunk.metadata as string); } catch { /* skip */ }
          } else if (chunk.metadata && typeof chunk.metadata === 'object') {
            meta = chunk.metadata as Record<string, unknown>;
          }
          if (meta.documentUrl) docUrls.add(meta.documentUrl as string);
        }

        if (docUrls.size > 0) {
          const session = db.neo4j.session();
          try {
            const result = await session.run(
              'MATCH (ch:Chunk)-[:FROM_DOCUMENT]->(d:Document) ' +
              'WHERE d.url IN $urls ' +
              'OPTIONAL MATCH (ch)-[:DISCUSSES]->(concept:Concept) ' +
              'RETURN d.url AS docUrl, ch.chunkIndex AS chunkIndex, collect(concept.name) AS concepts',
              { urls: Array.from(docUrls) }
            );
            for (const record of result.records) {
              const docUrl = record.get('docUrl') as string;
              const chunkIndex = record.get('chunkIndex')?.toNumber?.() ?? record.get('chunkIndex');
              const concepts = (record.get('concepts') as string[]).filter(Boolean);
              if (concepts.length > 0) {
                conceptMap[`${docUrl}:${chunkIndex}`] = concepts;
              }
            }
          } finally {
            await session.close();
          }
        }
      } catch (neo4jError) {
        console.warn('Neo4j concept enrichment failed (non-fatal):', neo4jError);
      }
    }

    // Format response
    const formattedChunks = chunks.map((chunk: Record<string, unknown>) => {
      const chunkId = typeof chunk.chunk_id === 'string'
        ? parseInt(chunk.chunk_id as string, 10)
        : (chunk.chunk_id as number);
      const contentText = (chunk.content_text as string) ?? '';

      // Parse metadata - Milvus JSON fields may already be objects or JSON strings
      let metadata: Record<string, unknown> = {};
      if (typeof chunk.metadata === 'string') {
        try {
          metadata = JSON.parse(chunk.metadata as string);
        } catch {
          metadata = {};
        }
      } else if (chunk.metadata && typeof chunk.metadata === 'object') {
        metadata = chunk.metadata as Record<string, unknown>;
      }

      return {
        chunkId: String(chunkId),
        contentPreview: contentText.length > 500 ? contentText.slice(0, 500) : contentText,
        contentFull: contentText,
        metadata: {
          documentId: metadata.documentId ?? null,
          documentTitle: metadata.documentTitle ?? null,
          documentUrl: metadata.documentUrl ?? null,
          sectionHeader: metadata.sectionHeader ?? null,
          chunkIndex: metadata.chunkIndex ?? null,
          totalChunks: metadata.totalChunks ?? null,
          tokenCount: metadata.tokenCount ?? null,
          hasCode: metadata.hasCode ?? false,
          hasFormula: metadata.hasFormula ?? false,
          hasTable: metadata.hasTable ?? false,
        },
        topicTag: (chunk.topic_tag as string) ?? '',
        concepts: conceptMap[`${metadata.documentUrl}:${metadata.chunkIndex}`] ?? [],
      };
    });

    const totalPages = Math.ceil(total / limit);

    return c.json(
      {
        chunks: formattedChunks,
        pagination: { page, limit, total, totalPages },
      },
      200
    );
  } catch (error) {
    console.error('List chunks error:', error);
    return errorJson(c, 'LIST_CHUNKS_ERROR', error instanceof Error ? error.message : 'Failed to list chunks', 500);
  }
});

// ============================================================================
// Knowledge Graph Endpoint
// ============================================================================

/**
 * GET /api/admin/graph
 *
 * Return knowledge graph data for visualization.
 * Queries Neo4j for concepts, their relationships, and connected documents.
 */
admin.get('/graph', async (c) => {
  if (!db.isConnected) {
    return errorJson(c, 'SERVICE_UNAVAILABLE', 'Database not connected', 500);
  }

  try {
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '100', 10) || 100, 1), 500);
    const minConnections = Math.max(parseInt(c.req.query('minConnections') || '1', 10) || 1, 1);

    const session = db.neo4j.session();
    try {
      // 1. Get concepts with their connection counts (relationships to other concepts or chunks)
      // Count both DISCUSSES (chunk->concept) and concept-to-concept relationships
      const conceptsResult = await session.run(
        `MATCH (c:Concept) ` +
        `OPTIONAL MATCH (c)<-[:DISCUSSES]-(chunk:Chunk) ` +
        `OPTIONAL MATCH (c)-[rel]-(other:Concept) ` +
        `WITH c, count(DISTINCT chunk) as chunkCount, count(DISTINCT rel) as relCount ` +
        `WHERE chunkCount + relCount >= ${Math.floor(minConnections)} ` +
        `RETURN c.name as name, chunkCount, relCount ` +
        `ORDER BY chunkCount + relCount DESC ` +
        `LIMIT ${Math.floor(limit)}`
      );

      const conceptNames: string[] = [];
      const conceptNodes: Array<{
        id: string;
        label: string;
        type: string;
        chunkCount: number;
      }> = [];

      for (const record of conceptsResult.records) {
        const name = record.get('name') as string;
        const chunkCount = record.get('chunkCount')?.toNumber?.() ?? 0;
        const relCount = record.get('relCount')?.toNumber?.() ?? 0;
        conceptNames.push(name);
        conceptNodes.push({
          id: `concept:${name}`,
          label: name,
          type: 'concept',
          chunkCount: chunkCount + relCount, // total connections
        });
      }

      // 2. Get relationships between those concepts
      const edges: Array<{
        source: string;
        target: string;
        relationship: string;
      }> = [];

      if (conceptNames.length > 0) {
        const relsResult = await session.run(
          'MATCH (c1:Concept)-[r]->(c2:Concept) ' +
          'WHERE c1.name IN $names AND c2.name IN $names ' +
          'RETURN c1.name as source, c2.name as target, type(r) as relationship',
          { names: conceptNames }
        );

        for (const record of relsResult.records) {
          edges.push({
            source: `concept:${record.get('source') as string}`,
            target: `concept:${record.get('target') as string}`,
            relationship: record.get('relationship') as string,
          });
        }
      }

      // 3. Get documents connected to these concepts
      const documentNodes: Array<{
        id: string;
        label: string;
        type: string;
        chunkCount: number;
      }> = [];

      if (conceptNames.length > 0) {
        const docsResult = await session.run(
          'MATCH (d:Document)<-[:FROM_DOCUMENT]-(chunk:Chunk) ' +
          'WITH d, count(DISTINCT chunk) as chunkCount ' +
          'RETURN d.url as url, d.title as title, chunkCount',
        );

        for (const record of docsResult.records) {
          const url = record.get('url') as string;
          const title = (record.get('title') as string) ?? url;
          const chunkCount = record.get('chunkCount')?.toNumber?.() ?? 0;

          // Create a stable ID from the URL
          const docId = `doc:${url}`;
          documentNodes.push({
            id: docId,
            label: title,
            type: 'document',
            chunkCount,
          });

        }

        // Add HAS_CHUNK edges from documents to concepts via chunk->concept triples
        // Find which concepts were extracted from chunks belonging to each document
        const docConceptResult = await session.run(
          'MATCH (d:Document)<-[:FROM_DOCUMENT]-(chunk:Chunk)-[:DISCUSSES]->(c:Concept) ' +
          'WHERE c.name IN $names ' +
          'RETURN d.url as url, collect(DISTINCT c.name) as concepts',
          { names: conceptNames }
        );
        for (const record of docConceptResult.records) {
          const url = record.get('url') as string;
          const docConcepts = record.get('concepts') as string[];
          const docId = `doc:${url}`;
          for (const conceptName of docConcepts) {
            edges.push({
              source: docId,
              target: `concept:${conceptName}`,
              relationship: 'HAS_CONCEPT',
            });
          }
        }
      }

      // 4. Collect stats
      const totalRelationships = edges.filter((e) => e.relationship !== 'HAS_CONCEPT').length;

      return c.json(
        {
          nodes: [...conceptNodes, ...documentNodes],
          edges,
          stats: {
            totalConcepts: conceptNodes.length,
            totalRelationships,
            totalDocuments: documentNodes.length,
          },
        },
        200
      );
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error('Graph data error:', error);
    return errorJson(c, 'GRAPH_ERROR', error instanceof Error ? error.message : 'Failed to get graph data', 500);
  }
});

export default admin;
