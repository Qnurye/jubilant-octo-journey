'use client';

import { useJobStatus, formatFileSize, getStatusColor, getFormatIcon, getElapsedTime } from '@/lib/admin-api';
import type { UploadResponse, DuplicateResponse } from '@/lib/admin-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface UploadItem {
  file: File;
  status: 'uploading' | 'processing' | 'complete' | 'failed' | 'duplicate';
  result?: UploadResponse;
  jobId?: string;
  error?: string;
  duplicateInfo?: DuplicateResponse;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function JobProgress({ jobId }: { jobId: string }) {
  const { data: job } = useJobStatus(jobId);

  if (!job) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          启动中...
        </div>
        <ProgressBar value={0} />
      </div>
    );
  }

  const stageLabel = job.currentStep || job.status;
  const isTerminal = job.status === 'complete' || job.status === 'failed';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          {isTerminal ? (
            job.status === 'complete' ? (
              <CheckCircle2 className="size-3 text-green-600" />
            ) : (
              <XCircle className="size-3 text-red-600" />
            )
          ) : (
            <Loader2 className="size-3 animate-spin text-blue-600" />
          )}
          <Badge className={getStatusColor(job.status)} variant="outline">
            {stageLabel}
          </Badge>
        </span>
        <span className="text-muted-foreground">
          {job.progress}% | {getElapsedTime(job.startedAt, job.completedAt)}
        </span>
      </div>
      <ProgressBar value={job.progress} />
      {job.errorMessage && (
        <p className="text-xs text-red-600 mt-1">{job.errorMessage}</p>
      )}
    </div>
  );
}

export function UploadProgress({ items }: { items: UploadItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">上传进度</h3>
      {items.map((item, index) => (
        <Card key={`${item.file.name}-${index}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {/* Format icon */}
              <div className="flex-shrink-0 size-10 rounded-lg bg-muted flex items-center justify-center">
                {item.result ? (
                  <span className="text-xs font-bold text-muted-foreground">
                    {getFormatIcon(item.result.format)}
                  </span>
                ) : (
                  <FileText className="size-5 text-muted-foreground" />
                )}
              </div>

              {/* File info + progress */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{item.file.name}</p>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatFileSize(item.file.size)}
                  </span>
                </div>

                {/* Status-specific content */}
                {item.status === 'uploading' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      上传中...
                    </div>
                    <ProgressBar value={10} />
                  </div>
                )}

                {item.status === 'processing' && item.jobId && (
                  <JobProgress jobId={item.jobId} />
                )}

                {item.status === 'complete' && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 className="size-3" />
                    处理完成
                  </div>
                )}

                {item.status === 'failed' && (
                  <div className="flex items-center gap-1.5 text-xs text-red-600">
                    <XCircle className="size-3" />
                    {item.error || '上传失败'}
                  </div>
                )}

                {item.status === 'duplicate' && (
                  <div className="flex items-center gap-1.5 text-xs text-yellow-600">
                    <XCircle className="size-3" />
                    检测到重复
                    {item.duplicateInfo && (
                      <span className="text-muted-foreground">
                        （已有：{item.duplicateInfo.existingTitle}）
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
