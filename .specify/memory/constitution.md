<!--
=== SYNC IMPACT REPORT ===
Version change: 1.0.0 → 1.1.0 (Technology stack clarification)

Modified sections:
- Technology Stack Constraints: LlamaIndex → LlamaIndex.TS for TypeScript compatibility

Added sections: None

Removed sections: None

Templates requiring updates:
- ✅ plan-template.md: No changes needed
- ✅ spec-template.md: No changes needed
- ✅ tasks-template.md: No changes needed
- ✅ checklist-template.md: No changes needed
- ✅ agent-file-template.md: No changes needed

Follow-up TODOs: None
=== END SYNC IMPACT REPORT ===
-->

# CompetitionTutor Constitution

## Core Principles

### I. Hybrid RAG Architecture

Every knowledge retrieval operation MUST utilize both vector search (Milvus) and knowledge graph traversal (Neo4j) in parallel. This dual-retrieval approach is non-negotiable because:

- Vector search captures semantic similarity for concept explanations
- Graph traversal captures structural relationships (prerequisites, comparisons, hierarchies)
- Single-source retrieval produces incomplete or misleading answers for competitive programming domains

**Enforcement**: All RAG pipeline implementations MUST include both retrieval paths with a re-ranking fusion step.

### II. Anti-Hallucination First

All generated answers MUST be grounded in retrieved evidence from the knowledge base. The system MUST NOT produce responses that fabricate algorithms, formulas, or code examples not present in the corpus.

- Every factual claim requires citation to source material
- Code examples MUST originate from or be verified against the knowledge base
- When evidence is insufficient, the system MUST acknowledge uncertainty rather than fabricate

**Rationale**: Students preparing for competitions rely on precise, correct information. A wrong algorithm or formula can waste hours of study time and damage trust in the system.

### III. Dual-Interface Design

The system MUST maintain strict separation between student-facing and teacher-facing interfaces:

- **Student Side**: Private, non-judgmental Q&A focused on learning support
- **Teacher Side**: Aggregated analytics without access to individual conversation content

This separation is fundamental to the "de-risking" mission—students must feel safe asking questions without fear of evaluation.

**Enforcement**: No API endpoint may expose individual student conversation data to teacher views. All teacher analytics MUST use aggregated, anonymized data.

### IV. Content-Aware Processing

Document ingestion MUST preserve semantic boundaries:

- Code blocks MUST NOT be split across chunks
- Mathematical formulas MUST remain intact within chunks
- Tables MUST NOT be fragmented
- Triple extraction for knowledge graph MUST use LLM-based semantic analysis, not rule-based patterns

**Rationale**: Fragmented code or formulas produce unusable retrieval results and confuse both the LLM and the student.

### V. Formative Assessment Priority

Teacher analytics MUST focus on identifying learning gaps rather than ranking students:

- Visualizations MUST highlight "misconception hotspots" (high-frequency confusion points)
- Knowledge coverage maps MUST show topic distribution, not individual performance
- Time-series analysis MUST reveal trends in collective understanding

**Enforcement**: No leaderboards, no individual performance rankings, no comparative metrics between students.

## Technology Stack Constraints

The following technology choices are binding for this project:

| Component | Technology | Rationale |
|-----------|------------|-----------|
| LLM | Qwen/Qwen3-32B | Local deployment, Chinese language support |
| Embeddings | Qwen/Qwen3-Embedding-8B | Consistent tokenization with main LLM |
| Reranker | Qwen/Qwen3-Reranker-4B | Optimized for retrieval quality |
| RAG Framework | LlamaIndex.TS | TypeScript RAG framework, unified language stack |
| Vector DB | Milvus | High-performance vector similarity |
| Graph DB | Neo4j | Industry-standard knowledge graph |
| Frontend | Next.js + Tailwind + shadcn/ui + TanStack Query | Modern React stack with type safety |
| Backend | Bun + Hono + Drizzle ORM | Fast TypeScript runtime with type-safe ORM |

Technology substitutions require constitution amendment with documented rationale.

## Development Workflow

### Quality Gates

1. **P0 Features** (Core Q&A, ETL Pipeline): MUST have integration tests covering the complete pipeline from input to response
2. **P1 Features** (Code Highlighting, Teacher Dashboard): MUST have component-level tests
3. **P2 Features** (Citations, Trend Analysis): Unit tests recommended

### Code Review Requirements

- All PRs MUST verify compliance with Core Principles
- RAG pipeline changes require evidence of retrieval quality testing
- UI changes for teacher dashboard MUST confirm no individual student data exposure

### Performance Targets

- First token latency (TTFT): < 3 seconds
- Concurrent users: 10-20 minimum (classroom scale)

## Governance

This constitution supersedes all other development practices for the CompetitionTutor project.

**Amendment Procedure**:
1. Propose change with written rationale
2. Document impact on existing implementations
3. Update constitution version following semantic versioning:
   - MAJOR: Principle removal or fundamental redefinition
   - MINOR: New principle or material expansion
   - PATCH: Clarifications and non-semantic refinements
4. Update all dependent templates if affected

**Compliance Review**: All feature specifications and implementation plans MUST include a Constitution Check section verifying alignment with Core Principles.

**Version**: 1.1.0 | **Ratified**: 2025-12-22 | **Last Amended**: 2025-12-22
