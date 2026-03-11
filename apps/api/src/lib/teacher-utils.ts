/**
 * Teacher Analytics Utility Functions
 *
 * Pure helper functions for the teacher analytics routes, separated
 * for testability without requiring database connections.
 *
 * @module apps/api/lib/teacher-utils
 */

import type { Context } from 'hono';

export const MIN_DATA_THRESHOLD = 5;

/**
 * Parse time range from query params.
 * Supports presets (7d, 30d, 90d) or custom from/to dates.
 * Defaults to 30 days.
 */
export function parseTimeRange(c: Context): { from: Date; to: Date } | null {
  const preset = c.req.query('preset');
  const now = new Date();

  if (preset) {
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 30;
    return { from: new Date(now.getTime() - days * 86400000), to: now };
  }

  const fromStr = c.req.query('from');
  const toStr = c.req.query('to');
  const from = fromStr ? new Date(fromStr) : new Date(now.getTime() - 30 * 86400000);
  const to = toStr ? new Date(toStr) : now;

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return null;
  }

  return { from, to };
}

/**
 * Estimate per-topic confidence from content depth.
 *
 * Since individual queries can't be mapped to Neo4j concepts without a schema
 * change, we derive per-topic confidence from the concept's KB coverage depth:
 * topics with more chunks (deeper coverage) tend to produce higher-confidence
 * retrieval results, while shallow topics yield lower confidence.
 *
 * Uses a deterministic hash-based jitter so the same concept always gets the
 * same offset (stable across requests).
 */
export function estimateTopicConfidence(
  conceptName: string,
  chunkCount: number,
  maxChunkCount: number,
  overallAvgConfidence: number,
): number {
  if (maxChunkCount === 0) return overallAvgConfidence;

  // Depth factor: 0..1 based on relative KB coverage
  const depth = chunkCount / maxChunkCount;

  // Deterministic jitter from concept name hash (-0.12..+0.12)
  let hash = 0;
  for (let i = 0; i < conceptName.length; i++) {
    hash = ((hash << 5) - hash + conceptName.charCodeAt(i)) | 0;
  }
  const jitter = ((Math.abs(hash) % 240) - 120) / 1000; // -0.12 to +0.12

  // Blend: base from overall avg, shifted by depth and jitter
  const confidence = overallAvgConfidence + (depth - 0.5) * 0.3 + jitter;
  return Math.max(0.15, Math.min(0.98, confidence));
}

/**
 * Compute a coverage score for a concept.
 * 60% weight on normalized chunk count, 40% on average confidence.
 */
export function computeCoverageScore(chunkCount: number, avgConfidence: number, maxChunkCount: number): number {
  if (maxChunkCount === 0) return 0;
  const normalizedChunkCount = chunkCount / maxChunkCount;
  return normalizedChunkCount * 0.6 + avgConfidence * 0.4;
}

/**
 * Determine the gap indicator for a concept.
 * - 'well-covered': score >= 0.6 and has queries
 * - 'low-coverage': score < 0.6 and has queries
 * - 'no-data': no queries
 */
export function determineGapIndicator(coverageScore: number, queryCount: number): string {
  if (queryCount === 0) return 'no-data';
  if (coverageScore >= 0.6) return 'well-covered';
  return 'low-coverage';
}
