'use client';

import { useState, useCallback, useRef } from 'react';
import {
  useUploadDocument,
  useUploadForce,
  useJobs,
  useJobsSummary,
  formatFileSize,
} from '@/lib/admin-api';
import type { UploadItem } from './components/UploadProgress';
import type { DuplicateResponse } from '@/lib/admin-api';
import { UploadProgress } from './components/UploadProgress';
import { JobCard } from './components/JobCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Upload,
  FileUp,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';

const ACCEPTED_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/plain',
  'text/x-markdown',
];
const ACCEPTED_EXTENSIONS = ['.pdf', '.md', '.txt'];
const MAX_FILES = 10;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function fileAccepted(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return ACCEPTED_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );
}

export default function AdminDashboard() {
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [duplicateDialog, setDuplicateDialog] = useState<{
    file: File;
    info: DuplicateResponse;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useUploadDocument();
  const forceMutation = useUploadForce();
  const { data: jobsData, isLoading: jobsLoading } = useJobs({ limit: 10 });
  const { data: summary } = useJobsSummary();

  const processFile = useCallback(
    async (file: File) => {
      // Add to upload list
      const itemIndex = uploadItems.length;
      setUploadItems((prev) => [
        ...prev,
        { file, status: 'uploading' },
      ]);

      try {
        const result = await uploadMutation.mutateAsync(file as File & { title?: string; author?: string });
        setUploadItems((prev) =>
          prev.map((item, i) =>
            i === itemIndex
              ? { ...item, status: 'processing' as const, result, jobId: result.jobId }
              : item
          )
        );
      } catch (err) {
        const error = err as Error & { status?: number; body?: DuplicateResponse };
        if (error.status === 409 && error.body) {
          setUploadItems((prev) =>
            prev.map((item, i) =>
              i === itemIndex
                ? { ...item, status: 'duplicate' as const, duplicateInfo: error.body }
                : item
            )
          );
          setDuplicateDialog({ file, info: error.body! });
        } else {
          setUploadItems((prev) =>
            prev.map((item, i) =>
              i === itemIndex
                ? { ...item, status: 'failed' as const, error: error.message }
                : item
            )
          );
        }
      }
    },
    [uploadItems.length, uploadMutation]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files).slice(0, MAX_FILES);
      const errors: string[] = [];

      for (const file of fileArray) {
        if (!fileAccepted(file)) {
          errors.push(`${file.name}: unsupported format. Use PDF, MD, or TXT.`);
          continue;
        }
        if (file.size > MAX_SIZE) {
          errors.push(`${file.name}: exceeds 10MB limit (${formatFileSize(file.size)}).`);
          continue;
        }
        processFile(file);
      }

      if (errors.length > 0) {
        // Add error items
        for (const msg of errors) {
          setUploadItems((prev) => [
            ...prev,
            {
              file: new File([], msg.split(':')[0]),
              status: 'failed',
              error: msg,
            },
          ]);
        }
      }
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleForceUpload = useCallback(async () => {
    if (!duplicateDialog) return;
    const { file } = duplicateDialog;
    setDuplicateDialog(null);

    // Find the duplicate item and update it
    setUploadItems((prev) =>
      prev.map((item) =>
        item.file === file ? { ...item, status: 'uploading' as const } : item
      )
    );

    try {
      const result = await forceMutation.mutateAsync(file);
      setUploadItems((prev) =>
        prev.map((item) =>
          item.file === file
            ? { ...item, status: 'processing' as const, result, jobId: result.jobId }
            : item
        )
      );
    } catch (err) {
      const error = err as Error;
      setUploadItems((prev) =>
        prev.map((item) =>
          item.file === file
            ? { ...item, status: 'failed' as const, error: error.message }
            : item
        )
      );
    }
  }, [duplicateDialog, forceMutation]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Upload documents and monitor ingestion progress.
        </p>
      </div>

      {/* Summary cards (T024) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Processing"
          value={summary?.processing}
          icon={<Loader2 className="size-4 animate-spin text-blue-600" />}
        />
        <SummaryCard
          label="Queued"
          value={summary?.queued}
          icon={<Clock className="size-4 text-yellow-600" />}
        />
        <SummaryCard
          label="Completed"
          value={summary?.completed}
          icon={<CheckCircle2 className="size-4 text-green-600" />}
        />
        <SummaryCard
          label="Failed"
          value={summary?.failed}
          icon={<XCircle className="size-4 text-red-600" />}
        />
      </div>

      {/* Upload zone (T010) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5" />
            Upload Documents
          </CardTitle>
          <CardDescription>
            Drag and drop files or click to browse. Supports PDF, Markdown, and plain text (max 10MB each, up to 10 files).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200
              ${isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />

            <FileUp className="size-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">
              {isDragOver ? 'Drop files here' : 'Drop files here or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, Markdown (.md), Plain Text (.txt)
            </p>

            <div className="flex items-center justify-center gap-2 mt-4">
              <Badge variant="outline">Max 10MB</Badge>
              <Badge variant="outline">Up to 10 files</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload progress (T012) */}
      <UploadProgress items={uploadItems} />

      {/* Recent jobs (T024) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Recent Jobs</h2>
        {jobsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : jobsData?.jobs && jobsData.jobs.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {jobsData.jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <p>No ingestion jobs yet. Upload a document to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Duplicate confirmation dialog (T013) */}
      <Dialog
        open={!!duplicateDialog}
        onOpenChange={(open) => {
          if (!open) setDuplicateDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-yellow-600" />
              Duplicate Document Detected
            </DialogTitle>
            <DialogDescription>
              A document with the same content already exists in the knowledge base.
            </DialogDescription>
          </DialogHeader>

          {duplicateDialog && (
            <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
              <p>
                <span className="font-medium">Existing document:</span>{' '}
                {duplicateDialog.info.existingTitle}
              </p>
              <p>
                <span className="font-medium">New file:</span>{' '}
                {duplicateDialog.file.name}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDuplicateDialog(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleForceUpload}>Upload Anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | undefined;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-bold mt-1">
          {value !== undefined ? value : <Skeleton className="h-8 w-12" />}
        </div>
      </CardContent>
    </Card>
  );
}
