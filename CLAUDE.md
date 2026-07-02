# ElectroBard

A web-based sound board and music tool for tabletop RPG game masters. See `docs/vision.md` and `docs/requirements.md` for product context.

## Preferences

### Conciseness

Be extremely concise. Get to the point as efficiently as possible without loosing clarity. Sacrifice grammar for conciseness.

## Coding Style

Prioritise readability and testability in the code. Even those unfamiliar with the technologies used should be able to understand it. Add appropriate comments. Use clear interfaces, small, decoupled components, and dependency injection.

## Agent skills

### Issue tracker

Issues are tracked in **GitHub Issues** via the `gh` CLI. External PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

**Single-context** — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
