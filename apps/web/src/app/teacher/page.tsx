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
        title="加载仪表盘失败"
        description={error.message || '发生了意外错误。'}
        icon={<AlertTriangle className="size-12" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">概览</h1>
          <p className="text-muted-foreground text-sm">
            查询分析汇总和学生参与度洞察。
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
          title="暂无数据"
          description="当学生开始提问后，查询分析将显示在此处。"
          icon={<BarChart3 className="size-12" />}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="总查询数"
              value={data.totalQueries.toLocaleString()}
              description="累计总量"
              icon={<BookOpen className="size-4" />}
            />
            <StatCard
              title="本期查询"
              value={data.periodQueries.toLocaleString()}
              description={`最近 ${timeRange.preset || '所选周期'} 的查询`}
              icon={<TrendingUp className="size-4" />}
            />
            <StatCard
              title="平均置信度"
              value={`${(data.avgConfidence * 100).toFixed(1)}%`}
              description="平均检索置信度"
              icon={<Activity className="size-4" />}
            />
            <StatCard
              title="低置信度"
              value={data.lowConfidenceCount}
              description="低于阈值的查询"
              icon={<AlertTriangle className="size-4" />}
            />
            <StatCard
              title="平均响应时间"
              value={`${(data.avgResponseTimeMs / 1000).toFixed(1)}s`}
              description="平均端到端延迟"
              icon={<Clock className="size-4" />}
            />
            <StatCard
              title="反馈评分"
              value={
                data.feedbackSummary.totalRatings > 0
                  ? `${data.feedbackSummary.avgRating.toFixed(1)} / 5`
                  : '暂无'
              }
              description={
                data.feedbackSummary.totalRatings > 0
                  ? `基于 ${data.feedbackSummary.totalRatings} 条评分`
                  : '暂无评分'
              }
              icon={<Star className="size-4" />}
            />
          </div>

          {/* Top Topics */}
          {data.topTopics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">热门主题</CardTitle>
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
                        {topic.count} 个分块
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
