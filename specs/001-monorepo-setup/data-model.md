# Data Model: Monorepo Structure

Since this feature is for repository setup, the "Data Model" refers to the configuration entities and file structure relationships.

## Entities

### Workspace
A self-contained package within the monorepo.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Package name (e.g., `@project/api`, `web`) |
| version | string | Semantic version |
| path | string | Relative path from root (e.g., `apps/web`) |
| type | enum | `app` (deployable) or `package` (library) |
| private | boolean | `true` prevents accidental publishing |

### Root Configuration
Global settings managed at the repository root.

| Field | Type | Description |
|-------|------|-------------|
| workspaces | string[] | Glob patterns identifying workspace locations (`apps/*`, `packages/*`) |
| scripts | map | Unified commands (`dev`, `build`, `lint`) |
| devDependencies | map | Tools shared across all workspaces (TypeScript, ESLint) |

## Relationships

- **Root -> Workspaces**: One-to-many. Root `package.json` defines workspace locations.
- **Web App -> Shared Types**: Dependency. `apps/web` depends on `packages/types`.
- **API App -> Shared Types**: Dependency. `apps/api` depends on `packages/types`.
- **All Workspaces -> Shared Config**: Dependency. All workspaces extend `packages/config` configurations.
