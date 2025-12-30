/**
 * Retrieval Metrics Collection
 *
 * Provides detailed timing instrumentation and statistics collection
 * for the hybrid retrieval pipeline (vector search, graph traversal,
 * fusion, and reranking).
 *
 * @module @jubilant/rag/retrieval/metrics
 */

/**
 * Timing metrics for individual pipeline stages
 */
export interface TimingMetrics {
  /** Embedding generation time in ms */
  embeddingMs: number;
  /** Vector search time in ms */
  vectorSearchMs: number;
  /** Graph traversal time in ms */
  graphTraversalMs: number;
  /** RRF fusion time in ms */
  fusionMs: number;
  /** Reranking time in ms */
  rerankMs: number;
  /** Total pipeline time in ms */
  totalMs: number;
}

/**
 * Vector retrieval statistics
 */
export interface VectorStats {
  /** Number of results from vector search */
  resultCount: number;
  /** Top similarity score */
  topScore: number | null;
  /** Average similarity score */
  avgScore: number | null;
  /** Minimum similarity score */
  minScore: number | null;
  /** Score standard deviation */
  scoreStdDev: number | null;
}

/**
 * Graph retrieval statistics
 */
export interface GraphStats {
  /** Number of results from graph traversal */
  resultCount: number;
  /** Maximum traversal depth reached */
  maxDepth: number;
  /** Number of distinct concepts found */
  conceptsFound: number;
  /** Number of relationship types traversed */
  relationshipTypes: number;
}

/**
 * Fusion statistics
 */
export interface FusionStats {
  /** Total unique results after fusion */
  totalResults: number;
  /** Results found by both retrievers */
  overlapCount: number;
  /** Results found only by vector search */
  vectorOnlyCount: number;
  /** Results found only by graph traversal */
  graphOnlyCount: number;
  /** Top RRF score */
  rrfTopScore: number | null;
  /** Average RRF score */
  rrfAvgScore: number | null;
}

/**
 * Reranking statistics
 */
export interface RerankStats {
  /** Number of candidates passed to reranker */
  candidateCount: number;
  /** Number of results after reranking */
  resultCount: number;
  /** Top rerank score */
  topScore: number | null;
  /** Average rerank score */
  avgScore: number | null;
  /** Number of results meeting confidence threshold */
  aboveThresholdCount: number;
  /** Whether the top result met the threshold */
  confidenceThresholdMet: boolean;
}

/**
 * Complete retrieval metrics for a query
 */
export interface DetailedRetrievalMetrics {
  /** Unique query identifier */
  queryId: string;
  /** Timestamp when metrics were collected */
  timestamp: Date;
  /** Timing metrics for all stages */
  timing: TimingMetrics;
  /** Vector retrieval statistics */
  vector: VectorStats;
  /** Graph retrieval statistics */
  graph: GraphStats;
  /** Fusion statistics */
  fusion: FusionStats;
  /** Reranking statistics */
  rerank: RerankStats;
  /** Final context token count */
  finalContextTokens: number;
  /** Number of citations generated */
  citationCount: number;
}

/**
 * Timer utility for tracking stage durations
 */
export class StageTimer {
  private stages: Map<string, { start: number; end?: number }> = new Map();
  private overallStart: number;

  constructor() {
    this.overallStart = Date.now();
  }

  /**
   * Start timing a stage
   */
  start(stageName: string): void {
    this.stages.set(stageName, { start: Date.now() });
  }

  /**
   * Stop timing a stage
   */
  stop(stageName: string): number {
    const stage = this.stages.get(stageName);
    if (!stage) {
      return 0;
    }
    stage.end = Date.now();
    return stage.end - stage.start;
  }

  /**
   * Get duration for a stage
   */
  getDuration(stageName: string): number {
    const stage = this.stages.get(stageName);
    if (!stage) return 0;
    if (stage.end) return stage.end - stage.start;
    return Date.now() - stage.start;
  }

  /**
   * Get total elapsed time
   */
  getTotalTime(): number {
    return Date.now() - this.overallStart;
  }

  /**
   * Get timing metrics object
   */
  getTimingMetrics(): TimingMetrics {
    return {
      embeddingMs: this.getDuration('embedding'),
      vectorSearchMs: this.getDuration('vectorSearch'),
      graphTraversalMs: this.getDuration('graphTraversal'),
      fusionMs: this.getDuration('fusion'),
      rerankMs: this.getDuration('rerank'),
      totalMs: this.getTotalTime(),
    };
  }
}

/**
 * Calculate statistics for an array of scores
 */
export function calculateScoreStats(
  scores: number[]
): { top: number | null; avg: number | null; min: number | null; stdDev: number | null } {
  if (scores.length === 0) {
    return { top: null, avg: null, min: null, stdDev: null };
  }

  const top = Math.max(...scores);
  const min = Math.min(...scores);
  const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  // Calculate standard deviation
  const squaredDiffs = scores.map((s) => Math.pow(s - avg, 2));
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  return { top, avg, min, stdDev };
}

/**
 * MetricsCollector - Collects and aggregates retrieval metrics
 */
export class MetricsCollector {
  private queryId: string;
  private timer: StageTimer;
  private vectorScores: number[] = [];
  private graphResultCount: number = 0;
  private graphMaxDepth: number = 0;
  private conceptsFound: number = 0;
  private fusedResults: Array<{
    hasVector: boolean;
    hasGraph: boolean;
    rrfScore: number;
  }> = [];
  private rerankScores: number[] = [];
  private confidenceThreshold: number = 0.6;
  private finalContextTokens: number = 0;
  private citationCount: number = 0;

  constructor(queryId: string, confidenceThreshold: number = 0.6) {
    this.queryId = queryId;
    this.timer = new StageTimer();
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Start timing a stage
   */
  startStage(stage: 'embedding' | 'vectorSearch' | 'graphTraversal' | 'fusion' | 'rerank'): void {
    this.timer.start(stage);
  }

  /**
   * Stop timing a stage
   */
  stopStage(stage: 'embedding' | 'vectorSearch' | 'graphTraversal' | 'fusion' | 'rerank'): number {
    return this.timer.stop(stage);
  }

  /**
   * Record vector search results
   */
  recordVectorResults(scores: number[]): void {
    this.vectorScores = scores;
  }

  /**
   * Record graph traversal results
   */
  recordGraphResults(resultCount: number, maxDepth: number, conceptsFound: number = 0): void {
    this.graphResultCount = resultCount;
    this.graphMaxDepth = maxDepth;
    this.conceptsFound = conceptsFound;
  }

  /**
   * Record fusion results
   */
  recordFusionResults(
    results: Array<{ vectorRank?: number; graphRank?: number; fusedScore: number }>
  ): void {
    this.fusedResults = results.map((r) => ({
      hasVector: r.vectorRank !== undefined,
      hasGraph: r.graphRank !== undefined,
      rrfScore: r.fusedScore,
    }));
  }

  /**
   * Record reranking results
   */
  recordRerankResults(scores: number[]): void {
    this.rerankScores = scores;
  }

  /**
   * Set final context metrics
   */
  setFinalContext(tokens: number, citations: number): void {
    this.finalContextTokens = tokens;
    this.citationCount = citations;
  }

  /**
   * Calculate vector statistics
   */
  private getVectorStats(): VectorStats {
    const stats = calculateScoreStats(this.vectorScores);
    return {
      resultCount: this.vectorScores.length,
      topScore: stats.top,
      avgScore: stats.avg,
      minScore: stats.min,
      scoreStdDev: stats.stdDev,
    };
  }

  /**
   * Calculate graph statistics
   */
  private getGraphStats(): GraphStats {
    return {
      resultCount: this.graphResultCount,
      maxDepth: this.graphMaxDepth,
      conceptsFound: this.conceptsFound,
      relationshipTypes: 0, // Would need to track during traversal
    };
  }

  /**
   * Calculate fusion statistics
   */
  private getFusionStats(): FusionStats {
    const overlapCount = this.fusedResults.filter((r) => r.hasVector && r.hasGraph).length;
    const vectorOnlyCount = this.fusedResults.filter((r) => r.hasVector && !r.hasGraph).length;
    const graphOnlyCount = this.fusedResults.filter((r) => !r.hasVector && r.hasGraph).length;

    const rrfScores = this.fusedResults.map((r) => r.rrfScore);
    const rrfStats = calculateScoreStats(rrfScores);

    return {
      totalResults: this.fusedResults.length,
      overlapCount,
      vectorOnlyCount,
      graphOnlyCount,
      rrfTopScore: rrfStats.top,
      rrfAvgScore: rrfStats.avg,
    };
  }

  /**
   * Calculate reranking statistics
   */
  private getRerankStats(): RerankStats {
    const stats = calculateScoreStats(this.rerankScores);
    const aboveThresholdCount = this.rerankScores.filter(
      (s) => s >= this.confidenceThreshold
    ).length;

    return {
      candidateCount: this.fusedResults.length,
      resultCount: this.rerankScores.length,
      topScore: stats.top,
      avgScore: stats.avg,
      aboveThresholdCount,
      confidenceThresholdMet:
        this.rerankScores.length > 0 && this.rerankScores[0] >= this.confidenceThreshold,
    };
  }

  /**
   * Get complete detailed metrics
   */
  getDetailedMetrics(): DetailedRetrievalMetrics {
    return {
      queryId: this.queryId,
      timestamp: new Date(),
      timing: this.timer.getTimingMetrics(),
      vector: this.getVectorStats(),
      graph: this.getGraphStats(),
      fusion: this.getFusionStats(),
      rerank: this.getRerankStats(),
      finalContextTokens: this.finalContextTokens,
      citationCount: this.citationCount,
    };
  }

  /**
   * Convert to database-compatible format
   */
  toDatabaseFormat(): {
    queryId: string;
    vectorSearchMs: number;
    vectorResultCount: number;
    vectorTopScore: number | null;
    vectorAvgScore: number | null;
    graphTraversalMs: number;
    graphResultCount: number;
    graphMaxDepth: number;
    conceptsFound: number;
    fusionMs: number;
    overlapCount: number;
    rrfTopScore: number | null;
    rerankMs: number;
    rerankTopScore: number | null;
    confidenceThresholdMet: boolean;
    finalContextTokens: number;
    citationCount: number;
  } {
    const metrics = this.getDetailedMetrics();
    return {
      queryId: metrics.queryId,
      vectorSearchMs: metrics.timing.vectorSearchMs,
      vectorResultCount: metrics.vector.resultCount,
      vectorTopScore: metrics.vector.topScore,
      vectorAvgScore: metrics.vector.avgScore,
      graphTraversalMs: metrics.timing.graphTraversalMs,
      graphResultCount: metrics.graph.resultCount,
      graphMaxDepth: metrics.graph.maxDepth,
      conceptsFound: metrics.graph.conceptsFound,
      fusionMs: metrics.timing.fusionMs,
      overlapCount: metrics.fusion.overlapCount,
      rrfTopScore: metrics.fusion.rrfTopScore,
      rerankMs: metrics.timing.rerankMs,
      rerankTopScore: metrics.rerank.topScore,
      confidenceThresholdMet: metrics.rerank.confidenceThresholdMet,
      finalContextTokens: metrics.finalContextTokens,
      citationCount: metrics.citationCount,
    };
  }
}

/**
 * Create a new MetricsCollector
 */
export function createMetricsCollector(
  queryId: string,
  confidenceThreshold?: number
): MetricsCollector {
  return new MetricsCollector(queryId, confidenceThreshold);
}
