# Context

Replicating s1 (arXiv 2501.19393) at small scale. Spec: GitHub issue #1.

## Factory logs

- **Event**: one JSON line with `ts`, `run`, `agent`, `type` and the type's required fields (issue #1). Written only through `factory/log.mjs`, which stamps `ts`, `run` and `agent`.
- **Activity file**: `factory/agents/<run-id>/<agent-id>.jsonl`. One per agent; an agent writes only its own. Committed.
- **Decision log**: `factory/decisions.tsv`, pstack show-me-your-work format, append-only, written only by the orchestrator. Committed. In the stream its rows are `type: "decision"` events with `agent: "orchestrator"` and `run: null` (the TSV has no run column).
- **Event stream**: `readStream()` in `factory/read.mjs`. Merges every activity file and the decision log by `ts`. Tests and the dashboard read only this. It throws on a corrupt line or an event filed under the wrong agent or run.
- **Audit**: `factory/audit/<run-id>.tsv`, one verdict (`ok` or `superseded`) per decision-log row, with the pointers the auditor checked. Written by the run that audited the log against the transcripts (pstack show-me-your-work). A wrong row is never edited: a later row supersedes it, and the audit names that row's line.
- **Trail review**: `factory/audit/<run-id>.review.md`, the cross-family model's review of the trail. Its `reviewed by <model>` line names the reviewer. Its flags go in the Attention section of the run's final reply. It is a sanity check, not a gate.
- **Trail check**: `npm run check:trail` (`factory/checks/trail.mjs`). Writes a `check` event named `trail`. Passes when the log is append-only against its git history, every row is well formed (no empty cell; a phase that is `start` or a lowercase slash path on the log's one tree), every row has a verdict whose pointers resolve, and every audit has a non-Claude review. Rules about the real log live here, not in unit tests.
- **Manual run**: a check run with no `--run` and no `FACTORY_RUN` files its event under run `manual`.
- **Factory root**: the main checkout, never the cwd. Resolved from `--root`, then `FACTORY_ROOT`, then `CLAUDE_PROJECT_DIR`, then the repo holding `factory/log.mjs`. Subagents run in worktrees, but their events land in the main checkout.

## Fetch page

- **Fetch page**: `npm run fetch-page` (`node factory/fetch-page.mjs [--root <repo>] [--port 4174]`), served on `127.0.0.1` only. Lists each **open** `fetch.failed` ref: no later `artifact` event with that `ref` field or a path under `research/refs/<ref>/raw/`.
- **Title**: the `fetch.failed` event's optional `title` field, else the `title` column of `research/refs/catalog.tsv` (keyed by a `bibkey`, `key` or `ref` column), else none.
- **Drop**: `POST /drop?ref=<ref>&name=<file>` with the file as the body. Saved to `research/refs/<ref>/raw/<sanitized name>` (never overwriting), then an `artifact` event (`kind: ref`, `ref`) is written as agent `fetch-page` in the run of the `fetch.failed` event it closes. Refused: a ref with no open failure, a ref that isn't a plain folder name, a foreign `Host`, a cross-site `Origin`.

## Viewer

- **Viewer**: `npm run viewer` (`node factory/viewer.mjs [--root <repo>] [--port 4175]`), served on `127.0.0.1` only, read-only (anything but `GET` gets 405). A quick stand-in for the dashboard (piece C): the page polls `GET /state?run=<run>` every 2 seconds and shows a swimlane timeline of the run's agents, a graph of the decision tree, the latest result of each check, the agents table and the event list. Black, white and grey only; status is told by fill (solid PASS, grey ISSUES, outline BLOCKED or unknown, pulse running).
- **Viewer files**: `factory/viewer/` holds `page.html` and the scripts `app.js`, `ui.js`, `layout.js`, `swimlane.js`, `graph.js`, served by name only at `/assets/<name>`. `layout.js` has no DOM and no three.js (graph, force layout, swimlane geometry), so `node:test` covers it. The diagrams load three.js `0.170.0` from jsDelivr through an import map; when it can't load, they show a note and the decision tree falls back to a plain list.
- **State**: `summarize(events, run)`. `run` defaults to the newest run. An agent with no `agent.stop` is `running`. Decisions have no run, so a run's timeline takes the decisions made between its first and last event; the newest run takes every later one too. The tree covers the whole decision log. If `readStream()` throws, `/state` returns 200 with the message in `error` and the page shows it as a banner.

## Run id and agent id

- **Run id**: the orchestrator's Claude Code session id. Hooks take it from the payload's `session_id`. The orchestrator passes its own with `FACTORY_RUN` or `--run`.
- **Agent id**: Claude Code's `agent_id` from the hook payload. The orchestrator's is `orchestrator`. Hooks record `parent: "orchestrator"` because the payload has no parent field.
- **Lifecycle hooks**: `.claude/settings.json` runs `factory/hooks/subagent.mjs` on `SubagentStart` and `SubagentStop` (they fire in the orchestrator session). It writes `agent.start` / `agent.stop`; a field the payload lacks becomes `unknown`. The stop `status` is the first `PASS`, `ISSUES` or `BLOCKED` in `last_assistant_message`. When that has none, the hook reads `agent_transcript_path` and uses the last `SubagentHandback` report, then the last assistant text block. If neither has one, the status is `unknown`.
- **Writer command**: on `SubagentStart` the hook injects `additionalContext` telling the subagent its agent id, run id and the exact command for its own events:
  `node "<main>/factory/log.mjs" --root "<main>" --run <run-id> --agent <agent-id> <type> key=value ...`
