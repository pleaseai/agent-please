---
seo:
  title: Agent Please — Autonomous Coding Agents at Scale
  description: Turn issue tracker tasks into autonomous Claude Code agent sessions. Zero-config with WORKFLOW.md as single source of truth.
---

# Agent Please

Turn issue tracker tasks into autonomous [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) agent sessions.

## Key Features

::card-group
  ::card{title="Poll-Based Orchestration" icon="i-lucide-refresh-cw"}
  Continuously polls issue trackers (GitHub Projects v2, Asana) and dispatches agent sessions for eligible issues.
  ::

  ::card{title="WORKFLOW.md Config" icon="i-lucide-file-text"}
  Version agent prompt and runtime settings alongside your code. Single Markdown file defines everything.
  ::

  ::card{title="Workspace Isolation" icon="i-lucide-folder-lock"}
  Each issue gets a dedicated directory with lifecycle hooks for safe, parallel agent execution.
  ::

  ::card{title="Bounded Concurrency" icon="i-lucide-gauge"}
  Global and per-state concurrent agent limits prevent resource exhaustion.
  ::

  ::card{title="Multi-Tracker Support" icon="i-lucide-git-branch"}
  GitHub Projects v2 (PAT or GitHub App) and Asana (PAT, section-based status, webhooks).
  ::

  ::card{title="Dashboard & Observability" icon="i-lucide-layout-dashboard"}
  Nuxt-based HTTP dashboard with real-time orchestrator state and session history.
  ::
::

## Get Started

::card-group
  ::card{title="Installation" icon="i-lucide-download" to="/getting-started/installation"}
  Install Agent Please and set up your first project.
  ::

  ::card{title="Configuration" icon="i-lucide-settings" to="/getting-started/configuration"}
  Learn how to configure WORKFLOW.md for your repository.
  ::

  ::card{title="Guides" icon="i-lucide-book-open" to="/guides/github-projects"}
  Set up GitHub Projects, Asana, chat bots, and more.
  ::

  ::card{title="Architecture" icon="i-lucide-boxes" to="/architecture/overview"}
  Understand the system design and data flow.
  ::
::
