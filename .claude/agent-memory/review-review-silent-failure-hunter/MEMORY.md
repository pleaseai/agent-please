# Error Handling Review Memory

## Project Error Handling Conventions

- Orchestrator uses `console.error` for fatal/blocking errors, `console.warn` for non-fatal warnings
- TrackerError is a discriminated union with `code` field -- always propagate or log, never discard silently
- `createTrackerAdapter` returns `TrackerAdapter | TrackerError` -- callers must check with `isTrackerError()`
- `formatTrackerError()` exists for human-readable error messages in logs
- No formal error ID system (no errorIds.ts / Sentry integration yet)
- No `logError` / `logForDebugging` / `logEvent` functions -- project uses raw `console.error` / `console.warn`

## Known Patterns to Watch

- **TrackerError-to-null conversion**: `resolveStatusField()` in `github-status-update.ts` converts structured errors to null, losing diagnostic info. Flagged in PR #86.
- **Supplementary data fetch killing workers**: Non-essential operations (like project context enrichment) placed inside try blocks without their own error isolation can kill the whole worker on transient failures. Flagged in PR #86.
- **IIFE spread for adapter methods**: `github.ts` uses `...(() => { ... })()` to spread methods from a context object. Harder to debug if construction throws.
- **RefreshButton swallows errors (PR #113)**: `finally` resets loading but catch is absent -- network/server errors on POST /api/v1/refresh are silently discarded. Flagged in PR #113.
- **Untyped error cast pattern**: `(e as Error).message` used in composables -- if fetch throws a non-Error (e.g. a string), `.message` is undefined and the error ref shows "undefined". Flagged in PR #113.
- **Silent fallback to inline HTML in server.ts**: When dashboard dist is missing, server silently degrades to inline HTML with no startup warning. Flagged in PR #113.
- **res.json() never throws-checked**: In api.ts, `res.json()` can throw a SyntaxError on malformed JSON. Propagates as untyped rejection producing "undefined" in the error ref. Flagged in PR #113.
- **Polling continues after persistent error**: `useIntervalFn` keeps firing even after repeated failures. No backoff, no cap. Flagged in PR #113.

## Files of Interest

- `apps/work-please/src/orchestrator.ts` -- main dispatch/worker loop, many error handling paths
- `apps/work-please/src/tracker/github-status-update.ts` -- GraphQL status field resolution + update
- `apps/work-please/src/tracker/github.ts` -- GitHub Projects v2 adapter
- `apps/work-please/src/tracker/types.ts` -- TrackerError, TrackerAdapter, StatusFieldInfo types
- `apps/work-please/src/tracker/index.ts` -- createTrackerAdapter factory
- `apps/work-please/src/server.ts` -- HTTP server + static file serving (PR #113 modified)
- `apps/dashboard/src/lib/api.ts` -- fetch wrappers (PR #113 added)
- `apps/dashboard/src/composables/useOrchestratorState.ts` -- polling composable (PR #113 added)
- `apps/dashboard/src/composables/useIssueDetail.ts` -- issue fetch composable (PR #113 added)
- `apps/dashboard/src/components/RefreshButton.vue` -- refresh trigger (PR #113 added)
- `apps/dashboard/src/pages/DashboardPage.vue` -- overview page (PR #113 added)
- `apps/dashboard/src/pages/IssuePage.vue` -- issue detail page (PR #113 added)
