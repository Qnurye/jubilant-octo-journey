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
        <h1 className="text-2xl font-bold tracking-tight">知识资源</h1>
        <p className="text-muted-foreground">
          浏览和管理知识库中的所有文档。
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="按标题搜索..."
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
          <option value="">所有状态</option>
          <option value="active">已激活</option>
          <option value="processing">处理中</option>
          <option value="pending">待处理</option>
          <option value="failed">失败</option>
          <option value="archived">已归档</option>
        </select>

        <select
          value={formatFilter}
          onChange={(e) => {
            setFormatFilter(e.target.value as DocumentFormat | '');
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">所有格式</option>
          <option value="pdf">PDF</option>
          <option value="markdown">Markdown</option>
          <option value="text">文本</option>
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
                  <th className="text-left p-3 font-medium">标题</th>
                  <th className="text-left p-3 font-medium">格式</th>
                  <th className="text-left p-3 font-medium">分块</th>
                  <th className="text-left p-3 font-medium">状态</th>
                  <th className="text-left p-3 font-medium">大小</th>
                  <th className="text-left p-3 font-medium">入库时间</th>
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
                      <span>{doc.chunkCount} 个分块</span>
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
                显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.total)}，共{' '}
                {data.total} 条
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
                  第 {page} / {totalPages} 页
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
                ? '没有匹配筛选条件的资源。'
                : '暂无资源。请从仪表盘上传文档。'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
