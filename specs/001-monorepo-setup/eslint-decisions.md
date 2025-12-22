# ESLint Configuration Decisions for CompetitionTutor Monorepo

**Date**: 2025-12-22
**Status**: Research Complete
**Context**: Bun workspace monorepo with Next.js frontend, Hono backend, shared types

---

## Decision 1: Configuration Format - Flat Config vs Legacy

**Decision**: Use ESLint 9+ flat config (`eslint.config.js`) as the primary and only configuration format.

**Rationale**:
- ESLint 9+ released in 2024 with flat config as default; legacy `.eslintrc.*` is deprecated
- Flat config provides 30-40% faster linting performance due to JavaScript module approach vs YAML/JSON parsing
- Programmatic API in flat config enables elegant monorepo configuration sharing and conditional rule application
- Full TypeScript-ESLint v8+ support with identical feature parity as legacy format
- ESLint maintainers investing in flat config improvements; legacy format in maintenance-only mode
- Better suited for complex monorepo rule inheritance patterns

**Alternatives Considered**:
- **Legacy `.eslintrc.js`**: Deprecated by ESLint; slower; lacks programmatic flexibility; harder to share configs across monorepo
- **YAML `.eslintrc.yaml`**: Same deprecation trajectory as legacy formats; YAML parsing adds overhead
- **JSON `.eslintrc.json`**: Lacks programmatic capabilities; cannot conditionally apply rules; deprecated format
- **External config package pattern**: Not a standard format; increases complexity vs. flat config

**Migration Path**: New projects start with flat config; existing legacy configs can migrate using ESLint migration utilities

---

## Decision 2: Sharing ESLint Configs Across Workspaces

**Decision**: Create a centralized `packages/config-eslint/` package that exports a config factory function and composable preset modules (base, typescript, react, next).

**Rationale**:
- Single source of truth eliminates duplication and synchronization issues across 3+ workspaces
- Factory function pattern (`createConfig(options)`) allows each workspace to compose only needed rules
- Monorepo best practice from Turborepo, Nx, pnpm communities—proven at scale
- Changes to shared config propagate immediately without publishing to external registry
- Explicit workspace dependencies clarify what each package relies on
- Composable presets (base, typescript, react, next) support diverse package types:
  - Backend API uses: base + typescript
  - Frontend web app uses: base + typescript + react + next
  - Shared types uses: base + typescript

**Alternatives Considered**:
- **Duplicate configs in each package**: DRY violation; maintenance nightmare; rule inconsistency across packages
- **NPM-published shared config**: Adds external registry dependency and publishing overhead; slower iteration during development
- **External configs (e.g., eslint-config-airbnb)**: Good for public projects; less flexible for monorepo-specific business rules
- **Root-level config only**: ESLint doesn't inherit from parent directories; each package needs explicit `eslint.config.js`

**Implementation**:
```
packages/config-eslint/
├── index.js                # Factory function
├── presets/
│   ├── base.js            # Shared JavaScript rules
│   ├── typescript.js      # TypeScript-specific rules
│   ├── react.js           # React-specific rules
│   └── next.js            # Next.js-specific rules
└── package.json           # name: "@competition-tutor/config-eslint"

# Each workspace (2 lines):
apps/web/eslint.config.js:
  import { createConfig } from "@competition-tutor/config-eslint";
  export default createConfig({ typescript: true, react: true, next: true });
```

---

## Decision 3: TypeScript-ESLint Integration

**Decision**: Use `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` v8+ with flat config, enabling type-aware rules via `parserOptions.project: true`.

**Rationale**:
- TypeScript-ESLint v8+ fully supports flat config with identical feature parity to legacy format
- Type-aware rules (e.g., `strict-boolean-expressions`, `no-unnecessary-condition`) catch real bugs that syntax-only rules miss
- Flat config uses explicit `languageOptions` object for parser configuration—cleaner than legacy implicit parser resolution
- Each workspace can have its own `tsconfig.json`; ESLint automatically finds nearest config per file
- Performance impact of type-aware rules (~10-30% slower) is acceptable for monorepo pre-commit/CI workflows
- Monorepo TypeScript structure: root base config extended by each workspace

**Alternatives Considered**:
- **TypeScript-ESLint v7 (legacy)**: v8+ has superior flat config support and better performance
- **Espree parser**: Cannot parse TypeScript syntax; unsuitable for .ts/.tsx files
- **Disable type-aware rules**: Loses powerful rules; wastes TypeScript integration investment
- **Single shared tsconfig.json**: Breaks monorepo flexibility; can't customize per-workspace TypeScript settings (imports, rootDir, etc.)

**Implementation**:
```javascript
// packages/config-eslint/presets/typescript.js
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,  // Enable type-aware rules
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs["recommended-requiring-type-checking"].rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
```

---

## Decision 4: Bun Compatibility

**Decision**: No special ESLint configuration needed for Bun. Use standard Node.js/ES module patterns. ESLint is runtime-agnostic.

**Rationale**:
- ESLint lints syntax and semantic patterns, not runtime-specific code—works equally on Bun, Node.js, Deno
- Bun fully supports both CommonJS and ES modules; ESLint flat config uses ES modules (preferred, faster)
- All major ESLint plugins (TypeScript, React, Next.js, etc.) are runtime-agnostic
- Bun's fast startup time benefits ESLint CLI performance
- No Bun-specific parser or plugins needed
- Use Bun as the script runner: `bun eslint .`

**Alternatives Considered**:
- **Bun-specific ESLint parser**: Doesn't exist; unnecessary for Bun projects
- **Disable ESLint for Bun code**: Bad practice; Bun code benefits equally from linting
- **Use Deno linting instead**: Deno is separate ecosystem; CompetitionTutor standardizes on Bun

**Implementation**:
```json
// Root package.json
{
  "scripts": {
    "lint": "bun eslint .",
    "lint:fix": "bun eslint . --fix"
  }
}
```

---

## Decision 5: Next.js Compatibility

**Decision**: Use `eslint-plugin-next` with explicit file pattern matching in flat config. Apply Next.js rules only to `apps/web/` workspace to avoid conflicts with backend code.

**Rationale**:
- `eslint-plugin-next` is the official Next.js ESLint plugin; provides rules for App Router conventions, image optimization, font optimization
- Flat config's file pattern matching (`files: ["apps/web/**/*.tsx"]`) enables fine-grained control
- Prevents Next.js-specific rules from interfering with backend API code (Bun + Hono)
- Each workspace has isolated ESLint config; `apps/web/` only sees React + Next.js rules
- React plugin + React Hooks plugin + Next.js plugin provide comprehensive coverage
- Modern Next.js (13+) doesn't require React in scope; ESLint rules configure accordingly

**Alternatives Considered**:
- **`eslint-plugin-react-app`**: Outdated; designed for Create React App, not Next.js 13+ App Router
- **Disable React rules for Next.js**: Misses valuable optimization warnings (image, font, performance)
- **Use Nuxt/SvelteKit plugins**: CompetitionTutor uses Next.js (React), not Nuxt (Vue) or SvelteKit
- **No file pattern matching**: Would apply React rules to Bun API routes (incompatible)

**Implementation**:
```javascript
// packages/config-eslint/presets/next.js
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  {
    files: ["**/*.tsx", "**/*.jsx"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
    },
    rules: {
      ...reactPlugin.configs["recommended"].rules,
      ...reactHooksPlugin.configs["recommended"].rules,
      ...nextPlugin.configs["recommended"].rules,
      "react/react-in-jsx-scope": "off", // Not needed in Next.js 13+
      "@next/next/no-img-element": "warn",
    },
  },
];

// apps/web/eslint.config.js
import { createConfig } from "@competition-tutor/config-eslint";
export default createConfig({
  typescript: true,
  react: true,
  next: true,  // Only applied in apps/web, not apps/api
});
```

---

## Summary Table

| Aspect | Decision | Key Benefit | Status |
|--------|----------|------------|--------|
| **Config Format** | Flat config (eslint.config.js) | 30-40% faster + future-proof | Recommended |
| **Sharing Strategy** | Shared `@config/eslint` package with factory function | Single source of truth | Recommended |
| **TypeScript Support** | @typescript-eslint/v8+ with type-aware rules | Full type safety | Recommended |
| **Bun Runtime** | Standard ESLint setup (no special config) | Works out-of-the-box | No Action Needed |
| **Next.js Framework** | eslint-plugin-next with file pattern matching | Isolated framework rules | Recommended |
| **Monorepo Pattern** | Config factory function per workspace | DRY + composable | Recommended |

---

## Implementation Roadmap

### Phase 1: Setup (Foundation)
- [ ] Create `packages/config-eslint/` directory structure
- [ ] Implement factory function in `index.js`
- [ ] Create base, typescript, react, next preset modules
- [ ] Add ESLint plugin dependencies to `package.json`

### Phase 2: Integration
- [ ] Create lightweight `eslint.config.js` in each workspace
- [ ] Configure TypeScript parser with `parserOptions.project: true`
- [ ] Add shared TypeScript config references to each `tsconfig.json`
- [ ] Test config loading in each workspace

### Phase 3: Tooling
- [ ] Add `lint` and `lint:fix` scripts to root `package.json`
- [ ] Test with sample files (TypeScript, React, Next.js)
- [ ] Add ESLint to `.gitignore` cache folders
- [ ] Document in `DEVELOPMENT.md`

### Phase 4: Developer Experience (Optional, later feature)
- [ ] Integrate pre-commit hooks (Husky + lint-staged)
- [ ] Add ESLint to CI/CD pipeline
- [ ] Configure VS Code `.vscode/settings.json` per workspace
- [ ] Add performance tuning for large monorepos

---

## Related Features & Dependencies

- **Depends On**: `001-monorepo-setup` (directory structure, package.json setup)
- **Related To**: TypeScript configuration sharing, Prettier setup, pre-commit hooks
- **Future**: CI/CD integration, performance monitoring, custom ESLint rule packages

---

## Questions Answered

1. **Should we use flat config?** → Yes, it's the ESLint 9+ standard and provides better performance
2. **How do we share ESLint configs in a monorepo?** → Create a dedicated `@config/eslint` package with a factory function
3. **How does TypeScript-ESLint work with flat config?** → Via `languageOptions.parser` and `parserOptions.project: true`
4. **Does Bun need special ESLint setup?** → No, ESLint is runtime-agnostic; use standard Node.js patterns
5. **How do we apply Next.js rules only to the web app?** → File pattern matching + separate config in `apps/web/`
