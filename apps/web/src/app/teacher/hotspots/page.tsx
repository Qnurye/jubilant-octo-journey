'use client';

import { useState } from 'react';
import { AlertTriangle, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useHotspots,
  type TimeRange,
  type TopicAggregate,
} from '@/lib/teacher-api';
import { BubbleChart } from '../components/BubbleChart';
import { EmptyState } from '../components/EmptyState';
import { TimeRangeFilter } from '../components/TimeRangeFilter';
import { TopicDetailPanel } from '../components/TopicDetailPanel';

export default function HotspotsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>({ preset: '7d' });
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const { data, isLoading, error } = useHotspots(timeRange, 20);

  if (error) {
    return (
      <EmptyState
        title="Failed to load hotspots"
        description={error.message || 'An unexpected error occurred.'}
        icon={<AlertTriangle className="size-12" />}
      />
    );
  }

  const handleBubbleClick = (topic: TopicAggregate) => {
    setSelectedTopic(topic.conceptName);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hotspots</h1>
          <p className="text-muted-foreground text-sm">
            Most-queried topics and their confidence levels.
          </p>
        </div>
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[400px] w-full rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
      ) : !data || data.belowThreshold || data.topics.length === 0 ? (
        <EmptyState
          title="Insufficient data"
          description="Not enough query data to generate hotspot analysis. Check back after more students have used the system."
          icon={<Target className="size-12" />}
        />
      ) : (
        <>
          {/* Bubble Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Topic Hotspot Map
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BubbleChart
                data={data.topics}
                onBubbleClick={handleBubbleClick}
              />
              <p className="text-xs text-muted-foreground text-center mt-2">
                Bubble size = query count. Color: green = high confidence, red =
                low confidence. Click a bubble for details.
              </p>
            </CardContent>
          </Card>

          {/* Topic List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Top Concepts ({data.topics.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topics.map((topic) => (
                  <button
                    key={topic.conceptName}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                    onClick={() => setSelectedTopic(topic.conceptName)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {topic.conceptName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {topic.chunkCount} chunks &middot;{' '}
                        {topic.relatedConcepts.length} related
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant="secondary">
                        {topic.queryCount} queries
                      </Badge>
                      <Badge
                        variant={
                          topic.avgConfidence >= 0.7 ? 'default' : 'destructive'
                        }
                      >
                        {(topic.avgConfidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Topic Detail Panel */}
      <TopicDetailPanel
        conceptName={selectedTopic}
        open={!!selectedTopic}
        onOpenChange={(open) => {
          if (!open) setSelectedTopic(null);
        }}
      />
    </div>
  );
}
