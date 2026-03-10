# Conductor Service Specification

Status: Draft v1 (TypeScript implementation)

Purpose: Define a service that orchestrates Claude Code agents to get project work done from GitHub Issues.

Reference: Adapted from [Symphony SPEC.md](vendor/symphony/SPEC.md) (Apache 2.0).

## 1. Problem Statement

Conductor is a long-running automation service that continuously reads work from GitHub Issues,
creates an isolated workspace for each issue, and runs a Claude Code agent session for that issue
inside the workspace.

The service solves four operational problems:

- It turns issue execution into a repeatable daemon workflow instead of manual scripts.
- It isolates agent execution in per-issue workspaces so agent commands run only inside per-issue
  workspace directories.
- It keeps the workflow policy in-repo (`WORKFLOW.md`) so teams version the agent prompt and runtime
  settings with their code.
- It provides enough observability to operate and debug multiple concurrent agent runs.

Implementations are expected to document their trust and safety posture explicitly. This
specification does not require a single approval, sandbox, or operator-confirmation policy; some
implementations may target trusted environments with a high-trust configuration, while others may
require stricter approvals or sandboxing.

Important boundary:

- Conductor is a scheduler/runner and tracker reader.
- Ticket writes (state transitions, comments, PR links) are typically performed by the coding agent
  using tools available in the workflow/runtime environment.
- A successful run may end at a workflow-defined handoff state (for example `In Review`), not
  necessarily `Closed`.

## 2. Goals and Non-Goals

### 2.1 Goals

- Poll GitHub Issues on a fixed cadence and dispatch work with bounded concurrency.
- Maintain a single authoritative orchestrator state for dispatch, retries, and reconciliation.
- Create deterministic per-issue workspaces and preserve them across runs.
- Stop active runs when issue state changes make them ineligible.
- Recover from transient failures with exponential backoff.
- Load runtime behavior from a repository-owned `WORKFLOW.md` contract.
- Expose operator-visible observability (at minimum structured logs).
- Support restart recovery without requiring a persistent database.

### 2.2 Non-Goals

- Rich web UI or multi-tenant control plane.
- Prescribing a specific dashboard or terminal UI implementation.
- General-purpose workflow engine or distributed job scheduler.
- Built-in business logic for how to edit issues, PRs, or comments. (That logic lives in the
  workflow prompt and agent tooling.)
- Mandating strong sandbox controls beyond what Claude Code and the host OS provide.
- Mandating a single default approval, sandbox, or operator-confirmation posture for all
  implementations.

## 3. System Overview

### 3.1 Main Components

1. `Workflow Loader`
   - Reads `WORKFLOW.md`.
   - Parses YAML front matter and prompt body.
   - Returns `{config, prompt_template}`.

2. `Config Layer`
   - Exposes typed getters for workflow config values.
   - Applies defaults and environment variable indirection.
   - Performs validation used by the orchestrator before dispatch.

3. `GitHub Client`
   - Fetches candidate issues in active label/state combinations.
   - Fetches current labels for specific issue numbers (reconciliation).
   - Fetches terminal-label issues during startup cleanup.
   - Normalizes GitHub API payloads into a stable issue model.

4. `Orchestrator`
   - Owns the poll tick.
   - Owns the in-memory runtime state.
   - Decides which issues to dispatch, retry, stop, or release.
   - Tracks session metrics and retry queue state.

5. `Workspace Manager`
   - Maps issue numbers to workspace paths.
   - Ensures per-issue workspace directories exist.
   - Runs workspace lifecycle hooks.
   - Cleans workspaces for terminal issues.

6. `Agent Runner`
   - Creates workspace.
   - Builds prompt from issue + workflow template.
   - Launches Claude Code CLI process.
   - Streams agent updates back to the orchestrator.

7. `Status Surface` (optional)
   - Presents human-readable runtime status (for example terminal output, dashboard, or other
     operator-facing view).

8. `Logging`
   - Emits structured runtime logs to one or more configured sinks.

### 3.2 Abstraction Levels

Conductor is easiest to port and extend when kept in these layers:

1. `Policy Layer` (repo-defined)
   - `WORKFLOW.md` prompt body.
   - Team-specific rules for issue handling, validation, and handoff.

2. `Configuration Layer` (typed getters)
   - Parses front matter into typed runtime settings.
   - Handles defaults, environment tokens, and path normalization.

3. `Coordination Layer` (orchestrator)
   - Polling loop, issue eligibility, concurrency, retries, reconciliation.

4. `Execution Layer` (workspace + agent subprocess)
   - Filesystem lifecycle, workspace preparation, Claude Code CLI protocol.

5. `Integration Layer` (GitHub adapter)
   - API calls and normalization for tracker data.

6. `Observability Layer` (logs + optional status surface)
   - Operator visibility into orchestrator and agent behavior.

### 3.3 External Dependencies

- GitHub API (REST and/or GraphQL) for `tracker.kind: github`.
- Local filesystem for workspaces and logs.
- Optional workspace population tooling (for example Git CLI, if used).
- Claude Code CLI executable that supports JSON streaming output over stdio.
- Host environment authentication for GitHub and Claude Code.

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 Issue

Normalized issue record used by orchestration, prompt rendering, and observability output.

Fields:

- `id` (string)
  - Stable GitHub node ID.
- `number` (integer)
  - GitHub issue number (human-readable, unique per repository).
- `identifier` (string)
  - Human-readable label derived from repo context (example: `#123` or `owner/repo#123`).
- `title` (string)
- `body` (string or null)
  - Issue description body.
- `priority` (integer or null)
  - Derived from labels (e.g. `priority:1` → `1`); lower numbers are higher priority.
- `state` (string)
  - GitHub issue open/closed state combined with active label name.
- `branch_name` (string or null)
  - Associated branch name if available (from linked PR or label convention).
- `url` (string or null)
- `labels` (list of strings)
  - Normalized to lowercase.
- `blocked_by` (list of blocker refs)
  - Each blocker ref contains:
    - `id` (string or null)
    - `number` (integer or null)
    - `identifier` (string or null)
    - `state` (string or null)
- `created_at` (timestamp or null)
- `updated_at` (timestamp or null)

#### 4.1.2 Workflow Definition

Parsed `WORKFLOW.md` payload:

- `config` (map)
  - YAML front matter root object.
- `prompt_template` (string)
  - Markdown body after front matter, trimmed.

#### 4.1.3 Service Config (Typed View)

Typed runtime values derived from `WorkflowDefinition.config` plus environment resolution.

Examples:

- poll interval
- workspace root
- active and terminal issue labels
- concurrency limits
- Claude Code executable/args/timeouts
- workspace hooks

#### 4.1.4 Workspace

Filesystem workspace assigned to one issue identifier.

Fields (logical):

- `path` (workspace path; current runtime typically uses absolute paths, but relative roots are
  possible if configured without path separators)
- `workspace_key` (sanitized issue identifier, e.g. `issue-123`)
- `created_now` (boolean, used to gate `after_create` hook)

#### 4.1.5 Run Attempt

One execution attempt for one issue.

Fields (logical):

- `issue_id`
- `issue_number`
- `issue_identifier`
- `attempt` (integer or null, `null` for first run, `>=1` for retries/continuation)
- `workspace_path`
- `started_at`
- `status`
- `error` (optional)

#### 4.1.6 Live Session (Agent Session Metadata)

State tracked while a Claude Code subprocess is running.

Fields:

- `session_id` (string)
  - Derived from process PID and run timestamp.
- `claude_pid` (integer or null)
  - OS process ID of the Claude Code subprocess.
- `last_event` (string/enum or null)
- `last_event_timestamp` (timestamp or null)
- `last_message` (summarized payload)
- `input_tokens` (integer)
- `output_tokens` (integer)
- `total_tokens` (integer)
- `turn_count` (integer)
  - Number of Claude Code turns started within the current worker lifetime.

#### 4.1.7 Retry Entry

Scheduled retry state for an issue.

Fields:

- `issue_id`
- `issue_number`
- `identifier` (best-effort human ID for status surfaces/logs)
- `attempt` (integer, 1-based for retry queue)
- `due_at_ms` (monotonic clock timestamp)
- `timer_handle` (runtime-specific timer reference)
- `error` (string or null)

#### 4.1.8 Orchestrator Runtime State

Single authoritative in-memory state owned by the orchestrator.

Fields:

- `poll_interval_ms` (current effective poll interval)
- `max_concurrent_agents` (current effective global concurrency limit)
- `running` (map `issue_id -> running entry`)
- `claimed` (set of issue IDs reserved/running/retrying)
- `retry_attempts` (map `issue_id -> RetryEntry`)
- `completed` (set of issue IDs; bookkeeping only, not dispatch gating)
- `claude_totals` (aggregate tokens + runtime seconds)

### 4.2 Stable Identifiers and Normalization Rules

- `Issue ID`
  - GitHub node ID; use for internal map keys.
- `Issue Number`
  - GitHub integer issue number; use for API lookups.
- `Issue Identifier`
  - Human-readable string (e.g. `#123`); use for logs and workspace naming.
- `Workspace Key`
  - Derive from `issue_number` as `issue-<number>` (e.g. `issue-123`).
  - Replace any character not in `[A-Za-z0-9._-]` with `_` for safety.
  - Use the sanitized value for the workspace directory name.
- `Normalized Label`
  - Compare labels after `trim` + `lowercase`.
- `Session ID`
  - Compose from process PID and start timestamp.

## 5. Workflow Specification (Repository Contract)

### 5.1 File Discovery and Path Resolution

Workflow file path precedence:

1. Explicit application/runtime setting (set by CLI startup path).
2. Default: `WORKFLOW.md` in the current process working directory.

Loader behavior:

- If the file cannot be read, return `missing_workflow_file` error.
- The workflow file is expected to be repository-owned and version-controlled.

### 5.2 File Format

`WORKFLOW.md` is a Markdown file with optional YAML front matter.

Design note:

- `WORKFLOW.md` should be self-contained enough to describe and run different workflows (prompt,
  runtime settings, hooks, and tracker selection/config) without requiring out-of-band
  service-specific configuration.

Parsing rules:

- If file starts with `---`, parse lines until the next `---` as YAML front matter.
- Remaining lines become the prompt body.
- If front matter is absent, treat the entire file as prompt body and use an empty config map.
- YAML front matter must decode to a map/object; non-map YAML is an error.
- Prompt body is trimmed before use.

Returned workflow object:

- `config`: front matter root object (not nested under a `config` key).
- `prompt_template`: trimmed Markdown body.

### 5.3 Front Matter Schema

Top-level keys:

- `tracker`
- `polling`
- `workspace`
- `hooks`
- `agent`
- `claude`

Unknown keys should be ignored for forward compatibility.

Note:

- The workflow front matter is extensible. Optional extensions may define additional top-level keys
  (for example `server`) without changing the core schema above.
- Extensions should document their field schema, defaults, validation rules, and whether changes
  apply dynamically or require restart.
- Common extension: `server.port` (integer) enables the optional HTTP server described in
  Section 13.7.

#### 5.3.1 `tracker` (object)

Fields:

- `kind` (string)
  - Required for dispatch.
  - Current supported value: `github`
- `endpoint` (string)
  - Default for `tracker.kind == "github"`: `https://api.github.com`
- `api_key` (string)
  - GitHub Personal Access Token or GitHub App token.
  - May be a literal token or `$VAR_NAME`.
  - Canonical environment variable for `tracker.kind == "github"`: `GITHUB_TOKEN`.
  - If `$VAR_NAME` resolves to an empty string, treat the key as missing.
- `owner` (string)
  - Required for dispatch when `tracker.kind == "github"`.
  - GitHub repository owner (user or organization).
- `repo` (string)
  - Required for dispatch when `tracker.kind == "github"`.
  - GitHub repository name.
- `active_labels` (list of strings or comma-separated string)
  - Default: `conductor:active`
  - Issues bearing any of these labels are candidates for dispatch.
- `terminal_labels` (list of strings or comma-separated string)
  - Default: `conductor:done, conductor:cancelled`
  - Issues bearing any of these labels (or that are closed) are considered terminal.
- `include_closed` (boolean)
  - Default: `false`
  - If `true`, closed issues with active labels are still dispatched.

#### 5.3.2 `polling` (object)

Fields:

- `interval_ms` (integer or string integer)
  - Default: `30000`
  - Changes should be re-applied at runtime and affect future tick scheduling without restart.

#### 5.3.3 `workspace` (object)

Fields:

- `root` (path string or `$VAR`)
  - Default: `<system-temp>/conductor_workspaces`
  - `~` and strings containing path separators are expanded.
  - Bare strings without path separators are preserved as-is (relative roots are allowed but
    discouraged).

#### 5.3.4 `hooks` (object)

Fields:

- `after_create` (multiline shell script string, optional)
  - Runs only when a workspace directory is newly created.
  - Failure aborts workspace creation.
- `before_run` (multiline shell script string, optional)
  - Runs before each agent attempt after workspace preparation and before launching Claude Code.
  - Failure aborts the current attempt.
- `after_run` (multiline shell script string, optional)
  - Runs after each agent attempt (success, failure, timeout, or cancellation) once the workspace
    exists.
  - Failure is logged but ignored.
- `before_remove` (multiline shell script string, optional)
  - Runs before workspace deletion if the directory exists.
  - Failure is logged but ignored; cleanup still proceeds.
- `timeout_ms` (integer, optional)
  - Default: `60000`
  - Applies to all workspace hooks.
  - Non-positive values should be treated as invalid and fall back to the default.
  - Changes should be re-applied at runtime for future hook executions.

#### 5.3.5 `agent` (object)

Fields:

- `max_concurrent_agents` (integer or string integer)
  - Default: `10`
  - Changes should be re-applied at runtime and affect subsequent dispatch decisions.
- `max_turns` (integer or string integer)
  - Default: `20`
  - Maximum number of Claude Code turns before the worker exits.
- `max_retry_backoff_ms` (integer or string integer)
  - Default: `300000` (5 minutes)
  - Changes should be re-applied at runtime and affect future retry scheduling.
- `max_concurrent_agents_by_label` (map `label_name -> positive integer`)
  - Default: empty map.
  - Label keys are normalized (`trim` + `lowercase`) for lookup.
  - Invalid entries (non-positive or non-numeric) are ignored.

#### 5.3.6 `claude` (object)

Fields:

- `command` (string shell command)
  - Default: `claude`
  - The runtime launches this command via `bash -lc` in the workspace directory.
  - The launched process must accept a prompt on stdin and emit JSON events on stdout.
- `permission_mode` (string)
  - Claude Code permission/approval posture.
  - Supported values: `default`, `acceptEdits`, `bypassPermissions`
  - Default: `default`
  - Maps to the `--permission-mode` CLI flag.
- `allowed_tools` (list of strings, optional)
  - Explicit tool allowlist passed via `--allowedTools`.
  - Default: empty (all tools allowed per permission_mode).
- `turn_timeout_ms` (integer)
  - Default: `3600000` (1 hour)
- `read_timeout_ms` (integer)
  - Default: `5000`
- `stall_timeout_ms` (integer)
  - Default: `300000` (5 minutes)
  - If `<= 0`, stall detection is disabled.

### 5.4 Prompt Template Contract

The Markdown body of `WORKFLOW.md` is the per-issue prompt template.

Rendering requirements:

- Use a strict template engine (Liquid-compatible semantics are sufficient).
- Unknown variables must fail rendering.
- Unknown filters must fail rendering.

Template input variables:

- `issue` (object)
  - Includes all normalized issue fields, including labels and blockers.
- `attempt` (integer or null)
  - `null`/absent on first attempt.
  - Integer on retry or continuation run.

Fallback prompt behavior:

- If the workflow prompt body is empty, the runtime may use a minimal default prompt
  (`You are working on a GitHub issue.`).
- Workflow file read/parse failures are configuration/validation errors and should not silently fall
  back to a prompt.

### 5.5 Workflow Validation and Error Surface

Error classes:

- `missing_workflow_file`
- `workflow_parse_error`
- `workflow_front_matter_not_a_map`
- `template_parse_error` (during prompt rendering)
- `template_render_error` (unknown variable/filter, invalid interpolation)

Dispatch gating behavior:

- Workflow file read/YAML errors block new dispatches until fixed.
- Template errors fail only the affected run attempt.

## 6. Configuration Specification

### 6.1 Source Precedence and Resolution Semantics

Configuration precedence:

1. Workflow file path selection (runtime setting -> cwd default).
2. YAML front matter values.
3. Environment indirection via `$VAR_NAME` inside selected YAML values.
4. Built-in defaults.

Value coercion semantics:

- Path/command fields support:
  - `~` home expansion
  - `$VAR` expansion for env-backed path values
  - Apply expansion only to values intended to be local filesystem paths; do not rewrite URIs or
    arbitrary shell command strings.

### 6.2 Dynamic Reload Semantics

Dynamic reload is required:

- The software should watch `WORKFLOW.md` for changes.
- On change, it should re-read and re-apply workflow config and prompt template without restart.
- The software should attempt to adjust live behavior to the new config (for example polling
  cadence, concurrency limits, active/terminal labels, claude settings, workspace paths/hooks, and
  prompt content for future runs).
- Reloaded config applies to future dispatch, retry scheduling, reconciliation decisions, hook
  execution, and agent launches.
- Implementations are not required to restart in-flight agent sessions automatically when config
  changes.
- Extensions that manage their own listeners/resources (for example an HTTP server port change) may
  require restart unless the implementation explicitly supports live rebind.
- Implementations should also re-validate/reload defensively during runtime operations (for example
  before dispatch) in case filesystem watch events are missed.
- Invalid reloads should not crash the service; keep operating with the last known good effective
  configuration and emit an operator-visible error.

### 6.3 Dispatch Preflight Validation

This validation is a scheduler preflight run before attempting to dispatch new work. It validates
the workflow/config needed to poll and launch workers, not a full audit of all possible workflow
behavior.

Startup validation:

- Validate configuration before starting the scheduling loop.
- If startup validation fails, fail startup and emit an operator-visible error.

Per-tick dispatch validation:

- Re-validate before each dispatch cycle.
- If validation fails, skip dispatch for that tick, keep reconciliation active, and emit an
  operator-visible error.

Validation checks:

- Workflow file can be loaded and parsed.
- `tracker.kind` is present and supported.
- `tracker.api_key` is present after `$` resolution.
- `tracker.owner` and `tracker.repo` are present when required by the selected tracker kind.
- `claude.command` is present and non-empty.

### 6.4 Config Fields Summary (Cheat Sheet)

This section is intentionally redundant so a coding agent can implement the config layer quickly.

- `tracker.kind`: string, required, currently `github`
- `tracker.endpoint`: string, default `https://api.github.com` when `tracker.kind=github`
- `tracker.api_key`: string or `$VAR`, canonical env `GITHUB_TOKEN` when `tracker.kind=github`
- `tracker.owner`: string, required when `tracker.kind=github`
- `tracker.repo`: string, required when `tracker.kind=github`
- `tracker.active_labels`: list/string, default `conductor:active`
- `tracker.terminal_labels`: list/string, default `conductor:done, conductor:cancelled`
- `tracker.include_closed`: boolean, default `false`
- `polling.interval_ms`: integer, default `30000`
- `workspace.root`: path, default `<system-temp>/conductor_workspaces`
- `hooks.after_create`: shell script or null
- `hooks.before_run`: shell script or null
- `hooks.after_run`: shell script or null
- `hooks.before_remove`: shell script or null
- `hooks.timeout_ms`: integer, default `60000`
- `agent.max_concurrent_agents`: integer, default `10`
- `agent.max_turns`: integer, default `20`
- `agent.max_retry_backoff_ms`: integer, default `300000` (5m)
- `agent.max_concurrent_agents_by_label`: map of positive integers, default `{}`
- `claude.command`: shell command string, default `claude`
- `claude.permission_mode`: string, default `default`
- `claude.allowed_tools`: list of strings, default `[]`
- `claude.turn_timeout_ms`: integer, default `3600000`
- `claude.read_timeout_ms`: integer, default `5000`
- `claude.stall_timeout_ms`: integer, default `300000`
- `server.port` (extension): integer, optional; enables the optional HTTP server, `0` may be used
  for ephemeral local bind, and CLI `--port` overrides it

## 7. Orchestration State Machine

The orchestrator is the only component that mutates scheduling state. All worker outcomes are
reported back to it and converted into explicit state transitions.

### 7.1 Issue Orchestration States

This is not the same as GitHub issue state (`open`/`closed`). This is the service's internal
claim state.

1. `Unclaimed`
   - Issue is not running and has no retry scheduled.

2. `Claimed`
   - Orchestrator has reserved the issue to prevent duplicate dispatch.
   - In practice, claimed issues are either `Running` or `RetryQueued`.

3. `Running`
   - Worker task exists and the issue is tracked in `running` map.

4. `RetryQueued`
   - Worker is not running, but a retry timer exists in `retry_attempts`.

5. `Released`
   - Claim removed because issue is terminal, non-active, missing, or retry path completed without
     re-dispatch.

Important nuance:

- A successful worker exit does not mean the issue is done forever.
- The worker may continue through multiple back-to-back Claude Code turns before it exits.
- After each normal turn completion, the worker re-checks the GitHub issue labels.
- If the issue still bears an active label, the worker should start another turn in the same
  workspace, up to `agent.max_turns`.
- The first turn should use the full rendered task prompt.
- Continuation turns should send only continuation guidance to the existing session, not resend the
  original task prompt.
- Once the worker exits normally, the orchestrator still schedules a short continuation retry
  (about 1 second) so it can re-check whether the issue remains active and needs another worker
  session.

### 7.2 Run Attempt Lifecycle

A run attempt transitions through these phases:

1. `PreparingWorkspace`
2. `BuildingPrompt`
3. `LaunchingAgentProcess`
4. `InitializingSession`
5. `StreamingTurn`
6. `Finishing`
7. `Succeeded`
8. `Failed`
9. `TimedOut`
10. `Stalled`
11. `CanceledByReconciliation`

Distinct terminal reasons are important because retry logic and logs differ.

### 7.3 Transition Triggers

- `Poll Tick`
  - Reconcile active runs.
  - Validate config.
  - Fetch candidate issues.
  - Dispatch until slots are exhausted.

- `Worker Exit (normal)`
  - Remove running entry.
  - Update aggregate runtime totals.
  - Schedule continuation retry (attempt `1`) after the worker exhausts or finishes its in-process
    turn loop.

- `Worker Exit (abnormal)`
  - Remove running entry.
  - Update aggregate runtime totals.
  - Schedule exponential-backoff retry.

- `Claude Update Event`
  - Update live session fields, token counters.

- `Retry Timer Fired`
  - Re-fetch active candidates and attempt re-dispatch, or release claim if no longer eligible.

- `Reconciliation State Refresh`
  - Stop runs whose issue labels are terminal or whose issues are no longer active.

- `Stall Timeout`
  - Kill worker and schedule retry.

### 7.4 Idempotency and Recovery Rules

- The orchestrator serializes state mutations through one authority to avoid duplicate dispatch.
- `claimed` and `running` checks are required before launching any worker.
- Reconciliation runs before dispatch on every tick.
- Restart recovery is tracker-driven and filesystem-driven (no durable orchestrator DB required).
- Startup terminal cleanup removes stale workspaces for issues already in terminal states.

## 8. Polling, Scheduling, and Reconciliation

### 8.1 Poll Loop

At startup, the service validates config, performs startup cleanup, schedules an immediate tick, and
then repeats every `polling.interval_ms`.

The effective poll interval should be updated when workflow config changes are re-applied.

Tick sequence:

1. Reconcile running issues.
2. Run dispatch preflight validation.
3. Fetch candidate issues from GitHub using active labels.
4. Sort issues by dispatch priority.
5. Dispatch eligible issues while slots remain.
6. Notify observability/status consumers of state changes.

If per-tick validation fails, dispatch is skipped for that tick, but reconciliation still happens
first.

### 8.2 Candidate Selection Rules

An issue is dispatch-eligible only if all are true:

- It has `id`, `number`, `title`, and at least one active label.
- Its labels include at least one `active_label` and no `terminal_label`.
- If `include_closed` is false, the GitHub issue state must be `open`.
- It is not already in `running`.
- It is not already in `claimed`.
- Global concurrency slots are available.
- Per-label concurrency slots are available.
- Blocker rule passes:
  - Do not dispatch when any labeled blocker is non-terminal.

Sorting order (stable intent):

1. `priority` ascending (derived from priority labels; null/unknown sorts last)
2. `created_at` oldest first
3. `number` ascending tie-breaker

### 8.3 Concurrency Control

Global limit:

- `available_slots = max(max_concurrent_agents - running_count, 0)`

Per-label limit:

- `max_concurrent_agents_by_label[label]` if present (label key normalized)
- otherwise fallback to global limit

The runtime counts issues by their current tracked active label in the `running` map.

### 8.4 Retry and Backoff

Retry entry creation:

- Cancel any existing retry timer for the same issue.
- Store `attempt`, `identifier`, `error`, `due_at_ms`, and new timer handle.

Backoff formula:

- Normal continuation retries after a clean worker exit use a short fixed delay of `1000` ms.
- Failure-driven retries use `delay = min(10000 * 2^(attempt - 1), agent.max_retry_backoff_ms)`.
- Power is capped by the configured max retry backoff (default `300000` / 5m).

Retry handling behavior:

1. Fetch active candidate issues (not all issues).
2. Find the specific issue by `issue_id`.
3. If not found, release claim.
4. If found and still candidate-eligible:
   - Dispatch if slots are available.
   - Otherwise requeue with error `no available orchestrator slots`.
5. If found but no longer active, release claim.

Note:

- Terminal-label workspace cleanup is handled by startup cleanup and active-run reconciliation.
- Retry handling mainly operates on active candidates and releases claims when the issue is absent,
  rather than performing terminal cleanup itself.

### 8.5 Active Run Reconciliation

Reconciliation runs every tick and has two parts.

Part A: Stall detection

- For each running issue, compute `elapsed_ms` since:
  - `last_event_timestamp` if any event has been seen, else
  - `started_at`
- If `elapsed_ms > claude.stall_timeout_ms`, terminate the worker and queue a retry.
- If `stall_timeout_ms <= 0`, skip stall detection entirely.

Part B: Tracker state refresh

- Fetch current labels for all running issue numbers.
- For each running issue:
  - If issue is closed or bears a terminal label: terminate worker and clean workspace.
  - If issue still bears an active label: update the in-memory issue snapshot.
  - If issue bears neither active nor terminal label: terminate worker without workspace cleanup.
- If state refresh fails, keep workers running and try again on the next tick.

### 8.6 Startup Terminal Workspace Cleanup

When the service starts:

1. Query GitHub for issues with terminal labels (and closed issues if configured).
2. For each returned issue number, remove the corresponding workspace directory.
3. If the terminal-issues fetch fails, log a warning and continue startup.

This prevents stale terminal workspaces from accumulating after restarts.

## 9. Workspace Management and Safety

### 9.1 Workspace Layout

Workspace root:

- `workspace.root` (normalized path; the config layer expands path-like values and preserves
  bare relative names)

Per-issue workspace path:

- `<workspace.root>/issue-<issue_number>`

Workspace persistence:

- Workspaces are reused across runs for the same issue.
- Successful runs do not auto-delete workspaces.

### 9.2 Workspace Creation and Reuse

Input: `issue.number`

Algorithm summary:

1. Derive `workspace_key = "issue-" + issue.number`.
2. Compute workspace path under workspace root.
3. Ensure the workspace path exists as a directory.
4. Mark `created_now=true` only if the directory was created during this call; otherwise
   `created_now=false`.
5. If `created_now=true`, run `after_create` hook if configured.

Notes:

- This section does not assume any specific repository/VCS workflow.
- Workspace preparation beyond directory creation (for example dependency bootstrap, checkout/sync,
  code generation) is implementation-defined and is typically handled via hooks.

### 9.3 Optional Workspace Population (Implementation-Defined)

The spec does not require any built-in VCS or repository bootstrap behavior.

Implementations may populate or synchronize the workspace using implementation-defined logic and/or
hooks (for example `after_create` and/or `before_run`).

Failure handling:

- Workspace population/synchronization failures return an error for the current attempt.
- If failure happens while creating a brand-new workspace, implementations may remove the partially
  prepared directory.
- Reused workspaces should not be destructively reset on population failure unless that policy is
  explicitly chosen and documented.

### 9.4 Workspace Hooks

Supported hooks:

- `hooks.after_create`
- `hooks.before_run`
- `hooks.after_run`
- `hooks.before_remove`

Execution contract:

- Execute in a local shell context appropriate to the host OS, with the workspace directory as
  `cwd`.
- On POSIX systems, `bash -lc <script>` is the conforming default.
- Hook timeout uses `hooks.timeout_ms`; default: `60000 ms`.
- Log hook start, failures, and timeouts.

Failure semantics:

- `after_create` failure or timeout is fatal to workspace creation.
- `before_run` failure or timeout is fatal to the current run attempt.
- `after_run` failure or timeout is logged and ignored.
- `before_remove` failure or timeout is logged and ignored.

### 9.5 Safety Invariants

This is the most important portability constraint.

Invariant 1: Run Claude Code only in the per-issue workspace path.

- Before launching the Claude Code subprocess, validate:
  - `cwd == workspace_path`

Invariant 2: Workspace path must stay inside workspace root.

- Normalize both paths to absolute.
- Require `workspace_path` to have `workspace_root` as a prefix directory.
- Reject any path outside the workspace root.

Invariant 3: Workspace key is sanitized.

- Only `[A-Za-z0-9._-]` allowed in workspace directory names.
- Replace all other characters with `_`.

## 10. Agent Runner Protocol (Claude Code Integration)

This section defines the contract for integrating Claude Code as the coding agent.

### 10.1 Launch Contract

Subprocess launch parameters:

- Command: `claude.command` (default: `claude`)
- Invocation: `bash -lc <claude.command> --output-format stream-json --print [--allowedTools <tools>] [--permission-mode <mode>]`
- Working directory: workspace path
- Stdin: rendered prompt string
- Stdout/stderr: separate streams
- Framing: line-delimited JSON objects on stdout (one event per line)

Notes:

- The `--output-format stream-json` flag instructs Claude Code to emit structured JSON events.
- The `--print` flag runs non-interactively, reading the prompt from stdin.
- Permission mode and allowed tools are passed as CLI flags per `claude.*` config values.

Recommended additional process settings:

- Max line size: 10 MB (for safe buffering)

### 10.2 Session Startup

Claude Code runs as a single-shot subprocess per turn. The orchestrator:

1. Renders the prompt string from `WORKFLOW.md` template + issue context.
2. Launches `claude` subprocess with appropriate flags.
3. Pipes the rendered prompt to stdin.
4. Reads JSON events from stdout until process exits.

For continuation turns (same issue, subsequent runs in the same session), the orchestrator may:

- Reuse the same workspace directory.
- Provide continuation guidance in the prompt (indicating this is a retry/continuation).

Session identifiers:

- Derive `session_id` from process PID and start timestamp (e.g. `<pid>-<start_ms>`).

### 10.3 Streaming Turn Processing

The client reads line-delimited JSON events from stdout until the process exits.

Completion conditions:

- Process exits with code `0` -> success
- Process exits with non-zero code -> failure
- Turn timeout (`claude.turn_timeout_ms`) -> failure
- Subprocess exit without expected completion event -> failure

Line handling requirements:

- Read JSON events from stdout only.
- Buffer partial stdout lines until newline arrives.
- Attempt JSON parse on complete stdout lines.
- Stderr is not part of the protocol stream:
  - Ignore it or log it as diagnostics.
  - Do not attempt protocol JSON parsing on stderr.

### 10.4 Emitted Runtime Events (Upstream to Orchestrator)

The agent runner emits structured events to the orchestrator callback. Each event should include:

- `event` (enum/string)
- `timestamp` (UTC timestamp)
- `claude_pid` (if available)
- optional `usage` map (token counts)
- payload fields as needed

Important emitted events may include:

- `session_started`
- `startup_failed`
- `turn_completed`
- `turn_failed`
- `message_received` (intermediate Claude output)
- `tool_use` (tool execution event)
- `malformed`

### 10.5 Permission Mode and Tool Policy

Permission mode and tool allow-list behavior is implementation-defined.

Policy requirements:

- Each implementation should document its chosen permission mode posture.
- Implementations should map `claude.permission_mode` to the appropriate `--permission-mode` CLI
  flag value.

Supported permission modes:

- `default` — Claude Code's standard interactive approval for sensitive operations.
- `acceptEdits` — Auto-approve file edits; prompt for shell commands.
- `bypassPermissions` — Auto-approve all operations (high-trust environments only).

Tool filtering:

- If `claude.allowed_tools` is non-empty, pass the list via `--allowedTools` to restrict which
  tools Claude Code may use.
- If empty, no tool restriction is applied beyond the permission mode.

### 10.6 Timeouts and Error Mapping

Timeouts:

- `claude.read_timeout_ms`: request/response timeout during startup
- `claude.turn_timeout_ms`: total subprocess execution timeout
- `claude.stall_timeout_ms`: enforced by orchestrator based on event inactivity

Error mapping (recommended normalized categories):

- `claude_not_found`
- `invalid_workspace_cwd`
- `turn_timeout`
- `process_exit_error`
- `turn_failed`
- `stall_timeout`

### 10.7 Agent Runner Contract

The `Agent Runner` wraps workspace + prompt + Claude Code subprocess.

Behavior:

1. Create/reuse workspace for issue.
2. Build prompt from workflow template.
3. Launch Claude Code subprocess.
4. Forward Claude events to orchestrator.
5. On any error, fail the worker attempt (the orchestrator will retry).

Note:

- Workspaces are intentionally preserved after successful runs.

## 11. Issue Tracker Integration Contract (GitHub)

### 11.1 Required Operations

An implementation must support these tracker adapter operations:

1. `fetch_candidate_issues()`
   - Return open issues bearing at least one `active_label` for the configured repository.

2. `fetch_issues_by_labels(label_names)`
   - Used for startup terminal cleanup.

3. `fetch_issue_labels_by_numbers(issue_numbers)`
   - Used for active-run reconciliation.

### 11.2 Query Semantics (GitHub)

GitHub-specific requirements for `tracker.kind == "github"`:

- GitHub REST API (`https://api.github.com` by default)
- Auth token sent in `Authorization: Bearer <token>` header
- `tracker.owner` and `tracker.repo` identify the repository
- Candidate issue query: `GET /repos/{owner}/{repo}/issues?state=open&labels={active_label}`
- Issue-label refresh: `GET /repos/{owner}/{repo}/issues/{number}` per running issue
- Pagination required for candidate issues
- Page size default: `50`
- Network timeout: `30000 ms`

GitHub GraphQL API (`https://api.github.com/graphql`) may be used as an alternative transport
for batched operations.

Important:

- GitHub API rate limits apply. Implement request throttling and respect `X-RateLimit-*` headers.
- Keep query construction isolated to the GitHub adapter module.

A non-GitHub implementation may change transport details, but the normalized outputs must match the
domain model in Section 4.

### 11.3 Normalization Rules

Candidate issue normalization should produce fields listed in Section 4.1.1.

Additional normalization details:

- `labels` -> lowercase strings (from GitHub label `name` field)
- `priority` -> integer derived from `priority:N` label pattern (non-matching labels yield null)
- `blocked_by` -> derived from issue body cross-references or `blocked-by: #N` convention
- `created_at` and `updated_at` -> parse ISO-8601 timestamps
- `branch_name` -> derived from linked PR branch name if available

### 11.4 Error Handling Contract

Recommended error categories:

- `unsupported_tracker_kind`
- `missing_tracker_api_key`
- `missing_tracker_owner_or_repo`
- `github_api_request` (transport failures)
- `github_api_status` (non-200 HTTP)
- `github_api_rate_limited`
- `github_unknown_payload`
- `github_missing_pagination_cursor`

Orchestrator behavior on tracker errors:

- Candidate fetch failure: log and skip dispatch for this tick.
- Running-label refresh failure: log and keep active workers running.
- Startup terminal cleanup failure: log warning and continue startup.

### 11.5 Tracker Writes (Important Boundary)

Conductor does not require first-class tracker write APIs in the orchestrator.

- Issue mutations (label changes, comments, PR metadata) are typically handled by Claude Code
  using the `gh` CLI or GitHub API tools defined by the workflow prompt.
- The service remains a scheduler/runner and tracker reader.
- Workflow-specific success often means "reached the next handoff label" (for example
  `conductor:review`) rather than `Closed`.

## 12. Prompt Construction and Context Assembly

### 12.1 Inputs

Inputs to prompt rendering:

- `workflow.prompt_template`
- normalized `issue` object
- optional `attempt` integer (retry/continuation metadata)

### 12.2 Rendering Rules

- Render with strict variable checking.
- Render with strict filter checking.
- Convert issue object keys to strings for template compatibility.
- Preserve nested arrays/maps (labels, blockers) so templates can iterate.

### 12.3 Retry/Continuation Semantics

`attempt` should be passed to the template because the workflow prompt may provide different
instructions for:

- first run (`attempt` null or absent)
- continuation run after a successful prior session
- retry after error/timeout/stall

### 12.4 Failure Semantics

If prompt rendering fails:

- Fail the run attempt immediately.
- Let the orchestrator treat it like any other worker failure and decide retry behavior.

## 13. Logging, Status, and Observability

### 13.1 Logging Conventions

Required context fields for issue-related logs:

- `issue_id`
- `issue_number`
- `issue_identifier`

Required context for Claude Code session lifecycle logs:

- `session_id`

Message formatting requirements:

- Use stable `key=value` phrasing.
- Include action outcome (`completed`, `failed`, `retrying`, etc.).
- Include concise failure reason when present.
- Avoid logging large raw payloads unless necessary.

### 13.2 Logging Outputs and Sinks

The spec does not prescribe where logs must go (stderr, file, remote sink, etc.).

Requirements:

- Operators must be able to see startup/validation/dispatch failures without attaching a debugger.
- Implementations may write to one or more sinks.
- If a configured log sink fails, the service should continue running when possible and emit an
  operator-visible warning through any remaining sink.

### 13.3 Runtime Snapshot / Monitoring Interface (Optional but Recommended)

If the implementation exposes a synchronous runtime snapshot (for dashboards or monitoring), it
should return:

- `running` (list of running session rows)
  - each running row should include `turn_count`
- `retrying` (list of retry queue rows)
- `claude_totals`
  - `input_tokens`
  - `output_tokens`
  - `total_tokens`
  - `seconds_running` (aggregate runtime seconds as of snapshot time, including active sessions)

Recommended snapshot error modes:

- `timeout`
- `unavailable`

### 13.4 Optional Human-Readable Status Surface

A human-readable status surface (terminal output, dashboard, etc.) is optional and
implementation-defined.

If present, it should draw from orchestrator state/metrics only and must not be required for
correctness.

### 13.5 Session Metrics and Token Accounting

Token accounting rules:

- Agent events may include token counts.
- Extract input/output/total token counts from Claude output event `usage` fields.
- Accumulate aggregate totals in orchestrator state.

Runtime accounting:

- Runtime should be reported as a live aggregate at snapshot/render time.
- Implementations may maintain a cumulative counter for ended sessions and add active-session
  elapsed time derived from `running` entries (for example `started_at`) when producing a
  snapshot/status view.
- Add run duration seconds to the cumulative ended-session runtime when a session ends (normal exit
  or cancellation/termination).

### 13.6 Humanized Agent Event Summaries (Optional)

Humanized summaries of raw agent events are optional.

If implemented:

- Treat them as observability-only output.
- Do not make orchestrator logic depend on humanized strings.

### 13.7 Optional HTTP Server Extension

This section defines an optional HTTP interface for observability and operational control.

If implemented:

- The HTTP server is an extension and is not required for conformance.
- The implementation may serve server-rendered HTML or a client-side application for the dashboard.
- The dashboard/API must be observability/control surfaces only and must not become required for
  orchestrator correctness.

Enablement (extension):

- Start the HTTP server when a CLI `--port` argument is provided.
- Start the HTTP server when `server.port` is present in `WORKFLOW.md` front matter.
- `server.port` is extension configuration and is intentionally not part of the core front-matter
  schema in Section 5.3.
- Precedence: CLI `--port` overrides `server.port` when both are present.
- `server.port` must be an integer. Positive values bind that port. `0` may be used to request an
  ephemeral port for local development and tests.
- Implementations should bind loopback by default (`127.0.0.1`) unless explicitly configured
  otherwise.

#### 13.7.1 Human-Readable Dashboard (`/`)

- Host a human-readable dashboard at `/`.
- The returned document should depict the current state of the system (for example active sessions,
  retry delays, token consumption, runtime totals, recent events, and health/error indicators).

#### 13.7.2 JSON REST API (`/api/v1/*`)

Provide a JSON REST API under `/api/v1/*` for current runtime state and operational debugging.

Minimum endpoints:

- `GET /api/v1/state`
  - Returns a summary view of the current system state (running sessions, retry queue/delays,
    aggregate token/runtime totals).
  - Suggested response shape:

    ```json
    {
      "generated_at": "2026-03-10T04:00:00Z",
      "counts": {
        "running": 2,
        "retrying": 1
      },
      "running": [
        {
          "issue_id": "I_abc123",
          "issue_number": 42,
          "issue_identifier": "#42",
          "state": "open",
          "session_id": "12345-1741571234000",
          "turn_count": 3,
          "last_event": "message_received",
          "last_message": "Working on tests",
          "started_at": "2026-03-10T04:00:00Z",
          "last_event_at": "2026-03-10T04:05:00Z",
          "tokens": {
            "input_tokens": 1200,
            "output_tokens": 800,
            "total_tokens": 2000
          }
        }
      ],
      "retrying": [
        {
          "issue_id": "I_def456",
          "issue_number": 43,
          "issue_identifier": "#43",
          "attempt": 2,
          "due_at": "2026-03-10T04:06:00Z",
          "error": "process_exit_error"
        }
      ],
      "claude_totals": {
        "input_tokens": 5000,
        "output_tokens": 2400,
        "total_tokens": 7400,
        "seconds_running": 1834.2
      }
    }
    ```

- `GET /api/v1/<issue_number>`
  - Returns issue-specific runtime/debug details for the identified issue.
  - Return `404` with `{"error":{"code":"issue_not_found","message":"..."}}` if unknown.

- `POST /api/v1/refresh`
  - Queues an immediate tracker poll + reconciliation cycle.
  - Response `202 Accepted`.

API design notes:

- Endpoints should be read-only except for operational triggers like `/refresh`.
- Unsupported methods on defined routes should return `405 Method Not Allowed`.
- API errors should use a JSON envelope such as `{"error":{"code":"...","message":"..."}}`.

## 14. Failure Model and Recovery Strategy

### 14.1 Failure Classes

1. `Workflow/Config Failures`
   - Missing `WORKFLOW.md`
   - Invalid YAML front matter
   - Unsupported tracker kind or missing tracker credentials/owner/repo
   - Missing Claude Code executable

2. `Workspace Failures`
   - Workspace directory creation failure
   - Workspace population/synchronization failure (implementation-defined; may come from hooks)
   - Invalid workspace path configuration
   - Hook timeout/failure

3. `Agent Session Failures`
   - Claude Code process not found
   - Turn failed (non-zero exit)
   - Turn timeout
   - Stalled session (no activity)
   - Subprocess crash

4. `Tracker Failures`
   - API transport errors
   - Non-200 HTTP status
   - Rate limiting
   - Malformed payloads

5. `Observability Failures`
   - Snapshot timeout
   - Dashboard render errors
   - Log sink configuration failure

### 14.2 Recovery Behavior

- Dispatch validation failures:
  - Skip new dispatches.
  - Keep service alive.
  - Continue reconciliation where possible.

- Worker failures:
  - Convert to retries with exponential backoff.

- Tracker candidate-fetch failures:
  - Skip this tick.
  - Try again on next tick.

- Reconciliation state-refresh failures:
  - Keep current workers.
  - Retry on next tick.

- Dashboard/log failures:
  - Do not crash the orchestrator.

### 14.3 Partial State Recovery (Restart)

Current design is intentionally in-memory for scheduler state.

After restart:

- No retry timers are restored from prior process memory.
- No running sessions are assumed recoverable.
- Service recovers by:
  - startup terminal workspace cleanup
  - fresh polling of active issues
  - re-dispatching eligible work

### 14.4 Operator Intervention Points

Operators can control behavior by:

- Editing `WORKFLOW.md` (prompt and most runtime settings).
- `WORKFLOW.md` changes should be detected and re-applied automatically without restart.
- Changing issue labels in GitHub:
  - Adding a terminal label to a running issue -> session is stopped and workspace cleaned when
    reconciled.
  - Closing a running issue (and `include_closed` is false) -> session is stopped.
  - Removing the active label -> session is stopped without workspace cleanup.
- Restarting the service to clear all in-memory state and retry timers.
- Using `POST /api/v1/refresh` to trigger an immediate poll cycle.

## 15. Trust and Safety

### 15.1 Trust Posture

Conductor is designed for use in **trusted environments** by engineering teams who understand the
risks of autonomous code execution. It is not designed as a public-facing, multi-tenant, or
zero-trust service.

Implementations must document their chosen trust posture explicitly, including:

- Claude Code permission mode used.
- Whether `bypassPermissions` mode is enabled.
- Workspace isolation mechanisms in place.
- Whether network access or external service access is restricted.

### 15.2 Claude Code Permission Modes

| Mode | Description | Use Case |
|---|---|---|
| `default` | Standard interactive approval for sensitive operations | Development, unknown repos |
| `acceptEdits` | Auto-approve file edits; prompt for shell commands | Trusted codebases |
| `bypassPermissions` | Auto-approve all operations | Fully trusted, sandboxed CI environments |

Implementations should default to the most restrictive mode that is operationally viable.

### 15.3 Workspace Isolation

- Each issue runs in a dedicated workspace directory under `workspace.root`.
- Claude Code's working directory is validated to be the issue workspace before launch.
- Workspace paths are sanitized to prevent path traversal.
- Implementations may further restrict filesystem access using OS-level sandboxing (e.g. seccomp,
  namespaces, Docker containers).

### 15.4 Network and API Access

- Claude Code has access to network resources by default.
- Implementations in sensitive environments should consider network egress restrictions.
- GitHub API credentials are passed via environment variable; Claude Code should not need direct
  access to the raw token unless the workflow prompt explicitly requires it.

### 15.5 Operator Confirmation

- Conductor does not provide built-in operator confirmation prompts for agent actions.
- Teams requiring human-in-the-loop approval should configure `claude.permission_mode: default` and
  monitor agent runs.
- The optional HTTP dashboard can be used to observe active sessions.
