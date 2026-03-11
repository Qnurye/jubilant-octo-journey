# Feature Specification: Teacher Dashboard

**Feature Branch**: `008-teacher-dashboard`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "M5: Teacher Dashboard"

## Context

The system already captures query data through the `rag_queries`, `retrieval_metrics`, and `feedback_events` tables (M2/M3). The knowledge graph in Neo4j contains concept nodes and relationships extracted during ETL (M4). This milestone builds the **teacher-facing analytics dashboard** that surfaces aggregate insights from this data — misconception hotspots, knowledge coverage gaps, and question trends — without exposing any individual student information.

## User Scenarios & Testing

### User Story 1 - View Misconception Hotspots (Priority: P0)

A teacher opens the dashboard and sees a visualization of the most commonly asked topics, highlighting areas where students collectively struggle. The visualization shows topic frequency as a word cloud or bubble chart, helping the teacher identify which concepts need more classroom attention.

**Why this priority**: This is the primary value proposition of the teacher dashboard — identifying where students are struggling so instructors can adjust their teaching.

**Independent Test**: After students have asked 20+ questions across different topics, open the teacher dashboard and verify that a visualization shows the most frequently queried concepts, with the highest-frequency topics being visually prominent.

**Acceptance Scenarios**:

1. **Given** students have asked questions over the past week, **When** the teacher opens the misconception hotspots view, **Then** they see a visualization where concept frequency is represented by visual size (larger = more frequent).
2. **Given** the hotspots view is displayed, **When** the teacher selects a time range filter (e.g., "last 7 days", "last 30 days", "custom range"), **Then** the visualization updates to show only data within that period.
3. **Given** the teacher clicks on a concept in the visualization, **When** the detail panel opens, **Then** it shows: the concept name, total query count, average confidence score, and related concepts — but NO individual question text or student identifiers.
4. **Given** there are fewer than 5 queries in the selected period, **When** the teacher views the hotspots, **Then** a message indicates insufficient data for meaningful analysis.

---

### User Story 2 - View Knowledge Coverage Heatmap (Priority: P0)

A teacher views a heatmap showing how well the knowledge base covers different topics, and where students are asking questions that the system struggles to answer (low confidence). This reveals both content gaps in the knowledge base and conceptual gaps in student understanding.

**Why this priority**: Equally critical to hotspots — it tells teachers what content to add to the knowledge base AND what to teach better.

**Independent Test**: After ingesting documents covering some topics and having students ask questions across those topics, verify the heatmap shows high-coverage topics in one color and low-coverage/low-confidence areas in another.

**Acceptance Scenarios**:

1. **Given** the knowledge base has content across multiple topics, **When** the teacher opens the coverage heatmap, **Then** they see topics distributed with color-coding: well-covered topics (high chunk count, high average confidence) in one shade and poorly-covered topics (few chunks, low confidence) in another.
2. **Given** students frequently ask about a topic with few knowledge base chunks, **When** the teacher views the heatmap, **Then** that topic is highlighted as a gap (high query frequency + low coverage).
3. **Given** a topic exists in the knowledge graph but has never been queried, **When** the teacher views the heatmap, **Then** that topic appears with a "no query data" indicator.

---

### User Story 3 - View Question Trends Over Time (Priority: P1)

A teacher views time-series charts showing how question volume and topic distribution change over time. This helps them understand whether teaching interventions are working (decreasing questions on a topic) or if new confusion is emerging.

**Why this priority**: Valuable for measuring teaching effectiveness over time, but requires enough historical data to be meaningful — less immediately actionable than hotspots/coverage.

**Independent Test**: With 2+ weeks of query data, view the trends chart and verify it shows daily/weekly question volumes with topic breakdowns.

**Acceptance Scenarios**:

1. **Given** query data spans multiple weeks, **When** the teacher opens the trends view, **Then** they see a time-series chart showing total query volume per day/week.
2. **Given** the trends view is displayed, **When** the teacher selects a specific topic, **Then** the chart filters to show only queries related to that topic over time.
3. **Given** the teacher selects two time periods, **When** they activate comparison mode, **Then** the chart overlays both periods to show how topic distribution has shifted.
4. **Given** there is less than one week of data, **When** the teacher views trends, **Then** a message suggests waiting for more data before trends become meaningful.

---

### User Story 4 - Dashboard Overview with Key Metrics (Priority: P1)

A teacher lands on the dashboard and immediately sees a summary of key metrics: total questions asked, average confidence score, most active topics this week, and a quick health indicator of the knowledge base.

**Why this priority**: Provides at-a-glance value and serves as the entry point to deeper analytics views.

**Independent Test**: Open the teacher dashboard and verify summary cards display aggregate counts and metrics that match the underlying data.

**Acceptance Scenarios**:

1. **Given** query data exists, **When** the teacher opens the dashboard, **Then** they see summary cards showing: total queries (all time), queries this week, average confidence score, and number of low-confidence queries.
2. **Given** the dashboard is displayed, **When** new queries come in from students, **Then** the summary metrics update on the next page load or manual refresh.
3. **Given** no query data exists yet, **When** the teacher opens the dashboard, **Then** they see a welcome state explaining that analytics will appear once students begin asking questions.

---

### Edge Cases

- What happens when the knowledge graph has no concept nodes? The dashboard shows an empty state with guidance to ingest documents first via the admin ETL page.
- What happens when all queries have the same confidence score? The heatmap degrades gracefully with uniform coloring and a note about limited variance.
- What happens when a teacher tries to drill down to individual query text? The system does not expose individual queries — only aggregate counts, averages, and distributions are available.
- What happens when the time range filter returns zero results? The visualization shows an empty state with the selected date range and a suggestion to widen it.
- What happens with very large datasets (10,000+ queries)? Aggregation happens server-side; the dashboard receives pre-computed summaries, not raw data.

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a teacher dashboard accessible at a dedicated route, visually and functionally separate from the student Q&A interface.
- **FR-002**: System MUST display a misconception hotspots visualization showing concept frequency derived from aggregated query data, with visual prominence proportional to frequency.
- **FR-003**: System MUST support time range filtering (preset ranges and custom date picker) across all dashboard views.
- **FR-004**: System MUST display a knowledge coverage heatmap showing topic distribution with confidence-based color coding, highlighting content gaps.
- **FR-005**: System MUST display time-series charts showing query volume trends with per-topic filtering.
- **FR-006**: System MUST display summary metric cards (total queries, weekly queries, average confidence, low-confidence count) on the dashboard landing page.
- **FR-007**: System MUST allow teachers to click on a concept/topic to see aggregate details (query count, average confidence, related concepts) without exposing individual query text or student identifiers.
- **FR-008**: System MUST support period-over-period comparison for trend analysis.
- **FR-009**: System MUST perform all analytics aggregation server-side and return pre-computed summaries to the dashboard.
- **FR-010**: System MUST show appropriate empty states when insufficient data is available for meaningful visualization.
- **FR-011**: System MUST NOT expose individual student identifiers, conversation content, or per-student query history through any dashboard endpoint or view.

### Key Entities

- **TopicAggregate**: Aggregated statistics for a knowledge graph concept — query count, average confidence, chunk coverage count, and time-series data points. Derived from joining query metrics with concept nodes.
- **TrendDataPoint**: A time-bucketed aggregation (daily or weekly) of query volume, average confidence, and top topics. Computed from query timestamps.
- **CoverageCell**: A topic's coverage score combining knowledge base depth (chunk count) and query performance (average confidence). Used for heatmap rendering.
- **DashboardSummary**: Snapshot of key metrics — total queries, period queries, average confidence, low-confidence count, top topics. Computed on demand from query and retrieval data.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Teachers can identify the top 5 misconception topics within 30 seconds of opening the dashboard.
- **SC-002**: The dashboard loads and displays all summary metrics and primary visualization within 3 seconds.
- **SC-003**: Time range filtering updates all visualizations within 2 seconds.
- **SC-004**: Zero individual student data points are exposed through the dashboard — all displayed data is aggregated across 5+ queries minimum.
- **SC-005**: Teachers can compare question trends across two time periods and identify topic shifts within 1 minute.
- **SC-006**: The coverage heatmap correctly identifies topics where query confidence is below the system threshold, enabling teachers to prioritize content improvements.

## Assumptions

- Query data from existing analytics tables is the primary data source for all dashboard analytics. No new instrumentation in the student Q&A pipeline is required.
- Concept/topic data comes from the knowledge graph. The mapping between queries and concepts uses existing graph traversal results stored in retrieval metrics.
- The teacher role is implicit for now — anyone accessing the teacher dashboard route can view analytics. Authentication/authorization is deferred to M6 (Production Readiness).
- The dashboard uses client-side rendering with data fetched from API endpoints. Real-time push updates are not required — periodic polling or manual refresh is sufficient.
- Aggregation minimum threshold: visualizations require at least 5 data points before rendering, to prevent de-anonymization through small sample sizes.
- The dashboard is read-only — teachers view analytics but do not modify data or trigger actions from this interface.
