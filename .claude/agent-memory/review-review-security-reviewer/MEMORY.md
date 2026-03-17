# Security Reviewer Memory — brisbane / work-please

## Project Context
- Bun + TypeScript monorepo; main service at `apps/work-please/src/`
- Dashboard SPA at `apps/dashboard/src/` (Vue 3 + Vite)
- HTTP server: `apps/work-please/src/server.ts` (Bun.serve)
- Workspace path logic: `apps/work-please/src/workspace.ts`

## Confirmed Security Patterns

### Path traversal guard (server.ts)
- Uses `normalize(join(DASHBOARD_DIST, pathname))` then `startsWith(DASHBOARD_DIST)`
- VULNERABILITY: `DASHBOARD_DIST` has no trailing separator; a path like
  `/dashboard-dist-evil/file` would pass the prefix check if another directory
  shares the same prefix string. Fix: append `path.sep` to the prefix before comparing.
- `DASHBOARD_DIST` can be overridden by `Bun.env.DASHBOARD_DIST` — no validation
  that the value is an absolute path or is normalised before use as prefix.

### Information disclosure (server.ts `issueResponse`)
- `workspace.path` (an absolute server filesystem path) is returned in the
  `/api/v1/:id` JSON response and rendered in `IssuePage.vue`.

### Missing security headers (server.ts)
- No `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`,
  or `Referrer-Policy` on any response.

### No authentication / no CSRF protection
- `/api/v1/refresh` (POST, state-changing) has no auth or CSRF token.
- Dashboard is accessible to any process that can reach the bound port
  (default 127.0.0.1 — mitigated by loopback bind, but SSRF-pivotable).

### XSS
- Vue templates use `{{ }}` interpolation exclusively — auto-escaped by Vue.
  No `v-html` found. No raw HTML injection risk in Vue layer.
- Inline HTML fallback in `dashboardResponse()` properly uses `esc()` helper.

### Vite proxy
- Proxy target hardcoded to `http://127.0.0.1:4567` — dev-only, not in prod.

## PR #113 Review — key findings (severity)
1. IMPORTANT — Path traversal: missing trailing separator in prefix check (server.ts:93)
2. IMPORTANT — Workspace path disclosure in API + UI (server.ts:164, IssuePage.vue:179)
3. SUGGESTION — No security response headers
4. SUGGESTION — No CSRF token on POST /api/v1/refresh
5. SUGGESTION — DASHBOARD_DIST env var not validated as absolute/normalised path
