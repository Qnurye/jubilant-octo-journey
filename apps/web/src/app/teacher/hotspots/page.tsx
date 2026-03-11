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
        title="加载热点失败"
        description={error.message || '发生了意外错误。'}
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
          <h1 className="text-2xl font-bold tracking-tight">热点</h1>
          <p className="text-muted-foreground text-sm">
            查询最多的主题及其置信度。
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
          title="数据不足"
          description="查询数据不足以生成热点分析。请等更多学生使用系统后再查看。"
          icon={<Target className="size-12" />}
        />
      ) : (
        <>
          {/* Bubble Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                主题热点图
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BubbleChart
                data={data.topics}
                onBubbleClick={handleBubbleClick}
              />
              <p className="text-xs text-muted-foreground text-center mt-2">
                气泡大小 = 查询次数。颜色：绿色 = 高置信度，红色 = 低置信度。点击气泡查看详情。
              </p>
            </CardContent>
          </Card>

          {/* Topic List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                热门概念 ({data.topics.length})
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
                        {topic.chunkCount} 个分块 &middot;{' '}
                        {topic.relatedConcepts.length} 个关联
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant="secondary">
                        {topic.queryCount} 次查询
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
