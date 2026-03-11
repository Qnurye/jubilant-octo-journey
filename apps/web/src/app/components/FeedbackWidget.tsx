'use client';

import { useState, useCallback } from 'react';
import { Check, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface FeedbackRequest {
  queryId: string;
  rating: number;
  comment?: string;
}

interface FeedbackWidgetProps {
  queryId: string;
  apiUrl: string;
  onSubmit?: (rating: number, comment?: string) => void;
  onError?: (error: string) => void;
  compact?: boolean;
}

const RATING_LABELS = ['很差', '一般', '不错', '很好', '优秀'] as const;

function StarRating({
  value,
  hoveredValue,
  onSelect,
  onHover,
  onLeave,
  disabled,
}: {
  value: number;
  hoveredValue: number;
  onSelect: (rating: number) => void;
  onHover: (rating: number) => void;
  onLeave: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1" onMouseLeave={onLeave}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= (hoveredValue || value);
        return (
          <Tooltip key={star}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelect(star)}
                onMouseEnter={() => onHover(star)}
                disabled={disabled}
                className={`
                  transition-all duration-150 p-0.5 rounded
                  ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-110'}
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                `}
                aria-label={`Rate ${star} out of 5: ${RATING_LABELS[star - 1]}`}
              >
                <Star
                  className={`size-6 transition-colors ${
                    isFilled
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-muted-foreground hover:text-yellow-300'
                  }`}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{RATING_LABELS[star - 1]}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function FeedbackWidget({
  queryId,
  apiUrl,
  onSubmit,
  onError,
  compact = false,
}: FeedbackWidgetProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (rating === 0) {
      toast.error('请选择评分');
      return;
    }

    setIsSubmitting(true);

    try {
      const request: FeedbackRequest = {
        queryId,
        rating,
        comment: comment.trim() || undefined,
      };

      const response = await fetch(`${apiUrl}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '提交反馈失败');
      }

      setSubmitted(true);
      toast.success('感谢你的反馈！');
      onSubmit?.(rating, comment.trim() || undefined);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '提交反馈失败';
      toast.error(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [queryId, rating, comment, apiUrl, onSubmit, onError]);

  if (submitted) {
    return (
      <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <Check className="size-5" />
            <span className="font-medium">感谢你的反馈！</span>
          </div>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
            你的意见有助于我们改进系统。
          </p>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">为此回答评分：</span>
        <StarRating
          value={rating}
          hoveredValue={hoveredRating}
          onSelect={setRating}
          onHover={setHoveredRating}
          onLeave={() => setHoveredRating(0)}
          disabled={isSubmitting}
        />
        {rating > 0 && (
          <Button onClick={handleSubmit} disabled={isSubmitting} size="sm">
            {isSubmitting ? (
              <>
                <Spinner className="size-4" />
                <span className="ml-1">发送中...</span>
              </>
            ) : (
              '提交'
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">这个回答有帮助吗？</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Star rating */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">评分：</span>
          <StarRating
            value={rating}
            hoveredValue={hoveredRating}
            onSelect={setRating}
            onHover={setHoveredRating}
            onLeave={() => setHoveredRating(0)}
            disabled={isSubmitting}
          />
          {rating > 0 && (
            <span className="text-sm text-muted-foreground">
              {RATING_LABELS[rating - 1]}
            </span>
          )}
        </div>

        {/* Comment field */}
        {rating > 0 && (
          <div className="space-y-2">
            <label htmlFor="feedback-comment" className="text-sm text-muted-foreground">
              补充说明（可选）：
            </label>
            <Textarea
              id="feedback-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isSubmitting}
              placeholder="告诉我们更多关于你的体验..."
              maxLength={2000}
              rows={3}
            />
            <div className="text-xs text-muted-foreground text-right tabular-nums">
              {comment.length}/2000
            </div>
          </div>
        )}

        {/* Submit button */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || rating === 0}
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <Spinner className="size-4" />
              <span className="ml-2">提交中...</span>
            </>
          ) : (
            '提交反馈'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default FeedbackWidget;
