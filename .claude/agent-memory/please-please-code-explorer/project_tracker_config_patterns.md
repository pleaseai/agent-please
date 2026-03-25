---
name: tracker-config-patterns
description: TrackerAdapter interface, fetchIssuesByStates return type, config/workflow loading flow, ServiceConfig structure
type: project
---

## TrackerAdapter interface

Defined at `packages/core/src/tracker/types.ts:14`.

```typescript
interface TrackerAdapter {
  fetchCandidateIssues: () => Promise<Issue[] | TrackerError>
  fetchCandidateAndWatchedIssues: (watchedStates: string[]) => Promise<CandidateAndWatchedResult | TrackerError>
  fetchIssuesByStates: (states: string[]) => Promise<Issue[] | TrackerError>
  fetchIssueStatesByIds: (ids: string[]) => Promise<Issue[] | TrackerError>
  updateItemStatus?: (itemId: string, targetState: string) => Promise<true | TrackerError>
  resolveStatusField?: () => Promise<StatusFieldInfo | null>
}
```

Return type pattern: all methods return `Promise<T | TrackerError>`. Callers must call `isTrackerError(result)` before consuming.

`fetchIssuesByStates(states: string[])` returns `Promise<Issue[] | TrackerError>`. Used by:
- `orchestrator.ts:904` — startup terminal workspace cleanup (fetches terminal-state issues to clean up old workspaces)
- NOT used during the main tick — the tick uses `fetchCandidateAndWatchedIssues` instead

## Issue type (packages/core/src/types.ts:30)

Key fields: `id`, `identifier`, `title`, `description`, `priority`, `state`, `branch_name`, `url`, `assignees`, `labels`, `blocked_by: BlockerRef[]`, `pull_requests: LinkedPR[]`, `review_decision`, `created_at`, `updated_at`, `project: ProjectItemContext | null`

## Adapter factory

`packages/core/src/tracker/index.ts` — `createTrackerAdapter(project: ProjectConfig, platform: PlatformConfig): TrackerAdapter | TrackerError`
- `platform.kind === 'github'` → `createGitHubAdapter()`
- `platform.kind === 'asana'` → `createAsanaAdapter()`
- otherwise → `{ code: 'unsupported_tracker_kind', kind: platform.kind }`

## WORKFLOW.md → ServiceConfig flow

1. `loadWorkflow(path)` in `workflow.ts` — reads file, splits YAML front matter (between `---` delimiters) from prompt template body
2. `parseYaml(frontMatterLines)` via `js-yaml` → `Record<string, unknown>` stored as `WorkflowDefinition.config`
3. `buildConfig(workflow)` in `config.ts` — maps config sections to typed `ServiceConfig`
   - `buildPlatformsConfig(raw)` → `Record<string, PlatformConfig>` (keyed by platform name, e.g. `"github"`)
   - `buildProjectsConfig(raw, platforms)` → `ProjectConfig[]` (array from `raw.projects`)
   - All credential fields support `$ENV_VAR` syntax resolved via `resolveEnvValue()` at startup

## ServiceConfig key shapes

```typescript
ServiceConfig.platforms: Record<string, PlatformConfig>   // e.g. { github: GitHubPlatformConfig }
ServiceConfig.projects: ProjectConfig[]                   // each references a platform by name
ServiceConfig.workspace.root: string                      // where workspaces are created
ServiceConfig.polling.mode: 'poll' | 'webhook'
ServiceConfig.agent.max_concurrent_agents: number
```

`ProjectConfig` (per-project): `platform: string` (key into platforms), `project_number`, `project_id`, `active_statuses`, `terminal_statuses`, `watched_statuses`, `filter: IssueFilter`

## Orchestrator-to-tracker wiring (orchestrator.ts)

During `tick()` (line 199):
```
for (const project of this.config.projects) {
  const platform = this.config.platforms[project.platform]
  const adapter = createTrackerAdapter(project, platform)
  // check isTrackerError(adapter) before use
  const result = await adapter.fetchCandidateAndWatchedIssues(watchedStates)
}
```

Adapter is created fresh on each tick, not cached. No adapter singleton.
