'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useSourceDetail,
  useDeleteSource,
  useRetryIngestion,
  formatFileSize,
  formatRelativeTime,
  getStatusColor,
  getFormatIcon,
  getElapsedTime,
} from '@/lib/admin-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Trash2,
  RotateCcw,
  FileText,
  Clock,
  Hash,
  User,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

export default function SourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: doc, isLoading } = useSourceDetail(id);
  const deleteMutation = useDeleteSource();
  const retryMutation = useRetryIngestion();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      router.push('/admin/sources');
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleRetry = async () => {
    try {
      await retryMutation.mutateAsync(id);
    } catch {
      // Error is handled by mutation state
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/sources">
            <ArrowLeft className="size-4 mr-1" />
            Back to Sources
          </Link>
        </Button>
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Document not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-3 mb-1">
            <Link href="/admin/sources">
              <ArrowLeft className="size-4 mr-1" />
              Back to Sources
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{doc.title}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{getFormatIcon(doc.format)}</Badge>
            <Badge className={getStatusColor(doc.status)} variant="outline">
              {doc.status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {doc.status === 'failed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="size-4 mr-1" />
              )}
              Retry
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="size-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Error message */}
      {doc.errorMessage && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="p-4 flex items-start gap-3">
            <XCircle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-600">Processing Error</p>
              <p className="text-sm text-muted-foreground mt-1">{doc.errorMessage}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetadataItem icon={FileText} label="Format" value={doc.format} />
        <MetadataItem icon={Hash} label="Chunks" value={String(doc.chunkCount)} />
        <MetadataItem
          icon={FileText}
          label="File Size"
          value={doc.fileSize ? formatFileSize(doc.fileSize) : '--'}
        />
        <MetadataItem icon={User} label="Author" value={doc.author || '--'} />
        <MetadataItem
          icon={Clock}
          label="Created"
          value={formatRelativeTime(doc.createdAt)}
        />
        <MetadataItem
          icon={Clock}
          label="Ingested"
          value={doc.ingestedAt ? formatRelativeTime(doc.ingestedAt) : '--'}
        />
        {doc.fileHash && (
          <MetadataItem
            icon={Hash}
            label="Content Hash"
            value={doc.fileHash.slice(0, 16) + '...'}
          />
        )}
      </div>

      {/* Processing history timeline */}
      {doc.jobs && doc.jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Processing History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {doc.jobs.map((job) => (
                <div key={job.id} className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {job.status === 'complete' ? (
                      <CheckCircle2 className="size-4 text-green-600" />
                    ) : job.status === 'failed' ? (
                      <XCircle className="size-4 text-red-600" />
                    ) : ['chunking', 'embedding', 'extracting'].includes(job.status) ? (
                      <Loader2 className="size-4 animate-spin text-blue-600" />
                    ) : (
                      <Clock className="size-4 text-yellow-600" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(job.status)} variant="outline">
                          {job.currentStep || job.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {job.progress}%
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {getElapsedTime(job.startedAt, job.completedAt)}
                      </span>
                    </div>
                    {job.startedAt && (
                      <p className="text-xs text-muted-foreground">
                        Started {formatRelativeTime(job.startedAt)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog (T021) */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-600" />
              Delete Source
            </DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{doc.title}&quot; and remove all associated chunks
              from the vector store and knowledge graph. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="size-4 mr-1" />
              )}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetadataItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className="size-4 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
