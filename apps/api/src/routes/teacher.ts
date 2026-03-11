/**
 * Teacher Analytics Routes
 *
 * Endpoints for teacher dashboard analytics:
 * - GET /api/teacher/summary - Aggregate overview metrics
 * - GET /api/teacher/hotspots - Topic frequency and confidence hotspots
 * - GET /api/teacher/coverage - Knowledge coverage heatmap data
 * - GET /api/teacher/trends - Time-series trend data
 * - GET /api/teacher/topics/:conceptName - Detailed per-topic analytics
 *
 * PRIVACY: All endpoints return ONLY aggregate data. No individual query text,
 * student identifiers, conversation IDs, session IDs, or conversation content
 * is ever returned.
 *
 * @module apps/api/routes/teacher
 */

import { Hono } from 'hono';
import { db, postgresSchema, sql, and } from '@jubilant/database';
import { parseTimeRange, computeCoverageScore, estimateTopicConfidence, determineGapIndicator, MIN_DATA_THRESHOLD } from '../lib/teacher-utils';

const teacher = new Hono();

// ============================================================================
// GET /summary
// ============================================================================

teacher.get('/summary', async (c) => {
  try {
    const range = parseTimeRange(c);
    if (!range) return c.json({ error: 'Invalid date format in from/to parameters' }, 400);
    const { from, to } = range;

    // Run independent queries in parallel
    const [totalResult, periodResult, confidenceResult, responseTimeResult, feedbackResult] = await Promise.all([
      // Total queries (all time)
      db.postgres
        .select({ count: sql<number>`count(*)::int` })
        .from(postgresSchema.ragQueries),

      // Period queries
      db.postgres
        .select({ count: sql<number>`count(*)::int` })
        .from(postgresSchema.ragQueries)
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${from}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${to}`,
          ),
        ),

      // Avg confidence in time range
      db.postgres
        .select({
          avgConfidence: sql<number>`avg(${postgresSchema.retrievalMetrics.rerankTopScore})`,
          lowConfidenceCount: sql<number>`count(*) FILTER (WHERE ${postgresSchema.retrievalMetrics.confidenceThresholdMet} = false)::int`,
        })
        .from(postgresSchema.retrievalMetrics)
        .innerJoin(
          postgresSchema.ragQueries,
          sql`${postgresSchema.retrievalMetrics.queryId} = ${postgresSchema.ragQueries.id}`,
        )
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${from}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${to}`,
          ),
        ),

      // Avg response time in time range
      db.postgres
        .select({ avgResponseTimeMs: sql<number>`avg(${postgresSchema.ragQueries.executionTimeMs})` })
        .from(postgresSchema.ragQueries)
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${from}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${to}`,
          ),
        ),

      // Feedback summary (filtered by time range via join)
      db.postgres
        .select({
          totalRatings: sql<number>`count(*)::int`,
          avgRating: sql<number>`avg(${postgresSchema.feedbackEvents.rating})`,
        })
        .from(postgresSchema.feedbackEvents)
        .innerJoin(
          postgresSchema.ragQueries,
          sql`${postgresSchema.feedbackEvents.queryId} = ${postgresSchema.ragQueries.id}`,
        )
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${from}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${to}`,
          ),
        ),
    ]);

    const totalQueries = totalResult[0]?.count ?? 0;
    const periodQueries = periodResult[0]?.count ?? 0;
    const avgConfidence = Number(confidenceResult[0]?.avgConfidence) || 0;
    const lowConfidenceCount = confidenceResult[0]?.lowConfidenceCount ?? 0;
    const avgResponseTimeMs = Number(responseTimeResult[0]?.avgResponseTimeMs) || 0;
    const feedbackSummary = {
      totalRatings: feedbackResult[0]?.totalRatings ?? 0,
      avgRating: Number(feedbackResult[0]?.avgRating) || 0,
    };

    // Top topics from Neo4j (chunks per concept — represents KB depth)
    let topTopics: Array<{ name: string; count: number }> = [];
    try {
      const session = db.neo4j.session();
      try {
        const result = await session.run(
          'MATCH (c:Concept)<-[:DISCUSSES]-(ch:Chunk) ' +
          'RETURN c.name AS name, count(ch) AS count ' +
          'ORDER BY count DESC LIMIT 5',
        );
        topTopics = result.records.map((record) => ({
          name: record.get('name') as string,
          count: record.get('count')?.toNumber?.() ?? 0,
        }));
      } finally {
        await session.close();
      }
    } catch (neo4jError) {
      console.warn('Neo4j top topics query failed (non-fatal):', neo4jError);
    }

    return c.json({
      totalQueries,
      periodQueries,
      avgConfidence: Number(avgConfidence) || 0,
      lowConfidenceCount,
      avgResponseTimeMs: Number(avgResponseTimeMs) || 0,
      topTopics,
      feedbackSummary,
      belowThreshold: periodQueries < MIN_DATA_THRESHOLD,
    });
  } catch (error) {
    console.error('Teacher summary error:', error);
    return c.json({ error: 'Failed to fetch summary' }, 500);
  }
});

// ============================================================================
// GET /hotspots
// ============================================================================

teacher.get('/hotspots', async (c) => {
  try {
    const range = parseTimeRange(c);
    if (!range) return c.json({ error: 'Invalid date format in from/to parameters' }, 400);
    const { from, to } = range;
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '30', 10) || 30, 1), 100);

    // Get total queries and avg confidence in range (parallel)
    const [totalResult, confidenceResult] = await Promise.all([
      db.postgres
        .select({ count: sql<number>`count(*)::int` })
        .from(postgresSchema.ragQueries)
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${from}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${to}`,
          ),
        ),
      db.postgres
        .select({
          avgConfidence: sql<number>`avg(${postgresSchema.retrievalMetrics.rerankTopScore})`,
        })
        .from(postgresSchema.retrievalMetrics)
        .innerJoin(
          postgresSchema.ragQueries,
          sql`${postgresSchema.retrievalMetrics.queryId} = ${postgresSchema.ragQueries.id}`,
        )
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${from}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${to}`,
          ),
        ),
    ]);

    const totalQueries = totalResult[0]?.count ?? 0;
    const overallAvgConfidence = Number(confidenceResult[0]?.avgConfidence) || 0;

    // Get concepts with chunk counts from Neo4j
    // Note: chunkCount represents KB depth per topic. queryCount and avgConfidence
    // are system-wide aggregates since we cannot map individual PG queries to
    // Neo4j concepts without a concept-per-query column (see research.md R4).
    let topics: Array<{
      conceptName: string;
      queryCount: number;
      avgConfidence: number;
      chunkCount: number;
      relatedConcepts: string[];
    }> = [];

    try {
      const session = db.neo4j.session();
      try {
        const result = await session.run(
          'MATCH (c:Concept)<-[:DISCUSSES]-(ch:Chunk) ' +
          'WITH c, count(ch) AS chunkCount ' +
          'ORDER BY chunkCount DESC ' +
          'LIMIT toInteger($limit) ' +
          'OPTIONAL MATCH (c)-[r]-(other:Concept) ' +
          'RETURN c.name AS conceptName, chunkCount, collect(DISTINCT other.name) AS relatedConcepts',
          { limit },
        );
        const rawTopics = result.records.map((record) => ({
          conceptName: record.get('conceptName') as string,
          chunkCount: record.get('chunkCount')?.toNumber?.() ?? 0,
          relatedConcepts: (record.get('relatedConcepts') as string[]).filter(Boolean),
        }));
        const maxChunkCount = rawTopics.length > 0 ? Math.max(...rawTopics.map((t) => t.chunkCount)) : 0;
        topics = rawTopics.map((t) => ({
          ...t,
          queryCount: totalQueries, // system-wide; per-topic not available without schema change
          avgConfidence: estimateTopicConfidence(t.conceptName, t.chunkCount, maxChunkCount, overallAvgConfidence),
        }));
      } finally {
        await session.close();
      }
    } catch (neo4jError) {
      console.warn('Neo4j hotspots query failed (non-fatal):', neo4jError);
    }

    return c.json({
      topics,
      totalQueries,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      belowThreshold: totalQueries < MIN_DATA_THRESHOLD,
    });
  } catch (error) {
    console.error('Teacher hotspots error:', error);
    return c.json({ error: 'Failed to fetch hotspots' }, 500);
  }
});

// ============================================================================
// GET /coverage
// ============================================================================

teacher.get('/coverage', async (c) => {
  try {
    const range = parseTimeRange(c);
    if (!range) return c.json({ error: 'Invalid date format in from/to parameters' }, 400);
    const { from, to } = range;

    // Get total queries and avg confidence in time range (parallel)
    const [queryResult, confidenceResult] = await Promise.all([
      db.postgres
        .select({ count: sql<number>`count(*)::int` })
        .from(postgresSchema.ragQueries)
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${from}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${to}`,
          ),
        ),
      db.postgres
        .select({
          avgConfidence: sql<number>`avg(${postgresSchema.retrievalMetrics.rerankTopScore})`,
        })
        .from(postgresSchema.retrievalMetrics)
        .innerJoin(
          postgresSchema.ragQueries,
          sql`${postgresSchema.retrievalMetrics.queryId} = ${postgresSchema.ragQueries.id}`,
        )
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${from}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${to}`,
          ),
        ),
    ]);

    const totalQueriesInRange = queryResult[0]?.count ?? 0;
    const overallAvgConfidence = Number(confidenceResult[0]?.avgConfidence) || 0;

    // Get all concepts with chunk counts from Neo4j
    let concepts: Array<{ conceptName: string; chunkCount: number }> = [];
    let totalChunks = 0;

    try {
      const session = db.neo4j.session();
      try {
        const result = await session.run(
          'MATCH (c:Concept)<-[:DISCUSSES]-(ch:Chunk) ' +
          'RETURN c.name AS conceptName, count(ch) AS chunkCount ' +
          'ORDER BY chunkCount DESC',
        );
        concepts = result.records.map((record) => ({
          conceptName: record.get('conceptName') as string,
          chunkCount: record.get('chunkCount')?.toNumber?.() ?? 0,
        }));
        totalChunks = concepts.reduce((sum, c) => sum + c.chunkCount, 0);
      } finally {
        await session.close();
      }
    } catch (neo4jError) {
      console.warn('Neo4j coverage query failed (non-fatal):', neo4jError);
    }

    const maxChunkCount = concepts.length > 0 ? Math.max(...concepts.map((c) => c.chunkCount)) : 0;

    const cells = concepts.map((concept) => {
      const topicConfidence = estimateTopicConfidence(concept.conceptName, concept.chunkCount, maxChunkCount, overallAvgConfidence);
      const coverageScore = computeCoverageScore(concept.chunkCount, topicConfidence, maxChunkCount);
      const gapIndicator = determineGapIndicator(coverageScore, totalQueriesInRange);

      return {
        conceptName: concept.conceptName,
        chunkCount: concept.chunkCount,
        queryCount: totalQueriesInRange,
        avgConfidence: topicConfidence,
        coverageScore: Math.round(coverageScore * 1000) / 1000,
        gapIndicator,
      };
    });

    return c.json({
      cells,
      totalConcepts: concepts.length,
      totalChunks,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      belowThreshold: totalQueriesInRange < MIN_DATA_THRESHOLD,
    });
  } catch (error) {
    console.error('Teacher coverage error:', error);
    return c.json({ error: 'Failed to fetch coverage' }, 500);
  }
});

// ============================================================================
// GET /trends
// ============================================================================

teacher.get('/trends', async (c) => {
  try {
    const range = parseTimeRange(c);
    if (!range) return c.json({ error: 'Invalid date format in from/to parameters' }, 400);
    const { from, to } = range;
    const granularity = c.req.query('granularity') === 'week' ? 'week' : 'day';

    // Use sql.raw() for date_trunc interval literal to avoid parameterization issues
    const truncFn = granularity === 'week'
      ? sql`date_trunc('week', ${postgresSchema.ragQueries.timestamp})`
      : sql`date_trunc('day', ${postgresSchema.ragQueries.timestamp})`;

    const dataPoints = await db.postgres.execute(
      sql`SELECT
        ${truncFn} AS bucket,
        count(*)::int AS query_count,
        avg(${postgresSchema.retrievalMetrics.rerankTopScore}) AS avg_confidence
      FROM ${postgresSchema.ragQueries}
      LEFT JOIN ${postgresSchema.retrievalMetrics}
        ON ${postgresSchema.retrievalMetrics.queryId} = ${postgresSchema.ragQueries.id}
      WHERE ${postgresSchema.ragQueries.timestamp} >= ${from}
        AND ${postgresSchema.ragQueries.timestamp} <= ${to}
      GROUP BY bucket
      ORDER BY bucket`,
    );

    const formattedPoints = (dataPoints as unknown as Array<{ bucket: string; query_count: number; avg_confidence: number | null }>).map((row) => ({
      bucket: row.bucket,
      queryCount: row.query_count,
      avgConfidence: Number(row.avg_confidence) || 0,
      topTopics: [] as Array<{ name: string; count: number }>,
    }));

    // Comparison period
    let comparisonPeriod = null;
    const compareTo = c.req.query('compareTo');
    if (compareTo) {
      const compareFrom = new Date(compareTo);
      if (!isNaN(compareFrom.getTime())) {
        const duration = to.getTime() - from.getTime();
        const compareEnd = new Date(compareFrom.getTime() + duration);

        const comparisonPoints = await db.postgres.execute(
          sql`SELECT
            ${truncFn} AS bucket,
            count(*)::int AS query_count,
            avg(${postgresSchema.retrievalMetrics.rerankTopScore}) AS avg_confidence
          FROM ${postgresSchema.ragQueries}
          LEFT JOIN ${postgresSchema.retrievalMetrics}
            ON ${postgresSchema.retrievalMetrics.queryId} = ${postgresSchema.ragQueries.id}
          WHERE ${postgresSchema.ragQueries.timestamp} >= ${compareFrom}
            AND ${postgresSchema.ragQueries.timestamp} <= ${compareEnd}
          GROUP BY bucket
          ORDER BY bucket`,
        );

        comparisonPeriod = (comparisonPoints as unknown as Array<{ bucket: string; query_count: number; avg_confidence: number | null }>).map((row) => ({
          bucket: row.bucket,
          queryCount: row.query_count,
          avgConfidence: Number(row.avg_confidence) || 0,
          topTopics: [] as Array<{ name: string; count: number }>,
        }));
      }
    }

    return c.json({
      dataPoints: formattedPoints,
      granularity,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
      comparisonPeriod,
    });
  } catch (error) {
    console.error('Teacher trends error:', error);
    return c.json({ error: 'Failed to fetch trends' }, 500);
  }
});

// ============================================================================
// GET /topics/:conceptName
// ============================================================================

teacher.get('/topics/:conceptName', async (c) => {
  try {
    const conceptName = decodeURIComponent(c.req.param('conceptName'));

    // Query Neo4j for concept details
    let conceptData: {
      conceptName: string;
      chunkCount: number;
      relatedConcepts: Array<{ name: string; relationship: string }>;
    } | null = null;

    try {
      const session = db.neo4j.session();
      try {
        const result = await session.run(
          'MATCH (c:Concept {name: $name})<-[:DISCUSSES]-(ch:Chunk) ' +
          'WITH c, count(ch) AS chunkCount ' +
          'OPTIONAL MATCH (c)-[r]-(other:Concept) ' +
          'RETURN c.name AS conceptName, chunkCount, ' +
          'collect(DISTINCT {name: other.name, relationship: type(r)}) AS relatedConcepts',
          { name: conceptName },
        );

        if (result.records.length === 0) {
          return c.json({ error: 'Concept not found' }, 404);
        }

        const record = result.records[0];
        conceptData = {
          conceptName: record.get('conceptName') as string,
          chunkCount: record.get('chunkCount')?.toNumber?.() ?? 0,
          relatedConcepts: (record.get('relatedConcepts') as Array<{ name: string; relationship: string }>)
            .filter((rc) => rc.name != null),
        };
      } finally {
        await session.close();
      }
    } catch (neo4jError) {
      console.warn('Neo4j topic detail query failed:', neo4jError);
      return c.json({ error: 'Concept not found' }, 404);
    }

    if (!conceptData) {
      return c.json({ error: 'Concept not found' }, 404);
    }

    // All PG queries in parallel — these are system-wide aggregates
    // (per-concept filtering not possible without a concept-per-query column in PG)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const now = new Date();

    const [trendPoints, queryCountResult, confidenceResult, feedbackResult] = await Promise.all([
      // Trend over time (daily buckets, last 30 days) — system-wide
      db.postgres.execute(
        sql`SELECT
          date_trunc('day', ${postgresSchema.ragQueries.timestamp}) AS bucket,
          count(*)::int AS query_count,
          avg(${postgresSchema.retrievalMetrics.rerankTopScore}) AS avg_confidence
        FROM ${postgresSchema.ragQueries}
        LEFT JOIN ${postgresSchema.retrievalMetrics}
          ON ${postgresSchema.retrievalMetrics.queryId} = ${postgresSchema.ragQueries.id}
        WHERE ${postgresSchema.ragQueries.timestamp} >= ${thirtyDaysAgo}
          AND ${postgresSchema.ragQueries.timestamp} <= ${now}
        GROUP BY bucket
        ORDER BY bucket`,
      ),

      // Total query count (last 30 days)
      db.postgres
        .select({ count: sql<number>`count(*)::int` })
        .from(postgresSchema.ragQueries)
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${thirtyDaysAgo}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${now}`,
          ),
        ),

      // Avg confidence (last 30 days)
      db.postgres
        .select({
          avgConfidence: sql<number>`avg(${postgresSchema.retrievalMetrics.rerankTopScore})`,
        })
        .from(postgresSchema.retrievalMetrics)
        .innerJoin(
          postgresSchema.ragQueries,
          sql`${postgresSchema.retrievalMetrics.queryId} = ${postgresSchema.ragQueries.id}`,
        )
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${thirtyDaysAgo}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${now}`,
          ),
        ),

      // Feedback avg rating (filtered by time range)
      db.postgres
        .select({
          avgRating: sql<number>`avg(${postgresSchema.feedbackEvents.rating})`,
        })
        .from(postgresSchema.feedbackEvents)
        .innerJoin(
          postgresSchema.ragQueries,
          sql`${postgresSchema.feedbackEvents.queryId} = ${postgresSchema.ragQueries.id}`,
        )
        .where(
          and(
            sql`${postgresSchema.ragQueries.timestamp} >= ${thirtyDaysAgo}`,
            sql`${postgresSchema.ragQueries.timestamp} <= ${now}`,
          ),
        ),
    ]);

    const trendOverTime = (trendPoints as unknown as Array<{ bucket: string; query_count: number; avg_confidence: number | null }>).map((row) => ({
      bucket: row.bucket,
      queryCount: row.query_count,
      avgConfidence: Number(row.avg_confidence) || 0,
      topTopics: [] as Array<{ name: string; count: number }>,
    }));

    const queryCount = queryCountResult[0]?.count ?? 0;
    const avgConfidence = Number(confidenceResult[0]?.avgConfidence) || 0;
    const feedbackAvgRating = feedbackResult[0]?.avgRating != null ? Number(feedbackResult[0].avgRating) : null;

    return c.json({
      conceptName: conceptData.conceptName,
      queryCount,
      avgConfidence,
      chunkCount: conceptData.chunkCount,
      relatedConcepts: conceptData.relatedConcepts,
      trendOverTime,
      feedbackAvgRating,
    });
  } catch (error) {
    console.error('Teacher topic detail error:', error);
    return c.json({ error: 'Failed to fetch topic details' }, 500);
  }
});

export default teacher;
