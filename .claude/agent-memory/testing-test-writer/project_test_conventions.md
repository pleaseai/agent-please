---
name: project test conventions
description: Test framework, patterns, and conventions used in agent-please
type: project
---

Test framework: bun:test (bun test runner)
Import style: `import { describe, it, expect, afterEach, beforeEach, beforeAll, mock } from 'bun:test'`
File placement: co-located next to source files (e.g. auth.ts -> auth.test.ts)
Indentation: 2-space, single quotes, no semicolons (antfu eslint config)

Nitro auto-imports (createError, etc.) are NOT available in test context.
Must polyfill via `globalThis.createError = ...` in a `beforeAll` hook BEFORE importing the module under test.
Use top-level `await import(...)` after the polyfill is registered.

better-auth SQLite integration:
- Use ':memory:' for in-memory SQLite (no file cleanup needed)
- Must run migrations before using auth.api: `await (await (auth as any).$context).runMigrations()`
- auth.$context is a Promise<AuthContext> — the context has runMigrations()

Global mock pattern (no mock library): save and restore globalThis.fetch
```
const origFetch = globalThis.fetch
globalThis.fetch = mock(async () => ...) as unknown as typeof fetch
try { ... } finally { globalThis.fetch = origFetch }
```

**Why:** Codebase uses bun:test natively; no jest/vitest. Integration tests use real implementations, not heavy mock frameworks.
**How to apply:** Always write co-located test files using bun:test imports. Polyfill Nitro globals before module imports.
