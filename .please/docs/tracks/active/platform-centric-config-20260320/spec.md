# Refactor: Platform-Centric Config Structure

> Track: platform-centric-config-20260320

## Overview

Restructure `ServiceConfig` from the current `tracker` + `chat` split to a three-section model: **platforms** (credentials registry), **projects** (polling targets), and **channels** (conversational surfaces). This eliminates credential duplication, removes the single-tracker limitation, and provides a natural home for each platform's configuration.

## Scope

- **Code structure improvement**: Split `ServiceConfig` into `platforms`, `projects`, and `channels` sections with clear separation of concerns
- **Technical debt resolution**: Eliminate GitHub credential duplication across `tracker` and `chat.github`; remove single-tracker limitation
- **API/interface redesign**: New typed config interfaces (`PlatformConfig`, `ProjectConfig`, `ChannelConfig`) replacing the monolithic `TrackerConfig` + `ChatConfig`

### Key Changes

| Current | Proposed |
|---------|----------|
| `tracker` (single) | `projects[]` (N polling targets) |
| `chat.github` / `chat.slack` | `channels[]` (N conversational surfaces) |
| Credentials scattered | `platforms{}` (single credentials registry) |

## Success Criteria

- [ ] SC-1: New `ServiceConfig` types (`PlatformConfig`, `ProjectConfig`, `ChannelConfig`) compile with strict TypeScript
- [ ] SC-2: `buildConfig()` parser handles new YAML structure and resolves `$ENV_VAR` references
- [ ] SC-3: Orchestrator iterates over `projects[]` instead of single `tracker`
- [ ] SC-4: Webhook handler and chat bot plugin use `channels[]` for dispatch
- [ ] SC-5: All existing tests updated and passing with new config shape
- [ ] SC-6: WORKFLOW.md documentation and examples updated to reflect new format

## Constraints

- No backward compatibility required — this is a breaking change (project in active development)
- External behavior remains the same — orchestrator still polls, dispatches agents, and applies status labels
- Config `$ENV_VAR` resolution must continue to work for credential fields

## Out of Scope

- Adding new platform integrations (Linear, Asana) — only restructure existing GitHub + Slack support
- Multi-project polling logic — structure supports it but orchestrator can remain single-project iteration initially
- Migration tooling for existing WORKFLOW.md files

## References

- [GitHub Issue #151](https://github.com/pleaseai/agent-please/issues/151)
- [ADR: Config Structure — Platforms / Projects / Channels (PR #152)](https://github.com/pleaseai/agent-please/pull/152)
- [Chat SDK channels abstraction](https://chat-sdk.dev/docs/threads-messages-channels)
