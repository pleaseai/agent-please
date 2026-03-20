# Config Structure: Platforms / Projects / Channels

**Date:** 2026-03-20
**Status:** Proposed
**Context:** Restructuring `ServiceConfig` to support multi-platform and multi-invocation-mode scenarios, replacing the current `tracker` + `chat` split.

## Decision

Restructure the WORKFLOW.md front matter config into three top-level sections:

| Section | Role | Cardinality |
|---------|------|-------------|
| `platforms` | Credentials and connection settings per service | N (registry) |
| `projects` | Where to pull work items from (polling) | N |
| `channels` | Where to receive conversations and commands (push) | N |

### Config Shape

```yaml
platforms:
  github:
    api_key: $GITHUB_TOKEN
    owner: myorg
    bot_username: my-bot
    # GitHub App auth (alternative to api_key)
    # app_id: $APP_ID
    # private_key: $PRIVATE_KEY
    # installation_id: $INSTALLATION_ID
  linear:
    api_key: $LINEAR_TOKEN
    team: engineering
    bot_username: agent-please
  slack:
    bot_token: $SLACK_BOT_TOKEN
    signing_secret: $SLACK_SIGNING_SECRET

projects:
  - platform: github
    project_number: 42
    active_statuses: [Todo, In Progress]
    watched_statuses: [Human Review]
    terminal_statuses: [Done, Cancelled]
    filter:
      assignee: []
      label: [agent]
  - platform: linear
    active_statuses: [Todo, In Progress]
    filter:
      label: [agent]

channels:
  - platform: github
    allowed_associations: [OWNER, MEMBER, COLLABORATOR]
  - platform: slack
  - platform: linear
```

### Invocation Model

Channels receive input that is routed by type:

```
Channel input
  |
  +-- /command arg   --> CommandHandler (orchestrator control)
  |                      e.g., /status, /run #123, /stop #123
  |
  +-- @bot free text --> AgentDispatch (code work)
  |                      single or multi-turn, posts reply in-thread
  |
  +-- (no prefix)    --> ignore or thread-context routing
```

Projects feed the orchestrator polling loop:

```
Orchestrator.tick()
  for each project:
    fetchCandidateIssues(project)
  merge into unified candidate pool
  sort by priority/age
  dispatch (shared concurrency limits)
```

### Type Definitions (Sketch)

```typescript
interface ServiceConfig {
  platforms: Record<string, PlatformConfig>
  projects: ProjectConfig[]
  channels: ChannelConfig[]
  // ... agent, workspace, polling, hooks, etc. (unchanged)
}

interface PlatformConfig {
  kind: 'github' | 'linear' | 'asana' | 'slack'
  api_key: string | null
  bot_username: string | null
  // platform-specific fields via discriminated union
}

interface ProjectConfig {
  platform: string                    // key into platforms
  active_statuses: string[]
  watched_statuses: string[]
  terminal_statuses: string[]
  filter: { assignee: string[], label: string[] }
  // platform-specific: project_number, project_gid, etc.
}

interface ChannelConfig {
  platform: string                    // key into platforms
  allowed_associations?: string[]     // GitHub-specific
  commands?: boolean                  // enable slash commands
}
```

## Context

### Current Structure

The existing config has two top-level sections for external service integration:

- `tracker` (singular) — issue polling config with platform-specific fields mixed in
- `chat` — bot username + per-platform chat settings (GitHub associations, Slack tokens)

This creates several problems:

1. **Credential duplication** — GitHub auth appears in both `tracker.api_key` and is needed by `chat.github`. The same platform's credentials have no single source of truth.
2. **"Where is the GitHub config?"** — No single answer. GitHub settings are split across `tracker` (when kind is `github_projects`) and `chat.github`.
3. **Single tracker limitation** — Only one tracker can be configured. Multi-project polling (e.g., GitHub Projects + Linear simultaneously) is not possible.
4. **Chat surfaces are implicit** — Adding a new conversational surface (e.g., Google Chat) requires modifying the chat config schema rather than simply adding an entry.
5. **Slash commands have no home** — Future command support (e.g., `/status`, `/run #123`) doesn't fit cleanly into either `tracker` or `chat`.

### Inspiration

- **Open SWE** (LangChain) — Unified invocation model across Slack, Linear, and GitHub. Each invocation creates a deterministic thread ID; follow-up messages route to the same running agent.
- **chat-sdk.dev** — Threads/Messages/Channels abstraction where channels are the entry points for conversations.
- **Symphony SPEC** — Defines `tracker` as singular, but this is a v1 scope constraint, not an architectural limitation.

## Consequences

### Positive

- **Single source of truth per platform** — All GitHub config lives under `platforms.github`
- **Multi-project support** — Same platform can have multiple project entries (e.g., frontend board + backend board)
- **N chat surfaces** — Adding a new platform (Google Chat, Discord) is just a new entry in `channels`
- **Slash commands fit naturally** — Commands are routed through the same channel input router
- **Naming clarity** — `projects` maps 1:1 to the actual polling unit (GitHub Project, Asana Project, Linear Project/Team). `channels` aligns with Chat SDK terminology
- **Same platform, dual role** — GitHub can be both a project (issue polling) and a channel (comment dispatch) without config awkwardness

### Negative

- **Breaking change** — All existing WORKFLOW.md files need migration (acceptable: project is in active development, no external users yet)
- **Indirection** — `projects[].platform` references `platforms.github` by key, adding a lookup step compared to the current flat `tracker` config
- **Orchestrator complexity** — Multi-project polling requires merging candidate pools and deduplicating across sources

### Neutral

- Agent config (`agent`, `claude`, `workspace`, `hooks`) is unaffected
- The polling/webhook mechanism is unchanged; it just iterates over `projects` instead of a single `tracker`

## Alternatives Considered

### 1. Platform-Centric (Issue #151 Original)

```yaml
github:
  api_key: $GITHUB_TOKEN
  project_number: 42
  active_statuses: [Todo]
  bot_username: my-bot
  allowed_associations: [OWNER, MEMBER, COLLABORATOR]

linear:
  api_key: $LINEAR_TOKEN
  team: engineering
```

**Rejected because:**
- Mixes credentials, project config, and chat config in one section
- Cannot represent multiple projects on the same platform (two GitHub Project boards)
- Unclear which platform is the "tracker" vs "chat surface" when using Linear for tracking and GitHub for comments

### 2. Tracker + Chat (Current)

```yaml
tracker:
  kind: github_projects
  api_key: $GITHUB_TOKEN
  ...

chat:
  bot_username: my-bot
  github:
    allowed_associations: [...]
  slack:
    bot_token: $SLACK_BOT_TOKEN
```

**Rejected because:**
- Credential duplication across sections
- Single tracker limitation
- No natural home for slash commands
- "Where is the GitHub config?" has no single answer

### 3. Role-Based (trackers + channels)

```yaml
platforms: { ... }
trackers:
  - platform: github
    ...
channels:
  - platform: github
    ...
```

**Rejected in favor of `projects`** because:
- "Tracker" is a system-level term (GitHub, Linear), but the polling unit is a **project/board**
- `projects` maps directly to what's being polled: GitHub Project #42, Asana Project gid456
- Same platform with multiple boards is more natural as multiple `projects` entries than multiple `trackers` entries
