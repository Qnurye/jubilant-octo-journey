# Implementation Plan: Teacher Dashboard

**Branch**: `008-teacher-dashboard` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-teacher-dashboard/spec.md`

## Summary

Build a teacher-facing analytics dashboard that surfaces aggregate insights from existing query/retrieval data. Four views: misconception hotspots (bubble chart), knowledge coverage heatmap, question trends (time-series), and summary overview. All data is aggregated server-side; no individual student data is exposed. Uses Recharts for visualizations, existing Drizzle ORM + Neo4j patterns for data access.

## Technical Context

**Language/Version**: TypeScript 5.x (Bun runtime)
**Primary Dependencies**: Next.js 16 (frontend), Hono (backend), Recharts (charts), shadcn/ui (components), TanStack Query (data fetching), Drizzle ORM (PostgreSQL), Neo4j driver
**Storage**: PostgreSQL (rag_queries, retrieval_metrics, feedback_events), Neo4j (Concept nodes, DISCUSSES relationships)
**Testing**: Bun test runner (API unit tests, component tests)
**Target Platform**: Web (desktop-first, responsive)
**Project Type**: Monorepo (apps/web + apps/api + packages/database)
**Performance Goals**: Dashboard load <3s, filter update <2s
**Constraints**: No individual student data exposure, minimum 5-query aggregation threshold
**Scale/Scope**: Classroom scale (10-20 concurrent users, <10K total queries)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Hybrid RAG | N/A | Dashboard is read-only analytics; does not perform retrieval |
| II. Anti-Hallucination | N/A | No generation in this feature |
| III. Dual Interface | PASS | Separate `/teacher` route; FR-011 prohibits individual data; API endpoints under `/api/teacher/` prefix |
| IV. Content-Aware | N/A | No document processing in this feature |
| V. Formative Assessment | PASS | All visualizations show aggregate data only; no rankings, no leaderboards; minimum 5-query threshold prevents de-anonymization |

**Post-Phase 1 Re-check**: PASS — API contracts confirm no endpoint returns individual query text, student IDs, or conversation content. All responses are aggregated summaries.

## Project Structure

### Documentation (this feature)

```text
specs/008-teacher-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: response shapes and aggregation patterns
├── quickstart.md        # Phase 1: development setup guide
├── contracts/
│   └── api.md           # Phase 1: API endpoint contracts
└── tasks.md             # Phase 2: task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/src/
└── routes/
    └── teacher.ts                  # NEW: all teacher analytics endpoints

apps/web/src/
├── app/teacher/
│   ├── layout.tsx                  # NEW: teacher navigation layout
│   ├── page.tsx                    # NEW: dashboard overview (US4)
│   ├── hotspots/page.tsx           # NEW: misconception hotspots (US1)
│   ├── coverage/page.tsx           # NEW: knowledge coverage heatmap (US2)
│   ├── trends/page.tsx             # NEW: question trends (US3)
│   └── components/
│       ├── TimeRangeFilter.tsx     # NEW: shared date filter
│       ├── StatCard.tsx            # NEW: metric card
│       ├── TopicDetailPanel.tsx    # NEW: concept drill-down
│       ├── EmptyState.tsx          # NEW: insufficient data state
│       ├── BubbleChart.tsx         # NEW: hotspot visualization
│       ├── CoverageHeatmap.tsx     # NEW: coverage grid
│       └── TrendChart.tsx          # NEW: time-series chart
└── lib/
    └── teacher-api.ts              # NEW: TanStack Query hooks + fetch helpers
```

**Structure Decision**: Follows existing monorepo pattern. Teacher routes parallel the admin routes structure. New `teacher.ts` route file follows the same pattern as `admin.ts`. Frontend uses Next.js app router under `/teacher/` path, mirroring `/admin/` layout.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
