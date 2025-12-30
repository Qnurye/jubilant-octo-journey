'use client';

import { useState, useCallback } from 'react';

/**
 * Feedback request interface matching the API
 */
interface FeedbackRequest {
  queryId: string;
  rating: number;
  comment?: string;
}

/**
 * Props for the FeedbackWidget component
 */
interface FeedbackWidgetProps {
  /** The query ID to submit feedback for */
  queryId: string;
  /** API base URL */
  apiUrl: string;
  /** Optional callback when feedback is submitted successfully */
  onSubmit?: (rating: number, comment?: string) => void;
  /** Optional callback when an error occurs */
  onError?: (error: string) => void;
  /** Whether to show a compact version */
  compact?: boolean;
}

/**
 * Star rating icons
 */
function StarIcon({ filled, onClick, disabled }: { filled: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        text-2xl transition-colors duration-150
        ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-110 transition-transform'}
        ${filled ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-200'}
      `}
      aria-label={filled ? 'Selected' : 'Not selected'}
    >
      {filled ? '\u2605' : '\u2606'}
    </button>
  );
}

/**
 * FeedbackWidget - Collects user feedback on query responses
 *
 * Displays a 5-star rating system with optional comment field.
 * Submits feedback to the /api/feedback endpoint.
 */
export function FeedbackWidget({
  queryId,
  apiUrl,
  onSubmit,
  onError,
  compact = false,
}: FeedbackWidgetProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    setIsSubmitting(true);
    setError(null);

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
        throw new Error(errorData.message || 'Failed to submit feedback');
      }

      setSubmitted(true);
      onSubmit?.(rating, comment.trim() || undefined);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit feedback';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [queryId, rating, comment, apiUrl, onSubmit, onError]);

  // Submitted state - show thank you message
  if (submitted) {
    return (
      <div className="feedback-widget feedback-submitted p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span className="font-medium">Thank you for your feedback!</span>
        </div>
        <p className="text-sm text-green-600 dark:text-green-400 mt-1">
          Your input helps us improve the system.
        </p>
      </div>
    );
  }

  // Compact version - just stars and submit
  if (compact) {
    return (
      <div className="feedback-widget feedback-compact flex items-center gap-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Rate this response:
        </span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <StarIcon
              key={star}
              filled={star <= (hoveredRating || rating)}
              onClick={() => setRating(star)}
              disabled={isSubmitting}
            />
          ))}
        </div>
        {rating > 0 && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`
              px-3 py-1 text-sm rounded-md transition-colors
              ${isSubmitting
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
              }
            `}
          >
            {isSubmitting ? 'Sending...' : 'Submit'}
          </button>
        )}
        {error && (
          <span className="text-sm text-red-500">{error}</span>
        )}
      </div>
    );
  }

  // Full version with comment field
  return (
    <div className="feedback-widget p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
        Was this response helpful?
      </h4>

      {/* Star rating */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-600 dark:text-gray-400 mr-2">
          Rating:
        </span>
        <div
          className="flex gap-1"
          onMouseLeave={() => setHoveredRating(0)}
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <div
              key={star}
              onMouseEnter={() => setHoveredRating(star)}
            >
              <StarIcon
                filled={star <= (hoveredRating || rating)}
                onClick={() => setRating(star)}
                disabled={isSubmitting}
              />
            </div>
          ))}
        </div>
        {rating > 0 && (
          <span className="text-sm text-gray-500 ml-2">
            {rating === 1 && 'Poor'}
            {rating === 2 && 'Fair'}
            {rating === 3 && 'Good'}
            {rating === 4 && 'Very Good'}
            {rating === 5 && 'Excellent'}
          </span>
        )}
      </div>

      {/* Comment field (shown after rating is selected) */}
      {rating > 0 && (
        <div className="mb-4">
          <label
            htmlFor="feedback-comment"
            className="block text-sm text-gray-600 dark:text-gray-400 mb-1"
          >
            Additional comments (optional):
          </label>
          <textarea
            id="feedback-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isSubmitting}
            placeholder="Tell us more about your experience..."
            maxLength={2000}
            rows={3}
            className={`
              w-full px-3 py-2 text-sm rounded-md border
              bg-white dark:bg-gray-700
              border-gray-300 dark:border-gray-600
              text-gray-900 dark:text-gray-100
              placeholder-gray-400 dark:placeholder-gray-500
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              disabled:bg-gray-100 disabled:cursor-not-allowed
              resize-none
            `}
          />
          <div className="text-xs text-gray-400 mt-1 text-right">
            {comment.length}/2000
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting || rating === 0}
        className={`
          w-full px-4 py-2 rounded-md font-medium transition-colors
          ${isSubmitting || rating === 0
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
          }
        `}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Submitting...
          </span>
        ) : (
          'Submit Feedback'
        )}
      </button>
    </div>
  );
}

export default FeedbackWidget;
