'use client';

import { useHealthStats } from '@/lib/admin-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  Layers,
  Brain,
  BarChart3,
  Activity,
} from 'lucide-react';

export default function HealthPage() {
  const { data, isLoading } = useHealthStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">知识库健康状况</h1>
        <p className="text-muted-foreground">
          内容、覆盖率和关键指标概览。
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="文档总数"
          value={data?.totalDocuments}
          isLoading={isLoading}
        />
        <StatCard
          icon={Layers}
          label="分块总数"
          value={data?.totalChunks}
          isLoading={isLoading}
        />
        <StatCard
          icon={Brain}
          label="概念总数"
          value={data?.totalConcepts}
          isLoading={isLoading}
        />
        <StatCard
          icon={BarChart3}
          label="平均分块/文档"
          value={data?.avgChunksPerDocument !== undefined ? data.avgChunksPerDocument.toFixed(1) : undefined}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Format breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4" />
              按格式分类
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : data?.documentsByFormat ? (
              <div className="space-y-3">
                <FormatBar label="PDF" count={data.documentsByFormat.pdf} total={data.totalDocuments} />
                <FormatBar label="Markdown" count={data.documentsByFormat.markdown} total={data.totalDocuments} />
                <FormatBar label="文本" count={data.documentsByFormat.text} total={data.totalDocuments} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无数据。</p>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="size-4" />
              按状态分类
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : data?.documentsByStatus ? (
              <div className="space-y-3">
                <StatusRow label="已激活" count={data.documentsByStatus.active} color="bg-green-500" />
                <StatusRow label="处理中" count={data.documentsByStatus.processing} color="bg-blue-500" />
                <StatusRow label="待处理" count={data.documentsByStatus.pending} color="bg-yellow-500" />
                <StatusRow label="失败" count={data.documentsByStatus.failed} color="bg-red-500" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无数据。</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top concepts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="size-4" />
            热门概念
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : data?.topConcepts && data.topConcepts.length > 0 ? (
            <div className="space-y-2">
              {data.topConcepts.map((concept, index) => (
                <div
                  key={concept.name}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">
                      {index + 1}.
                    </span>
                    <span className="text-sm font-medium">{concept.name}</span>
                  </div>
                  <Badge variant="secondary">{concept.chunkCount} 个分块</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              暂无已提取的概念。上传并处理文档以查看概念数据。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number | undefined;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-bold">{value ?? '--'}</p>
        )}
      </CardContent>
    </Card>
  );
}

function FormatBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {count} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusRow({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <div className={`size-2.5 rounded-full ${color}`} />
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-sm font-medium">{count}</span>
    </div>
  );
}
