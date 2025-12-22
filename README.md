# Jubilant Octo Journey

A modern monorepo for full-stack web development, powered by Bun workspaces, Next.js, and Hono.

## Tech Stack

- **Runtime**: Bun
- **Frontend**: Next.js 14+ (`apps/web`)
- **Backend**: Hono (`apps/api`)
- **Languages**: TypeScript 5.x
- **Monorepo Tools**: Bun Workspaces
- **Code Quality**: ESLint (Flat Config), Prettier

## Project Structure

```text
.
├── apps/
│   ├── web/                 # Next.js Frontend (@repo/web)
│   └── api/                 # Hono Backend (@repo/api)
├── packages/
│   ├── config/              # Shared Config (ESLint, Prettier, TS)
│   └── types/               # Shared Type Definitions
└── package.json             # Root scripts
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later

### Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd jubilant-octo-journey
bun install
```

### Development

Start all applications in development mode:

```bash
bun dev
```

- **Web**: http://localhost:3000
- **API**: http://localhost:8080

> Note: By default, `bun dev` runs scripts in parallel.

### Building

Build all applications:

```bash
bun build
```

### Linting & Formatting

Run linting across all workspaces:

```bash
bun lint
```

Format code:

```bash
bun run --filter '*' format
```

Type check:

```bash
bun type-check
```

### Cleaning

Remove `node_modules` and build artifacts:

```bash
bun clean
```

## Workspaces

This project uses Bun workspaces. You can run commands for specific workspaces using the `--filter` flag.

Example: Run dev only for the web app:
```bash
bun run --filter '@repo/web' dev
```

## Shared Packages

- **@repo/config**: Contains shared ESLint, Prettier, and TypeScript configurations.
- **@repo/types**: Contains shared TypeScript interfaces and types used by both frontend and backend.

## License

MIT
