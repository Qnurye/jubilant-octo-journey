# ESLint Configuration Quick Reference

**For**: CompetitionTutor TypeScript Monorepo (Bun + Next.js)
**Status**: Ready for Implementation
**Last Updated**: 2025-12-22

---

## At a Glance

| Question | Answer | File |
|----------|--------|------|
| What config format? | ESLint 9+ flat config (`eslint.config.js`) | `packages/config-eslint/` |
| Where to put shared rules? | `@competition-tutor/config-eslint` package | `packages/config-eslint/index.js` |
| How to enable TypeScript? | `@typescript-eslint/v8+` with `parserOptions.project: true` | `packages/config-eslint/presets/typescript.js` |
| Special setup for Bun? | No—ESLint is runtime-agnostic | N/A |
| How to configure Next.js? | `eslint-plugin-next` with file pattern matching | `packages/config-eslint/presets/next.js` |

---

## File Structure

```
packages/config-eslint/
├── package.json
├── index.js                    # ← Config factory function
├── presets/
│   ├── base.js                # ← Shared JavaScript + ESLint core rules
│   ├── typescript.js          # ← TypeScript + @typescript-eslint rules
│   ├── react.js               # ← React + React Hooks rules
│   └── next.js                # ← Next.js-specific rules
└── utils/
    └── patterns.js            # ← Reusable file patterns

# Each workspace:
apps/web/eslint.config.js       # ← Imports factory, applies presets
apps/api/eslint.config.js       # ← Imports factory, applies presets
packages/shared-types/eslint.config.js  # ← Imports factory, applies presets
```

---

## Code Snippets

### 1. Config Factory (`packages/config-eslint/index.js`)

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

### 2. Base Preset (`packages/config-eslint/presets/base.js`)

```javascript
import js from "@eslint/js";

export default [
  {
    ignores: [
      "**/node_modules",
      "**/.next",
      "**/dist",
      "**/build",
      "**/.turbo",
      "**/coverage",
    ],
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
    rules: {
      ...js.configs.recommended.rules,
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
];
```

### 3. TypeScript Preset (`packages/config-eslint/presets/typescript.js`)

```javascript
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,  // ← Enable type-aware rules
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
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
];
```

### 4. React Preset (`packages/config-eslint/presets/react.js`)

```javascript
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  {
    files: ["**/*.tsx", "**/*.jsx"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs["recommended"].rules,
      ...reactHooksPlugin.configs["recommended"].rules,
      "react/react-in-jsx-scope": "off", // Next.js 13+
      "react/prop-types": "off", // TypeScript provides type safety
    },
  },
];
```

### 5. Next.js Preset (`packages/config-eslint/presets/next.js`)

```javascript
import nextPlugin from "@next/eslint-plugin-next";

export default [
  {
    files: ["**/*.tsx", "**/*.jsx"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs["recommended"].rules,
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];
```

### 6. Backend Config (`apps/api/eslint.config.js`)

```javascript
import { createConfig } from "@competition-tutor/config-eslint";

export default createConfig({
  typescript: true,  // Only TypeScript, no React or Next.js
});
```

### 7. Frontend Config (`apps/web/eslint.config.js`)

```javascript
import { createConfig } from "@competition-tutor/config-eslint";

export default createConfig({
  typescript: true,
  react: true,
  next: true,  // All three enabled for Next.js app
});
```

### 8. Shared Types Config (`packages/shared-types/eslint.config.js`)

```javascript
import { createConfig } from "@competition-tutor/config-eslint";

export default createConfig({
  typescript: true,  // Only TypeScript
});
```

### 9. Root Scripts (`package.json`)

```json
{
  "scripts": {
    "lint": "bun eslint .",
    "lint:fix": "bun eslint . --fix",
    "lint:staged": "bun eslint --fix"
  }
}
```

---

## Dependencies

### In `packages/config-eslint/package.json`

```json
{
  "name": "@competition-tutor/config-eslint",
  "version": "1.0.0",
  "type": "module",
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
    "@next/eslint-plugin-next": "^15.0.0"
  }
}
```

### In workspace `package.json` files (e.g., `apps/web/package.json`)

```json
{
  "dependencies": {
    "@competition-tutor/config-eslint": "workspace:*"
  },
  "devDependencies": {
    "eslint": "^9.0.0"
  }
}
```

---

## TypeScript Setup per Workspace

Each workspace extends the root base TypeScript config:

```json
// apps/web/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", ".next"]
}

// apps/api/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}

// Root tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

---

## Running ESLint

```bash
# Lint all code
bun lint

# Fix linting issues automatically
bun lint:fix

# Lint specific file
bun eslint apps/web/src/components/Button.tsx

# Lint with detailed output
bun eslint . --format json
```

---

## Troubleshooting

### Issue: ESLint can't find TypeScript parser
**Solution**: Ensure `@typescript-eslint/parser` is in `packages/config-eslint/package.json` dependencies

### Issue: Rules not applying to a file
**Solution**: Check file patterns in the config match the file path (e.g., `**/*.tsx` for `.tsx` files)

### Issue: Type-aware rules slow down linting
**Solution**: Normal (10-30% slower); speed up by:
- Running type-aware rules only in CI/CD
- Using ESLint cache: `bun eslint . --cache`
- Running in parallel: `bun eslint . --max-warnings=0` (see ESLint docs for parallel setup)

### Issue: React rules apply to backend code
**Solution**: Ensure backend's `eslint.config.js` only imports base and typescript presets, not react

### Issue: Next.js rules conflict with Bun API routes
**Solution**: File pattern matching ensures `@next/next` rules only apply to `apps/web/`

---

## What NOT to Do

❌ Don't create separate configs for each workspace (duplicates rules)
❌ Don't use legacy `.eslintrc.json` format (deprecated)
❌ Don't disable TypeScript rules in TypeScript files
❌ Don't install ESLint plugins in each workspace (install in shared `@config/eslint`)
❌ Don't put Next.js rules in the backend ESLint config

---

## Performance Benchmarks

| Operation | Time | Notes |
|-----------|------|-------|
| Lint 100 files (no type checking) | ~500ms | With ESLint 9 cache |
| Lint 100 files (with type checking) | ~2-3s | Type-aware rules enabled |
| Full monorepo lint | ~3-5s | Depends on file count |

*Timings assume Bun runtime (faster than Node.js)*

---

## Next Steps

1. Create `packages/config-eslint/` directory
2. Implement factory function and presets (use code snippets above)
3. Add dependencies to `packages/config-eslint/package.json`
4. Create `eslint.config.js` in each workspace
5. Run `bun lint` to verify setup
6. Document in `DEVELOPMENT.md`

---

## Related Documentation

- Full research: `research-eslint-config.md`
- Design decisions: `eslint-decisions.md`
- Monorepo spec: `spec.md`
- Implementation plan: `plan.md`
