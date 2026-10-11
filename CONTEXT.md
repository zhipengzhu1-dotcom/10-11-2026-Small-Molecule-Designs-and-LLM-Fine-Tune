# Context

Replicating s1 (arXiv 2501.19393) at small scale. Spec: GitHub issue #1.

## Factory logs

- **Event**: one JSON line with `ts`, `run`, `agent`, `type` and the type's required fields (issue #1). Written only through `factory/log.mjs`, which stamps `ts`, `run` and `agent`.
- **Activity file**: `factory/agents/<run-id>/<agent-id>.jsonl`. One per agent; an agent writes only its own. Committed.
- **Decision log**: `factory/decisions.tsv`, pstack show-me-your-work format, append-only, written only by the orchestrator. Committed. In the stream its rows are `type: "decision"` events with `agent: "orchestrator"` and `run: null` (the TSV has no run column).
- **Event stream**: `readStream()` in `factory/read.mjs`. Merges every activity file and the decision log by `ts`. Tests and the dashboard read only this. It throws on a corrupt line or an event filed under the wrong agent or run.
- **Factory root**: the main checkout, never the cwd. Resolved from `--root`, then `FACTORY_ROOT`, then `CLAUDE_PROJECT_DIR`, then the repo holding `factory/log.mjs`. Subagents run in worktrees, but their events land in the main checkout.

## Fetch page

- **Fetch page**: `npm run fetch-page` (`node factory/fetch-page.mjs [--root <repo>] [--port 4174]`), served on `127.0.0.1` only. Lists each **open** `fetch.failed` ref: no later `artifact` event with that `ref` field or a path under `research/refs/<ref>/raw/`.
- **Title**: the `fetch.failed` event's optional `title` field, else the `title` column of `research/refs/catalog.tsv` (keyed by a `bibkey`, `key` or `ref` column), else none.
- **Drop**: `POST /drop?ref=<ref>&name=<file>` with the file as the body. Saved to `research/refs/<ref>/raw/<sanitized name>` (never overwriting), then an `artifact` event (`kind: ref`, `ref`) is written as agent `fetch-page` in the run of the `fetch.failed` event it closes. Refused: a ref with no open failure, a ref that isn't a plain folder name, a foreign `Host`, a cross-site `Origin`.

## Run id and agent id

- **Run id**: the orchestrator's Claude Code session id. Hooks take it from the payload's `session_id`. The orchestrator passes its own with `FACTORY_RUN` or `--run`.
- **Agent id**: Claude Code's `agent_id` from the hook payload. The orchestrator's is `orchestrator`. Hooks record `parent: "orchestrator"` because the payload has no parent field.
- **Lifecycle hooks**: `.claude/settings.json` runs `factory/hooks/subagent.mjs` on `SubagentStart` and `SubagentStop` (they fire in the orchestrator session). It writes `agent.start` / `agent.stop`; a field the payload lacks becomes `unknown`. The stop `status` is the first `PASS`, `ISSUES` or `BLOCKED` in the subagent's final message.
- **Writer command**: on `SubagentStart` the hook injects `additionalContext` telling the subagent its agent id, run id and the exact command for its own events:
  `node "<main>/factory/log.mjs" --root "<main>" --run <run-id> --agent <agent-id> <type> key=value ...`
