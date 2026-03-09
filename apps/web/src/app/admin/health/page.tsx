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
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base Health</h1>
        <p className="text-muted-foreground">
          Overview of content, coverage, and key metrics.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Total Documents"
          value={data?.totalDocuments}
          isLoading={isLoading}
        />
        <StatCard
          icon={Layers}
          label="Total Chunks"
          value={data?.totalChunks}
          isLoading={isLoading}
        />
        <StatCard
          icon={Brain}
          label="Total Concepts"
          value={data?.totalConcepts}
          isLoading={isLoading}
        />
        <StatCard
          icon={BarChart3}
          label="Avg Chunks/Doc"
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
              Documents by Format
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
                <FormatBar label="Text" count={data.documentsByFormat.text} total={data.totalDocuments} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="size-4" />
              Documents by Status
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
                <StatusRow label="Active" count={data.documentsByStatus.active} color="bg-green-500" />
                <StatusRow label="Processing" count={data.documentsByStatus.processing} color="bg-blue-500" />
                <StatusRow label="Pending" count={data.documentsByStatus.pending} color="bg-yellow-500" />
                <StatusRow label="Failed" count={data.documentsByStatus.failed} color="bg-red-500" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top concepts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="size-4" />
            Top Concepts
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
                  <Badge variant="secondary">{concept.chunkCount} chunks</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No concepts extracted yet. Upload and process documents to see concept data.
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
