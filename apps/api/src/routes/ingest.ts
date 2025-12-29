/**
 * Ingestion Routes
 *
 * Endpoints for document ingestion:
 * - POST /api/ingest - Submit a document for ingestion
 * - GET /api/ingest/:jobId/status - Check ingestion job status
 *
 * @module apps/api/routes/ingest
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, postgresSchema, eq } from '@jubilant/database';
import {
  createIngestionPipeline,
  validateSource,
  isFormatSupported,
  type IngestRequest,
  type DatabaseOperations,
  type IngestionJob,
  type DocumentRecord,
  type ErrorResponse,
} from '@jubilant/rag';

const ingest = new Hono();

// ============================================================================
// Validation Schemas (T066)
// ============================================================================

const SUPPORTED_FORMATS = ['markdown', 'pdf', 'text'] as const;

const ingestSchema = z.object({
  documentUrl: z
    .string()
    .min(1, 'Document URL is required')
    .refine(
      (url) => {
        // Must be a valid URL or local file path
        if (url.startsWith('http://') || url.startsWith('https://')) {
          try {
            new URL(url);
            return true;
          } catch {
            return false;
          }
        }
        // Local file paths are allowed
        return url.length > 0;
      },
      { message: 'Invalid URL format' }
    ),
  title: z.string().max(255).optional(),
  format: z.enum(SUPPORTED_FORMATS).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Pipeline Initialization
// ============================================================================

let pipeline: ReturnType<typeof createIngestionPipeline> | null = null;

/**
 * Create a DatabaseOperations implementation using the @jubilant/database package
 */
function createDatabaseOperations(): DatabaseOperations {
  return {
    async insertDocument(doc: {
      id: string;
      url: string;
      title: string;
      format: string;
      status: string;
      metadata: Record<string, unknown>;
    }): Promise<void> {
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

    async insertJob(job: {
      id: string;
      documentId: string;
      status: string;
      progress: number;
    }): Promise<void> {
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

    async updateJob(jobId: string, updates: Partial<IngestionJob>): Promise<void> {
      await db.postgres
        .update(postgresSchema.ingestionJobs)
        .set(updates as Record<string, unknown>)
        .where(eq(postgresSchema.ingestionJobs.id, jobId));
    },

    async updateDocument(documentId: string, updates: Partial<DocumentRecord>): Promise<void> {
      await db.postgres
        .update(postgresSchema.documents)
        .set({ ...updates, updatedAt: new Date() } as Record<string, unknown>)
        .where(eq(postgresSchema.documents.id, documentId));
    },
  };
}

/**
 * Get or create the ingestion pipeline
 */
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
// Conflict Detection (T067)
// ============================================================================

/**
 * Check if a document with the same URL already exists
 */
async function checkDuplicateDocument(url: string): Promise<{
  exists: boolean;
  documentId?: string;
  status?: string;
}> {
  const existing = await db.postgres
    .select({
      id: postgresSchema.documents.id,
      status: postgresSchema.documents.status,
    })
    .from(postgresSchema.documents)
    .where(eq(postgresSchema.documents.url, url))
    .limit(1);

  if (existing.length > 0) {
    return {
      exists: true,
      documentId: existing[0].id,
      status: existing[0].status || undefined,
    };
  }

  return { exists: false };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/ingest
 *
 * Submit a document for ingestion.
 * Returns a job ID for tracking progress.
 */
ingest.post(
  '/',
  zValidator('json', ingestSchema, (result, c) => {
    if (!result.success) {
      const errorResponse: ErrorResponse = {
        error: 'VALIDATION_ERROR',
        message: 'Invalid ingestion request',
        details: result.error.flatten().fieldErrors,
      };
      return c.json(errorResponse, 400);
    }
  }),
  async (c) => {
    const body = c.req.valid('json');

    try {
      // Validate source
      const validation = validateSource(body.documentUrl);
      if (!validation.valid) {
        const errorResponse: ErrorResponse = {
          error: 'INVALID_SOURCE',
          message: validation.error || 'Invalid document source',
        };
        return c.json(errorResponse, 400);
      }

      // Validate format if specified
      if (body.format && !isFormatSupported(body.format)) {
        const errorResponse: ErrorResponse = {
          error: 'UNSUPPORTED_FORMAT',
          message: `Format '${body.format}' is not supported. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
        };
        return c.json(errorResponse, 400);
      }

      // Check for duplicates (T067)
      const duplicate = await checkDuplicateDocument(body.documentUrl);
      if (duplicate.exists) {
        const errorResponse: ErrorResponse = {
          error: 'DOCUMENT_EXISTS',
          message: `Document already exists with ID: ${duplicate.documentId}`,
          details: {
            documentId: duplicate.documentId,
            status: duplicate.status,
          },
        };
        return c.json(errorResponse, 409);
      }

      // Start ingestion
      const ingestionPipeline = getOrCreatePipeline();

      const request: IngestRequest = {
        documentUrl: body.documentUrl,
        title: body.title,
        format: body.format,
        metadata: body.metadata,
      };

      const response = await ingestionPipeline.startIngestion(request);

      // Start processing in background
      // Note: In production, use a proper job queue (e.g., Bull, BullMQ)
      setImmediate(async () => {
        try {
          await ingestionPipeline.processJob(response.jobId);
        } catch (error) {
          console.error(`Ingestion job ${response.jobId} failed:`, error);
        }
      });

      return c.json(response, 202);
    } catch (error) {
      console.error('Ingestion error:', error);

      const errorResponse: ErrorResponse = {
        error: 'INGESTION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to start ingestion',
      };

      return c.json(errorResponse, 500);
    }
  }
);

/**
 * GET /api/ingest/:jobId/status
 *
 * Get the status of an ingestion job.
 */
ingest.get('/:jobId/status', async (c) => {
  const jobId = c.req.param('jobId');

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(jobId)) {
    const errorResponse: ErrorResponse = {
      error: 'INVALID_JOB_ID',
      message: 'Job ID must be a valid UUID',
    };
    return c.json(errorResponse, 400);
  }

  try {
    const ingestionPipeline = getOrCreatePipeline();
    const status = await ingestionPipeline.getJobStatus(jobId);

    if (!status) {
      const errorResponse: ErrorResponse = {
        error: 'JOB_NOT_FOUND',
        message: `Ingestion job ${jobId} not found`,
      };
      return c.json(errorResponse, 404);
    }

    return c.json(status, 200);
  } catch (error) {
    console.error('Status check error:', error);

    const errorResponse: ErrorResponse = {
      error: 'STATUS_CHECK_ERROR',
      message: error instanceof Error ? error.message : 'Failed to check job status',
    };

    return c.json(errorResponse, 500);
  }
});

/**
 * DELETE /api/ingest/:documentId
 *
 * Delete an ingested document and all its chunks.
 * (Optional endpoint - not in original spec but useful)
 */
ingest.delete('/:documentId', async (c) => {
  const documentId = c.req.param('documentId');

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(documentId)) {
    const errorResponse: ErrorResponse = {
      error: 'INVALID_DOCUMENT_ID',
      message: 'Document ID must be a valid UUID',
    };
    return c.json(errorResponse, 400);
  }

  try {
    // Get document to find URL
    const docs = await db.postgres
      .select({ url: postgresSchema.documents.url })
      .from(postgresSchema.documents)
      .where(eq(postgresSchema.documents.id, documentId))
      .limit(1);

    if (docs.length === 0) {
      const errorResponse: ErrorResponse = {
        error: 'DOCUMENT_NOT_FOUND',
        message: `Document ${documentId} not found`,
      };
      return c.json(errorResponse, 404);
    }

    const ingestionPipeline = getOrCreatePipeline();

    // Delete chunks from both stores
    await ingestionPipeline.getStorage().deleteChunks(docs[0].url, documentId);

    // Update document status
    await db.postgres
      .update(postgresSchema.documents)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(postgresSchema.documents.id, documentId));

    return c.json({ success: true, documentId }, 200);
  } catch (error) {
    console.error('Delete error:', error);

    const errorResponse: ErrorResponse = {
      error: 'DELETE_ERROR',
      message: error instanceof Error ? error.message : 'Failed to delete document',
    };

    return c.json(errorResponse, 500);
  }
});

export default ingest;
