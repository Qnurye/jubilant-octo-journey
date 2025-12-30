/**
 * LLM Error Handling Tests
 *
 * Tests for FR-014: System MUST handle retrieval or generation failures
 * gracefully with user-friendly error messages.
 *
 * Tests for T081: Graceful error handling for LLM service unavailability
 *
 * @module @jubilant/rag/tests/unit/llm-error-handling
 */

import { describe, it, expect } from 'vitest';
import {
  LLMServiceError,
  classifyLLMError,
  type LLMErrorType,
} from '../../src/generation/llm';

// ============================================================================
// LLMServiceError Tests
// ============================================================================

describe('LLMServiceError', () => {
  it('should create an error with type and message', () => {
    const error = new LLMServiceError(
      'Connection failed',
      'CONNECTION_ERROR'
    );

    expect(error.message).toBe('Connection failed');
    expect(error.errorType).toBe('CONNECTION_ERROR');
    expect(error.name).toBe('LLMServiceError');
  });

  it('should set isRetryable to false by default', () => {
    const error = new LLMServiceError('Error', 'UNKNOWN_ERROR');

    expect(error.isRetryable).toBe(false);
  });

  it('should accept isRetryable option', () => {
    const error = new LLMServiceError('Error', 'TIMEOUT_ERROR', {
      isRetryable: true,
    });

    expect(error.isRetryable).toBe(true);
  });

  it('should accept statusCode option', () => {
    const error = new LLMServiceError('Error', 'SERVICE_UNAVAILABLE', {
      statusCode: 503,
    });

    expect(error.statusCode).toBe(503);
  });

  it('should accept originalError option', () => {
    const originalError = new Error('Original');
    const error = new LLMServiceError('Wrapped', 'UNKNOWN_ERROR', {
      originalError,
    });

    expect(error.originalError).toBe(originalError);
  });

  it('should extend Error class', () => {
    const error = new LLMServiceError('Test', 'CONNECTION_ERROR');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LLMServiceError);
  });
});

// ============================================================================
// classifyLLMError Tests
// ============================================================================

describe('classifyLLMError', () => {
  describe('Connection errors', () => {
    it('should classify ECONNREFUSED as CONNECTION_ERROR', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:8000');
      const result = classifyLLMError(error);

      expect(result.type).toBe('CONNECTION_ERROR');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify ENOTFOUND as CONNECTION_ERROR', () => {
      const error = new Error('getaddrinfo ENOTFOUND example.com');
      const result = classifyLLMError(error);

      expect(result.type).toBe('CONNECTION_ERROR');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify network error as CONNECTION_ERROR', () => {
      const error = new Error('Network error occurred');
      const result = classifyLLMError(error);

      expect(result.type).toBe('CONNECTION_ERROR');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify connection refused as CONNECTION_ERROR', () => {
      const error = new Error('connection refused by server');
      const result = classifyLLMError(error);

      expect(result.type).toBe('CONNECTION_ERROR');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify failed to fetch as CONNECTION_ERROR', () => {
      const error = new Error('Failed to fetch');
      const result = classifyLLMError(error);

      expect(result.type).toBe('CONNECTION_ERROR');
      expect(result.isRetryable).toBe(true);
    });
  });

  describe('Timeout errors', () => {
    it('should classify timeout as TIMEOUT_ERROR', () => {
      const error = new Error('Request timeout');
      const result = classifyLLMError(error);

      expect(result.type).toBe('TIMEOUT_ERROR');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify timed out as TIMEOUT_ERROR', () => {
      const error = new Error('Operation timed out after 30000ms');
      const result = classifyLLMError(error);

      expect(result.type).toBe('TIMEOUT_ERROR');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify ETIMEDOUT as TIMEOUT_ERROR', () => {
      const error = new Error('connect ETIMEDOUT 10.0.0.1:8000');
      const result = classifyLLMError(error);

      expect(result.type).toBe('TIMEOUT_ERROR');
      expect(result.isRetryable).toBe(true);
    });
  });

  describe('Rate limit errors', () => {
    it('should classify rate limit as RATE_LIMIT_ERROR', () => {
      const error = new Error('Rate limit exceeded');
      const result = classifyLLMError(error);

      expect(result.type).toBe('RATE_LIMIT_ERROR');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify too many requests as RATE_LIMIT_ERROR', () => {
      const error = new Error('Too many requests');
      const result = classifyLLMError(error);

      expect(result.type).toBe('RATE_LIMIT_ERROR');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify 429 as RATE_LIMIT_ERROR', () => {
      const error = new Error('HTTP 429: Too Many Requests');
      const result = classifyLLMError(error);

      expect(result.type).toBe('RATE_LIMIT_ERROR');
      expect(result.isRetryable).toBe(true);
    });
  });

  describe('Context length errors', () => {
    it('should classify context length as CONTEXT_LENGTH_ERROR', () => {
      const error = new Error('Context length exceeded');
      const result = classifyLLMError(error);

      expect(result.type).toBe('CONTEXT_LENGTH_ERROR');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify max_tokens as CONTEXT_LENGTH_ERROR', () => {
      const error = new Error('max_tokens limit exceeded');
      const result = classifyLLMError(error);

      expect(result.type).toBe('CONTEXT_LENGTH_ERROR');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify too long as CONTEXT_LENGTH_ERROR', () => {
      const error = new Error('Input is too long for the model');
      const result = classifyLLMError(error);

      expect(result.type).toBe('CONTEXT_LENGTH_ERROR');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify token limit as CONTEXT_LENGTH_ERROR', () => {
      const error = new Error('Token limit exceeded');
      const result = classifyLLMError(error);

      expect(result.type).toBe('CONTEXT_LENGTH_ERROR');
      expect(result.isRetryable).toBe(false);
    });
  });

  describe('Model errors', () => {
    it('should classify model not found as MODEL_ERROR', () => {
      const error = new Error('Model not found: gpt-5');
      const result = classifyLLMError(error);

      expect(result.type).toBe('MODEL_ERROR');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify model_not_found as MODEL_ERROR', () => {
      const error = new Error('model_not_found');
      const result = classifyLLMError(error);

      expect(result.type).toBe('MODEL_ERROR');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify invalid model as MODEL_ERROR', () => {
      const error = new Error('Invalid model specified');
      const result = classifyLLMError(error);

      expect(result.type).toBe('MODEL_ERROR');
      expect(result.isRetryable).toBe(false);
    });
  });

  describe('Service unavailable errors', () => {
    it('should classify 502 as SERVICE_UNAVAILABLE', () => {
      const error = new Error('HTTP 502 Bad Gateway');
      const result = classifyLLMError(error);

      expect(result.type).toBe('SERVICE_UNAVAILABLE');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify 503 as SERVICE_UNAVAILABLE', () => {
      const error = new Error('503 Service Unavailable');
      const result = classifyLLMError(error);

      expect(result.type).toBe('SERVICE_UNAVAILABLE');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify 504 status code as SERVICE_UNAVAILABLE', () => {
      // Note: "504 Gateway Timeout" contains "timeout" which matches TIMEOUT_ERROR first
      // So we test with a message that doesn't include "timeout"
      const error = new Error('HTTP 504');
      const result = classifyLLMError(error);

      expect(result.type).toBe('SERVICE_UNAVAILABLE');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify bad gateway as SERVICE_UNAVAILABLE', () => {
      const error = new Error('Bad Gateway');
      const result = classifyLLMError(error);

      expect(result.type).toBe('SERVICE_UNAVAILABLE');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify service unavailable as SERVICE_UNAVAILABLE', () => {
      // The pattern checks for exact "service unavailable" (case insensitive)
      const error = new Error('Service Unavailable');
      const result = classifyLLMError(error);

      expect(result.type).toBe('SERVICE_UNAVAILABLE');
      expect(result.isRetryable).toBe(true);
    });
  });

  describe('Unknown errors', () => {
    it('should classify unrecognized error as UNKNOWN_ERROR', () => {
      const error = new Error('Some random error message');
      const result = classifyLLMError(error);

      expect(result.type).toBe('UNKNOWN_ERROR');
      expect(result.isRetryable).toBe(false);
    });

    it('should handle non-Error objects', () => {
      const result = classifyLLMError('string error');

      expect(result.type).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('string error');
    });

    it('should handle null/undefined', () => {
      const result = classifyLLMError(undefined);

      expect(result.type).toBe('UNKNOWN_ERROR');
    });
  });

  describe('Already classified errors', () => {
    it('should return existing classification for LLMServiceError', () => {
      const existingError = new LLMServiceError(
        'Custom message',
        'RATE_LIMIT_ERROR',
        {
          isRetryable: true,
          statusCode: 429,
        }
      );

      const result = classifyLLMError(existingError);

      expect(result.type).toBe('RATE_LIMIT_ERROR');
      expect(result.message).toBe('Custom message');
      expect(result.isRetryable).toBe(true);
      expect(result.statusCode).toBe(429);
    });
  });
});

// ============================================================================
// Error Type Coverage Tests
// ============================================================================

describe('LLMErrorType coverage', () => {
  const allErrorTypes: LLMErrorType[] = [
    'CONNECTION_ERROR',
    'TIMEOUT_ERROR',
    'RATE_LIMIT_ERROR',
    'MODEL_ERROR',
    'CONTEXT_LENGTH_ERROR',
    'SERVICE_UNAVAILABLE',
    'UNKNOWN_ERROR',
  ];

  it('should have 7 error types', () => {
    expect(allErrorTypes).toHaveLength(7);
  });

  it('should be able to create LLMServiceError with each type', () => {
    for (const errorType of allErrorTypes) {
      const error = new LLMServiceError(`Test ${errorType}`, errorType);
      expect(error.errorType).toBe(errorType);
    }
  });

  describe('Retryable vs non-retryable errors', () => {
    const retryableTypes: LLMErrorType[] = [
      'CONNECTION_ERROR',
      'TIMEOUT_ERROR',
      'RATE_LIMIT_ERROR',
      'SERVICE_UNAVAILABLE',
    ];

    const nonRetryableTypes: LLMErrorType[] = [
      'MODEL_ERROR',
      'CONTEXT_LENGTH_ERROR',
      'UNKNOWN_ERROR',
    ];

    it('should have retryable error types', () => {
      expect(retryableTypes).toHaveLength(4);
    });

    it('should have non-retryable error types', () => {
      expect(nonRetryableTypes).toHaveLength(3);
    });
  });
});

// ============================================================================
// User-Friendly Error Message Tests
// ============================================================================

describe('User-friendly error messages', () => {
  it('should provide helpful message for connection errors', () => {
    const result = classifyLLMError(new Error('ECONNREFUSED'));

    expect(result.message.toLowerCase()).toContain('unreachable');
    expect(result.message.toLowerCase()).toContain('check');
  });

  it('should provide helpful message for timeout errors', () => {
    const result = classifyLLMError(new Error('timeout'));

    expect(result.message.toLowerCase()).toContain('timed out');
  });

  it('should provide helpful message for rate limit errors', () => {
    const result = classifyLLMError(new Error('rate limit'));

    expect(result.message.toLowerCase()).toContain('rate limit');
    expect(result.message.toLowerCase()).toContain('later');
  });

  it('should provide helpful message for context length errors', () => {
    const result = classifyLLMError(new Error('context length exceeded'));

    expect(result.message.toLowerCase()).toContain('context');
    expect(result.message.toLowerCase()).toContain('limit');
  });
});
