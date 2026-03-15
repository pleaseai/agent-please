# .please/ Workspace Index

> Central navigation for all project artifacts managed by the please plugin.

## Directory Map

| Path | Purpose |
|------|---------|
| `state/` | Runtime session state (checkpoint, progress) — not tracked in git |
| `docs/specs/` | Feature specifications → [Specs Index](docs/specs/index.md) |
| `docs/plans/` | Implementation plans → [Plans Index](docs/plans/index.md) |
| `docs/decisions/` | Architecture Decision Records → [Decisions Index](docs/decisions/index.md) |
| `docs/investigations/` | Bug investigation reports (empty) |
| `docs/research/` | Research documents → [Research Index](docs/research/index.md) |
| `docs/knowledge/` | Knowledge base articles (empty) |
| `templates/` | Workflow templates (empty) |
| `scripts/` | Utility scripts (empty) |
| `references/` | Reference files → [References Index](references/INDEX.md) |

## Configuration

See [config.yml](config.yml) for workspace settings.

## Workflows

- `/please:spec` — Create feature specification
- `/please:plan` — Architecture design and task breakdown
- `/please:implement` — TDD implementation from plan file
- `/please:pr-finalization` — Finalize PR, move plan to completed, update tech debt
- `/please:do` — Route to appropriate workflow automatically
