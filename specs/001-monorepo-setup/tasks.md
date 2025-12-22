# Tasks: Monorepo Setup

**Status**: Pending
**Feature Branch**: `001-monorepo-setup`
**Plan**: [specs/001-monorepo-setup/plan.md](specs/001-monorepo-setup/plan.md)

## Phase 1: Setup
**Goal**: Initialize repository structure and root configuration.

- [x] T001 Initialize root `package.json` with Bun workspaces configuration in `package.json`
- [x] T002 Create root `tsconfig.json` for workspace reference in `tsconfig.json`
- [x] T003 Create `.gitignore` with standard monorepo exclusions in `.gitignore`
- [x] T004 Create directory structure (`apps/`, `packages/`) in `apps/.keep` and `packages/.keep`

## Phase 2: Foundational
**Goal**: Create scaffolding for shared packages required by applications.

- [x] T005 [P] Create `packages/config` package structure and `package.json` in `packages/config/package.json`
- [x] T006 [P] Create `packages/types` package structure and entry point in `packages/types/package.json`
- [x] T007 [P] Create base TypeScript configuration in `packages/config/tsconfig.base.json`

## Phase 3: Developer Project Initialization (US1)
**Goal**: Scaffold frontend and backend applications and ensure workspace linking.
**Priority**: P1

- [x] T008 [US1] Scaffold Next.js frontend application in `apps/web`
- [x] T009 [US1] Scaffold Hono backend application in `apps/api`
- [x] T010 [US1] Configure dependencies to verify workspace linking in `apps/web/package.json` and `apps/api/package.json`

## Phase 4: Unified Development Scripts (US2)
**Goal**: Enable running common tasks from the repository root.
**Priority**: P1

- [x] T011 [US2] Add `dev` script to root `package.json` to start all apps
- [x] T012 [US2] Add `build` script to root `package.json` for topological builds
- [x] T013 [US2] Add `lint` script to root `package.json`
- [x] T014 [US2] Add `type-check` script to root `package.json`
- [x] T015 [US2] Add `clean` script to root `package.json` to remove artifacts

## Phase 5: Shared Configuration Management (US3)
**Goal**: Enforce consistent code style and configuration across workspaces.
**Priority**: P2

- [ ] T016 [US3] Implement shared Prettier configuration in `packages/config/prettier.config.js`
- [ ] T017 [US3] Implement shared ESLint configuration in `packages/config/eslint.config.js`
- [ ] T018 [P] [US3] Update `apps/web` to extend shared TS, ESLint, and Prettier configs
- [ ] T019 [P] [US3] Update `apps/api` to extend shared TS, ESLint, and Prettier configs

## Phase 6: Shared Type Definitions (US4)
**Goal**: Enable type sharing between frontend and backend.
**Priority**: P2

- [ ] T020 [US4] Define example shared domain entity in `packages/types/src/index.ts`
- [ ] T021 [P] [US4] Import and use shared type in `apps/web/src/app/page.tsx` (or similar entry)
- [ ] T022 [P] [US4] Import and use shared type in `apps/api/src/index.ts`

## Phase 7: Polish
**Goal**: Finalize documentation and verify environment.

- [ ] T023 Update README.md with setup and usage instructions in `README.md`
- [ ] T024 Verify all root scripts execute successfully in `package.json`

## Dependencies

1. **Setup & Foundational** (T001-T007) MUST complete before **US1**.
2. **US1** (T008-T010) MUST complete before **US2**, **US3**, **US4**.
3. **US2** (Scripts) depends on **US1** (Apps existing).
4. **US3** (Shared Config) depends on **US1** and **Foundational**.
5. **US4** (Shared Types) depends on **US1** and **Foundational**.

## Parallel Execution Examples

- **US1**: T008 (Web) and T009 (API) can be scaffolded in parallel.
- **US3**: T018 (Web Config) and T019 (API Config) can be updated in parallel.
- **US4**: T021 (Web Consume) and T022 (API Consume) can be implemented in parallel.

## Implementation Strategy

1. **MVP (Setup + US1 + US2)**: Establish the repo, apps, and running scripts. This allows developers to start working.
2. **Increment 1 (US3)**: Standardize the code style.
3. **Increment 2 (US4)**: Enable type sharing.
