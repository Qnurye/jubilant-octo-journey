'use client';

import { useState } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useHotspots, useTrends, type TimeRange } from '@/lib/teacher-api';
import { EmptyState } from '../components/EmptyState';
import { TimeRangeFilter } from '../components/TimeRangeFilter';
import { TrendChart } from '../components/TrendChart';

export default function TrendsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>({ preset: '30d' });
  const [granularity, setGranularity] = useState<'day' | 'week'>('day');
  const [topic, setTopic] = useState<string>('__all__');
  const [compareMode, setCompareMode] = useState(false);

  // Derive comparison period: shift back by the same duration
  const compareTo = (() => {
    if (!compareMode) return undefined;
    const days = timeRange.preset === '7d' ? 7 : timeRange.preset === '30d' ? 30 : timeRange.preset === '90d' ? 90 : 30;
    const compareStart = new Date(Date.now() - days * 2 * 86400000);
    return compareStart.toISOString();
  })();

  const { data, isLoading, error } = useTrends(timeRange, {
    granularity,
    topic: topic === '__all__' ? undefined : topic,
    compareTo,
  });

  // Fetch topic list for the filter dropdown
  const { data: hotspotsData } = useHotspots(timeRange, 50);
  const topicOptions = hotspotsData?.topics.map((t) => t.conceptName) ?? [];

  if (error) {
    return (
      <EmptyState
        title="Failed to load trends"
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
          <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
          <p className="text-muted-foreground text-sm">
            Query volume and confidence over time.
          </p>
        </div>
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Granularity toggle */}
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            variant={granularity === 'day' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setGranularity('day')}
          >
            Day
          </Button>
          <Button
            variant={granularity === 'week' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setGranularity('week')}
          >
            Week
          </Button>
        </div>

        {/* Topic filter */}
        <Select value={topic} onValueChange={setTopic}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All topics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All topics</SelectItem>
            {topicOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Compare toggle */}
        <Button
          variant={compareMode ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setCompareMode(!compareMode)}
        >
          {compareMode ? 'Hide comparison' : 'Compare'}
        </Button>
      </div>

      {/* Chart */}
      {isLoading ? (
        <Skeleton className="h-[400px] w-full rounded-xl" />
      ) : !data || data.dataPoints.length < 2 ? (
        <EmptyState
          title="Insufficient data"
          description="At least two data points are needed to display a trend chart. Try a wider time range or wait for more queries."
          icon={<TrendingUp className="size-12" />}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Query Volume
              {topic ? ` - ${topic}` : ''}
              {compareMode ? ' (with comparison)' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={data.dataPoints}
              comparisonData={data.comparisonPeriod ?? undefined}
            />
            <p className="text-xs text-muted-foreground text-center mt-2">
              {data.dateRange.from} to {data.dateRange.to} &middot;{' '}
              {data.granularity === 'day' ? 'Daily' : 'Weekly'} buckets
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
