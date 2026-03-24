# Documentation Site with Docus

> Track: docs-site-docus-20260324

## Overview

Create a documentation site for Agent Please using [Docus](https://docus.dev) (Nuxt-based documentation theme) at `apps/docs`. The site will serve as the primary documentation hub for end users setting up Agent Please and contributors working on the codebase. Deployed to Cloudflare Pages.

## Requirements

### Functional Requirements

- [ ] FR-1: Scaffold `apps/docs` as a Docus project integrated into the existing Bun + Turborepo monorepo
- [ ] FR-2: Getting Started section — installation, setup, WORKFLOW.md configuration, first run guide
- [ ] FR-3: Guides section — tracker setup (GitHub Projects v2, Asana), workspace hooks, chat bot integration, dashboard usage
- [ ] FR-4: Architecture section — system design, data flow, component overview (sourced from existing ARCHITECTURE.md)
- [ ] FR-5: Auto-generated sidebar navigation from content directory structure
- [ ] FR-6: Full-text search via built-in Docus search
- [ ] FR-7: GitHub integration — edit-this-page links, repository link in header
- [ ] FR-8: SEO metadata — title, description, Open Graph images for social sharing
- [ ] FR-9: Dark mode support (built-in with Docus)
- [ ] FR-10: Cloudflare Pages deployment configuration

### Non-functional Requirements

- [ ] NFR-1: English only (single locale, i18n can be added later)
- [ ] NFR-2: Consistent with existing monorepo conventions (Bun, Turbo tasks, ESLint)
- [ ] NFR-3: Content authored in Markdown with MDC syntax where needed
- [ ] NFR-4: Site builds and serves via `bun run dev` / `bun run build` through Turborepo

## Acceptance Criteria

- [ ] AC-1: `apps/docs` runs as a Docus site with `bun run dev` showing documentation at localhost
- [ ] AC-2: Sidebar navigation auto-generated from content structure
- [ ] AC-3: Getting Started, Guides, and Architecture sections contain initial content
- [ ] AC-4: Site builds successfully with `bun run build` producing static output for Cloudflare Pages
- [ ] AC-5: Turbo tasks (`dev`, `build`, `lint`, `check`) include the docs workspace

## Out of Scope

- API reference documentation (can be added in a future track)
- Multi-language / i18n support
- AI Assistant / MCP server features of Docus
- Nuxt Studio integration
- Custom Vue components or layouts beyond Docus defaults

## Assumptions

- Docus v4 is used (latest, Nuxt layer-based approach)
- `better-sqlite3` dependency required by Docus is acceptable
- Initial content will be scaffolded with placeholder structure; full content writing is a separate effort
- Cloudflare Pages supports Nuxt SSG output via `nuxt generate`
