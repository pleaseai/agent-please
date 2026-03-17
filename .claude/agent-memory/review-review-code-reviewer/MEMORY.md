# Review Agent Memory — brisbane (work-please)

## Project conventions (from CLAUDE.md)
- Package manager: bun / bunx (never npm/pnpm)
- Code style: 2-space indent, single quotes, no semicolons (@antfu/eslint-config)
- TypeScript strict mode
- File limit: ≤500 LOC; function limit: ≤50 LOC, ≤5 params
- Commit convention: Conventional Commits, lowercase type, imperative mood
- Surgical changes only — do not reformat untouched lines

## Dashboard app (apps/dashboard) — PR amondnet/web-dashboard-shadcn
- Vue 3 SPA with shadcn-vue, TailwindCSS v4, Vite, vue-router
- API helpers in src/lib/api.ts — uses fetch('/api/v1/...')
- Composables: useOrchestratorState, useIssueDetail — polling via useIntervalFn
- server.ts serves static dashboard dist with path traversal guard using normalize+startsWith

## Known issues found in PR review (iteration 2)
- package.json root: lucide-vue-next added as a runtime dep of the root workspace — should be in apps/dashboard only
- serveStatic: path traversal guard uses `sep` (OS path separator), which fails on Windows with URL-encoded paths — low impact for server-side Bun app
- useIssueDetail: interval continues running even when the component unmounts (no cleanup of useIntervalFn pause/resume)
- useOrchestratorState: same missing cleanup concern
- ThemeToggle.vue: useColorMode() from @vueuse/core — composables/useTheme.ts also referenced in git status as untracked but ThemeToggle uses useColorMode directly; no conflict
- DashboardPage: refreshError is never cleared on subsequent successful auto-polls — stale error persists

See patterns.md for detailed notes.
