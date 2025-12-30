/**
 * Qwen3 LLM Client
 *
 * OpenAI-compatible LLM client for Qwen3-32B model.
 * Supports both streaming and non-streaming responses.
 * Includes graceful error handling for service unavailability.
 *
 * @module @jubilant/rag/generation/llm
 */

import { OpenAI } from '@llamaindex/openai';

// ============================================================================
// Error Types (T081)
// ============================================================================

/**
 * LLM service error types for graceful error handling
 */
export type LLMErrorType =
  | 'CONNECTION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'MODEL_ERROR'
  | 'CONTEXT_LENGTH_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

/**
 * Custom error class for LLM service errors
 */
export class LLMServiceError extends Error {
  public readonly errorType: LLMErrorType;
  public readonly isRetryable: boolean;
  public readonly statusCode?: number;
  public readonly originalError?: Error;

  constructor(
    message: string,
    errorType: LLMErrorType,
    options?: {
      isRetryable?: boolean;
      statusCode?: number;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'LLMServiceError';
    this.errorType = errorType;
    this.isRetryable = options?.isRetryable ?? false;
    this.statusCode = options?.statusCode;
    this.originalError = options?.originalError;
  }
}

/**
 * Classify an error into an LLM error type
 */
export function classifyLLMError(error: unknown): {
  type: LLMErrorType;
  message: string;
  isRetryable: boolean;
  statusCode?: number;
} {
  if (error instanceof LLMServiceError) {
    return {
      type: error.errorType,
      message: error.message,
      isRetryable: error.isRetryable,
      statusCode: error.statusCode,
    };
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Connection errors
  if (
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('connection refused') ||
    lowerMessage.includes('failed to fetch')
  ) {
    return {
      type: 'CONNECTION_ERROR',
      message: 'LLM service is unreachable. Please check if the service is running.',
      isRetryable: true,
    };
  }

  // Timeout errors
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('etimedout')
  ) {
    return {
      type: 'TIMEOUT_ERROR',
      message: 'LLM request timed out. The service may be overloaded.',
      isRetryable: true,
    };
  }

  // Rate limit errors
  if (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('too many requests') ||
    lowerMessage.includes('429')
  ) {
    return {
      type: 'RATE_LIMIT_ERROR',
      message: 'LLM rate limit exceeded. Please try again later.',
      isRetryable: true,
    };
  }

  // Context length errors
  if (
    lowerMessage.includes('context length') ||
    lowerMessage.includes('max_tokens') ||
    lowerMessage.includes('too long') ||
    lowerMessage.includes('token limit')
  ) {
    return {
      type: 'CONTEXT_LENGTH_ERROR',
      message: 'Request exceeds the model context length limit.',
      isRetryable: false,
    };
  }

  // Model errors
  if (
    lowerMessage.includes('model not found') ||
    lowerMessage.includes('model_not_found') ||
    lowerMessage.includes('invalid model')
  ) {
    return {
      type: 'MODEL_ERROR',
      message: 'Requested model is not available.',
      isRetryable: false,
    };
  }

  // Service unavailable (5xx errors)
  if (
    lowerMessage.includes('502') ||
    lowerMessage.includes('503') ||
    lowerMessage.includes('504') ||
    lowerMessage.includes('bad gateway') ||
    lowerMessage.includes('service unavailable')
  ) {
    return {
      type: 'SERVICE_UNAVAILABLE',
      message: 'LLM service is temporarily unavailable.',
      isRetryable: true,
    };
  }

  // Unknown error
  return {
    type: 'UNKNOWN_ERROR',
    message: errorMessage || 'An unknown error occurred with the LLM service.',
    isRetryable: false,
  };
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration for LLM requests
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay between retries in ms */
  initialDelayMs: number;
  /** Maximum delay between retries in ms */
  maxDelayMs: number;
  /** Exponential backoff factor */
  backoffFactor: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
};

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay for exponential backoff
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffFactor, attempt);
  return Math.min(delay, config.maxDelayMs);
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for Qwen3LLM
 */
export interface Qwen3LLMConfig {
  /** Base URL for the LLM service */
  baseUrl: string;
  /** API key (optional for local deployments) */
  apiKey?: string;
  /** Model name */
  model: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for generation (0.0 - 2.0) */
  temperature?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Retry configuration for failed requests */
  retry?: Partial<RetryConfig>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<Qwen3LLMConfig> = {
  baseUrl: process.env.LLM_BASE_URL || 'http://localhost:8000/v1',
  model: process.env.LLM_MODEL || 'Qwen/Qwen3-32B',
  maxTokens: 4096,
  temperature: 0.7,
  timeout: 120000, // 2 minutes for long responses
};

/**
 * Message format for chat completions
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Streaming chunk from LLM
 */
export interface LLMStreamChunk {
  content: string;
  finishReason?: 'stop' | 'length' | null;
}

/**
 * Qwen3 LLM client using OpenAI-compatible API
 *
 * Includes:
 * - Graceful error handling with classified error types
 * - Automatic retry with exponential backoff for transient errors
 * - Service health checking
 */
export class Qwen3LLM {
  private config: Qwen3LLMConfig;
  private retryConfig: RetryConfig;
  private client: OpenAI;

  constructor(config: Partial<Qwen3LLMConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Qwen3LLMConfig;

    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retry,
    };

    // Initialize LlamaIndex OpenAI client with custom base URL
    this.client = new OpenAI({
      apiKey: this.config.apiKey || 'not-needed',
      additionalSessionOptions: {
        baseURL: this.config.baseUrl,
      },
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
  }

  /**
   * Generate a complete response (non-streaming) with retry logic
   */
  async complete(messages: ChatMessage[]): Promise<string> {
    return this.withRetry(async () => {
      try {
        const response = await this.client.chat({
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        });

        return response.message.content as string;
      } catch (error) {
        throw this.wrapError(error);
      }
    });
  }

  /**
   * Generate a complete response with fallback for errors
   *
   * Returns a graceful error message instead of throwing when LLM is unavailable
   */
  async completeWithFallback(
    messages: ChatMessage[],
    fallbackMessage?: string
  ): Promise<{ content: string; error?: LLMServiceError }> {
    try {
      const content = await this.complete(messages);
      return { content };
    } catch (error) {
      const llmError = error instanceof LLMServiceError
        ? error
        : this.wrapError(error);

      console.error(`LLM error [${llmError.errorType}]:`, llmError.message);

      const defaultFallback = this.getDefaultFallbackMessage(llmError);
      return {
        content: fallbackMessage || defaultFallback,
        error: llmError,
      };
    }
  }

  /**
   * Generate a streaming response with error handling
   */
  async *stream(messages: ChatMessage[]): AsyncGenerator<LLMStreamChunk> {
    try {
      const stream = await this.client.chat({
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.delta;
        if (content) {
          yield {
            content,
            finishReason: null,
          };
        }
      }

      yield {
        content: '',
        finishReason: 'stop',
      };
    } catch (error) {
      // For streaming, we yield an error indicator
      const llmError = this.wrapError(error);
      console.error(`LLM stream error [${llmError.errorType}]:`, llmError.message);

      // Yield error information in the stream
      yield {
        content: '',
        finishReason: 'stop',
        error: llmError,
      } as LLMStreamChunk & { error?: LLMServiceError };

      throw llmError;
    }
  }

  /**
   * Generate a streaming response with graceful error handling
   *
   * Instead of throwing on error, yields an error message as the final chunk
   */
  async *streamWithFallback(
    messages: ChatMessage[],
    fallbackMessage?: string
  ): AsyncGenerator<LLMStreamChunk> {
    try {
      yield* this.stream(messages);
    } catch (error) {
      const llmError = error instanceof LLMServiceError
        ? error
        : this.wrapError(error);

      const errorMessage = fallbackMessage || this.getDefaultFallbackMessage(llmError);

      // Yield the fallback message as tokens
      yield {
        content: errorMessage,
        finishReason: null,
      };

      yield {
        content: '',
        finishReason: 'stop',
      };
    }
  }

  /**
   * Check if the LLM service is healthy
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    latencyMs: number;
    message?: string;
    errorType?: LLMErrorType;
  }> {
    const start = Date.now();

    try {
      // Simple completion test with shorter timeout
      await this.complete([
        { role: 'user', content: 'Say "ok"' },
      ]);
      return {
        healthy: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      const classified = classifyLLMError(error);
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: classified.message,
        errorType: classified.type,
      };
    }
  }

  /**
   * Execute a function with retry logic for transient errors
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const classified = classifyLLMError(error);

        // Only retry for retryable errors
        if (!classified.isRetryable || attempt === this.retryConfig.maxRetries) {
          throw error;
        }

        const delay = calculateBackoffDelay(attempt, this.retryConfig);
        console.warn(
          `LLM request failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}): ` +
          `${classified.message}. Retrying in ${delay}ms...`
        );

        await sleep(delay);
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Wrap an error as an LLMServiceError
   */
  private wrapError(error: unknown): LLMServiceError {
    if (error instanceof LLMServiceError) {
      return error;
    }

    const classified = classifyLLMError(error);
    return new LLMServiceError(
      classified.message,
      classified.type,
      {
        isRetryable: classified.isRetryable,
        statusCode: classified.statusCode,
        originalError: error instanceof Error ? error : undefined,
      }
    );
  }

  /**
   * Get a user-friendly fallback message for an error type
   */
  private getDefaultFallbackMessage(error: LLMServiceError): string {
    switch (error.errorType) {
      case 'CONNECTION_ERROR':
        return 'I apologize, but I\'m currently unable to connect to the AI service. ' +
          'Please try again in a few moments.';
      case 'TIMEOUT_ERROR':
        return 'I apologize, but the request took too long to process. ' +
          'The service may be experiencing high load. Please try again.';
      case 'RATE_LIMIT_ERROR':
        return 'I apologize, but too many requests have been made. ' +
          'Please wait a moment before trying again.';
      case 'CONTEXT_LENGTH_ERROR':
        return 'I apologize, but the conversation has become too long to process. ' +
          'Please try with a shorter question.';
      case 'MODEL_ERROR':
        return 'I apologize, but there\'s a configuration issue with the AI model. ' +
          'Please contact support.';
      case 'SERVICE_UNAVAILABLE':
        return 'I apologize, but the AI service is temporarily unavailable. ' +
          'Please try again in a few minutes.';
      default:
        return 'I apologize, but an unexpected error occurred. ' +
          'Please try again or contact support if the issue persists.';
    }
  }

  /**
   * Get the configured model name
   */
  get model(): string {
    return this.config.model;
  }

  /**
   * Get the underlying LlamaIndex OpenAI client
   */
  get llamaindexClient(): OpenAI {
    return this.client;
  }

  /**
   * Check if the service is likely available (quick check)
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.healthy;
    } catch {
      return false;
    }
  }
}

/**
 * Create a Qwen3LLM instance with environment configuration
 */
export function createLLM(config: Partial<Qwen3LLMConfig> = {}): Qwen3LLM {
  return new Qwen3LLM({
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
    ...config,
  });
}
