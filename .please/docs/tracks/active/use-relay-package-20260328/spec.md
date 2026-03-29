# Use External Relay Packages

> Track: use-relay-package-20260328

## Overview

Replace the in-monorepo `packages/relay-client` and `packages/relay-server` with the external `@pleaseai/relay-client` and `@pleaseai/relay-server` packages published from [pleaseai/relay](https://github.com/pleaseai/relay). The external packages have an enhanced API (provider-based webhook handling, updated callback signatures) that supersedes the local implementation.

## Scope

### 1. Remove local packages
- Delete `packages/relay-client/` directory
- Delete `packages/relay-server/` directory
- Remove workspace references from root `package.json` (if any) and `bun.lock`
- Remove from `release-please-config.json`
- Remove from `turbo.json` pipeline (if referenced)

### 2. Install external packages from npm
- Replace `"@pleaseai/relay-client": "workspace:*"` with npm version in `packages/core/package.json`
- Replace `"@pleaseai/relay-server": "workspace:*"` with npm version in `apps/relay-worker/package.json`

### 3. Adapt core orchestrator
- Update `triggerRefresh` callback in `packages/core/src/orchestrator.ts` to accept `RelayEnvelope` parameter (new signature: `(envelope: RelayEnvelope) => void`)
- Update `packages/core/src/relay-transport.ts` re-export (may need adjustment for new `RelayEnvelope` fields: `provider`, `payload`)
- Update `packages/core/src/types.ts` import if needed

### 4. Update relay-worker
- Update `apps/relay-worker/src/index.ts` to work with the new provider-based `RelayParty` API
- The new `RelayParty.onRequest` requires `X-Relay-Provider` header and uses provider-based verification
- Update `apps/relay-worker/wrangler.toml` if `FORWARD_PAYLOAD` env var is needed

### 5. Update documentation
- Update `ARCHITECTURE.md` references
- Update `.please/docs/knowledge/tech-stack.md` project structure section
- Update package READMEs if applicable

## Success Criteria

- [ ] SC-1: `packages/relay-client/` and `packages/relay-server/` directories are removed
- [ ] SC-2: `@pleaseai/relay-client` and `@pleaseai/relay-server` are installed from npm registry
- [ ] SC-3: `packages/core` builds and type-checks successfully with the external relay-client
- [ ] SC-4: `apps/relay-worker` builds and type-checks successfully with the external relay-server
- [ ] SC-5: All existing tests pass
- [ ] SC-6: `bun run check` passes across all workspaces
- [ ] SC-7: `bun run lint` passes across all workspaces

## Constraints

- No special constraints — free to change as needed

## Out of Scope

- Adding new webhook providers beyond what the external package supports
- Modifying the external relay packages themselves
- Changing the relay-worker deployment infrastructure (Cloudflare Workers)
- Completing the previous `relay-package-split-20260326` track (superseded by this)
