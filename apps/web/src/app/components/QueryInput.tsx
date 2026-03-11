'use client';

import { useState, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface QueryInputProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function QueryInput({
  onSubmit,
  isLoading,
  placeholder = '输入关于算法、数据结构或竞赛策略的问题...',
  maxLength = 2000,
}: QueryInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed && !isLoading) {
        onSubmit(trimmed);
        setQuery('');
      }
    },
    [query, isLoading, onSubmit]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const trimmed = query.trim();
        const overLimit = query.length > maxLength;
        if (trimmed && !isLoading && !overLimit) {
          onSubmit(trimmed);
          setQuery('');
        }
      }
    },
    [query, isLoading, maxLength, onSubmit]
  );

  const charCount = query.length;
  const isOverLimit = charCount > maxLength;
  const canSubmit = query.trim().length > 0 && !isLoading && !isOverLimit;

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={3}
          className={`pr-24 resize-none ${isOverLimit ? 'border-destructive focus-visible:ring-destructive' : ''}`}
        />

        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <span
            className={`text-xs tabular-nums ${
              isOverLimit
                ? 'text-destructive'
                : charCount > maxLength * 0.9
                  ? 'text-yellow-500'
                  : 'text-muted-foreground'
            }`}
          >
            {charCount}/{maxLength}
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                disabled={!canSubmit}
                size="sm"
              >
                {isLoading ? (
                  <>
                    <Spinner className="size-4" />
                    <span className="ml-1">思考中...</span>
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    <span className="ml-1">提问</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>按 Enter 提交</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        按 <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd> 提交，<kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Shift+Enter</kbd> 换行
      </p>

      {isOverLimit && (
        <p className="mt-1 text-xs text-destructive">
          问题超出最大长度 {maxLength} 个字符
        </p>
      )}
    </form>
  );
}

export default QueryInput;
