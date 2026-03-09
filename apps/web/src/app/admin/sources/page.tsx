'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useSources,
  formatFileSize,
  formatRelativeTime,
  getStatusColor,
  getFormatIcon,
} from '@/lib/admin-api';
import type { DocumentStatus, DocumentFormat } from '@/lib/admin-api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ChevronLeft, ChevronRight, Database } from 'lucide-react';

export default function SourcesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('');
  const [formatFilter, setFormatFilter] = useState<DocumentFormat | ''>('');
  const pageSize = 20;

  const { data, isLoading } = useSources({
    page,
    pageSize,
    status: statusFilter || undefined,
    format: formatFilter || undefined,
    search: search || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Sources</h1>
        <p className="text-muted-foreground">
          Browse and manage all documents in the knowledge base.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by title..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as DocumentStatus | '');
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="processing">Processing</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="archived">Archived</option>
        </select>

        <select
          value={formatFilter}
          onChange={(e) => {
            setFormatFilter(e.target.value as DocumentFormat | '');
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All formats</option>
          <option value="pdf">PDF</option>
          <option value="markdown">Markdown</option>
          <option value="text">Text</option>
        </select>
      </div>

      {/* Sources table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data?.documents && data.documents.length > 0 ? (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Title</th>
                  <th className="text-left p-3 font-medium">Format</th>
                  <th className="text-left p-3 font-medium">Chunks</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Size</th>
                  <th className="text-left p-3 font-medium">Ingested</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((doc) => (
                  <tr key={doc.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <Link
                        href={`/admin/sources/${doc.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {doc.title}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline">{getFormatIcon(doc.format)}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{doc.chunkCount}</td>
                    <td className="p-3">
                      <Badge className={getStatusColor(doc.status)} variant="outline">
                        {doc.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatFileSize(doc.fileSize)}</td>
                    <td className="p-3 text-muted-foreground">
                      {doc.ingestedAt ? formatRelativeTime(doc.ingestedAt) : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {data.documents.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="p-4">
                  <Link
                    href={`/admin/sources/${doc.id}`}
                    className="block space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm truncate">{doc.title}</p>
                      <Badge className={getStatusColor(doc.status)} variant="outline">
                        {doc.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Badge variant="outline">{getFormatIcon(doc.format)}</Badge>
                      <span>{doc.chunkCount} chunks</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      <span>{doc.ingestedAt ? formatRelativeTime(doc.ingestedAt) : '--'}</span>
                    </div>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.total)} of{' '}
                {data.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Database className="size-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              {search || statusFilter || formatFilter
                ? 'No sources match your filters.'
                : 'No sources yet. Upload documents from the Dashboard.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
