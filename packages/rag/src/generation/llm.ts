/**
 * Qwen3 LLM Client
 *
 * OpenAI-compatible LLM client for Qwen3-32B model.
 * Supports both streaming and non-streaming responses.
 *
 * @module @jubilant/rag/generation/llm
 */

import { OpenAI } from '@llamaindex/openai';

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
 */
export class Qwen3LLM {
  private config: Qwen3LLMConfig;
  private client: OpenAI;

  constructor(config: Partial<Qwen3LLMConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Qwen3LLMConfig;

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
   * Generate a complete response (non-streaming)
   */
  async complete(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat({
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    return response.message.content as string;
  }

  /**
   * Generate a streaming response
   */
  async *stream(messages: ChatMessage[]): AsyncGenerator<LLMStreamChunk> {
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
  }

  /**
   * Check if the LLM service is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; message?: string }> {
    const start = Date.now();

    try {
      // Simple completion test
      await this.complete([
        { role: 'user', content: 'Say "ok"' },
      ]);
      return {
        healthy: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
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
