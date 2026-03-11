'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Clock,
  Star,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSummary, type TimeRange } from '@/lib/teacher-api';
import { EmptyState } from './components/EmptyState';
import { StatCard } from './components/StatCard';
import { TimeRangeFilter } from './components/TimeRangeFilter';

export default function TeacherOverviewPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>({ preset: '7d' });
  const { data, isLoading, error } = useSummary(timeRange);

  if (error) {
    return (
      <EmptyState
        title="Failed to load dashboard"
        description={error.message || 'An unexpected error occurred.'}
        icon={<AlertTriangle className="size-12" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground text-sm">
            Aggregate query analytics and student engagement insights.
          </p>
        </div>
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !data || data.totalQueries === 0 ? (
        <EmptyState
          title="No data yet"
          description="Query analytics will appear here once students start asking questions."
          icon={<BarChart3 className="size-12" />}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Total Queries"
              value={data.totalQueries.toLocaleString()}
              description="All-time total"
              icon={<BookOpen className="size-4" />}
            />
            <StatCard
              title="This Period"
              value={data.periodQueries.toLocaleString()}
              description={`Queries in the last ${timeRange.preset || 'selected period'}`}
              icon={<TrendingUp className="size-4" />}
            />
            <StatCard
              title="Avg Confidence"
              value={`${(data.avgConfidence * 100).toFixed(1)}%`}
              description="Mean retrieval confidence"
              icon={<Activity className="size-4" />}
            />
            <StatCard
              title="Low Confidence"
              value={data.lowConfidenceCount}
              description="Queries below threshold"
              icon={<AlertTriangle className="size-4" />}
            />
            <StatCard
              title="Avg Response Time"
              value={`${(data.avgResponseTimeMs / 1000).toFixed(1)}s`}
              description="Mean end-to-end latency"
              icon={<Clock className="size-4" />}
            />
            <StatCard
              title="Feedback Rating"
              value={
                data.feedbackSummary.totalRatings > 0
                  ? `${data.feedbackSummary.avgRating.toFixed(1)} / 5`
                  : 'N/A'
              }
              description={
                data.feedbackSummary.totalRatings > 0
                  ? `Based on ${data.feedbackSummary.totalRatings} ratings`
                  : 'No ratings yet'
              }
              icon={<Star className="size-4" />}
            />
          </div>

          {/* Top Topics */}
          {data.topTopics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Topics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.topTopics.map((topic) => (
                    <div
                      key={topic.name}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm font-medium">{topic.name}</span>
                      <Badge variant="secondary">
                        {topic.count} {topic.count === 1 ? 'chunk' : 'chunks'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
