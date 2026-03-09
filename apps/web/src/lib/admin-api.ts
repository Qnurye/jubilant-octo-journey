import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Types (matching OpenAPI spec)
// ---------------------------------------------------------------------------

export type DocumentStatus = 'pending' | 'processing' | 'active' | 'failed' | 'archived';
export type DocumentFormat = 'pdf' | 'markdown' | 'text';
export type JobStatus = 'queued' | 'chunking' | 'embedding' | 'extracting' | 'complete' | 'failed';

export interface UploadResponse {
  documentId: string;
  jobId: string;
  title: string;
  format: DocumentFormat;
  fileSize: number;
  message: string;
}

export interface DuplicateResponse {
  error: 'DUPLICATE_DOCUMENT';
  message: string;
  existingDocumentId: string;
  existingTitle: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DocumentSummary {
  id: string;
  title: string;
  format: DocumentFormat;
  fileSize: number;
  chunkCount: number;
  status: DocumentStatus;
  createdAt: string;
  ingestedAt: string | null;
}

export interface DocumentDetail {
  id: string;
  title: string;
  format: DocumentFormat;
  author: string | null;
  fileSize: number | null;
  fileHash: string | null;
  chunkCount: number;
  status: DocumentStatus;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  ingestedAt: string | null;
  jobs: JobSummary[];
}

export interface JobSummary {
  id: string;
  documentId: string;
  documentTitle: string;
  status: JobStatus;
  currentStep: string | null;
  progress: number;
  totalChunks: number | null;
  processedChunks: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobDetail {
  id: string;
  documentId: string;
  status: JobStatus;
  currentStep: string | null;
  progress: number;
  totalChunks: number | null;
  processedChunks: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface SourcesResponse {
  documents: DocumentSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JobsResponse {
  jobs: JobSummary[];
  summary: {
    processing: number;
    queued: number;
    completed: number;
    failed: number;
  };
}

export interface HealthStats {
  totalDocuments: number;
  totalChunks: number;
  totalConcepts: number;
  avgChunksPerDocument: number;
  documentsByFormat: {
    pdf: number;
    markdown: number;
    text: number;
  };
  documentsByStatus: {
    active: number;
    processing: number;
    failed: number;
    pending: number;
  };
  topConcepts: Array<{
    name: string;
    chunkCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'UNKNOWN', message: res.statusText }));
    throw Object.assign(new Error(body.message || res.statusText), {
      status: res.status,
      body,
    });
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Upload hooks (T011)
// ---------------------------------------------------------------------------

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation<UploadResponse, Error & { status?: number; body?: DuplicateResponse }, File & { title?: string; author?: string }>({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      if (file.title) formData.append('title', file.title);
      if (file.author) formData.append('author', file.author);

      const res = await fetch(`${API_URL}/api/admin/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'UNKNOWN', message: res.statusText }));
        throw Object.assign(new Error(body.message || res.statusText), {
          status: res.status,
          body,
        });
      }

      return res.json() as Promise<UploadResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });
    },
  });
}

export function useUploadForce() {
  const queryClient = useQueryClient();

  return useMutation<UploadResponse, Error, File>({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/api/admin/upload/force`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'UNKNOWN', message: res.statusText }));
        throw Object.assign(new Error(body.message || res.statusText), {
          status: res.status,
          body,
        });
      }

      return res.json() as Promise<UploadResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });
    },
  });
}

export function useJobStatus(jobId: string | null) {
  return useQuery<JobDetail>({
    queryKey: ['admin', 'jobs', jobId, 'status'],
    queryFn: () => adminFetch<JobDetail>(`/api/admin/jobs/${jobId}/status`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === 'complete' || data.status === 'failed')) return false;
      return 2000;
    },
  });
}

// ---------------------------------------------------------------------------
// Sources hooks (T018)
// ---------------------------------------------------------------------------

export interface SourcesParams {
  page?: number;
  pageSize?: number;
  status?: DocumentStatus;
  format?: DocumentFormat;
  search?: string;
  sortBy?: 'createdAt' | 'title' | 'chunkCount' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
}

export function useSources(params: SourcesParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params.status) searchParams.set('status', params.status);
  if (params.format) searchParams.set('format', params.format);
  if (params.search) searchParams.set('search', params.search);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const qs = searchParams.toString();

  return useQuery<SourcesResponse>({
    queryKey: ['admin', 'sources', params],
    queryFn: () => adminFetch<SourcesResponse>(`/api/admin/sources${qs ? `?${qs}` : ''}`),
  });
}

export function useSourceDetail(id: string | null) {
  return useQuery<DocumentDetail>({
    queryKey: ['admin', 'sources', id],
    queryFn: () => adminFetch<DocumentDetail>(`/api/admin/sources/${id}`),
    enabled: !!id,
  });
}

export function useDeleteSource() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string; deletedChunks: number }, Error, string>({
    mutationFn: (documentId) =>
      adminFetch(`/api/admin/sources/${documentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'health'] });
    },
  });
}

export function useRetryIngestion() {
  const queryClient = useQueryClient();

  return useMutation<{ jobId: string; message: string }, Error, string>({
    mutationFn: (documentId) =>
      adminFetch(`/api/admin/sources/${documentId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Jobs hooks (T023)
// ---------------------------------------------------------------------------

export interface JobsParams {
  status?: JobStatus;
  limit?: number;
}

export function useJobs(params: JobsParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.limit) searchParams.set('limit', String(params.limit));

  const qs = searchParams.toString();

  return useQuery<JobsResponse>({
    queryKey: ['admin', 'jobs', params],
    queryFn: () => adminFetch<JobsResponse>(`/api/admin/jobs${qs ? `?${qs}` : ''}`),
    refetchInterval: 2000,
  });
}

export function useJobsSummary() {
  return useQuery<JobsResponse['summary']>({
    queryKey: ['admin', 'jobs', 'summary'],
    queryFn: async () => {
      const data = await adminFetch<JobsResponse>('/api/admin/jobs?limit=1');
      return data.summary;
    },
    refetchInterval: 2000,
  });
}

// ---------------------------------------------------------------------------
// Health hooks (T027)
// ---------------------------------------------------------------------------

export function useHealthStats() {
  return useQuery<HealthStats>({
    queryKey: ['admin', 'health'],
    queryFn: () => adminFetch<HealthStats>('/api/admin/health'),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Chunks types & hooks
// ---------------------------------------------------------------------------

export interface ChunkItem {
  chunkId: string;
  contentPreview: string;
  contentFull: string;
  metadata: {
    documentId: string;
    documentTitle: string;
    documentUrl: string;
    sectionHeader?: string;
    chunkIndex: number;
    totalChunks: number;
    tokenCount: number;
    hasCode: boolean;
    hasFormula: boolean;
    hasTable: boolean;
  };
  topicTag: string;
  concepts: string[];
}

export interface ChunksResponse {
  chunks: ChunkItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ChunksParams {
  page?: number;
  limit?: number;
  search?: string;
  documentId?: string;
  topicTag?: string;
  concept?: string;
}

export function useChunks(params: ChunksParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.search) searchParams.set('search', params.search);
  if (params.documentId) searchParams.set('documentId', params.documentId);
  if (params.topicTag) searchParams.set('topicTag', params.topicTag);
  if (params.concept) searchParams.set('concept', params.concept);

  const qs = searchParams.toString();

  return useQuery<ChunksResponse>({
    queryKey: ['admin', 'chunks', params],
    queryFn: () => adminFetch<ChunksResponse>(`/api/admin/chunks${qs ? `?${qs}` : ''}`),
  });
}

// ---------------------------------------------------------------------------
// Graph types & hooks
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  label: string;
  type: 'concept' | 'document';
  chunkCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { totalConcepts: number; totalRelationships: number; totalDocuments: number };
}

export interface GraphParams {
  limit?: number;
  minConnections?: number;
}

export function useGraph(params: GraphParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.minConnections) searchParams.set('minConnections', String(params.minConnections));

  const qs = searchParams.toString();

  return useQuery<GraphResponse>({
    queryKey: ['admin', 'graph', params],
    queryFn: () => adminFetch<GraphResponse>(`/api/admin/graph${qs ? `?${qs}` : ''}`),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function getStatusColor(status: DocumentStatus | JobStatus): string {
  switch (status) {
    case 'active':
    case 'complete':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'processing':
    case 'chunking':
    case 'embedding':
    case 'extracting':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'pending':
    case 'queued':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'archived':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

export function getFormatIcon(format: DocumentFormat): string {
  switch (format) {
    case 'pdf':
      return 'PDF';
    case 'markdown':
      return 'MD';
    case 'text':
      return 'TXT';
    default:
      return '?';
  }
}

export function getElapsedTime(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '--';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffSec = Math.floor((end - start) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  return `${min}m ${sec}s`;
}
