'use client';

import { AlertTriangle, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useTopicDetail } from '@/lib/teacher-api';
import { TrendChart } from './TrendChart';

interface TopicDetailPanelProps {
  conceptName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TopicDetailPanel({
  conceptName,
  open,
  onOpenChange,
}: TopicDetailPanelProps) {
  const { data, isLoading, error } = useTopicDetail(conceptName);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{conceptName || 'Topic Detail'}</SheetTitle>
          <SheetDescription>
            Detailed analytics for this concept.
          </SheetDescription>
        </SheetHeader>

        <div className="p-4 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
              <Skeleton className="h-[200px] rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertTriangle className="size-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {error.message || 'Failed to load topic details.'}
              </p>
            </div>
          ) : data ? (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Queries</p>
                  <p className="text-lg font-bold">{data.queryCount}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Confidence</p>
                  <p className="text-lg font-bold">
                    {(data.avgConfidence * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Chunks</p>
                  <p className="text-lg font-bold">{data.chunkCount}</p>
                </div>
              </div>

              {/* Related Concepts */}
              {data.relatedConcepts.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    Related Concepts
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {data.relatedConcepts.map((rc) => (
                      <div
                        key={rc.name}
                        className="flex items-center gap-1.5"
                      >
                        <span className="text-sm">{rc.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {rc.relationship}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mini Trend Chart */}
              {data.trendOverTime.length >= 2 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    Trend Over Time
                  </h4>
                  <TrendChart data={data.trendOverTime} />
                </div>
              )}

              {/* Feedback Rating */}
              {data.feedbackAvgRating !== null && (
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <Star className="size-4 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium">
                      Feedback Rating: {data.feedbackAvgRating.toFixed(1)} / 5
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Average student rating for this topic
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
