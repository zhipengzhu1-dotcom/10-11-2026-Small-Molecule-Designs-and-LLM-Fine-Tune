# AGENTS.md

Target paper and current spec: GitHub issue #1. Its sub-issues are the tickets.

CI runs in a Docker container on this machine (Docker Desktop), never on GitHub Actions or any hosted runner.

## Rules and what enforces them

| Rule | Enforced by |
|---|---|
| CI is local Docker, no hosted runner | `scripts/rules.mjs` (run by `npm test`) fails on `.github/workflows/` |
| Tests run on fixtures, never the live log, audits or `research/` | `scripts/rules.mjs` names the line |
| A push tests the commit being pushed, with the data checks | `.githooks/pre-push` → `scripts/ci.mjs --pre-push` (`npm run hooks:install` once per clone) |
| The decision log is append-only and every row is audited | `npm run check:trail` |
| Audit evidence is tracked: no gitignored `file:` pointer | `npm run check:trail` |
| No decision row for a push or PR | `npm run check:trail` |
| A committed file under `research/**/raw/` has a row in `research/refs/catalog.tsv` or `research/licenses.tsv` with CC BY, CC BY-SA, CC0, MIT, or Apache-2.0 plus its license text in the same folder; the repo's own files are listed by path as `own work` in `research/licenses.tsv` | `npm run check:licenses` |
| Agent worktrees start at the orchestrator's branch, with the source data | `worktree.baseRef` in `.claude/settings.json`, `.worktreeinclude` |
| Long text goes through the Write tool and `--body-file`, not a heredoc | PreToolUse hook `factory/hooks/long-heredoc.mjs` |
| A ticket names its deliverables so subagent writes pass (`notes.md`, never a summary or report file) | `npm run check:ticket -- --body <file>` (or stdin); CI runs it on `docs/agents/ticket-template.md` |
| Subagents don't write shared git config: `git config` writes need `--worktree`; anything else is reported for approval | PreToolUse hook `factory/hooks/git-config.mjs` (Bash and PowerShell) |
| A model's VRAM is its `nvidia-smi` delta against 8 GiB, never Ollama's `/api/ps` | `npm run vram -- <model>...` |

## Agent skills

### Spec pipeline

Feature work runs `grilling` → `to-spec` → `to-tickets` → `implement` (one ticket) or `implement-spec` (a whole spec). The spec is the GitHub issue `to-spec` opens, and it lives only there: no copy in the repo to drift. When `brainstorming` fires on feature work, switch to `grilling`.

### Issue tracker

Issues live in this repo's GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
