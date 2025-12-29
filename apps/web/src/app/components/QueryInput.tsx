'use client';

import { useState, useCallback, FormEvent, KeyboardEvent } from 'react';

interface QueryInputProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function QueryInput({
  onSubmit,
  isLoading,
  placeholder = 'Ask a question about algorithms, data structures, or competition strategies...',
  maxLength = 2000,
}: QueryInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed && !isLoading) {
        onSubmit(trimmed);
      }
    },
    [query, isLoading, onSubmit]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Enter without Shift
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const trimmed = query.trim();
        if (trimmed && !isLoading) {
          onSubmit(trimmed);
        }
      }
    },
    [query, isLoading, onSubmit]
  );

  const charCount = query.length;
  const isOverLimit = charCount > maxLength;
  const canSubmit = query.trim().length > 0 && !isLoading && !isOverLimit;

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={3}
          className={`
            w-full px-4 py-3 pr-24
            border rounded-lg
            resize-none
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:bg-gray-100 disabled:cursor-not-allowed
            dark:bg-gray-800 dark:border-gray-700 dark:text-white
            dark:placeholder-gray-400 dark:disabled:bg-gray-900
            ${isOverLimit ? 'border-red-500' : 'border-gray-300'}
          `}
        />

        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <span
            className={`text-xs ${
              isOverLimit
                ? 'text-red-500'
                : charCount > maxLength * 0.9
                  ? 'text-yellow-500'
                  : 'text-gray-400'
            }`}
          >
            {charCount}/{maxLength}
          </span>

          <button
            type="submit"
            disabled={!canSubmit}
            className={`
              px-4 py-1.5 rounded-md text-sm font-medium
              transition-colors duration-200
              ${
                canSubmit
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700'
              }
            `}
          >
            {isLoading ? (
              <span className="flex items-center gap-1">
                <LoadingSpinner />
                Thinking...
              </span>
            ) : (
              'Ask'
            )}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Press Enter to submit, Shift+Enter for new line
      </p>

      {isOverLimit && (
        <p className="mt-1 text-xs text-red-500">
          Query exceeds maximum length of {maxLength} characters
        </p>
      )}
    </form>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default QueryInput;
