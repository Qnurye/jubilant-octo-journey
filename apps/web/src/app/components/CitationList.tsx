'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface Citation {
  id: string;
  chunkId: string;
  documentTitle: string;
  documentUrl: string;
  snippet: string;
  relevanceScore: number;
}

interface CitationListProps {
  citations: Citation[];
  maxVisible?: number;
}

export function CitationList({ citations, maxVisible = 5 }: CitationListProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  if (citations.length === 0) {
    return null;
  }

  const visibleCitations = expanded ? citations : citations.slice(0, maxVisible);
  const hasMore = citations.length > maxVisible;

  return (
    <div className="space-y-3">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">
            来源 ({citations.length})
          </h3>
          {hasMore && (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-auto p-1 text-xs gap-1">
                {expanded ? (
                  <>
                    <ChevronUp className="size-3" />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3" />
                    显示全部 {citations.length}
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          )}
        </div>

        <div className="grid gap-2 mt-2">
          {citations.slice(0, maxVisible).map((citation) => (
            <CitationCard
              key={citation.id}
              citation={citation}
              isSelected={selectedCitation?.id === citation.id}
              onClick={() =>
                setSelectedCitation(
                  selectedCitation?.id === citation.id ? null : citation
                )
              }
            />
          ))}
        </div>

        {hasMore && (
          <CollapsibleContent>
            <div className="grid gap-2 mt-2">
              {citations.slice(maxVisible).map((citation) => (
                <CitationCard
                  key={citation.id}
                  citation={citation}
                  isSelected={selectedCitation?.id === citation.id}
                  onClick={() =>
                    setSelectedCitation(
                      selectedCitation?.id === citation.id ? null : citation
                    )
                  }
                />
              ))}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>

      {selectedCitation && (
        <CitationDetail
          citation={selectedCitation}
          onClose={() => setSelectedCitation(null)}
        />
      )}
    </div>
  );
}

interface CitationCardProps {
  citation: Citation;
  isSelected: boolean;
  onClick: () => void;
}

function CitationCard({ citation, isSelected, onClick }: CitationCardProps) {
  const relevancePercent = Math.round(citation.relevanceScore * 100);
  const relevanceVariant =
    relevancePercent >= 80
      ? 'default'
      : relevancePercent >= 60
        ? 'secondary'
        : 'outline';

  return (
    <Card
      className={`cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-primary' : 'hover:bg-accent'
      }`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono text-sm font-bold text-primary cursor-help">
                  [{citation.id}]
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>分块 ID：{citation.chunkId}</p>
              </TooltipContent>
            </Tooltip>
            <span className="font-medium text-sm truncate">
              {citation.documentTitle}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant={relevanceVariant} className="cursor-help">
                {relevancePercent}%
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>相关度评分</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {citation.snippet}
        </p>
      </CardContent>
    </Card>
  );
}

interface CitationDetailProps {
  citation: Citation;
  onClose: () => void;
}

function CitationDetail({ citation, onClose }: CitationDetailProps) {
  return (
    <Card className="mt-2">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-primary">
                [{citation.id}]
              </span>
              {citation.documentTitle}
            </CardTitle>
            {citation.documentUrl && (
              <a
                href={citation.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                {citation.documentUrl}
              </a>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-8"
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>关闭详情</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            摘录
          </h5>
          <blockquote className="pl-3 border-l-2 border-primary text-sm text-muted-foreground italic">
            {citation.snippet}
          </blockquote>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            相关度：{' '}
            <strong className="text-foreground">
              {Math.round(citation.relevanceScore * 100)}%
            </strong>
          </span>
          <span>
            分块 ID：{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
              {citation.chunkId}
            </code>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default CitationList;
