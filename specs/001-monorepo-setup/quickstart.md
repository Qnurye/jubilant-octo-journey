# Quickstart Guide

## Prerequisites
- **Bun**: v1.0.0 or higher ([Install Instructions](https://bun.sh/docs/installation))
- **Git**: Installed and configured

## Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd <repo-name>
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

## Common Commands

Run these commands from the **root** directory:

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all applications (Frontend + Backend) in development mode |
| `bun run build` | Build all applications and packages |
| `bun run lint` | Lint all workspaces |
| `bun run type-check` | Run TypeScript validation across the entire repo |
| `bun run test` | Run tests for all packages |
| `bun run clean` | Clean build artifacts and node_modules |

## Troubleshooting

- **Dependency Issues**: Run `rm -rf node_modules && bun install` to reset.
- **Port Conflicts**: Ensure ports 3000 (Web) and 8787 (API) are free.
