# Plan: libsql/Turso Agent Run History

> Track: libsql-turso-20260317
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: ./spec.md
- **Track**: libsql-turso-20260317
- **Issue**: #115
- **Created**: 2026-03-17
- **Approach**: Thin DB module with async fire-and-forget writes

## Purpose

Add persistent agent run history storage using libsql (embedded) with optional Turso cloud connectivity. This enables tracking token usage, execution time, and success/failure status across agent runs without modifying the existing in-memory orchestrator state.

## Context

The orchestrator currently uses in-memory `Map`/`Set` for all state (`OrchestratorState`). Agent run data (tokens, duration, outcome) is accumulated in `RunningEntry` during execution and aggregated into `agent_totals` at completion, but individual run records are lost on restart. This feature persists per-run records to a SQLite-compatible database.

## Architecture Decision

**Approach**: Thin DB module + async fire-and-forget writes

- New `db.ts` module wraps `@libsql/client` with connection management, schema migration, and typed insert/query functions
- `onWorkerExit` and `terminateRunningIssue` call `db.insertRun()` asynchronously (fire-and-forget with error logging)
- DB config follows existing `sectionMap` + builder pattern in `config.ts`
- `GET /api/v1/runs` endpoint returns paginated run history
- Graceful degradation: DB failures never crash the orchestrator

**Key integration points:**
- `orchestrator.ts:417` — primary write after `onWorkerExit` totals accumulation
- `orchestrator.ts:594` — secondary write at end of `terminateRunningIssue`
- `orchestrator.ts:57` — DB init after config validation in `start()`
- `orchestrator.ts:69` — DB close in `stop()`
- `server.ts` — new `/api/v1/runs` route
- `config.ts` — new `buildDbConfig()` builder
- `types.ts` — new `DbConfig` interface on `ServiceConfig`

## Tasks

### Phase 1: DB Foundation

- [ ] T001: Add `@libsql/client` dependency
  - `bun add @libsql/client` in `apps/work-please`
  - **Files**: `apps/work-please/package.json`

- [ ] T002: Add `DbConfig` to `ServiceConfig` (depends on T001)
  - Add `DbConfig` interface: `{ path: string, turso_url: string | null, turso_auth_token: string | null }`
  - Add `db: DbConfig` field to `ServiceConfig`
  - **Files**: `apps/work-please/src/types.ts`

- [ ] T003: Implement `buildDbConfig()` in config layer (depends on T002)
  - Follow `sectionMap` + `resolveEnvValue` pattern for `$VAR` support
  - Default path: `'.work-please/agent_runs.db'` (relative to workspace.root)
  - **Files**: `apps/work-please/src/config.ts`, `apps/work-please/src/config.test.ts`

### Phase 2: DB Module

- [ ] T004: Create `db.ts` — connection and schema migration (depends on T002)
  - `createDbClient(config: DbConfig, workspaceRoot: string): Client | null`
  - Embedded mode: `file:{workspaceRoot}/{path}` with directory auto-creation
  - Turso mode: `libsql://{turso_url}` with auth token
  - Path traversal check: resolved path must be under workspace root
  - `runMigrations(client)`: CREATE TABLE IF NOT EXISTS `agent_runs`
  - Graceful failure: return `null` on connection error (log warning)
  - **Files**: `apps/work-please/src/db.ts`, `apps/work-please/src/db.test.ts`

- [ ] T005: Implement `insertRun()` function (depends on T004)
  - Accepts: issue_id, identifier, issue_state, session_id, started_at, finished_at, duration_ms, status ('success' | 'failure' | 'terminated'), error, turn_count, retry_attempt, input_tokens, output_tokens, total_tokens
  - Async, fire-and-forget (catches and logs errors)
  - **Files**: `apps/work-please/src/db.ts`, `apps/work-please/src/db.test.ts`

- [ ] T006: Implement `queryRuns()` function (depends on T004)
  - Optional filters: identifier, status, limit (default 50), offset
  - Returns typed `AgentRunRecord[]`
  - **Files**: `apps/work-please/src/db.ts`, `apps/work-please/src/db.test.ts`

### Phase 3: Orchestrator Integration

- [ ] T007: Initialize DB in `Orchestrator.start()` and close in `stop()` (depends on T004, T005)
  - After `validateConfig()`: create client, run migrations, store on instance
  - In `stop()`: call `db.close()`
  - DB init failure → log warning, continue without DB (set `this.db = null`)
  - **Files**: `apps/work-please/src/orchestrator.ts`, `apps/work-please/src/orchestrator.test.ts`

- [ ] T008: Record agent runs in `onWorkerExit` (depends on T007)
  - After line 416 (totals accumulation): call `db.insertRun()` with data from `running` entry
  - Map `reason: 'normal'` → `status: 'success'`, `reason: 'failed'` → `status: 'failure'`
  - **Files**: `apps/work-please/src/orchestrator.ts`, `apps/work-please/src/orchestrator.test.ts`

- [ ] T009: Record terminated runs in `terminateRunningIssue` (depends on T007)
  - At the end of `terminateRunningIssue`, after the workspace cleanup branch (line 594): call `db.insertRun()` with `status: 'terminated'`
  - Compute duration from `entry.started_at`
  - **Files**: `apps/work-please/src/orchestrator.ts`, `apps/work-please/src/orchestrator.test.ts`

### Phase 4: HTTP API

- [ ] T010: Add `GET /api/v1/runs` endpoint (depends on T006, T007)
  - Parse query params: `identifier`, `status`, `limit`, `offset`
  - Call `db.queryRuns()` and return JSON array
  - Return `[]` when DB is not available
  - Follow existing `jsonResponse` / `errorResponse` patterns
  - **Files**: `apps/work-please/src/server.ts`, `apps/work-please/src/server.test.ts`

### Phase 5: Config & Documentation

- [ ] T011: [P] Update `init.ts` WORKFLOW.md template with `db` section (depends on T002)
  - Add commented-out `db` section showing available options
  - **Files**: `apps/work-please/src/init.ts`, `apps/work-please/src/init.test.ts`

## Key Files

| File | Role |
|------|------|
| `apps/work-please/src/types.ts` | `DbConfig` interface, `ServiceConfig` extension |
| `apps/work-please/src/config.ts` | `buildDbConfig()` builder |
| `apps/work-please/src/db.ts` | New — DB connection, migration, insert, query |
| `apps/work-please/src/orchestrator.ts` | DB init/close, run recording at exit points |
| `apps/work-please/src/server.ts` | `/api/v1/runs` endpoint |
| `apps/work-please/src/init.ts` | WORKFLOW.md template update |

## Verification

### Automated Tests

- [ ] `bun run test` — all existing tests pass
- [ ] `bun run check` — no type errors
- [ ] `bun run lint` — no lint errors
- [ ] New tests cover: DB creation, migration, insert, query, graceful failure, config parsing

### Observable Outcomes

- [ ] Start without `db` config → DB created at default path under workspace root
- [ ] Agent completes → record visible at `GET /api/v1/runs`
- [ ] DB connection failure → service starts and operates normally with warning log

### Acceptance Criteria Check

- [ ] AC-1: Starting without DB config creates an embedded libsql DB at the default path → T003, T007
- [ ] AC-2: After agent completion, a record is persisted to the `agent_runs` table → T008
- [ ] AC-3: When Turso URL is configured, data is stored in the remote DB → T004
- [ ] AC-4: Orchestrator continues to function normally when DB connection fails → T007
- [ ] AC-5: Run history is queryable via the HTTP dashboard API → T010

## Progress

| Task | Status | Completed |
|------|--------|-----------|
| T001 | [ ]    |           |
| T002 | [ ]    |           |
| T003 | [ ]    |           |
| T004 | [ ]    |           |
| T005 | [ ]    |           |
| T006 | [ ]    |           |
| T007 | [ ]    |           |
| T008 | [ ]    |           |
| T009 | [ ]    |           |
| T010 | [ ]    |           |
| T011 | [ ]    |           |

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Fire-and-forget async writes | NFR-1: DB writes must not block orchestrator loop |
| 2 | Graceful degradation (null DB) | NFR-2: DB failure must not prevent service startup |
| 3 | Path traversal check on DB path | NFR-3: Security requirement from spec |
| 4 | `@libsql/client` over `better-sqlite3` | Bun-compatible, supports embedded + Turso cloud |
| 5 | Single `agent_runs` table | Simple schema for MVP; can add indexes/tables later |
| 6 | Add `'terminated'` as third status value | Spec FR-3 defines `'success' \| 'failure'`; extended with `'terminated'` for forced-termination (stall, tracker state change) — a distinct outcome from normal failure |

## Surprises & Discoveries

- `@libsql/client` has a `migrate()` method purpose-built for `CREATE TABLE IF NOT EXISTS` with `foreign_keys=OFF`
- `bun build --compile` has a known bug with `@libsql` — not a blocker since Work Please runs as a daemon, not a compiled binary
- `terminateRunningIssue` does NOT accumulate token totals like `onWorkerExit` — terminated runs may have partial token data
