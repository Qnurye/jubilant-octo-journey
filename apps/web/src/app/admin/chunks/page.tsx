'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useChunks, useSources } from '@/lib/admin-api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Layers,
  Code,
  FunctionSquare,
  Table,
  X,
  ChevronRightIcon,
} from 'lucide-react';

export default function ChunksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [documentId, setDocumentId] = useState(
    searchParams.get('documentId') || ''
  );
  const [concept, setConcept] = useState(searchParams.get('concept') || '');
  const [contentFilters, setContentFilters] = useState({
    hasCode: false,
    hasFormula: false,
    hasTable: false,
  });
  const [selectedChunk, setSelectedChunk] = useState<string | null>(null);
  const pageSize = 20;

  // Sync URL params on initial load
  useEffect(() => {
    const urlConcept = searchParams.get('concept') || '';
    const urlDocumentId = searchParams.get('documentId') || '';
    if (urlConcept !== concept) setConcept(urlConcept);
    if (urlDocumentId !== documentId) setDocumentId(urlDocumentId);
    // Only run on searchParams change, not state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const updateUrlParams = useCallback(
    (params: Record<string, string | null>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value) {
          newParams.set(key, value);
        } else {
          newParams.delete(key);
        }
      }
      const qs = newParams.toString();
      router.replace(qs ? `?${qs}` : '/admin/chunks');
    },
    [searchParams, router]
  );

  const { data, isLoading } = useChunks({
    page,
    limit: pageSize,
    search: search || undefined,
    documentId: documentId || undefined,
    concept: concept || undefined,
  });

  const { data: sourcesData } = useSources({ pageSize: 100 });

  // Client-side content type filtering
  const filteredChunks = data?.chunks?.filter((chunk) => {
    if (contentFilters.hasCode && !chunk.metadata.hasCode) return false;
    if (contentFilters.hasFormula && !chunk.metadata.hasFormula) return false;
    if (contentFilters.hasTable && !chunk.metadata.hasTable) return false;
    return true;
  });

  const totalPages = data?.pagination?.totalPages ?? 0;
  const total = data?.pagination?.total ?? 0;

  const selectedChunkData = filteredChunks?.find(
    (c) => c.chunkId === selectedChunk
  );

  function toggleFilter(key: keyof typeof contentFilters) {
    setContentFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    setPage(1);
  }

  const hasActiveFilters =
    !!search ||
    !!documentId ||
    !!concept ||
    contentFilters.hasCode ||
    contentFilters.hasFormula ||
    contentFilters.hasTable;

  function clearAllFilters() {
    setSearch('');
    setDocumentId('');
    setConcept('');
    setContentFilters({ hasCode: false, hasFormula: false, hasTable: false });
    setPage(1);
    router.replace('/admin/chunks');
  }

  function clearConcept() {
    setConcept('');
    setPage(1);
    updateUrlParams({ concept: null });
  }

  function clearDocumentId() {
    setDocumentId('');
    setPage(1);
    updateUrlParams({ documentId: null });
  }

  // Find document title for the active documentId filter
  const activeDocTitle = documentId
    ? sourcesData?.documents?.find((d) => d.id === documentId)?.title
    : null;

  // Detect if navigated from graph (concept param in URL)
  const fromGraph = searchParams.has('concept');

  return (
    <div className="space-y-6">
      <div>
        {fromGraph && concept && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
            <span>图谱</span>
            <ChevronRightIcon className="size-3.5" />
            <span>
              &lsquo;{concept}&rsquo; 的分块
            </span>
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight">分块</h1>
        <p className="text-muted-foreground">
          浏览和检查所有已处理的内容分块。
        </p>
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">当前筛选：</span>
          {concept && (
            <Badge variant="secondary" className="gap-1 pr-1">
              概念：{concept}
              <button
                onClick={clearConcept}
                className="ml-0.5 rounded-sm hover:bg-muted p-0.5"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {documentId && (
            <Badge variant="secondary" className="gap-1 pr-1">
              文档：{activeDocTitle || documentId.slice(0, 8)}
              <button
                onClick={clearDocumentId}
                className="ml-0.5 rounded-sm hover:bg-muted p-0.5"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {search && (
            <Badge variant="secondary" className="gap-1 pr-1">
              搜索：{search.length > 20 ? search.slice(0, 20) + '...' : search}
              <button
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="ml-0.5 rounded-sm hover:bg-muted p-0.5"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {contentFilters.hasCode && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Code
              <button
                onClick={() => toggleFilter('hasCode')}
                className="ml-0.5 rounded-sm hover:bg-muted p-0.5"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {contentFilters.hasFormula && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Formula
              <button
                onClick={() => toggleFilter('hasFormula')}
                className="ml-0.5 rounded-sm hover:bg-muted p-0.5"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {contentFilters.hasTable && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Table
              <button
                onClick={() => toggleFilter('hasTable')}
                className="ml-0.5 rounded-sm hover:bg-muted p-0.5"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-6 text-xs">
            清除全部
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索分块内容..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <select
          value={documentId}
          onChange={(e) => {
            setDocumentId(e.target.value);
            setPage(1);
            updateUrlParams({ documentId: e.target.value || null });
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">所有文档</option>
          {sourcesData?.documents?.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title}
            </option>
          ))}
        </select>

        <Input
          placeholder="按概念筛选..."
          value={concept}
          onChange={(e) => {
            setConcept(e.target.value);
            setPage(1);
            updateUrlParams({ concept: e.target.value || null });
          }}
          className="sm:max-w-[200px]"
        />
      </div>

      {/* Content type filter chips */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={contentFilters.hasCode ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggleFilter('hasCode')}
          className="gap-1.5"
        >
          <Code className="size-3.5" />
          代码
        </Button>
        <Button
          variant={contentFilters.hasFormula ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggleFilter('hasFormula')}
          className="gap-1.5"
        >
          <FunctionSquare className="size-3.5" />
          公式
        </Button>
        <Button
          variant={contentFilters.hasTable ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggleFilter('hasTable')}
          className="gap-1.5"
        >
          <Table className="size-3.5" />
          表格
        </Button>
      </div>

      {/* Chunks list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filteredChunks && filteredChunks.length > 0 ? (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">内容</th>
                  <th className="text-left p-3 font-medium">文档</th>
                  <th className="text-left p-3 font-medium">Token</th>
                  <th className="text-left p-3 font-medium">类型</th>
                  <th className="text-left p-3 font-medium">主题</th>
                  <th className="text-left p-3 font-medium">概念</th>
                </tr>
              </thead>
              <tbody>
                {filteredChunks.map((chunk) => (
                  <tr
                    key={chunk.chunkId}
                    className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedChunk(chunk.chunkId)}
                  >
                    <td className="p-3 max-w-xs">
                      <p className="truncate text-sm">
                        {chunk.contentPreview}
                      </p>
                      {chunk.metadata.sectionHeader && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {chunk.metadata.sectionHeader}
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="text-sm text-muted-foreground truncate block max-w-[150px]">
                        {chunk.metadata.documentTitle}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {chunk.metadata.chunkIndex + 1}/{chunk.metadata.totalChunks}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary">
                        {chunk.metadata.tokenCount}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {chunk.metadata.hasCode && (
                          <Badge variant="outline" className="text-xs">
                            <Code className="size-3 mr-0.5" />
                            代码
                          </Badge>
                        )}
                        {chunk.metadata.hasFormula && (
                          <Badge variant="outline" className="text-xs">
                            <FunctionSquare className="size-3 mr-0.5" />
                            公式
                          </Badge>
                        )}
                        {chunk.metadata.hasTable && (
                          <Badge variant="outline" className="text-xs">
                            <Table className="size-3 mr-0.5" />
                            表格
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {chunk.topicTag && (
                        <Badge variant="secondary" className="text-xs">
                          {chunk.topicTag}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {chunk.concepts.slice(0, 3).map((c) => (
                          <Badge
                            key={c}
                            variant="outline"
                            className="text-xs"
                          >
                            {c}
                          </Badge>
                        ))}
                        {chunk.concepts.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{chunk.concepts.length - 3}
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filteredChunks.map((chunk) => (
              <Card
                key={chunk.chunkId}
                className="cursor-pointer"
                onClick={() => setSelectedChunk(chunk.chunkId)}
              >
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm line-clamp-2">
                    {chunk.contentPreview}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate">
                      {chunk.metadata.documentTitle}
                    </span>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {chunk.metadata.tokenCount} token
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {chunk.metadata.hasCode && (
                      <Badge variant="outline" className="text-xs">代码</Badge>
                    )}
                    {chunk.metadata.hasFormula && (
                      <Badge variant="outline" className="text-xs">公式</Badge>
                    )}
                    {chunk.metadata.hasTable && (
                      <Badge variant="outline" className="text-xs">表格</Badge>
                    )}
                    {chunk.topicTag && (
                      <Badge variant="secondary" className="text-xs">
                        {chunk.topicTag}
                      </Badge>
                    )}
                    {chunk.concepts.slice(0, 2).map((c) => (
                      <Badge
                        key={c}
                        variant="outline"
                        className="text-xs"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                显示 {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, total)}，共 {total} 条
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
            <Layers className="size-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? '没有匹配筛选条件的分块。'
                : '暂无分块。上传并处理文档以查看分块。'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Chunk detail dialog */}
      <Dialog
        open={!!selectedChunk}
        onOpenChange={(open) => !open && setSelectedChunk(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedChunkData && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  分块 {selectedChunkData.metadata.chunkIndex + 1} / {selectedChunkData.metadata.totalChunks}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedChunkData.metadata.documentTitle}
                  {selectedChunkData.metadata.sectionHeader &&
                    ` / ${selectedChunkData.metadata.sectionHeader}`}
                </p>
              </DialogHeader>

              <div className="space-y-4">
                {/* Metadata badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {selectedChunkData.metadata.tokenCount} token
                  </Badge>
                  {selectedChunkData.topicTag && (
                    <Badge variant="secondary">
                      {selectedChunkData.topicTag}
                    </Badge>
                  )}
                  {selectedChunkData.metadata.hasCode && (
                    <Badge variant="outline">
                      <Code className="size-3 mr-1" />
                      代码
                    </Badge>
                  )}
                  {selectedChunkData.metadata.hasFormula && (
                    <Badge variant="outline">
                      <FunctionSquare className="size-3 mr-1" />
                      公式
                    </Badge>
                  )}
                  {selectedChunkData.metadata.hasTable && (
                    <Badge variant="outline">
                      <Table className="size-3 mr-1" />
                      表格
                    </Badge>
                  )}
                </div>

                {/* Concepts */}
                {selectedChunkData.concepts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      概念
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selectedChunkData.concepts.map((c) => (
                        <Badge
                          key={c}
                          variant="outline"
                          className="text-xs"
                        >
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full content */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    完整内容
                  </p>
                  <div className="rounded-md border bg-muted/30 p-4">
                    <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                      {selectedChunkData.contentFull}
                    </pre>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
