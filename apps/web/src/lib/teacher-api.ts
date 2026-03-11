import { useQuery } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  totalQueries: number;
  periodQueries: number;
  avgConfidence: number;
  lowConfidenceCount: number;
  avgResponseTimeMs: number;
  topTopics: Array<{ name: string; count: number }>;
  feedbackSummary: { totalRatings: number; avgRating: number };
}

export interface TopicAggregate {
  conceptName: string;
  queryCount: number;
  avgConfidence: number;
  chunkCount: number;
  relatedConcepts: string[];
}

export interface HotspotsResponse {
  topics: TopicAggregate[];
  totalQueries: number;
  dateRange: { from: string; to: string };
  belowThreshold: boolean;
}

export interface CoverageCell {
  conceptName: string;
  chunkCount: number;
  queryCount: number;
  avgConfidence: number;
  coverageScore: number;
  gapIndicator: 'well-covered' | 'low-coverage' | 'no-data';
}

export interface CoverageResponse {
  cells: CoverageCell[];
  totalConcepts: number;
  totalChunks: number;
  dateRange: { from: string; to: string };
}

export interface TrendDataPoint {
  bucket: string;
  queryCount: number;
  avgConfidence: number;
  topTopics: Array<{ name: string; count: number }>;
}

export interface TrendsResponse {
  dataPoints: TrendDataPoint[];
  granularity: 'day' | 'week';
  dateRange: { from: string; to: string };
  comparisonPeriod: TrendDataPoint[] | null;
}

export interface TopicDetail {
  conceptName: string;
  queryCount: number;
  avgConfidence: number;
  chunkCount: number;
  relatedConcepts: Array<{ name: string; relationship: string }>;
  trendOverTime: TrendDataPoint[];
  feedbackAvgRating: number | null;
}

export interface TimeRange {
  preset?: '7d' | '30d' | '90d';
  from?: string;
  to?: string;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function teacherFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ error: 'UNKNOWN', message: res.statusText }));
    throw Object.assign(new Error(body.message || res.statusText), {
      status: res.status,
      body,
    });
  }
  return res.json() as Promise<T>;
}

function buildTimeParams(range?: TimeRange): string {
  if (!range) return '';
  const params = new URLSearchParams();
  if (range.preset) params.set('preset', range.preset);
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useSummary(range?: TimeRange) {
  return useQuery<DashboardSummary>({
    queryKey: ['teacher', 'summary', range],
    queryFn: () =>
      teacherFetch<DashboardSummary>(
        `/api/teacher/summary${buildTimeParams(range)}`
      ),
    staleTime: 30_000,
  });
}

export function useHotspots(range?: TimeRange, limit?: number) {
  return useQuery<HotspotsResponse>({
    queryKey: ['teacher', 'hotspots', range, limit],
    queryFn: () => {
      const params = new URLSearchParams();
      if (range?.preset) params.set('preset', range.preset);
      if (range?.from) params.set('from', range.from);
      if (range?.to) params.set('to', range.to);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return teacherFetch<HotspotsResponse>(
        `/api/teacher/hotspots${qs ? `?${qs}` : ''}`
      );
    },
    staleTime: 60_000,
  });
}

export function useCoverage(range?: TimeRange) {
  return useQuery<CoverageResponse>({
    queryKey: ['teacher', 'coverage', range],
    queryFn: () =>
      teacherFetch<CoverageResponse>(
        `/api/teacher/coverage${buildTimeParams(range)}`
      ),
    staleTime: 60_000,
  });
}

export function useTrends(
  range?: TimeRange,
  options?: {
    granularity?: 'day' | 'week';
    topic?: string;
    compareTo?: string;
  }
) {
  return useQuery<TrendsResponse>({
    queryKey: ['teacher', 'trends', range, options],
    queryFn: () => {
      const params = new URLSearchParams();
      if (range?.preset) params.set('preset', range.preset);
      if (range?.from) params.set('from', range.from);
      if (range?.to) params.set('to', range.to);
      if (options?.granularity) params.set('granularity', options.granularity);
      if (options?.topic) params.set('topic', options.topic);
      if (options?.compareTo) params.set('compareTo', options.compareTo);
      const qs = params.toString();
      return teacherFetch<TrendsResponse>(
        `/api/teacher/trends${qs ? `?${qs}` : ''}`
      );
    },
    staleTime: 60_000,
  });
}

export function useTopicDetail(conceptName: string | null) {
  return useQuery<TopicDetail>({
    queryKey: ['teacher', 'topic', conceptName],
    queryFn: () =>
      teacherFetch<TopicDetail>(
        `/api/teacher/topics/${encodeURIComponent(conceptName!)}`
      ),
    enabled: !!conceptName,
    staleTime: 30_000,
  });
}
