'use client';

import { cn } from '@/lib/utils';
import type { CoverageCell } from '@/lib/teacher-api';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CoverageHeatmapProps {
  data: CoverageCell[];
  onCellClick: (cell: CoverageCell) => void;
}

function gapColor(indicator: CoverageCell['gapIndicator']): string {
  switch (indicator) {
    case 'well-covered':
      return 'bg-green-100 dark:bg-green-900/40 border-green-200 dark:border-green-800';
    case 'low-coverage':
      return 'bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800';
    case 'no-data':
      return 'bg-muted border-muted-foreground/10';
  }
}

function gapTextColor(indicator: CoverageCell['gapIndicator']): string {
  switch (indicator) {
    case 'well-covered':
      return 'text-green-800 dark:text-green-200';
    case 'low-coverage':
      return 'text-amber-800 dark:text-amber-200';
    case 'no-data':
      return 'text-muted-foreground';
  }
}

export function CoverageHeatmap({ data, onCellClick }: CoverageHeatmapProps) {
  return (
    <TooltipProvider>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {data.map((cell) => (
        <Tooltip key={cell.conceptName}>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border p-3 text-center transition-all hover:ring-2 hover:ring-ring hover:ring-offset-1 min-h-[80px]',
                gapColor(cell.gapIndicator)
              )}
              onClick={() => onCellClick(cell)}
            >
              <span
                className={cn(
                  'text-xs font-medium leading-tight truncate w-full',
                  gapTextColor(cell.gapIndicator)
                )}
              >
                {cell.conceptName}
              </span>
              <span
                className={cn(
                  'text-[10px] mt-1',
                  gapTextColor(cell.gapIndicator)
                )}
              >
                {cell.chunkCount} chunks
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="space-y-1">
              <p className="font-semibold">{cell.conceptName}</p>
              <p>Chunks: {cell.chunkCount}</p>
              <p>Queries: {cell.queryCount}</p>
              <p>Confidence: {(cell.avgConfidence * 100).toFixed(1)}%</p>
              <p>
                Coverage:{' '}
                {cell.gapIndicator === 'well-covered'
                  ? 'Well covered'
                  : cell.gapIndicator === 'low-coverage'
                    ? 'Low coverage'
                    : 'No data'}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
    </TooltipProvider>
  );
}
