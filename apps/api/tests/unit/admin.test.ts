/**
 * Admin Routes Tests
 *
 * Unit tests for knowledge base administration endpoints:
 * - POST /upload, /upload/force
 * - GET /jobs, /jobs/:jobId/status
 * - GET /sources, /sources/:documentId
 * - DELETE /sources/:documentId
 * - POST /sources/:documentId/retry
 * - GET /health
 *
 * @module apps/api/tests/unit/admin
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ============================================================================
// Mock Setup
// ============================================================================

// Track setImmediate calls for background job verification
const setImmediateSpy = vi.fn((fn: () => void) => fn());
vi.stubGlobal('setImmediate', setImmediateSpy);

// Mock upload utility
const mockSaveUploadToTemp = vi.fn();
const mockCleanupTempFile = vi.fn().mockResolvedValue(undefined);
const mockDetectFormat = vi.fn();

vi.mock('../../src/lib/upload', () => ({
  saveUploadToTemp: (...args: unknown[]) => mockSaveUploadToTemp(...args),
  cleanupTempFile: (...args: unknown[]) => mockCleanupTempFile(...args),
  detectFormat: (...args: unknown[]) => mockDetectFormat(...args),
  MAX_FILE_SIZE: 10 * 1024 * 1024,
}));

// Mock database chain helpers
function createChainMock(result: unknown[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockResolvedValue(result);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  // Terminal: when used as a thenable, resolve with result
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

let mockPostgres: ReturnType<typeof createChainMock>;
let mockIsConnected: boolean;

const mockNeo4jSession = {
  run: vi.fn().mockResolvedValue({ records: [] }),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockNeo4j = {
  session: vi.fn().mockReturnValue(mockNeo4jSession),
};

const mockMilvus = {};

const mockPipelineProcessJob = vi.fn().mockResolvedValue(undefined);
const mockPipelineGetStorage = vi.fn().mockReturnValue({
  deleteChunks: vi.fn().mockResolvedValue(undefined),
});
const mockPipelineSetDatabase = vi.fn();

vi.mock('@jubilant/rag', () => ({
  createIngestionPipeline: vi.fn().mockReturnValue({
    processJob: (...args: unknown[]) => mockPipelineProcessJob(...args),
    getStorage: () => mockPipelineGetStorage(),
    setDatabase: (...args: unknown[]) => mockPipelineSetDatabase(...args),
  }),
}));

vi.mock('@jubilant/database', () => {
  // Create proxy for postgresSchema that returns unique symbols for each table/column
  const schemaProxy = new Proxy(
    {},
    {
      get(_target, tableName) {
        return new Proxy(
          { _table: tableName },
          {
            get(target, columnName) {
              if (columnName === '_table') return (target as { _table: string })._table;
              return { _table: tableName, _column: columnName };
            },
          }
        );
      },
    }
  );

  return {
    get db() {
      return {
        get isConnected() {
          return mockIsConnected;
        },
        get postgres() {
          return mockPostgres;
        },
        milvus: mockMilvus,
        neo4j: mockNeo4j,
      };
    },
    postgresSchema: schemaProxy,
    eq: vi.fn().mockReturnValue('eq_condition'),
    ilike: vi.fn().mockReturnValue('ilike_condition'),
    and: vi.fn((...args: unknown[]) => args),
    sql: vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => 'sql_expression'),
  };
});

// Mock fs/promises for retry source file check
vi.mock('fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// Import admin routes AFTER mocking
import adminRoutes from '../../src/routes/admin';
import { ilike } from '@jubilant/database';

// ============================================================================
// Test Helpers
// ============================================================================

const VALID_UUID = '12345678-1234-1234-1234-123456789abc';
const VALID_UUID_2 = 'aabbccdd-aabb-aabb-aabb-aabbccddeeff';

function createApp() {
  const app = new Hono();
  app.route('/api/admin', adminRoutes);
  return app;
}

function createFormDataWithFile(
  content: string,
  filename: string,
  opts?: { size?: number; title?: string; author?: string }
) {
  const formData = new FormData();
  const fileContent = opts?.size ? 'x'.repeat(opts.size) : content;
  formData.append('file', new File([fileContent], filename, { type: 'application/octet-stream' }));
  if (opts?.title) formData.append('title', opts.title);
  if (opts?.author) formData.append('author', opts.author);
  return formData;
}

// ============================================================================
// Setup
// ============================================================================

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.clearAllMocks();
  mockIsConnected = true;
  mockPostgres = createChainMock([]);

  // Default: detectFormat returns 'pdf'
  mockDetectFormat.mockReturnValue('pdf');
  // Default: saveUploadToTemp succeeds
  mockSaveUploadToTemp.mockResolvedValue({
    path: '/tmp/competitiontutor-uploads/test-uuid.pdf',
    hash: 'abc123hash',
    size: 1024,
  });

  app = createApp();
});

// ============================================================================
// POST /upload - Validation
// ============================================================================

describe('POST /api/admin/upload - validation', () => {
  it('should return 400 MISSING_FILE when no file provided', async () => {
    const formData = new FormData();
    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('MISSING_FILE');
  });

  it('should return 400 EMPTY_FILE when file size is 0', async () => {
    const formData = new FormData();
    formData.append('file', new File([], 'empty.pdf', { type: 'application/pdf' }));

    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('EMPTY_FILE');
  });

  it('should return 400 FILE_TOO_LARGE when file exceeds 10MB', async () => {
    const formData = new FormData();
    // Create a file larger than 10MB
    const bigContent = new Uint8Array(10 * 1024 * 1024 + 1);
    formData.append('file', new File([bigContent], 'big.pdf', { type: 'application/pdf' }));

    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('FILE_TOO_LARGE');
  });

  it('should return 400 UNSUPPORTED_FORMAT for unsupported file type', async () => {
    mockDetectFormat.mockReturnValue(null);

    const formData = new FormData();
    formData.append('file', new File(['data'], 'virus.exe', { type: 'application/octet-stream' }));

    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('UNSUPPORTED_FORMAT');
  });

  it('should return 500 SERVICE_UNAVAILABLE when DB not connected', async () => {
    mockIsConnected = false;

    const formData = createFormDataWithFile('content', 'test.pdf');
    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
  });
});

// ============================================================================
// POST /upload - Duplicate Detection
// ============================================================================

describe('POST /api/admin/upload - duplicate detection', () => {
  it('should return 409 DUPLICATE_DOCUMENT when hash matches existing', async () => {
    // The chain for duplicate check: select().from().where().limit() resolves with existing doc
    const dupChain = createChainMock([{ id: VALID_UUID, title: 'Existing Doc' }]);
    mockPostgres.select = vi.fn().mockReturnValue(dupChain);

    const formData = createFormDataWithFile('content', 'test.pdf');
    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('DUPLICATE_DOCUMENT');
    expect(body.existingDocumentId).toBe(VALID_UUID);
    expect(body.existingTitle).toBe('Existing Doc');
  });

  it('should return 409 DUPLICATE_DOCUMENT on concurrent unique constraint error', async () => {
    // First select (dup check) returns empty, then insert throws unique constraint
    let selectCallCount = 0;
    mockPostgres.select = vi.fn().mockImplementation(() => {
      selectCallCount++;
      return createChainMock([]);
    });

    mockPostgres.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValueOnce(new Error('unique constraint violation'))
        .mockResolvedValue(undefined),
    });

    const formData = createFormDataWithFile('content', 'test.pdf');
    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('DUPLICATE_DOCUMENT');
  });
});

// ============================================================================
// POST /upload - Success
// ============================================================================

describe('POST /api/admin/upload - success', () => {
  beforeEach(() => {
    // No duplicate found, inserts succeed
    mockPostgres.select = vi.fn().mockReturnValue(createChainMock([]));
    mockPostgres.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockPostgres.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it('should return 202 with document details for valid PDF upload', async () => {
    const formData = createFormDataWithFile('pdf content', 'report.pdf');
    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.documentId).toBeDefined();
    expect(body.jobId).toBeDefined();
    expect(body.format).toBe('pdf');
    expect(body.fileSize).toBe(1024);
    expect(body.message).toContain('accepted');
  });

  it('should extract title from filename when not provided', async () => {
    const formData = createFormDataWithFile('content', 'my-great-notes.pdf');
    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    // "my-great-notes" with dashes/underscores replaced by spaces
    expect(body.title).toBe('my great notes');
  });

  it('should use provided title when given', async () => {
    const formData = createFormDataWithFile('content', 'file.pdf', {
      title: 'Custom Title',
    });
    const res = await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.title).toBe('Custom Title');
  });

  it('should start background ingestion job', async () => {
    const formData = createFormDataWithFile('content', 'test.pdf');
    await app.request('/api/admin/upload', {
      method: 'POST',
      body: formData,
    });

    expect(setImmediateSpy).toHaveBeenCalled();
  });
});

// ============================================================================
// POST /upload/force
// ============================================================================

describe('POST /api/admin/upload/force', () => {
  beforeEach(() => {
    mockPostgres.select = vi.fn().mockReturnValue(createChainMock([]));
    mockPostgres.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockPostgres.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it('should return 202 even for duplicate file (skips duplicate check)', async () => {
    // Even though there's a matching hash, force upload should succeed
    // The key is that the duplicate-check select is never called in force mode
    const formData = createFormDataWithFile('content', 'test.pdf');
    const res = await app.request('/api/admin/upload/force', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.documentId).toBeDefined();
  });

  it('should still validate format', async () => {
    mockDetectFormat.mockReturnValue(null);

    const formData = new FormData();
    formData.append('file', new File(['data'], 'virus.exe'));

    const res = await app.request('/api/admin/upload/force', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('UNSUPPORTED_FORMAT');
  });

  it('should still validate size', async () => {
    const formData = new FormData();
    const bigContent = new Uint8Array(10 * 1024 * 1024 + 1);
    formData.append('file', new File([bigContent], 'big.pdf'));

    const res = await app.request('/api/admin/upload/force', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('FILE_TOO_LARGE');
  });
});

// ============================================================================
// GET /jobs/:jobId/status
// ============================================================================

describe('GET /api/admin/jobs/:jobId/status', () => {
  it('should return 200 with job details for valid job', async () => {
    const jobData = {
      id: VALID_UUID,
      documentId: VALID_UUID_2,
      status: 'processing',
      currentStep: 'chunking',
      progress: 50,
      totalChunks: 10,
      processedChunks: 5,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
    };

    mockPostgres.select = vi.fn().mockReturnValue(createChainMock([jobData]));

    const res = await app.request(`/api/admin/jobs/${VALID_UUID}/status`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(VALID_UUID);
    expect(body.documentId).toBe(VALID_UUID_2);
    expect(body.status).toBe('processing');
    expect(body.progress).toBe(50);
    expect(body.processedChunks).toBe(5);
  });

  it('should return 400 INVALID_JOB_ID for non-UUID', async () => {
    const res = await app.request('/api/admin/jobs/not-a-uuid/status');

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_JOB_ID');
  });

  it('should return 404 JOB_NOT_FOUND when job does not exist', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(createChainMock([]));

    const res = await app.request(`/api/admin/jobs/${VALID_UUID}/status`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('JOB_NOT_FOUND');
  });
});

// ============================================================================
// GET /jobs
// ============================================================================

describe('GET /api/admin/jobs', () => {
  it('should return jobs list with summary counts', async () => {
    const jobsList = [
      {
        id: VALID_UUID,
        documentId: VALID_UUID_2,
        documentTitle: 'Test Doc',
        status: 'complete',
        currentStep: null,
        progress: 100,
        totalChunks: 10,
        processedChunks: 10,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    ];

    const summaryRows = [
      { status: 'complete', count: 5 },
      { status: 'failed', count: 2 },
      { status: 'queued', count: 1 },
    ];

    let selectCallCount = 0;
    mockPostgres.select = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return createChainMock(jobsList);
      }
      return createChainMock(summaryRows);
    });

    const res = await app.request('/api/admin/jobs');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.summary).toBeDefined();
    expect(body.summary.completed).toBe(5);
    expect(body.summary.failed).toBe(2);
    expect(body.summary.queued).toBe(1);
  });

  it('should respect status filter', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(createChainMock([]));

    const res = await app.request('/api/admin/jobs?status=failed');

    expect(res.status).toBe(200);
  });

  it('should respect limit parameter', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(createChainMock([]));

    const res = await app.request('/api/admin/jobs?limit=5');

    expect(res.status).toBe(200);
  });
});

// ============================================================================
// GET /sources
// ============================================================================

describe('GET /api/admin/sources', () => {
  beforeEach(() => {
    let selectCallCount = 0;
    mockPostgres.select = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // Count query
        return createChainMock([{ count: 1 }]);
      }
      // Documents query
      return createChainMock([
        {
          id: VALID_UUID,
          title: 'Test Doc',
          format: 'pdf',
          fileSize: 1024,
          chunkCount: 10,
          status: 'active',
          createdAt: new Date(),
          ingestedAt: new Date(),
        },
      ]);
    });
  });

  it('should return paginated document list', async () => {
    const res = await app.request('/api/admin/sources');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toBeDefined();
    expect(body.total).toBeDefined();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  it('should escape ILIKE wildcards in search filter (CRITICAL-01)', async () => {
    const res = await app.request('/api/admin/sources?search=test%25_pattern');

    expect(res.status).toBe(200);
    // Verify ilike was called with escaped pattern
    expect(ilike).toHaveBeenCalled();
    const ilikeCall = vi.mocked(ilike).mock.calls[0];
    const searchPattern = ilikeCall[1] as string;
    // % should be escaped to \% and _ to \_
    expect(searchPattern).toContain('\\%');
    expect(searchPattern).toContain('\\_');
  });

  it('should support status filter', async () => {
    const res = await app.request('/api/admin/sources?status=active');

    expect(res.status).toBe(200);
  });

  it('should support format filter', async () => {
    const res = await app.request('/api/admin/sources?format=pdf');

    expect(res.status).toBe(200);
  });

  it('should exclude archived documents by default (CRITICAL-04)', async () => {
    // When no status filter, the code adds: status != 'archived'
    const { sql } = await import('@jubilant/database');
    const res = await app.request('/api/admin/sources');

    expect(res.status).toBe(200);
    // sql template tag should have been called (for the archived exclusion)
    expect(sql).toHaveBeenCalled();
  });

  it('should support sorting by different columns', async () => {
    const res = await app.request('/api/admin/sources?sortBy=title&sortOrder=asc');

    expect(res.status).toBe(200);
  });

  it('should support pagination parameters', async () => {
    const res = await app.request('/api/admin/sources?page=2&pageSize=10');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
  });
});

// ============================================================================
// GET /sources/:documentId
// ============================================================================

describe('GET /api/admin/sources/:documentId', () => {
  it('should return 200 with full document details and jobs history', async () => {
    const docData = {
      id: VALID_UUID,
      title: 'Test Document',
      format: 'pdf',
      author: 'Author',
      fileSize: 2048,
      fileHash: 'somehash',
      chunkCount: 15,
      status: 'active',
      errorMessage: null,
      metadata: { key: 'value' },
      createdAt: new Date(),
      updatedAt: new Date(),
      ingestedAt: new Date(),
    };

    const jobsData = [
      {
        id: VALID_UUID_2,
        documentId: VALID_UUID,
        status: 'complete',
        currentStep: null,
        progress: 100,
        totalChunks: 15,
        processedChunks: 15,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    ];

    let selectCallCount = 0;
    mockPostgres.select = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return createChainMock([docData]);
      }
      return createChainMock(jobsData);
    });

    const res = await app.request(`/api/admin/sources/${VALID_UUID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(VALID_UUID);
    expect(body.title).toBe('Test Document');
    expect(body.format).toBe('pdf');
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].id).toBe(VALID_UUID_2);
  });

  it('should return 400 for invalid UUID', async () => {
    const res = await app.request('/api/admin/sources/not-valid');

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_DOCUMENT_ID');
  });

  it('should return 404 when document not found', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(createChainMock([]));

    const res = await app.request(`/api/admin/sources/${VALID_UUID}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('DOCUMENT_NOT_FOUND');
  });
});

// ============================================================================
// DELETE /sources/:documentId
// ============================================================================

describe('DELETE /api/admin/sources/:documentId', () => {
  it('should return 200 with deletedChunks count for valid document', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(
      createChainMock([{ id: VALID_UUID, url: 'upload://doc/file.pdf', chunkCount: 25 }])
    );
    mockPostgres.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const res = await app.request(`/api/admin/sources/${VALID_UUID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedChunks).toBe(25);
    expect(body.message).toContain(VALID_UUID);
  });

  it('should archive the document (set status to archived)', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(
      createChainMock([{ id: VALID_UUID, url: 'upload://doc/file.pdf', chunkCount: 5 }])
    );
    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockPostgres.update = vi.fn().mockReturnValue({ set: mockSet });

    await app.request(`/api/admin/sources/${VALID_UUID}`, { method: 'DELETE' });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived' })
    );
  });

  it('should call storage.deleteChunks', async () => {
    const mockDeleteChunks = vi.fn().mockResolvedValue(undefined);
    mockPipelineGetStorage.mockReturnValue({ deleteChunks: mockDeleteChunks });
    mockPostgres.select = vi.fn().mockReturnValue(
      createChainMock([{ id: VALID_UUID, url: 'upload://doc/file.pdf', chunkCount: 5 }])
    );
    mockPostgres.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await app.request(`/api/admin/sources/${VALID_UUID}`, { method: 'DELETE' });

    expect(mockDeleteChunks).toHaveBeenCalledWith('upload://doc/file.pdf', VALID_UUID);
  });

  it('should return 404 when document not found', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(createChainMock([]));

    const res = await app.request(`/api/admin/sources/${VALID_UUID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('DOCUMENT_NOT_FOUND');
  });
});

// ============================================================================
// POST /sources/:documentId/retry
// ============================================================================

describe('POST /api/admin/sources/:documentId/retry', () => {
  it('should return 202 with new jobId for failed document', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(
      createChainMock([{
        id: VALID_UUID,
        status: 'failed',
        url: 'https://example.com/doc.pdf',
        title: 'Failed Doc',
      }])
    );
    mockPostgres.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mockPostgres.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const res = await app.request(`/api/admin/sources/${VALID_UUID}/retry`, {
      method: 'POST',
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBeDefined();
    expect(body.message).toContain('Retry');
  });

  it('should return 400 INVALID_STATE for non-failed document', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(
      createChainMock([{
        id: VALID_UUID,
        status: 'active',
        url: 'https://example.com/doc.pdf',
      }])
    );

    const res = await app.request(`/api/admin/sources/${VALID_UUID}/retry`, {
      method: 'POST',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_STATE');
  });

  it('should return 400 SOURCE_FILE_MISSING when local file is gone (CRITICAL-05)', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(
      createChainMock([{
        id: VALID_UUID,
        status: 'failed',
        url: '/tmp/competitiontutor-uploads/old-file.pdf',
      }])
    );

    // Mock fs/promises access to throw (file not found)
    const fsPromises = await import('fs/promises');
    vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('ENOENT'));

    const res = await app.request(`/api/admin/sources/${VALID_UUID}/retry`, {
      method: 'POST',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('SOURCE_FILE_MISSING');
  });

  it('should return 404 when document not found', async () => {
    mockPostgres.select = vi.fn().mockReturnValue(createChainMock([]));

    const res = await app.request(`/api/admin/sources/${VALID_UUID}/retry`, {
      method: 'POST',
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('DOCUMENT_NOT_FOUND');
  });
});

// ============================================================================
// GET /health
// ============================================================================

describe('GET /api/admin/health', () => {
  it('should return aggregate stats', async () => {
    let selectCallCount = 0;
    mockPostgres.select = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // Doc stats
        return createChainMock([{ totalDocuments: 10, totalChunks: 150 }]);
      }
      if (selectCallCount === 2) {
        // Format breakdown
        return createChainMock([
          { format: 'pdf', count: 5 },
          { format: 'markdown', count: 3 },
          { format: 'text', count: 2 },
        ]);
      }
      // Status breakdown
      return createChainMock([
        { status: 'active', count: 8 },
        { status: 'failed', count: 2 },
      ]);
    });

    // Neo4j returns concept data
    mockNeo4jSession.run.mockResolvedValueOnce({
      records: [{ get: () => ({ toNumber: () => 42 }) }],
    }).mockResolvedValueOnce({
      records: [
        {
          get: (key: string) =>
            key === 'name'
              ? 'Graph Theory'
              : { toNumber: () => 15 },
        },
      ],
    });

    const res = await app.request('/api/admin/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalDocuments).toBe(10);
    expect(body.totalChunks).toBe(150);
    expect(body.totalConcepts).toBe(42);
    expect(body.avgChunksPerDocument).toBe(15);
    expect(body.documentsByFormat).toBeDefined();
    expect(body.documentsByFormat.pdf).toBe(5);
    expect(body.documentsByStatus).toBeDefined();
    expect(body.documentsByStatus.active).toBe(8);
    expect(body.topConcepts).toHaveLength(1);
    expect(body.topConcepts[0].name).toBe('Graph Theory');
  });

  it('should handle Neo4j failure gracefully (non-fatal)', async () => {
    let selectCallCount = 0;
    mockPostgres.select = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return createChainMock([{ totalDocuments: 5, totalChunks: 50 }]);
      }
      if (selectCallCount === 2) {
        return createChainMock([]);
      }
      return createChainMock([]);
    });

    // Neo4j throws
    mockNeo4j.session.mockReturnValue({
      run: vi.fn().mockRejectedValue(new Error('Neo4j connection failed')),
      close: vi.fn().mockResolvedValue(undefined),
    });

    const res = await app.request('/api/admin/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalDocuments).toBe(5);
    expect(body.totalConcepts).toBe(0);
    expect(body.topConcepts).toEqual([]);
  });

  it('should return correct format and status breakdowns', async () => {
    let selectCallCount = 0;
    mockPostgres.select = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return createChainMock([{ totalDocuments: 0, totalChunks: 0 }]);
      }
      if (selectCallCount === 2) {
        return createChainMock([]);
      }
      return createChainMock([]);
    });

    mockNeo4jSession.run.mockResolvedValue({ records: [] });

    const res = await app.request('/api/admin/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    // Default format breakdown
    expect(body.documentsByFormat).toEqual({ pdf: 0, markdown: 0, text: 0 });
    // Default status breakdown
    expect(body.documentsByStatus).toEqual({
      active: 0,
      processing: 0,
      failed: 0,
      pending: 0,
    });
    expect(body.avgChunksPerDocument).toBe(0);
  });

  it('should return 500 when DB not connected', async () => {
    mockIsConnected = false;

    const res = await app.request('/api/admin/health');

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
  });
});
