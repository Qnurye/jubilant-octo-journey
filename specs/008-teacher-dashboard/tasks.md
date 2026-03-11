# Tasks: Teacher Dashboard (008)

**Branch**: `008-teacher-dashboard`
**Plan**: [plan.md](./plan.md)
**Contracts**: [contracts/api.md](./contracts/api.md)

## Task Dependency Graph

```
T1 (API: teacher routes) ──┬── T3 (Frontend: hooks + types)
T2 (Install recharts)  ────┤
                            ├── T4 (Teacher layout + overview page)
                            ├── T5 (Hotspots page + bubble chart)
                            ├── T6 (Coverage page + heatmap)
                            ├── T7 (Trends page + time-series chart)
                            └── T8 (Topic detail panel)
T9 (API tests) ── depends on T1
T10 (Privacy audit) ── depends on T1, T4-T8
```

---

## T1: API — Teacher Analytics Endpoints

**Priority**: P0 | **Estimate**: Medium | **Status**: complete
**File**: `apps/api/src/routes/teacher.ts`

Create all 5 teacher analytics API endpoints following the contracts in `contracts/api.md`. Mount at `/api/teacher` in the main app.

### Subtasks

- [x] T1.1: Create `apps/api/src/routes/teacher.ts` with Hono router
- [x] T1.2: Implement `GET /api/teacher/summary` — aggregate from `rag_queries` + `retrieval_metrics` + `feedback_events`
- [x] T1.3: Implement `GET /api/teacher/hotspots` — PostgreSQL aggregation + Neo4j concept lookup
- [x] T1.4: Implement `GET /api/teacher/coverage` — merge Neo4j concept/chunk counts with query confidence
- [x] T1.5: Implement `GET /api/teacher/trends` — `date_trunc()` bucketed aggregation with optional topic filter
- [x] T1.6: Implement `GET /api/teacher/topics/:conceptName` — single concept detail with trend + related concepts
- [x] T1.7: Add shared time range query parameter parsing (from/to/preset) as middleware or helper
- [x] T1.8: Mount teacher routes in `apps/api/src/index.ts`

### Acceptance Criteria
- All endpoints return JSON matching the contract shapes
- Time range filtering works with presets (7d, 30d, 90d) and custom ranges
- Empty/insufficient data returns `belowThreshold: true` with empty arrays
- No individual query text or student identifiers in any response

### Key References
- Pattern: `apps/api/src/routes/admin.ts` (Drizzle + Neo4j query patterns)
- Schema: `packages/database/src/schema/postgres.ts`
- Contracts: `specs/008-teacher-dashboard/contracts/api.md`

---

## T2: Frontend — Install Recharts

**Priority**: P0 | **Estimate**: Small | **Status**: complete
**Command**: `cd apps/web && bun add recharts`

### Acceptance Criteria
- `recharts` appears in `apps/web/package.json` dependencies
- Import works: `import { LineChart, ScatterChart, Treemap } from 'recharts'`

---

## T3: Frontend — Teacher API Hooks & Types

**Priority**: P0 | **Estimate**: Small | **Status**: complete
**File**: `apps/web/src/lib/teacher-api.ts`

Create TanStack Query hooks for all teacher endpoints, plus TypeScript types matching the API contract shapes.

### Subtasks

- [x] T3.1: Define TypeScript interfaces (DashboardSummary, TopicAggregate, CoverageCell, TrendDataPoint, TopicDetail, etc.)
- [x] T3.2: Create `teacherFetch<T>()` helper (mirrors `adminFetch` pattern)
- [x] T3.3: Create hooks: `useSummary()`, `useHotspots()`, `useCoverage()`, `useTrends()`, `useTopicDetail()`
- [x] T3.4: Add shared time range state type and parameter builder

### Acceptance Criteria
- All hooks return typed data matching API contracts
- Hooks support time range parameters
- `staleTime` set appropriately (30s for summary, 60s for analytics)

### Key References
- Pattern: `apps/web/src/lib/admin-api.ts`

---

## T4: Frontend — Teacher Layout + Overview Page

**Priority**: P0 | **Estimate**: Medium | **Status**: complete
**Files**: `apps/web/src/app/teacher/layout.tsx`, `apps/web/src/app/teacher/page.tsx`, `apps/web/src/app/teacher/components/StatCard.tsx`, `apps/web/src/app/teacher/components/TimeRangeFilter.tsx`, `apps/web/src/app/teacher/components/EmptyState.tsx`

### Subtasks

- [x] T4.1: Create teacher layout with navigation tabs (Overview, Hotspots, Coverage, Trends)
- [x] T4.2: Create `TimeRangeFilter` component with preset buttons (7d/30d/90d) + custom date picker
- [x] T4.3: Create `StatCard` component for metric display
- [x] T4.4: Create `EmptyState` component for insufficient data
- [x] T4.5: Create overview page with summary cards (total queries, weekly queries, avg confidence, low-confidence count, top topics)
- [x] T4.6: Handle empty/no-data state on overview page

### Acceptance Criteria
- Layout matches admin layout pattern (header + nav tabs + content area)
- Navigation works between all 4 teacher pages
- Overview page shows summary metrics from `useSummary()` hook
- Time range filter is visible and functional
- Empty state shown when no query data exists

### Key References
- Pattern: `apps/web/src/app/admin/layout.tsx`
- Pattern: `apps/web/src/app/admin/health/page.tsx` (StatCard grid)

---

## T5: Frontend — Misconception Hotspots Page

**Priority**: P0 | **Estimate**: Medium | **Status**: complete
**Files**: `apps/web/src/app/teacher/hotspots/page.tsx`, `apps/web/src/app/teacher/components/BubbleChart.tsx`

### Subtasks

- [x] T5.1: Create `BubbleChart` component using Recharts ScatterChart with variable-size bubbles
- [x] T5.2: Create hotspots page with bubble chart + topic list sidebar
- [x] T5.3: Wire time range filter to `useHotspots()` hook
- [x] T5.4: Add click handler on bubbles to open topic detail panel
- [x] T5.5: Handle `belowThreshold` state with EmptyState component

### Acceptance Criteria
- Bubble size proportional to query frequency
- Color indicates confidence level (green = high, red = low)
- Clicking a bubble shows topic detail (T8)
- Time range filter updates the visualization
- Insufficient data shows empty state

---

## T6: Frontend — Knowledge Coverage Heatmap Page

**Priority**: P0 | **Estimate**: Medium | **Status**: complete
**Files**: `apps/web/src/app/teacher/coverage/page.tsx`, `apps/web/src/app/teacher/components/CoverageHeatmap.tsx`

### Subtasks

- [x] T6.1: Create `CoverageHeatmap` component using CSS grid with color-coded cells
- [x] T6.2: Create coverage page with heatmap + legend + summary stats
- [x] T6.3: Color cells by `gapIndicator`: green (well-covered), amber (low-coverage), gray (no-data)
- [x] T6.4: Add hover tooltip showing concept name, chunk count, query count, confidence
- [x] T6.5: Add click handler to open topic detail panel
- [x] T6.6: Wire time range filter

### Acceptance Criteria
- Heatmap shows all concepts from knowledge graph
- Color coding clearly distinguishes coverage levels
- Hovering shows detailed metrics
- Gap topics are visually prominent
- Time range filter works

---

## T7: Frontend — Question Trends Page

**Priority**: P1 | **Estimate**: Medium | **Status**: complete
**Files**: `apps/web/src/app/teacher/trends/page.tsx`, `apps/web/src/app/teacher/components/TrendChart.tsx`

### Subtasks

- [x] T7.1: Create `TrendChart` component using Recharts LineChart/AreaChart
- [x] T7.2: Create trends page with chart + topic filter dropdown + granularity toggle (day/week)
- [x] T7.3: Implement topic filter (dropdown of concept names from hotspots data)
- [x] T7.4: Implement period comparison mode (overlay two periods)
- [x] T7.5: Handle insufficient data (< 1 week) with EmptyState
- [x] T7.6: Wire time range filter

### Acceptance Criteria
- Line chart shows query volume over time
- Topic filter narrows to specific concept
- Granularity toggle switches between day/week buckets
- Comparison mode overlays two time periods
- Insufficient data shows helpful message

---

## T8: Frontend — Topic Detail Panel

**Priority**: P1 | **Estimate**: Small | **Status**: complete
**File**: `apps/web/src/app/teacher/components/TopicDetailPanel.tsx`

### Subtasks

- [x] T8.1: Create slide-over panel (shadcn/ui Sheet or Dialog) for concept detail
- [x] T8.2: Display: concept name, query count, avg confidence, chunk count, related concepts, mini trend chart
- [x] T8.3: Wire to `useTopicDetail()` hook
- [x] T8.4: Add loading skeleton while data fetches

### Acceptance Criteria
- Panel opens when clicking a concept in hotspots or coverage views
- Shows all detail fields from TopicDetail contract
- Related concepts shown with relationship type labels
- Mini trend chart shows query volume for this concept over time
- No individual student data visible

---

## T9: API Tests

**Priority**: P1 | **Estimate**: Medium | **Status**: complete
**File**: `apps/api/tests/unit/teacher.test.ts`

### Subtasks

- [x] T9.1: Test `GET /api/teacher/summary` returns correct shape and aggregates
- [x] T9.2: Test `GET /api/teacher/hotspots` with time range filtering
- [x] T9.3: Test `GET /api/teacher/coverage` returns correct gap indicators
- [x] T9.4: Test `GET /api/teacher/trends` with granularity and topic filter
- [x] T9.5: Test `GET /api/teacher/topics/:conceptName` with valid and invalid concept
- [x] T9.6: Test time range preset parsing (7d, 30d, 90d)
- [x] T9.7: Test empty data returns `belowThreshold: true`
- [x] T9.8: Privacy test: verify no endpoint returns individual query text or student identifiers

### Acceptance Criteria
- All tests pass with `cd apps/api && bun test`
- Privacy invariant verified by test

### Key References
- Pattern: `apps/api/tests/unit/throttle.test.ts`

---

## T10: Privacy Audit

**Priority**: P0 | **Estimate**: Small | **Status**: complete

Final review pass to ensure constitution compliance.

### Subtasks

- [x] T10.1: Review all API endpoint responses — verify no individual query text, no student IDs, no conversation content
- [x] T10.2: Review all frontend components — verify no drill-down to individual queries
- [x] T10.3: Verify aggregation minimum threshold (5 data points) is enforced
- [x] T10.4: Verify teacher routes are separate from student routes (no shared layout or navigation crossover)

### Acceptance Criteria
- Zero individual student data points exposed anywhere
- All visualizations respect 5-query minimum threshold
- Teacher and student interfaces are fully separated
