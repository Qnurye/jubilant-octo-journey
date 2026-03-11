# Quickstart: Teacher Dashboard (008)

## Prerequisites

- Databases running: `docker compose -f infrastructure/docker-compose.yml up -d`
- Some query data in `rag_queries` + `retrieval_metrics` tables (use student Q&A to generate)
- Some concepts in Neo4j (use ETL admin to ingest documents)

## Development

```bash
# Install recharts for chart visualizations
cd apps/web && bun add recharts

# Start development
bun dev
# Web: http://localhost:3000 | API: http://localhost:8080

# Teacher dashboard will be at:
# http://localhost:3000/teacher
```

## Implementation Order

1. **API endpoints** (`apps/api/src/routes/teacher.ts`):
   - `GET /api/teacher/summary` — summary metrics
   - `GET /api/teacher/hotspots` — misconception data
   - `GET /api/teacher/coverage` — coverage heatmap data
   - `GET /api/teacher/trends` — time-series data
   - `GET /api/teacher/topics/:conceptName` — concept detail

2. **Frontend hooks** (`apps/web/src/lib/teacher-api.ts`):
   - TanStack Query hooks matching each endpoint
   - Shared time range filter state

3. **Dashboard pages** (`apps/web/src/app/teacher/`):
   - `layout.tsx` — teacher navigation (Dashboard, Hotspots, Coverage, Trends)
   - `page.tsx` — summary cards + quick overview
   - `hotspots/page.tsx` — bubble chart + word cloud
   - `coverage/page.tsx` — heatmap grid
   - `trends/page.tsx` — time-series charts

4. **Shared components** (`apps/web/src/app/teacher/components/`):
   - `TimeRangeFilter` — preset buttons + date picker
   - `StatCard` — metric display card
   - `TopicDetailPanel` — concept drill-down sheet/dialog
   - `EmptyState` — insufficient data message
   - `BubbleChart`, `CoverageHeatmap`, `TrendChart` — visualization wrappers

## Key Patterns

- Follow existing admin route patterns in `apps/api/src/routes/admin.ts`
- Follow existing TanStack Query patterns in `apps/web/src/lib/admin-api.ts`
- Follow existing page layout patterns in `apps/web/src/app/admin/`
- Use shadcn/ui Card, Badge, Tabs components consistently
- All PostgreSQL queries use Drizzle ORM with `sql` template literals for aggregation
- All Neo4j queries use session-based pattern with `.close()` in finally block

## Testing

- API endpoint tests: `apps/api/tests/unit/teacher.test.ts`
- Component tests as needed in `apps/web/` (P1 quality gate: component-level tests)
