# s1 paper intake and factory event log

Date: 2026-10-11. Status: draft for review. Branch: `intake/s1`.

## Context

This project replicates **s1: Simple test-time scaling** (Muennighoff et al., 2025, arXiv 2501.19393) at small scale. The authors fine-tuned Qwen2.5-32B-Instruct. We use a model under 8B parameters on one RTX 5090 with GPU memory capped at 8 GB to match an RTX 5060.

The project has four pieces, built in this order:

| Piece | Output | Spec |
|---|---|---|
| A. Paper intake | Verified notes on s1 and its references, and a Tier 1 brief | **This document** |
| B. Tier 1 replication | QLoRA SFT on s1K under 8 GB, evaluated with and without budget forcing | Later, from the Tier 1 brief |
| C. Factory dashboard | Node + React + three.js live view of agents and the decision tree, with screenshot checks | Later |
| D. Skill tree | Reusable skills extracted from what worked in A to C | Later |

This spec covers piece A and the logs every piece writes to.

## Goal

Produce a Tier 1 brief for s1 where every number traces to a location in the paper and has been checked against the released code or data. Along the way, catalog every reference with its open-access status and read the ones Tier 1 depends on.

## Non-goals

- Running any training or evaluation. That is piece B.
- Building the dashboard. That is piece C. This spec only fixes the log formats the dashboard will read.
- Reading every reference in full. Only Tier 1 references are read.
- Getting around paywalls. Closed references are catalogued, not fetched.

## Section 1: Logs

### Decision log

- File: `factory/decisions.tsv`, committed.
- Format: the pstack **show-me-your-work** skill owns it. One row per decision, append-only, with an evidence pointer on every row. Rows are written with that skill's `log.sh` helper.
- Single writer: only the orchestrator (the main Claude Code session) writes rows. Subagents report decisions in their results, and the orchestrator logs them.
- Tree: the `phase` column holds a slash path, such as `intake/references/oa-check`. The dashboard builds the decision tree from those paths.
- Seed rows: the decisions already made on 2026-10-11 are backfilled with phase `project/...`. These are dropping the first paper, choosing s1, the 8 GB cap, research-first order, reference depth, the fetch fallback and the subagent approach.
- End of run: audit the log against the transcript (per show-me-your-work), then have the local `qwen3.5:9b` model (Ollama) review the trail as the cross-family reviewer. The reply to the user ends with an "Attention" section from that review.

### Agent activity log

- One file per agent: `factory/agents/<run-id>/<agent-id>.jsonl`. No two agents write the same file.
- Claude Code `SubagentStart` and `SubagentStop` hooks write `agent.start` and `agent.stop` events automatically.
- Other event types: `artifact` (a file an agent produced), `fetch.failed` (a reference that could not be downloaded) and `check` (a verification result with pass or fail and evidence).
- Writer: `factory/log.mjs`, plain Node with no dependencies. It validates each event against its type's required fields, stamps `ts` and `run`, and appends one line. It rejects malformed events with an error naming the missing field.
- Agents write their own `artifact`, `fetch.failed` and `check` events with `log.mjs` into their own file. The orchestrator writes to `factory/agents/<run-id>/orchestrator.jsonl`. Hooks write `agent.start` and `agent.stop` into the file of the agent they describe.
- The hooks use whatever agent ID and type Claude Code passes them. If the payload lacks a field the table requires, the plan records the gap and `log.mjs` fills `unknown` instead of dropping the event.
- Readers merge all files at read time, sorted by `ts`.

Every event carries `ts`, `run`, `agent` and `type`. Required fields per type:

| type | fields |
|---|---|
| `agent.start` | `role`, `parent` |
| `agent.stop` | `role`, `status` (`PASS`, `ISSUES` or `BLOCKED`) |
| `artifact` | `path`, `kind` |
| `fetch.failed` | `ref`, `url`, `reason` |
| `check` | `name`, `result` (`pass` or `fail`), `evidence` |

## Section 2: Intake roles

The pstack **figure-it-out** skill frames the whole intake. Each claim gets a verdict of VERIFIED, NOT VERIFIED or INCONCLUSIVE, and INCONCLUSIVE never counts as a pass.

### Step 0: fetch (orchestrator)

Into `research/s1/source/`:

- arXiv PDF, HTML version and LaTeX source package for 2501.19393.
- A clone of `github.com/simplescaling/s1`.
- The Hugging Face dataset cards for `simplescaling/s1K` and `simplescaling/s1K-1.1`.

### Step 1: parallel workers (pstack **swarm**)

Each worker gets a brief that stands on its own, writes only to its own output path and reports `PASS`, `ISSUES` or `BLOCKED` with evidence. All workers run on the parent model.

| Role | Reads | Writes |
|---|---|---|
| Section reader | Paper text | `research/s1/notes/paper.md`: a summary per section, with every factual claim given an ID (`C-01`, `C-02`, ...) and its section |
| Tables and figures | LaTeX tables and figure image files | `research/s1/tables/<table-id>.md` with exact values, and `research/s1/figures/<figure-id>.md` describing axes, trend and key values read off the figure |
| Reference cataloger | The bibliography (`.bib` or `.bbl` from the source) | `research/s1/references.md`: one row per reference with key, title, year, arXiv or DOI link, open-access status, why s1 cites it and a Tier 1 flag |
| Tool scout | GitHub and the web | `research/agent-research-tools.md`: repos and skills that teach agents to read papers and do research, with a recommendation |

### Step 2: dependent workers

| Role | Depends on | Writes |
|---|---|---|
| Verifier (pstack **interrogate**, two independent reviewers) | Section reader's claims | `research/s1/verification.md`: each claim checked against the code (training config, hyperparameters, budget-forcing implementation) and the data, with verdict and evidence. Findings are sorted into act on, consider, noted and dismissed. |
| Key-reference readers, 5 to 10 in parallel | Cataloger's Tier 1 flags | `research/s1/refs/<key>.md` for the base model, datasets, benchmarks and budget-forcing baselines |

### Step 3: Tier 1 brief (orchestrator)

`research/s1/tier1-brief.md`: the data, hyperparameters and evaluation protocol from the paper, each with its paper location, verdict and the planned value for a model under 8B under the 8 GB cap. This is the input to piece B's spec.

### Cross-cutting rules

- **Context:** raw PDFs and LaTeX never enter the orchestrator's context. Workers return summaries (pstack **guard-the-context-window**).
- **Writing:** all notes follow pstack **unslop**.
- **Run end:** run pstack **reflect** on the transcript and turn lessons into skill edits. Those edits seed piece D.

## Section 3: Reference fetching

For each reference with a Tier 1 flag, in order:

1. **Find an open copy.** Use the arXiv ID if present. Otherwise query OpenAlex (`best_oa_location`) and Semantic Scholar (`openAccessPdf`). With no open copy, mark it `closed` and stop.
2. **Download directly** into a new, empty folder `research/s1/refs/raw/<key>/`. Downloads are untrusted data: never executed, and read only by tools that do not load code from that folder (Python runs with `-I`).
3. **Chrome fallback.** If the site blocks scripted downloads (403, JavaScript-only page, cookie wall), open it in a new tab through the Claude in Chrome extension and pull the text or PDF. Never reuse the user's existing tabs. Stop and ask on any login or captcha.
4. **Fetch page.** If it still fails, log `fetch.failed`. A local page, `factory/fetch-page/server.mjs` (Node, no dependencies, bound to `127.0.0.1`), lists open `fetch.failed` entries with title, link and reason, plus a drop zone. A dropped file is saved to that reference's raw folder and logged as an `artifact` event. The page becomes a panel of the dashboard in piece C.

Reference statuses: `arxiv`, `oa`, `closed`, `fetch-pending`, `fetched`.

## Section 4: Verification and definition of done

Checks are scripts in `factory/checks/`. Each one writes a `check` event.

Piece A is done when all four pass:

1. **Tables match the source.** `check-tables.mjs` extracts every `tabular` from the LaTeX source and compares each numeric cell with `research/s1/tables/*.md`. Any mismatch fails.
2. **References are complete.** `check-references.mjs` confirms that every bibliography key appears in `references.md` with a valid status.
3. **The brief is fully backed.** `check-brief.mjs` confirms that every parameter row in `tier1-brief.md` has a paper location and a verdict, and that no row is unexamined.
4. **The trail holds up.** `decisions.tsv` is audited against the transcript and reviewed by `qwen3.5:9b`, and the Attention flags are reported to the user.

Tests:

- `log.mjs` and the fetch page get `node:test` tests written before the code.
- The fetch page gets one screenshot check: drop a file, then confirm it lands in the right folder and appears in the log.

## Operating rules

- **Context budget:** if the orchestrator's context nears 150k tokens, stop. Write a status note, split the remaining work into GitHub issues following `docs/agents/issue-tracker.md` (label `ready-for-agent`, with blocking links), and continue in a fresh session.
- **Git:** work on local branch `intake/s1`, one commit per verified unit. Ask the user before pushing, opening issues or opening pull requests.
- **Hardware:** no GPU work happens in piece A.

## Risks

- **Cross-family review is weak.** `qwen3.5:9b` is far weaker than the orchestrator. Its review is a different-family sanity check, not a replacement for the scripted checks.
- **LaTeX table extraction.** Tables that use macros or `multirow` may not parse cleanly. `check-tables.mjs` reports unparsed tables as INCONCLUSIVE, not as a pass, and they are checked by hand.
- **Rate limits.** OpenAlex and Semantic Scholar throttle anonymous requests. The cataloger spaces its requests and retries, and logs any reference it could not resolve.
- **Chrome extension availability.** If the extension is not connected, step 3 is skipped and references go straight to the fetch page.
