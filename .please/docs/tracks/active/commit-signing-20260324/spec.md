# Commit Signing & Authenticated Remote

> Track: commit-signing-20260324

## Overview

Add commit signing support so that bot-created commits in agent workspaces appear as "Verified" on GitHub. Also configure authenticated remote URLs so agents can push without relying solely on `GH_TOKEN` env var passthrough.

Currently `agent-env.ts` injects `GIT_AUTHOR_*` / `GIT_COMMITTER_*` identity env vars and `GH_TOKEN`, but commits created by `git commit` lack cryptographic signatures and show as "Unverified".

This feature adds two signing strategies (SSH signing key, GitHub API commits) configured via WORKFLOW.md, and optionally rewrites the git remote URL with an embedded installation access token.

## Requirements

### Functional Requirements

- [ ] FR-1: Support **SSH signing key** strategy — write a user-provided SSH private key to the workspace root at orchestrator startup, configure `git config gpg.format ssh`, `user.signingkey`, and `commit.gpgsign true` in each agent workspace
- [ ] FR-2: Support **GitHub API commits** strategy — when enabled, set env vars or agent instructions so the Claude Code agent uses GitHub's `POST /repos/{owner}/{repo}/git/commits` API instead of `git commit` (commits are auto-signed by GitHub)
- [ ] FR-3: Add `commit_signing` section to WORKFLOW.md YAML front matter schema:
  ```yaml
  commit_signing:
    mode: ssh | api | none          # default: none
    ssh_signing_key: $SSH_SIGNING_KEY # env var reference for SSH mode
  ```
- [ ] FR-4: Parse and validate `commit_signing` config in the config layer (`config.ts`), resolving `$ENV_VAR` references
- [ ] FR-5: Add new `ServiceConfig` fields: `commit_signing: { mode, ssh_signing_key }` in `types.ts`
- [ ] FR-6: On orchestrator startup (when `mode: ssh`), write the SSH private key to `{workspace.root}/.ssh/agent_signing_key` with `0o600` permissions; persist for the orchestrator's lifetime
- [ ] FR-7: In `resolveAgentEnv()` or workspace setup, inject git config env vars when SSH mode is active:
  - `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_*`, `GIT_CONFIG_VALUE_*` for `gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`
- [ ] FR-8: Configure authenticated remote URL: rewrite workspace git origin to `https://x-access-token:<token>@github.com/{owner}/{repo}.git` when an installation access token is available
- [ ] FR-9: Cleanup: delete the SSH signing key file on orchestrator graceful shutdown

### Non-functional Requirements

- [ ] NFR-1: SSH private key must never appear in logs or agent env output
- [ ] NFR-2: Key file permissions must be `0o600` (owner read/write only)
- [ ] NFR-3: Backward compatible — `commit_signing` is optional; default `mode: none` preserves current behavior

## Acceptance Criteria

- [ ] AC-1: When `commit_signing.mode: ssh` is configured with a valid SSH key, commits made by the Claude Code agent in the workspace show "Verified" on GitHub
- [ ] AC-2: When `commit_signing.mode: api` is configured, the agent uses GitHub API to create commits which are auto-verified
- [ ] AC-3: When `commit_signing` is omitted or `mode: none`, behavior is identical to current (no signing)
- [ ] AC-4: Authenticated remote URL is configured when installation access token is available, enabling `git push` without additional auth setup
- [ ] AC-5: SSH key file is cleaned up on orchestrator shutdown
- [ ] AC-6: All existing tests continue to pass without modification

## Out of Scope

- GPG key-based signing (traditional GPG — too complex for automated setup)
- Per-issue signing key rotation (single key shared across all workspaces)
- GitHub App commit verification via the Commit API's `signature` field
- Signing for non-GitHub platforms (Asana doesn't have commit verification)

## Assumptions

- The SSH public key corresponding to the configured private key is already registered as a **Signing Key** on the GitHub account matching the bot identity
- For API commit mode, the Claude Code agent (via WORKFLOW.md prompt) can be instructed to use `gh api` instead of `git commit`
- `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_*` / `GIT_CONFIG_VALUE_*` env vars are supported by the git version available in agent workspaces
