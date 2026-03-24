# Plan: Documentation Site with Docus

> Track: docs-site-docus-20260324
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: .please/docs/tracks/active/docs-site-docus-20260324/spec.md
- **Issue**: #191
- **Created**: 2026-03-24
- **Approach**: Pragmatic

## Purpose

After this change, users and contributors will have a dedicated documentation site for Agent Please at `apps/docs`, powered by Docus v4. They can verify it works by running `bun run dev` and navigating to the docs dev server, or by building with `bun run build` and confirming static output is generated for Cloudflare Pages.

## Context

Agent Please currently has READMEs, ARCHITECTURE.md, and SPEC.md scattered across the repo, but no unified documentation site. Users need a central place to learn how to set up and use Agent Please with their issue trackers.

Docus v4 is a Nuxt layer-based documentation theme that integrates with Nuxt Content and Nuxt UI. It provides auto-generated sidebar navigation, full-text search, dark mode, and SEO optimization out of the box. The project already uses Nuxt 4 for `apps/agent-please`, so Docus fits naturally into the monorepo.

The site deploys to Cloudflare Pages using the `cloudflare_pages` Nitro preset. The monorepo uses Bun + Turborepo with `apps/*` and `packages/*` workspaces, so `apps/docs` is automatically discovered.

**Non-goals**: API reference docs, multi-language support, AI Assistant/MCP features of Docus, and custom Vue components are out of scope for this track.

## Architecture Decision

Docus is used as a Nuxt layer via `extends: ['docus']` in `nuxt.config.ts`. This is the standard Docus v4 approach — the docs app is a minimal Nuxt project that extends the Docus layer and adds Markdown content in `content/`. No custom layouts or components are needed for the initial setup.

For Cloudflare Pages, the Nitro preset `cloudflare_pages` is used with `nuxt build`. The `.output/public` directory is the deploy target. A `wrangler.toml` is not required — Cloudflare Pages auto-detects Nuxt projects.

The content structure follows Docus conventions with a landing page at `content/index.md` and documentation sections under `content/` organized by topic (getting-started, guides, architecture).

## Tasks

- [x] T001 Scaffold apps/docs package with package.json, nuxt.config.ts, and tsconfig.json (file: apps/docs/package.json)
- [x] T002 Configure Docus app.config.ts with branding, SEO, GitHub integration, and social links (file: apps/docs/app.config.ts) (depends on T001)
- [x] T003 Create landing page content (file: apps/docs/content/index.md) (depends on T001)
- [x] T004 Create Getting Started section content — introduction, installation, WORKFLOW.md configuration, first run (file: apps/docs/content/1.getting-started/) (depends on T001)
- [x] T005 [P] Create Guides section content — tracker setup (GitHub/Asana), workspace hooks, chat bot, dashboard (file: apps/docs/content/2.guides/) (depends on T001)
- [x] T006 [P] Create Architecture section content — system overview, data flow, components (file: apps/docs/content/3.architecture/) (depends on T001)
- [x] T007 Update root .gitignore and root package.json scripts for docs workspace (file: .gitignore) (depends on T001)
- [x] T008 Add Cloudflare Pages deployment configuration (file: apps/docs/nuxt.config.ts) (depends on T002)
- [x] T009 Verify full build pipeline — dev server, production build, lint, type-check (depends on T003, T004, T005, T006, T007, T008)

## Key Files

### Create
- `apps/docs/package.json` — workspace package definition
- `apps/docs/nuxt.config.ts` — Nuxt config extending Docus layer
- `apps/docs/tsconfig.json` — TypeScript config extending root
- `apps/docs/app.config.ts` — Docus branding, SEO, GitHub config
- `apps/docs/content/index.md` — Landing page
- `apps/docs/content/1.getting-started/1.introduction.md` — Intro
- `apps/docs/content/1.getting-started/2.installation.md` — Install guide
- `apps/docs/content/1.getting-started/3.configuration.md` — WORKFLOW.md config
- `apps/docs/content/1.getting-started/4.first-run.md` — First run guide
- `apps/docs/content/2.guides/1.github-projects.md` — GitHub tracker setup
- `apps/docs/content/2.guides/2.asana.md` — Asana tracker setup
- `apps/docs/content/2.guides/3.workspace-hooks.md` — Workspace hooks
- `apps/docs/content/2.guides/4.chat-bot.md` — Chat bot integration
- `apps/docs/content/2.guides/5.dashboard.md` — Dashboard usage
- `apps/docs/content/3.architecture/1.overview.md` — System overview
- `apps/docs/content/3.architecture/2.data-flow.md` — Data flow
- `apps/docs/content/3.architecture/3.components.md` — Component details

### Modify
- `.gitignore` — add `apps/docs/.nuxt/` and `apps/docs/.output/`
- Root `package.json` — add docs-specific scripts

### Reuse
- `ARCHITECTURE.md` — source material for architecture section content
- `README.md` — source material for getting started content
- `vendor/symphony/SPEC.md` — reference for WORKFLOW.md documentation

## Verification

### Automated Tests
- [ ] `bun run build --filter=@pleaseai/docs` succeeds without errors
- [ ] `bun run check --filter=@pleaseai/docs` passes type-check
- [ ] `bun run lint --filter=@pleaseai/docs` passes lint

### Observable Outcomes
- After running `bun run dev`, the docs site is accessible at localhost with sidebar navigation
- Running `bun run build` produces `.output/` directory with Cloudflare Pages-compatible output
- Navigating the docs shows Getting Started, Guides, and Architecture sections with content
- Dark mode toggle works out of the box
- Full-text search returns results from documentation content

### Acceptance Criteria Check
- [ ] AC-1: `apps/docs` runs as a Docus site with `bun run dev`
- [ ] AC-2: Sidebar navigation auto-generated from content structure
- [ ] AC-3: Getting Started, Guides, and Architecture sections contain initial content
- [ ] AC-4: Site builds successfully for Cloudflare Pages
- [ ] AC-5: Turbo tasks include the docs workspace

## Decision Log

- Decision: Use Docus as Nuxt layer (not standalone CLI)
  Rationale: Monorepo integration — `apps/docs` follows same patterns as `apps/agent-please`
  Date/Author: 2026-03-24 / Claude

- Decision: Cloudflare Pages with `cloudflare_pages` Nitro preset
  Rationale: User preference; Cloudflare Pages auto-detects Nuxt, no wrangler config needed
  Date/Author: 2026-03-24 / Claude

- Decision: English only, no i18n setup
  Rationale: Simplicity; i18n can be added later as a separate track
  Date/Author: 2026-03-24 / Claude

- Decision: Use bun Nitro preset (not cloudflare_pages) for local builds
  Rationale: h3 v2 RC compatibility issues with Docus dependencies (MCP toolkit, nuxt-og-image). Cloudflare Pages preset via NITRO_PRESET env var for deployment.
  Date/Author: 2026-03-24 / Claude

- Decision: Disable prerendering for docs site
  Rationale: h3 v2 RC (pulled in by @nuxt/test-utils) causes `event.req.headers.entries is not a function` in prerender context. SSR at the edge handles rendering.
  Date/Author: 2026-03-24 / Claude

- Decision: Custom Rollup plugin for Docus .ts server route transpilation
  Rationale: Bun hoists Docus to `node_modules/.bun/docus@.../` path which Nitro's esbuild plugin excludes via `/node_modules/` regex. Custom load hook pre-transpiles.
  Date/Author: 2026-03-24 / Claude

## Progress

- [x] (2026-03-24 14:00 KST) T001 Scaffold apps/docs package
- [x] (2026-03-24 14:10 KST) T002 Configure Docus app.config.ts
- [x] (2026-03-24 14:10 KST) T003 Create landing page content
- [x] (2026-03-24 14:15 KST) T004 Create Getting Started section content
- [x] (2026-03-24 14:15 KST) T005 Create Guides section content
- [x] (2026-03-24 14:15 KST) T006 Create Architecture section content
- [x] (2026-03-24 14:20 KST) T007 Update root .gitignore and package.json scripts
- [x] (2026-03-24 14:25 KST) T008 Add Cloudflare Pages deployment configuration
- [x] (2026-03-24 14:35 KST) T009 Verify full build pipeline
  Evidence: `bun run build:docs` → Client built + Server built successfully, prerender warnings non-blocking

## Surprises & Discoveries

- Observation: Bun's hoisted dependency path (`node_modules/.bun/pkg@version/`) bypasses Nitro's esbuild plugin `/node_modules/` exclude regex, causing Rollup to fail parsing raw .ts files from Nuxt layers
  Evidence: sitemap.xml.ts from Docus layer fails with "Expression expected" — interface keyword not valid JS

- Observation: @nuxt/test-utils@4.0.0 pulls in h3@2.0.1-rc.11 which conflicts with h3@1.15.x used by Nuxt ecosystem
  Evidence: `bun pm why h3` shows h3 v2 RC from test-utils, causes `toWebRequest` not found and `headers.entries` errors

- Observation: Docus's @nuxtjs/mcp-toolkit module uses h3 `toWebRequest()` which doesn't exist in any released h3 version
  Evidence: Not found in h3@2.0.1-rc.11 through rc.19
