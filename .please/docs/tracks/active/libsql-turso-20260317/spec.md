# libsql/Turso Agent Run History

> Track: libsql-turso-20260317

## Overview

Persist agent run history to libsql/Turso to track token usage, execution time, success/failure status, and linked issue context. Uses embedded libsql (local file DB) by default with optional Turso cloud connectivity for multi-instance sync.

The existing in-memory OrchestratorState remains unchanged. Run records are written asynchronously to the DB upon agent completion, minimizing changes to existing logic.

## Requirements

### Functional Requirements

- [ ] FR-1: Implement embedded libsql DB connection using `@libsql/client`
- [ ] FR-2: Support optional Turso cloud connection when URL + auth token are configured
- [ ] FR-3: Store the following data in an `agent_runs` table on agent completion:
  - Issue context (issue_id, identifier, state)
  - Token usage (input_tokens, output_tokens, total_tokens)
  - Execution time (started_at, finished_at, duration_ms)
  - Result status (status: 'success' | 'failure', error message)
- [ ] FR-4: Auto-migrate DB schema on startup (create tables if not present)
- [ ] FR-5: Add DB configuration to ServiceConfig (db.path, db.turso_url, db.turso_auth_token)
- [ ] FR-6: Read DB settings from the `db` section in WORKFLOW.md config

### Non-functional Requirements

- [ ] NFR-1: DB writes must be asynchronous and not block the orchestrator loop
- [ ] NFR-2: DB connection failure must not prevent service startup (warn and continue)
- [ ] NFR-3: DB file path must be resolved relative to workspace.root (path traversal prevention)

## Acceptance Criteria

- [ ] AC-1: Starting without DB config creates an embedded libsql DB at the default path
- [ ] AC-2: After agent completion, a record is persisted to the `agent_runs` table
- [ ] AC-3: When Turso URL is configured, data is stored in the remote DB
- [ ] AC-4: Orchestrator continues to function normally when DB connection fails
- [ ] AC-5: Run history is queryable via the HTTP dashboard API

## Out of Scope

- Migrating existing OrchestratorState (running, retry, completed) to DB
- Real-time streaming log storage (only completion summaries are stored)
- DB backup/restore mechanisms
- Complex query/analytics dashboards (basic list API only)

## Assumptions

- `@libsql/client` package is compatible with the Bun runtime
- Default DB path is `{workspace.root}/.work-please/agent_runs.db` when no config is provided
- The `db` section in WORKFLOW.md is optional; when absent, embedded mode is used
