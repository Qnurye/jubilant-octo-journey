# Data Model: Teacher Dashboard (008)

No new database tables are introduced. All analytics are computed from existing tables via aggregation queries.

## Source Tables (existing)

### PostgreSQL

| Table | Key Fields for Analytics |
|-------|------------------------|
| `rag_queries` | `id`, `timestamp`, `conversation_id`, `execution_time_ms`, `milvus_hits`, `neo4j_hits`, `strategy_used` |
| `retrieval_metrics` | `query_id`, `vector_top_score`, `graph_result_count`, `concepts_found`, `rerank_top_score`, `confidence_threshold_met`, `citation_count` |
| `feedback_events` | `query_id`, `rating`, `comment`, `created_at` |

### Neo4j

| Node/Relationship | Key Properties |
|-------------------|---------------|
| `(:Concept)` | `name` |
| `(:Chunk)-[:DISCUSSES]->(:Concept)` | — |
| `(:Concept)-[r]->(:Concept)` | `type(r)` (PREREQUISITE_OF, COMPARED_WITH, etc.) |

## API Response Shapes (computed, not stored)

### DashboardSummary

```typescript
interface DashboardSummary {
  totalQueries: number;
  periodQueries: number;       // within selected time range
  avgConfidence: number;       // average rerank_top_score where confidence_threshold_met
  lowConfidenceCount: number;  // count where confidence_threshold_met = false
  avgResponseTimeMs: number;
  topTopics: Array<{ name: string; count: number }>;  // top 5
  feedbackSummary: {
    totalRatings: number;
    avgRating: number;
  };
}
```

### TopicAggregate (Misconception Hotspots)

```typescript
interface TopicAggregate {
  conceptName: string;
  queryCount: number;
  avgConfidence: number;
  chunkCount: number;          // from Neo4j: chunks discussing this concept
  relatedConcepts: string[];   // from Neo4j: connected concepts
}

interface HotspotsResponse {
  topics: TopicAggregate[];
  totalQueries: number;
  dateRange: { from: string; to: string };
  belowThreshold: boolean;     // true if <5 data points
}
```

### CoverageCell (Knowledge Coverage Heatmap)

```typescript
interface CoverageCell {
  conceptName: string;
  chunkCount: number;          // knowledge base depth
  queryCount: number;          // how often queried
  avgConfidence: number;       // average answer confidence
  coverageScore: number;       // computed: normalized 0-1
  gapIndicator: 'well-covered' | 'low-coverage' | 'no-data';
}

interface CoverageResponse {
  cells: CoverageCell[];
  totalConcepts: number;
  totalChunks: number;
  dateRange: { from: string; to: string };
}
```

### TrendDataPoint (Question Trends)

```typescript
interface TrendDataPoint {
  bucket: string;              // ISO date string (day or week start)
  queryCount: number;
  avgConfidence: number;
  topTopics: Array<{ name: string; count: number }>;
}

interface TrendsResponse {
  dataPoints: TrendDataPoint[];
  granularity: 'day' | 'week';
  dateRange: { from: string; to: string };
  comparisonPeriod?: TrendDataPoint[];  // for period-over-period
}
```

### TopicDetail (Concept Drill-Down)

```typescript
interface TopicDetail {
  conceptName: string;
  queryCount: number;
  avgConfidence: number;
  chunkCount: number;
  relatedConcepts: Array<{
    name: string;
    relationship: string;      // e.g., "PREREQUISITE_OF"
  }>;
  trendOverTime: TrendDataPoint[];
  feedbackAvgRating: number | null;
}
```

## Aggregation Queries (key patterns)

### Topic frequency (PostgreSQL + Neo4j join)

1. Neo4j: `MATCH (c:Concept)<-[:DISCUSSES]-(ch:Chunk) RETURN c.name, count(ch) AS chunkCount`
2. PostgreSQL: Aggregate `retrieval_metrics` by time range, group by concept (via Neo4j lookup)
3. Join in application layer: merge concept names with query counts

### Time-series bucketing (PostgreSQL)

```sql
SELECT
  date_trunc('day', rq.timestamp) AS bucket,
  count(*) AS query_count,
  avg(rm.rerank_top_score) AS avg_confidence
FROM rag_queries rq
JOIN retrieval_metrics rm ON rm.query_id = rq.id
WHERE rq.timestamp BETWEEN $from AND $to
GROUP BY bucket
ORDER BY bucket
```

### Coverage scoring (computed)

```
coverageScore = normalize(chunkCount * 0.6 + avgConfidence * 0.4)
gapIndicator:
  - 'well-covered': coverageScore >= 0.6
  - 'low-coverage': coverageScore < 0.6 AND queryCount > 0
  - 'no-data': queryCount = 0
```
