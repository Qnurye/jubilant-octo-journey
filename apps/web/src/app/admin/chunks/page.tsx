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
            <span>Graph</span>
            <ChevronRightIcon className="size-3.5" />
            <span>
              Chunks for &lsquo;{concept}&rsquo;
            </span>
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight">Chunks</h1>
        <p className="text-muted-foreground">
          Browse and inspect all processed content chunks.
        </p>
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {concept && (
            <Badge variant="secondary" className="gap-1 pr-1">
              Concept: {concept}
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
              Document: {activeDocTitle || documentId.slice(0, 8)}
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
              Search: {search.length > 20 ? search.slice(0, 20) + '...' : search}
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
            Clear all
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search chunk content..."
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
          <option value="">All documents</option>
          {sourcesData?.documents?.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title}
            </option>
          ))}
        </select>

        <Input
          placeholder="Filter by concept..."
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
          Code
        </Button>
        <Button
          variant={contentFilters.hasFormula ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggleFilter('hasFormula')}
          className="gap-1.5"
        >
          <FunctionSquare className="size-3.5" />
          Formula
        </Button>
        <Button
          variant={contentFilters.hasTable ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggleFilter('hasTable')}
          className="gap-1.5"
        >
          <Table className="size-3.5" />
          Table
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
                  <th className="text-left p-3 font-medium">Content</th>
                  <th className="text-left p-3 font-medium">Document</th>
                  <th className="text-left p-3 font-medium">Tokens</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Topic</th>
                  <th className="text-left p-3 font-medium">Concepts</th>
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
                            Code
                          </Badge>
                        )}
                        {chunk.metadata.hasFormula && (
                          <Badge variant="outline" className="text-xs">
                            <FunctionSquare className="size-3 mr-0.5" />
                            Math
                          </Badge>
                        )}
                        {chunk.metadata.hasTable && (
                          <Badge variant="outline" className="text-xs">
                            <Table className="size-3 mr-0.5" />
                            Table
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
                      {chunk.metadata.tokenCount} tokens
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {chunk.metadata.hasCode && (
                      <Badge variant="outline" className="text-xs">Code</Badge>
                    )}
                    {chunk.metadata.hasFormula && (
                      <Badge variant="outline" className="text-xs">Math</Badge>
                    )}
                    {chunk.metadata.hasTable && (
                      <Badge variant="outline" className="text-xs">Table</Badge>
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
                Showing {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, total)} of {total}
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
            <Layers className="size-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? 'No chunks match your filters.'
                : 'No chunks yet. Upload and process documents to see chunks.'}
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
                  Chunk {selectedChunkData.metadata.chunkIndex + 1} of{' '}
                  {selectedChunkData.metadata.totalChunks}
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
                    {selectedChunkData.metadata.tokenCount} tokens
                  </Badge>
                  {selectedChunkData.topicTag && (
                    <Badge variant="secondary">
                      {selectedChunkData.topicTag}
                    </Badge>
                  )}
                  {selectedChunkData.metadata.hasCode && (
                    <Badge variant="outline">
                      <Code className="size-3 mr-1" />
                      Code
                    </Badge>
                  )}
                  {selectedChunkData.metadata.hasFormula && (
                    <Badge variant="outline">
                      <FunctionSquare className="size-3 mr-1" />
                      Formula
                    </Badge>
                  )}
                  {selectedChunkData.metadata.hasTable && (
                    <Badge variant="outline">
                      <Table className="size-3 mr-1" />
                      Table
                    </Badge>
                  )}
                </div>

                {/* Concepts */}
                {selectedChunkData.concepts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      Concepts
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
                    Full Content
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
