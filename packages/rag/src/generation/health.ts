/**
 * LLM Health Check Utilities
 *
 * Provides health checking for all LLM services:
 * - Qwen3-32B (generation)
 * - Qwen3-Embedding-8B (embeddings)
 * - Qwen3-Reranker-4B (reranking)
 *
 * @module @jubilant/rag/generation/health
 */

import { Qwen3LLM, createLLM } from './llm';
import { Qwen3Embedding, createEmbedder } from './embedder';
import { Qwen3Reranker, createReranker } from '../reranking/reranker';
import type { ComponentHealth } from '../types';

/**
 * Combined health status for all LLM services
 */
export interface LLMHealthStatus {
  llm: ComponentHealth;
  embedding: ComponentHealth;
  reranker: ComponentHealth;
  allHealthy: boolean;
}

/**
 * LLM Health Checker
 *
 * Manages health checks for all LLM-related services
 */
export class LLMHealthChecker {
  private llm: Qwen3LLM;
  private embedder: Qwen3Embedding;
  private reranker: Qwen3Reranker;

  constructor(options?: {
    llm?: Qwen3LLM;
    embedder?: Qwen3Embedding;
    reranker?: Qwen3Reranker;
  }) {
    this.llm = options?.llm || createLLM();
    this.embedder = options?.embedder || createEmbedder();
    this.reranker = options?.reranker || createReranker();
  }

  /**
   * Check health of all LLM services
   */
  async checkAll(): Promise<LLMHealthStatus> {
    // Run all health checks in parallel
    const [llmHealth, embeddingHealth, rerankerHealth] = await Promise.all([
      this.checkLLM(),
      this.checkEmbedding(),
      this.checkReranker(),
    ]);

    return {
      llm: llmHealth,
      embedding: embeddingHealth,
      reranker: rerankerHealth,
      allHealthy: llmHealth.healthy && embeddingHealth.healthy && rerankerHealth.healthy,
    };
  }

  /**
   * Check LLM service health
   */
  async checkLLM(): Promise<ComponentHealth> {
    return this.llm.healthCheck();
  }

  /**
   * Check embedding service health
   */
  async checkEmbedding(): Promise<ComponentHealth> {
    return this.embedder.healthCheck();
  }

  /**
   * Check reranker service health
   */
  async checkReranker(): Promise<ComponentHealth> {
    return this.reranker.healthCheck();
  }

  /**
   * Quick liveness check (just verifies services are reachable)
   */
  async liveness(): Promise<boolean> {
    try {
      // Just check if the endpoints respond
      const checks = await Promise.allSettled([
        this.pingEndpoint(process.env.LLM_BASE_URL || 'http://localhost:8000/v1'),
        this.pingEndpoint(process.env.EMBEDDING_BASE_URL || 'http://localhost:8001/v1'),
        this.pingEndpoint(process.env.RERANKER_BASE_URL || 'http://localhost:8002/v1'),
      ]);

      // At least LLM must be reachable for liveness
      return checks[0].status === 'fulfilled';
    } catch {
      return false;
    }
  }

  /**
   * Readiness check (all services must be functional)
   */
  async readiness(): Promise<boolean> {
    const status = await this.checkAll();
    return status.allHealthy;
  }

  /**
   * Ping an endpoint to check if it's reachable
   */
  private async pingEndpoint(baseUrl: string): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a health checker with default configuration
 */
export function createHealthChecker(): LLMHealthChecker {
  return new LLMHealthChecker();
}

/**
 * Quick health check of all LLM services
 */
export async function checkLLMHealth(): Promise<LLMHealthStatus> {
  const checker = createHealthChecker();
  return checker.checkAll();
}
