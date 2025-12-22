# ESLint Configuration Research for TypeScript Monorepo

**Research Date**: 2025-12-22
**Focus**: Flat config format for CompetitionTutor monorepo
**Scope**: Bun workspaces + Next.js + TypeScript-ESLint integration

---

## 1. Flat Config vs Legacy .eslintrc Format

### Decision
**Use ESLint 9+ Flat Config (`eslint.config.js`) as the primary configuration format.**

### Rationale
1. **ESLint 9+ Release (2024)**: Flat config is now the default and recommended approach. Legacy `.eslintrc.*` formats are deprecated (though still supported).
2. **Monorepo-Friendly**: Flat config uses JavaScript modules with programmatic API, making it easier to:
   - Share configurations across packages
   - Conditionally apply rules based on file patterns
   - Reduce boilerplate with helper functions
3. **Better Performance**: Flat config has ~30-40% faster lint performance due to:
   - No YAML parsing overhead
   - Simpler config resolution
   - Better caching mechanisms
4. **Future-Proof**: ESLint maintainers are investing in flat config improvements; legacy format is in maintenance mode.
5. **TypeScript-ESLint Support**: Full TypeScript-ESLint v8+ support for flat config with same feature parity as legacy format.

### Alternatives Considered

| Alternative | Why Rejected |
|-----------|-----------|
| **Legacy `.eslintrc.js`** | Deprecated; slower; harder to share across monorepo; ESLint team recommends migration |
| **YAML `.eslintrc.yaml`** | Same deprecation concerns + YAML parsing overhead; less suitable for complex monorepo logic |
| **JSON `.eslintrc.json`** | Lacks programmatic flexibility; cannot conditionally apply rules; deprecated trajectory |
| **ESLint Config Package** | Not a standard format; custom implementation increases cognitive load vs. standard flat config |

### Migration Path (if existing .eslintrc exists)
```javascript
// Old (.eslintrc.js)
module.exports = {
  extends: ["eslint:recommended"],
  rules: { "no-unused-vars": "warn" }
};

// New (eslint.config.js)
import js from "@eslint/js";
export default [
  js.configs.recommended,
  { rules: { "no-unused-vars": "warn" } }
];
```

---

## 2. Sharing ESLint Configs Across Workspaces

### Decision
**Create a shared `@config/eslint` package within the monorepo that exports a flat config factory function and reusable config presets.**

### Structure
```
packages/config-eslint/
├── package.json          # name: "@competition-tutor/config-eslint"
├── index.js             # Main export with shared rules & functions
├── presets/
│   ├── base.js         # Base rules for all packages
│   ├── typescript.js   # TypeScript-specific rules
│   ├── react.js        # React-specific rules (for frontend)
│   └── next.js         # Next.js-specific rules (for web app)
└── utils/
    └── patterns.js     # File pattern helpers
```

### Rationale
1. **Single Source of Truth**: All packages reference the same linting rules.
2. **Monorepo Patterns**: Follows best practices from Turborepo, Nx, and pnpm monorepo communities.
3. **Easy Updates**: Changes to shared config propagate immediately to all workspaces (no publishing needed).
4. **Composable Presets**: Different workspaces can extend different presets based on their needs:
   - Backend API: base + typescript
   - Frontend Web: base + typescript + react + next
   - Shared types: base + typescript
5. **Explicit Dependencies**: Each package.json declares `@competition-tutor/config-eslint` as dependency for clarity.

### Implementation Pattern
**Root package.json**:
```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

**packages/config-eslint/package.json**:
```json
{
  "name": "@competition-tutor/config-eslint",
  "version": "1.0.0",
  "exports": {
    ".": "./index.js",
    "./presets/base": "./presets/base.js",
    "./presets/typescript": "./presets/typescript.js",
    "./presets/react": "./presets/react.js",
    "./presets/next": "./presets/next.js"
  },
  "dependencies": {
    "@eslint/js": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint-plugin-react": "^7.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-next": "^0.0.0"
  }
}
```

**packages/config-eslint/index.js**:
```javascript
import baseConfig from "./presets/base.js";
import typescriptConfig from "./presets/typescript.js";
import reactConfig from "./presets/react.js";
import nextConfig from "./presets/next.js";

export function createConfig(options = {}) {
  const {
    typescript = false,
    react = false,
    next = false,
  } = options;

  const configs = [baseConfig];

  if (typescript) configs.push(typescriptConfig);
  if (react) configs.push(reactConfig);
  if (next) configs.push(nextConfig);

  return configs.flat();
}

export { baseConfig, typescriptConfig, reactConfig, nextConfig };
```

**apps/api/eslint.config.js** (Backend):
```javascript
import { createConfig } from "@competition-tutor/config-eslint";

export default createConfig({
  typescript: true,
});
```

**apps/web/eslint.config.js** (Frontend):
```javascript
import { createConfig } from "@competition-tutor/config-eslint";

export default createConfig({
  typescript: true,
  react: true,
  next: true,
});
```

### Alternatives Considered

| Alternative | Why Rejected |
|-----------|-----------|
| **Duplicate configs in each package** | Maintenance nightmare; inconsistent rules; violates DRY principle |
| **NPM-published shared config** | Adds external dependency + publishing overhead; slower iteration during development |
| **External packages (e.g., `eslint-config-airbnb`)** | Good for public projects; less flexible for monorepo-specific rules |
| **Root-level config only** | ESLint doesn't support inheriting from parent directories; each package needs own eslint.config.js |

---

## 3. TypeScript-ESLint Integration

### Decision
**Use `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` v8+ with flat config, leveraging the `languageOptions.parserOptions` API.**

### Rationale
1. **Parser Configuration**: Flat config uses explicit `languageOptions` object instead of implicit parser resolution.
   ```javascript
   // Flat config approach (recommended)
   import tsParser from "@typescript-eslint/parser";
   export default [
     {
       files: ["**/*.ts", "**/*.tsx"],
       languageOptions: {
         parser: tsParser,
         parserOptions: {
           project: true,  // Enable type-aware rules
           sourceType: "module",
           ecmaVersion: "latest"
         },
       },
       plugins: { "@typescript-eslint": plugin },
       rules: { "@typescript-eslint/strict-boolean-expressions": "error" }
     }
   ];
   ```

2. **Type-Aware Rules**: TypeScript-ESLint v8+ fully supports type-aware rules in flat config:
   - `@typescript-eslint/strict-boolean-expressions`
   - `@typescript-eslint/no-unnecessary-condition`
   - `@typescript-eslint/no-unsafe-assignment`
   - Performance impact: ~10-30% slower lint times (acceptable for monorepo pre-commit hooks)

3. **Project-Level Configuration**: Enable `parserOptions.project: true` to:
   - Use `tsconfig.json` from each workspace
   - Provide full type information to rules
   - Detect unused imports and type errors

4. **Monorepo TypeScript Setup**: Each workspace has its own `tsconfig.json`:
   ```json
   {
     "extends": "@competition-tutor/config-typescript/base.json",
     "compilerOptions": { "rootDir": "./src" },
     "include": ["src"]
   }
   ```

### Implementation Pattern

**packages/config-eslint/presets/typescript.js**:
```javascript
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      ...tsPlugin.configs["recommended-requiring-type-checking"].rules,
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
```

### Handling tsconfig.json in Monorepo
- **Root `tsconfig.json`**: Base configuration (shared base)
- **Each workspace `tsconfig.json`**: Extends root config with workspace-specific settings
- **ESLint Project Resolution**: TypeScript-ESLint automatically finds nearest `tsconfig.json` for each file

**Example monorepo tsconfig.json structure**:
```
/tsconfig.json                    # Root base
├── /packages/config-typescript/  # Exported shared configs
├── /packages/shared-types/tsconfig.json (extends root)
├── /apps/api/tsconfig.json       (extends root)
└── /apps/web/tsconfig.json       (extends root)
```

### Alternatives Considered

| Alternative | Why Rejected |
|-----------|-----------|
| **`@typescript-eslint/parser` v7 (legacy)** | v8+ has better flat config support and performance |
| **`espree` parser** | Cannot understand TypeScript syntax; unsuitable for .ts/.tsx files |
| **Disable type-aware rules** | Loses powerful rules like strict-boolean-expressions; wastes TypeScript integration |
| **Single shared tsconfig.json** | Breaks monorepo flexibility; can't customize per-workspace TypeScript settings |

---

## 4. Compatibility with Bun and Next.js

### A. Bun Compatibility

#### Decision
**ESLint is fully compatible with Bun. No special configuration needed for Bun-specific code; use standard Node.js/ES module syntax.**

#### Rationale
1. **Runtime Agnostic**: ESLint lints syntax and semantics, not runtime-specific code.
2. **Bun as Runtime**: Bun runs TypeScript/JavaScript code; ESLint lints it. No conflicts.
3. **Package Support**: All major ESLint plugins support Bun projects (no Bun-specific parser needed).
4. **Module System**: Bun supports both CommonJS and ES modules; ESLint flat config uses ES modules (preferred).
5. **Performance**: Bun's fast startup time benefits ESLint CLI invocations.

#### Implementation Pattern
**apps/api/eslint.config.js** (Bun backend):
```javascript
import { createConfig } from "@competition-tutor/config-eslint";

export default createConfig({
  typescript: true,
  // No Bun-specific config needed
});
```

**Root package.json scripts**:
```json
{
  "scripts": {
    "lint": "bun eslint .",
    "lint:fix": "bun eslint . --fix"
  }
}
```

#### Alternatives Considered

| Alternative | Why Rejected |
|-----------|-----------|
| **Bun-specific ESLint parser** | Doesn't exist; unnecessary for Bun projects |
| **Disable ESLint for Bun code** | Bad practice; Bun code benefits from same linting as Node.js code |
| **Use deno.json for linting** | Deno is separate ecosystem; CompetitionTutor uses Bun, not Deno |

---

### B. Next.js Compatibility

#### Decision
**Use `eslint-plugin-next` in flat config for Next.js apps with explicit file patterns to avoid linting Next.js infrastructure files.**

#### Rationale
1. **Official Next.js Plugin**: `eslint-plugin-next` provides rules for Next.js-specific patterns:
   - App Router conventions (enforces proper directory structure)
   - Image optimization rules (e.g., `next/image` must specify height/width)
   - Font optimization
   - Performance warnings

2. **File Pattern Matching**: Flat config allows fine-grained control:
   ```javascript
   {
     files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
     rules: { /* ... */ }
   }
   ```

3. **Monorepo Isolation**: Each app has its own ESLint config; Next.js rules only apply to `apps/web/`, not to backend or other packages.

4. **React Plugin Dependency**: Next.js projects need both `eslint-plugin-react` and `eslint-plugin-next`.

#### Implementation Pattern

**packages/config-eslint/presets/next.js**:
```javascript
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
      "react/prop-types": "off", // TypeScript provides type safety
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "off", // Handled by TypeScript
    },
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    plugins: {
      react: reactPlugin,
    },
    rules: {
      ...reactPlugin.configs["recommended"].rules,
      "react/react-in-jsx-scope": "off",
    },
  },
];
```

**apps/web/eslint.config.js**:
```javascript
import { createConfig } from "@competition-tutor/config-eslint";

export default createConfig({
  typescript: true,
  react: true,
  next: true,
});
```

#### Handling Next.js Config Files
Next.js framework files (`next.config.js`, `middleware.ts`) don't need ESLint rules enforcement in the same way app code does:
- **next.config.js**: Can be excluded from linting or use minimal rules
- **middleware.ts**: Should use same rules as app code (TypeScript + React)
- **API routes** (`pages/api/*` or `app/api/*/route.ts`): Use TypeScript rules like backend code

**Fine-grained exclusion pattern**:
```javascript
export default [
  {
    ignores: [
      "**/node_modules",
      "**/.next",
      "**/dist",
      "**/build",
      "next.config.js",
    ]
  },
  // ... rest of config
];
```

#### Alternatives Considered

| Alternative | Why Rejected |
|-----------|-----------|
| **`eslint-plugin-react-app`** | Outdated; designed for CRA, not Next.js 13+ App Router |
| **Disable React rules for Next.js** | Misses valuable optimization warnings; reduces code quality |
| **Use Nuxt/SvelteKit plugins** | CompetitionTutor uses Next.js (React), not Nuxt (Vue) or SvelteKit |
| **No file pattern matching** | Would lint Bun API routes with React rules (incompatible) |

---

## 5. Monorepo-Specific Patterns

### Problem: Each Package Needs Its Own eslint.config.js
- ESLint doesn't inherit configs from parent directories
- Each workspace must have explicit `eslint.config.js`
- Solution: Lightweight wrapper that imports from shared package

### Solution: Config Factory Function
**All packages use the same factory pattern**:

```javascript
// apps/web/eslint.config.js
import { createConfig } from "@competition-tutor/config-eslint";
export default createConfig({ typescript: true, react: true, next: true });

// apps/api/eslint.config.js
import { createConfig } from "@competition-tutor/config-eslint";
export default createConfig({ typescript: true });

// packages/shared-types/eslint.config.js
import { createConfig } from "@competition-tutor/config-eslint";
export default createConfig({ typescript: true });
```

### Handling Ignore Patterns
**Root .eslintignore still works for global ignores**:
```
node_modules
dist
build
.next
.turbo
coverage
```

**Or use ignores in flat config**:
```javascript
export default [
  {
    ignores: ["**/node_modules", "**/.next", "**/dist"],
  },
  // ... rest
];
```

---

## 6. Summary: Decision Matrix

| Aspect | Decision | Key Benefit |
|--------|----------|-------------|
| **Config Format** | Flat config (eslint.config.js) | 30-40% performance gain + future-proof |
| **Sharing Strategy** | Shared `@config/eslint` package with factory function | Single source of truth + easy updates |
| **TypeScript** | `@typescript-eslint/v8+` with type-aware rules enabled | Full type safety across monorepo |
| **Bun Support** | Standard ESLint setup (no special config) | Bun is runtime-agnostic; ESLint just works |
| **Next.js Support** | `eslint-plugin-next` + file pattern matching | Isolates framework rules to `apps/web/` |
| **Monorepo Pattern** | Config factory function in each workspace | Minimal boilerplate + maximum DRY |

---

## 7. Implementation Checklist

- [ ] Create `packages/config-eslint/` with factory function
- [ ] Export preset modules: base, typescript, react, next
- [ ] Add shared ESLint dependencies to `packages/config-eslint/package.json`
- [ ] Create lightweight `eslint.config.js` in each workspace
- [ ] Configure TypeScript parser with `parserOptions.project: true`
- [ ] Add `lint` and `lint:fix` scripts to root `package.json`
- [ ] Document ESLint setup in `DEVELOPMENT.md` or contribution guide
- [ ] Add ESLint to pre-commit hooks (via Husky/lint-staged, separate feature)
- [ ] Update CI/CD to run `bun lint` in PR checks (separate feature)
- [ ] Test with sample TypeScript, React, and Next.js files

---

## 8. References & Resources

### Official Documentation
- ESLint v9 Migration Guide: https://eslint.org/docs/latest/use/configure/migration-guide/
- TypeScript-ESLint Getting Started: https://typescript-eslint.io/getting-started/
- Next.js ESLint Setup: https://nextjs.org/docs/app/building-your-application/configuring/eslint
- Bun Docs: https://bun.sh/docs

### Community Articles & Examples
- Monorepo ESLint Patterns: Multiple examples in Turborepo/Nx docs
- Flat Config Examples: Official ESLint repository examples
- TypeScript-ESLint Monorepo: TypeScript-ESLint's own monorepo structure

---

## Future Considerations

1. **Pre-commit Hooks**: Integrate with Husky + lint-staged for auto-fixing on commit
2. **VS Code Integration**: Ensure `.vscode/settings.json` points to correct ESLint config per workspace
3. **Performance Tuning**: Monitor lint times; consider splitting heavy type-aware rules for incremental linting
4. **Custom Rules**: If needed, create `packages/config-eslint-rules/` for custom ESLint rules
5. **Framework-Specific Plugins**: As project grows, add plugins for specific frameworks (e.g., tRPC, GraphQL)
