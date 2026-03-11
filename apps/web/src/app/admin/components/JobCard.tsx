'use client';

import type { JobSummary } from '@/lib/admin-api';
import { getStatusColor, getElapsedTime } from '@/lib/admin-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="size-4 text-green-600" />;
    case 'failed':
      return <XCircle className="size-4 text-red-600" />;
    case 'queued':
      return <Clock className="size-4 text-yellow-600" />;
    default:
      return <Loader2 className="size-4 animate-spin text-blue-600" />;
  }
}

export function JobCard({ job }: { job: JobSummary }) {
  const isActive = !['complete', 'failed'].includes(job.status);
  const stageLabel = job.currentStep || job.status;

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusIcon status={job.status} />
            <p className="text-sm font-medium truncate">{job.documentTitle}</p>
          </div>
          <Badge className={getStatusColor(job.status)} variant="outline">
            {stageLabel}
          </Badge>
        </div>

        {isActive && <ProgressBar value={job.progress} />}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{job.progress}% 完成</span>
          <span>{getElapsedTime(job.startedAt, job.completedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
