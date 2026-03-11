# Research: Teacher Dashboard (008)

## R1: Chart/Visualization Library

**Decision**: Recharts (built on D3, React-native)
**Rationale**: Declarative React API matches existing shadcn/ui patterns. Supports line charts (trends), bar charts (topic frequency), treemap (heatmap), and composed charts. Lightweight bundle (~45KB gzip). Strong TypeScript support.
**Alternatives considered**:
- D3.js: Too low-level for dashboard widgets; would require custom React wrappers
- Chart.js / react-chartjs-2: Less React-idiomatic; canvas-based limits styling flexibility with Tailwind
- Nivo: Heavier bundle; more complex API for simpler chart types
- Tremor: Dashboard-focused but adds another design system layer on top of shadcn/ui

## R2: Word Cloud / Bubble Chart for Misconception Hotspots

**Decision**: Custom bubble chart using Recharts ScatterChart with variable bubble sizes, supplemented by a simple CSS-based word cloud component
**Rationale**: Avoids adding a separate word-cloud library. Recharts ScatterChart with `<Scatter>` and custom `<Cell>` sizes maps concept frequency to bubble area naturally. For the word cloud variant, a lightweight CSS grid with font-size scaling is sufficient (no canvas needed).
**Alternatives considered**:
- react-wordcloud: Adds ~30KB dependency for a single visualization; canvas-based doesn't match the SVG/CSS approach of the rest of the dashboard
- d3-cloud: Requires manual React integration; over-engineered for our use case

## R3: Heatmap Visualization for Knowledge Coverage

**Decision**: CSS Grid-based heatmap with Tailwind color utilities
**Rationale**: The coverage heatmap is a matrix of topics × coverage metrics, not a geographic or time-series heatmap. A CSS grid with background-color gradients (using Tailwind's color scale or CSS custom properties) is simpler and more accessible than a canvas/SVG approach. Recharts Treemap can serve as an alternative view.
**Alternatives considered**:
- Recharts Treemap: Good for hierarchical topic display but doesn't naturally show the two-dimensional coverage vs. confidence mapping
- Heatmap.js: Canvas-based, designed for geographic/pointer heatmaps, not categorical data

## R4: Query-to-Concept Mapping Strategy

**Decision**: Use Neo4j graph traversal to map queries to concepts via the existing `retrieval_metrics.concepts_found` count and the `Chunk→DISCUSSES→Concept` relationships in the graph. The analytics API will query Neo4j for concept frequency and join with PostgreSQL query metrics.
**Rationale**: The existing pipeline already stores which concepts were found per query (in `retrieval_metrics.concepts_found` as a count). For richer mapping, we query Neo4j for `Chunk→DISCUSSES→Concept` relationships and correlate with the chunks returned per query. This avoids adding a new PostgreSQL column for concept names.
**Alternatives considered**:
- Storing concept names in PostgreSQL per query: Would require schema migration and pipeline changes; violates the spec assumption of "no new instrumentation"
- Pure PostgreSQL aggregation: Cannot access concept relationship data without Neo4j

## R5: Server-Side Aggregation Strategy

**Decision**: Dedicated analytics API endpoints that perform aggregation in PostgreSQL (for time-series, counts) and Neo4j (for concept relationships). Results returned as pre-computed JSON summaries.
**Rationale**: Matches FR-009 (server-side aggregation). PostgreSQL handles time-bucketed aggregation efficiently with `date_trunc()`. Neo4j handles concept graph queries. The API combines both into unified response shapes.
**Alternatives considered**:
- Materialized views in PostgreSQL: Premature optimization; direct queries are fast enough at classroom scale (10-20 concurrent users, <10K queries)
- Client-side aggregation: Violates FR-009 and would expose raw query data

## R6: Time Range Filtering Pattern

**Decision**: Query parameter-based filtering (`?from=ISO8601&to=ISO8601&preset=7d|30d|90d`) applied consistently across all analytics endpoints. Frontend provides preset buttons + custom date picker.
**Rationale**: Consistent with existing admin API patterns (query params for filtering). Presets simplify common use cases while custom range supports advanced analysis.
**Alternatives considered**:
- POST body for filters: Breaks REST convention for read-only queries
- Separate endpoints per time range: Unnecessary endpoint proliferation

## R7: Privacy Aggregation Threshold

**Decision**: Minimum 5 data points required before rendering any visualization. Below this threshold, show "insufficient data" message.
**Rationale**: Matches spec assumption. With classroom-scale usage (20-50 students), 5 queries per concept is a reasonable threshold that prevents de-anonymization while still providing useful data quickly.
**Alternatives considered**:
- No threshold: Risks exposing individual query patterns in small datasets
- Higher threshold (10+): Would delay useful analytics for smaller classes
