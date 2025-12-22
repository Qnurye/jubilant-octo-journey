# Research: Monorepo Setup

## Unknowns & Decisions

### 1. Monorepo Tooling
**Decision**: Use **Bun Workspaces**.
**Rationale**:
- Native support in Bun (runtime choice).
- Performance (installation speed).
- Simpler configuration than Turborepo/Nx for this scale (though they can be added later if needed).
- Supports `workspace:*` protocol for easy local linking.

### 2. Project Structure
**Decision**: `apps/` and `packages/` convention.
**Rationale**:
- Standard industry practice.
- Clear separation of deployables (`apps/`) vs. libraries (`packages/`).
- `apps/web`: Next.js frontend.
- `apps/api`: Hono backend.
- `packages/types`: Shared TypeScript definitions (DTOs, Domain entities).
- `packages/config`: Shared ESLint, Prettier, TSConfig.

### 3. Shared Configuration Strategy
**Decision**: Centralized config package (`packages/config`) exported and extended by workspaces.
**Rationale**:
- **TypeScript**: `packages/config/tsconfig.base.json` extended by apps.
- **ESLint**: Shared flat config exported from `packages/config`.
- **Prettier**: Shared config exported or symlinked.
- **Why**: Ensures consistency (SC-006, SC-005) and reduces boilerplate in new packages.

### 4. Shared Packages Import
**Decision**: Use `workspace:*` protocol in `package.json`.
**Rationale**:
- Bun automatically links these.
- Ensures local versions are always used during development.
- Prevents accidental fetching from npm registry.

### 5. LlamaIndex.TS Compatibility
**Decision**: Validated.
**Rationale**:
- LlamaIndex.TS is a standard npm package.
- Compatible with Bun runtime.
- Can be installed in `apps/api` or a dedicated `packages/rag` (started with `apps/api` initially for simplicity, moved to shared if multiple apps need it). *Refinement*: For now, core RAG logic likely sits in Backend API, but shared types go to `packages/types`.

## Alternatives Considered

- **Turborepo**: Powerful but adds complexity. Bun's native workspaces are sufficient for FR-001/FR-009 (build order can be managed via `bun run --filter`). *Revisit if build times degrade.*
- **pnpm**: Good, but Bun is the requested runtime and has built-in package management.
- **Separate Repos**: Rejected due to P1 requirement "User Story 1 - Developer Project Initialization".

## References
- Bun Workspaces Documentation.
- Next.js Monorepo examples.
- Hono Monorepo examples.