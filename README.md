# Conductor

Conductor turns GitHub Issues into isolated, autonomous implementation runs — managing work instead
of supervising coding agents.

> **Warning**: Conductor is an engineering preview for use in trusted environments.

## Overview

Conductor is a long-running TypeScript service that:

1. Polls a GitHub repository for issues bearing configured labels.
2. Creates an isolated workspace directory for each eligible issue.
3. Launches a Claude Code agent session inside that workspace with a rendered prompt.
4. Monitors the session, handles retries, and reconciles issue state on each poll cycle.

It is a TypeScript implementation of the [Symphony specification](vendor/symphony/SPEC.md),
adapted for GitHub Issues and Claude Code instead of Linear and Codex.

For full technical details, see [SPEC.md](SPEC.md).

## Key Differences from Symphony

| | Symphony (reference) | Conductor |
|---|---|---|
| Issue Tracker | Linear | GitHub Issues |
| Coding Agent | Codex (app-server mode) | Claude Code CLI |
| Language | Elixir/OTP | TypeScript (Node.js) |
| Tracker Auth | `LINEAR_API_KEY` | `GITHUB_TOKEN` |
| Project Config | `project_slug` | `owner` + `repo` |
| Issue States | Linear workflow states | GitHub labels |
| Agent Protocol | JSON-RPC over stdio | Stream-JSON CLI output |
| Permission Model | Codex approval/sandbox policies | Claude Code `--permission-mode` |

## Features

- **GitHub Issues polling** — Dispatch work from issues with configured labels on a fixed cadence.
- **Isolated workspaces** — Each issue gets a dedicated directory; workspaces persist across runs.
- **`WORKFLOW.md` config** — Version agent prompt and runtime settings alongside your code.
- **Bounded concurrency** — Global and per-label concurrent agent limits.
- **Retry with backoff** — Exponential backoff on failures; short continuation retry on clean exit.
- **Dynamic config reload** — Edit `WORKFLOW.md` and changes apply without restarting the service.
- **Workspace hooks** — Shell scripts run at `after_create`, `before_run`, `after_run`, and
  `before_remove` lifecycle events.
- **Structured logging** — Operator-visible logs with stable `key=value` format.
- **Optional HTTP dashboard** — Enable with `--port` for runtime status and JSON API.

## Architecture

```
WORKFLOW.md
    |
    v
Config Layer ──> Orchestrator ──> Workspace Manager ──> Agent Runner (Claude Code)
                     |                                         |
                     v                                         v
               GitHub Client                          Isolated workspace/
              (Issues polling,                        per-issue directory
              reconciliation)
                     |
                     v
               Status Surface (optional HTTP dashboard / structured logs)
```

Components:

- **Workflow Loader** — Parses `WORKFLOW.md` YAML front matter and prompt template body.
- **Config Layer** — Typed getters with env-var indirection and built-in defaults.
- **GitHub Client** — Fetches candidate issues, reconciles running-issue labels.
- **Orchestrator** — Owns in-memory state; drives the poll/dispatch/retry loop.
- **Workspace Manager** — Creates, reuses, and cleans per-issue workspaces; runs hooks.
- **Agent Runner** — Launches Claude Code, streams events back to the orchestrator.
- **Status Surface** — Optional terminal view and HTTP API for operator visibility.

See [SPEC.md](SPEC.md) for the full specification.

## Quick Start

### Prerequisites

- **Node.js** 20+ (or Bun)
- **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code` or follow the
  [official installation guide](https://docs.anthropic.com/en/docs/claude-code))
- **GitHub Personal Access Token** with `repo` scope (or a GitHub App token)

### Install

```bash
git clone https://github.com/chatbot-pf/conductor.git
cd conductor
npm install
npm run build
```

### Configure

Create a `WORKFLOW.md` in your target repository (the repo whose issues Conductor will process):

```markdown
---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  owner: your-org
  repo: your-repo
  active_labels:
    - conductor:active
  terminal_labels:
    - conductor:done
    - conductor:cancelled

polling:
  interval_ms: 30000

workspace:
  root: ~/conductor_workspaces

hooks:
  after_create: |
    git clone https://github.com/your-org/your-repo.git .
    npm install

agent:
  max_concurrent_agents: 3
  max_turns: 20

claude:
  permission_mode: acceptEdits
  turn_timeout_ms: 3600000
---

You are working on a GitHub issue for the repository `your-org/your-repo`.

Issue #{{ issue.number }}: {{ issue.title }}

{{ issue.body }}

Labels: {{ issue.labels | join: ", " }}

{% if attempt %}
This is attempt #{{ attempt }}. Review any prior work in the workspace before continuing.
{% endif %}

Your task:
1. Understand the issue requirements.
2. Implement the requested changes.
3. Write or update tests as needed.
4. Open a pull request and add the label `conductor:review` to this issue.
```

### Run

```bash
# Set your GitHub token
export GITHUB_TOKEN=ghp_your_token_here

# Run Conductor against a WORKFLOW.md in the current directory
npx conductor

# Or specify a WORKFLOW.md path
npx conductor --workflow /path/to/WORKFLOW.md

# Enable the optional HTTP dashboard on port 3000
npx conductor --port 3000
```

## WORKFLOW.md Configuration

`WORKFLOW.md` is the single source of truth for Conductor's runtime behavior. It combines a YAML
front matter configuration block with a Markdown prompt template body.

### Full Front Matter Schema

```yaml
---
tracker:
  kind: github                        # Required: "github"
  api_key: $GITHUB_TOKEN              # Required: token or $ENV_VAR
  owner: your-org                     # Required: GitHub owner
  repo: your-repo                     # Required: GitHub repository name
  endpoint: https://api.github.com    # Optional: override GitHub API base URL
  active_labels:                      # Optional: default ["conductor:active"]
    - conductor:active
  terminal_labels:                    # Optional: default ["conductor:done", "conductor:cancelled"]
    - conductor:done
    - conductor:cancelled
  include_closed: false               # Optional: dispatch closed issues? default false

polling:
  interval_ms: 30000                  # Optional: poll cadence in ms, default 30000

workspace:
  root: ~/conductor_workspaces        # Optional: default <tmpdir>/conductor_workspaces

hooks:
  after_create: |                     # Optional: run once when workspace is first created
    git clone https://github.com/your-org/your-repo.git .
  before_run: |                       # Optional: run before each agent attempt
    git pull --rebase
  after_run: |                        # Optional: run after each agent attempt (ignored on failure)
    echo "Run completed"
  before_remove: |                    # Optional: run before workspace deletion
    echo "Cleaning up"
  timeout_ms: 60000                   # Optional: hook timeout in ms, default 60000

agent:
  max_concurrent_agents: 10           # Optional: global concurrency limit, default 10
  max_turns: 20                       # Optional: max Claude turns per worker, default 20
  max_retry_backoff_ms: 300000        # Optional: max retry delay in ms, default 300000
  max_concurrent_agents_by_label:     # Optional: per-label concurrency limits
    conductor:active: 5

claude:
  command: claude                     # Optional: Claude Code CLI command, default "claude"
  permission_mode: acceptEdits        # Optional: default|acceptEdits|bypassPermissions
  allowed_tools:                      # Optional: restrict available tools
    - Read
    - Write
    - Bash
  turn_timeout_ms: 3600000            # Optional: per-turn timeout in ms, default 3600000
  stall_timeout_ms: 300000            # Optional: stall detection timeout, default 300000

server:
  port: 3000                          # Optional: enable HTTP dashboard on this port
---

Your prompt template goes here. Available variables:

- {{ issue.number }}       — GitHub issue number
- {{ issue.title }}        — Issue title
- {{ issue.body }}         — Issue body/description
- {{ issue.labels }}       — Array of label names
- {{ issue.url }}          — Issue URL
- {{ issue.identifier }}   — Human-readable identifier (e.g. "#42")
- {{ issue.priority }}     — Numeric priority (from priority:N label) or null
- {{ issue.created_at }}   — ISO-8601 creation timestamp
- {{ issue.updated_at }}   — ISO-8601 last-updated timestamp
- {{ attempt }}            — Retry attempt number (null on first run)
```

### Template Variables

The prompt template uses Liquid-compatible syntax. All `issue` fields are available:

```markdown
Issue #{{ issue.number }}: {{ issue.title }}

{{ issue.body }}

{% if attempt %}
Retry attempt: {{ attempt }}
{% endif %}

{% for label in issue.labels %}
- {{ label }}
{% endfor %}
```

## CLI Usage

```bash
# Basic usage
conductor

# Specify WORKFLOW.md path
conductor --workflow ./WORKFLOW.md

# Enable HTTP dashboard
conductor --port 3000

# Show help
conductor --help
```

## Trust and Safety

Conductor runs Claude Code autonomously. Understand the trust implications before deploying.

### Permission Modes

| Mode | Behavior | Recommended For |
|---|---|---|
| `default` | Interactive approval for sensitive operations | Development, unknown repositories |
| `acceptEdits` | Auto-approve file edits; prompt for shell commands | Trusted codebases |
| `bypassPermissions` | Auto-approve all operations | Sandboxed CI environments |

Start with `default` or `acceptEdits` unless you are running in a fully isolated environment.

### Workspace Isolation

- Each issue runs in a dedicated directory under `workspace.root`.
- Claude Code's working directory is validated against the workspace path before launch.
- Workspace paths are sanitized to prevent path traversal attacks.

### Recommendations

- Use `acceptEdits` permission mode as a baseline for most deployments.
- Use `bypassPermissions` only in network-isolated CI runners or Docker containers.
- Set `agent.max_concurrent_agents` conservatively when first testing.
- Monitor agent runs via the HTTP dashboard (`--port`) or structured logs.
- Keep `GITHUB_TOKEN` scoped to the minimum required permissions (`repo` for private repos,
  `public_repo` for public repos).

## License

Apache License 2.0. See [LICENSE](vendor/symphony/LICENSE) for details.

Conductor is a TypeScript implementation based on the
[Symphony specification](vendor/symphony/SPEC.md) by OpenAI (Apache 2.0).
