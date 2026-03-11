# API Contracts: Teacher Dashboard (008)

All endpoints under `/api/teacher/` prefix. All return JSON. All support time range filtering via query parameters.

## Common Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `from` | ISO8601 string | 30 days ago | Start of time range |
| `to` | ISO8601 string | now | End of time range |
| `preset` | `7d` \| `30d` \| `90d` | — | Shortcut (overrides from/to) |

## Endpoints

### GET /api/teacher/summary

Returns dashboard summary metrics.

**Response 200**:
```json
{
  "totalQueries": 1234,
  "periodQueries": 89,
  "avgConfidence": 0.72,
  "lowConfidenceCount": 15,
  "avgResponseTimeMs": 1850,
  "topTopics": [
    { "name": "Dynamic Programming", "count": 45 },
    { "name": "Graph Theory", "count": 38 }
  ],
  "feedbackSummary": {
    "totalRatings": 56,
    "avgRating": 3.8
  }
}
```

---

### GET /api/teacher/hotspots

Returns misconception hotspot data for visualization.

**Additional Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 30 | Max topics to return |

**Response 200**:
```json
{
  "topics": [
    {
      "conceptName": "Dynamic Programming",
      "queryCount": 45,
      "avgConfidence": 0.65,
      "chunkCount": 12,
      "relatedConcepts": ["Memoization", "Recursion"]
    }
  ],
  "totalQueries": 200,
  "dateRange": { "from": "2026-02-11T00:00:00Z", "to": "2026-03-11T00:00:00Z" },
  "belowThreshold": false
}
```

**Response 200 (insufficient data)**:
```json
{
  "topics": [],
  "totalQueries": 3,
  "dateRange": { "from": "...", "to": "..." },
  "belowThreshold": true
}
```

---

### GET /api/teacher/coverage

Returns knowledge coverage heatmap data.

**Response 200**:
```json
{
  "cells": [
    {
      "conceptName": "Binary Search",
      "chunkCount": 8,
      "queryCount": 22,
      "avgConfidence": 0.85,
      "coverageScore": 0.78,
      "gapIndicator": "well-covered"
    },
    {
      "conceptName": "Network Flow",
      "chunkCount": 1,
      "queryCount": 15,
      "avgConfidence": 0.42,
      "coverageScore": 0.25,
      "gapIndicator": "low-coverage"
    }
  ],
  "totalConcepts": 50,
  "totalChunks": 320,
  "dateRange": { "from": "...", "to": "..." }
}
```

---

### GET /api/teacher/trends

Returns time-series trend data.

**Additional Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `granularity` | `day` \| `week` | `day` | Time bucket size |
| `topic` | string | — | Filter to specific concept |
| `compareTo` | ISO8601 string | — | Start of comparison period (same duration) |

**Response 200**:
```json
{
  "dataPoints": [
    {
      "bucket": "2026-03-01",
      "queryCount": 12,
      "avgConfidence": 0.71,
      "topTopics": [
        { "name": "Dynamic Programming", "count": 5 }
      ]
    }
  ],
  "granularity": "day",
  "dateRange": { "from": "...", "to": "..." },
  "comparisonPeriod": null
}
```

---

### GET /api/teacher/topics/:conceptName

Returns detailed analytics for a specific concept.

**Response 200**:
```json
{
  "conceptName": "Dynamic Programming",
  "queryCount": 45,
  "avgConfidence": 0.65,
  "chunkCount": 12,
  "relatedConcepts": [
    { "name": "Memoization", "relationship": "PREREQUISITE_OF" },
    { "name": "Greedy Algorithm", "relationship": "COMPARED_WITH" }
  ],
  "trendOverTime": [
    { "bucket": "2026-03-01", "queryCount": 5, "avgConfidence": 0.62, "topTopics": [] }
  ],
  "feedbackAvgRating": 3.5
}
```

**Response 404**:
```json
{ "error": "Concept not found" }
```

---

## Privacy Invariants

- No endpoint returns individual query text, student identifiers, or conversation content
- All data is aggregated across queries; minimum 5 data points before rendering (enforced client-side via `belowThreshold` flag)
- `topTopics` arrays are capped at configurable limits to prevent information leakage through very long lists
