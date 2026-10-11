# Spec: s1 paper intake and factory event log

## Problem Statement

I want to replicate **s1: Simple test-time scaling** (Muennighoff et al., 2025, arXiv 2501.19393) on hardware an ordinary person can afford. The authors fine-tuned a 32B model on 16 H100s. I have one RTX 5090, and I'm capping every run at 8 GB of GPU memory so the results hold for an RTX 5060.

Before I can plan a small-scale run, I need to know exactly what the paper did: the data, the hyperparameters, the evaluation protocol and the budget-forcing method. I also need to know which numbers I can trust. Reading the paper by hand means tables copied wrong, references I never check and claims I can't trace back. Agents can do the reading, but then I can't see what they did or why. I have no record of their decisions, no way to watch them work and no proof their notes match the paper.

Some references won't download with a script, and I don't want to fetch each one by hand while the agents wait on me.

## Solution

A team of agents reads s1, its tables and figures, its reference list, and its released code and data. They produce a **Tier 1 brief**: every number needed for a small-scale replication, each traced to a place in the paper and checked against the code or data.

Every step leaves a record. Agents write what they did to their own activity logs, and the orchestrator writes each decision to one decision log. A single reader merges both into one time-ordered **event stream**. The dashboard (a later piece of work) will read that same stream to show the agents and the decision tree live.

References get fetched in order: legal open-access copy first, then a direct download, then my Chrome. Anything still missing goes on a small local **fetch page** where I can drop the file in.

The intake is done when four scripted checks pass, not when an agent says so.

## User Stories

1. As a researcher, I want the paper, its LaTeX source, its released code and its dataset cards fetched into the repo, so that every later step works from the same primary sources.
2. As a researcher, I want a section-by-section summary of the paper, so that I can understand the method without reading it end to end.
3. As a researcher, I want every factual claim in the notes to have a stable ID and a section reference, so that I can trace any statement back to the paper.
4. As a researcher, I want every table extracted from the LaTeX source with exact values, so that I never rely on numbers copied by eye from a PDF.
5. As a researcher, I want every figure described with its axes, trend and key values, so that I can use figure results without opening the image.
6. As a researcher, I want a catalog of every reference with title, year, link and open-access status, so that I have a map of the field around s1.
7. As a researcher, I want each catalog row to say why s1 cites that reference, so that I can tell background citations from load-bearing ones.
8. As a researcher, I want references Tier 1 depends on flagged, so that only those get read in full.
9. As a researcher, I want the base model, datasets, benchmarks and budget-forcing baselines read and summarized, so that the Tier 1 brief rests on primary sources, not on s1's description of them.
10. As a researcher, I want each claim checked against the released code and data, with a verdict of VERIFIED, NOT VERIFIED or INCONCLUSIVE, so that I know which numbers to trust.
11. As a researcher, I want INCONCLUSIVE never counted as a pass, so that gaps stay visible.
12. As a researcher, I want two independent reviewers to check the notes, with their findings sorted into act on, consider, noted and dismissed, so that one agent's mistake doesn't go unchallenged.
13. As a researcher, I want a Tier 1 brief that lists the data, hyperparameters and evaluation protocol, each with its paper location, verdict and planned value for a model under 8B within 8 GB, so that I can write the replication spec straight from it.
14. As a researcher, I want a short report on GitHub repos and skills that teach agents to read papers and do research, so that I can adopt what already works.
15. As a researcher, I want legal open-access copies found first through arXiv, OpenAlex and Semantic Scholar, so that agents don't waste effort on paywalled pages.
16. As a researcher, I want references with no open copy marked closed and left alone, so that nothing tries to get around a paywall.
17. As a researcher, I want blocked downloads retried in a new tab of my own Chrome, so that most fetch failures resolve without me.
18. As a researcher, I want the agent to stop and ask when a page needs a login or a captcha, so that it never acts on my accounts without me.
19. As a researcher, I want a local fetch page that lists each still-missing reference with its title, link and the reason it failed, so that I can see at a glance what needs me.
20. As a researcher, I want to drag a file onto the fetch page and have it land in the right reference's folder, so that handing over a file takes seconds.
21. As a researcher, I want the fetch page reachable only from my own machine, so that nobody else can drop files into my repo.
22. As a researcher, I want downloaded files treated as untrusted data and never executed, so that a malicious download can't run code.
23. As a researcher, I want each fetched reference's status recorded as arxiv, oa, closed, fetch-pending or fetched, so that I can tell what's still outstanding.
24. As a researcher, I want every decision the orchestrator makes written to one decision log with a reason and an evidence pointer, so that I can audit the run after stepping away.
25. As a researcher, I want decisions arranged by a path-shaped phase such as intake/references/oa-check, so that the dashboard can draw them as a tree.
26. As a researcher, I want the decisions we already made (dropping the first paper, choosing s1, the 8 GB cap, research-first order, reference depth, fetch fallback, subagent approach) in the log from the start, so that the tree begins with its real history.
27. As a researcher, I want the decision log append-only, with wrong calls superseded by new rows rather than edited, so that history can't be rewritten.
28. As a researcher, I want agent starts and stops recorded automatically by hooks, so that an agent can't forget to log itself.
29. As a researcher, I want each agent to write only to its own activity file, so that parallel agents never corrupt each other's records.
30. As a researcher, I want a malformed event rejected with an error naming the missing field, so that bad records never reach the log.
31. As a researcher, I want an event with a field the hook payload couldn't supply recorded as unknown rather than dropped, so that the record stays complete.
32. As a researcher, I want one reader that merges all activity files and the decision log into a single time-ordered stream, so that every consumer sees the same history.
33. As a dashboard (piece C), I want a stable event schema and stable log locations, so that I can render agents and decisions without reading agent internals.
34. As the orchestrator, I want each worker to report PASS, ISSUES or BLOCKED with evidence, so that I can combine results without pasting raw output.
35. As the orchestrator, I want raw PDFs and LaTeX kept out of my context, with workers returning summaries, so that my context stays small enough to reason well.
36. As the orchestrator, I want to stop near 150k tokens of context, write a status note and split the remaining work into GitHub issues, so that the next session starts sharp.
37. As a researcher, I want a check that compares every table in my notes with the LaTeX source cell by cell, so that copying errors fail loudly.
38. As a researcher, I want a table the checker can't parse reported as INCONCLUSIVE, so that it gets checked by hand instead of passing silently.
39. As a researcher, I want a check that every bibliography key appears in the catalog with a valid status, so that no reference is missed.
40. As a researcher, I want a check that every parameter in the Tier 1 brief has a paper location and a verdict, so that the brief contains no unbacked numbers.
41. As a researcher, I want each check's result recorded in the event stream with its evidence, so that the dashboard can show pass and fail.
42. As a researcher, I want the decision log audited against the session transcript at the end of the run, so that the log tells the truth.
43. As a researcher, I want a model from a different family (my local qwen3.5:9b) to review the decision trail and flag weak evidence or skipped checks, so that the review isn't the same model grading itself.
44. As a researcher, I want the final reply to end with an Attention section listing those flags, so that I see the risks without reading the whole trail.
45. As a future replicator, I want the lessons from this run turned into edits to the skills, so that the next paper goes faster.
46. As a researcher, I want all notes written in plain language with no AI filler, so that they're quick to read.
47. As a researcher, I want work committed on a local branch one verified unit at a time, and to be asked before anything is pushed or published, so that nothing leaves my machine without my say-so.

## Implementation Decisions

**Modules**

- **Event writer.** A Node CLI with no dependencies. It takes an event type and fields, validates them against the type's required fields, stamps `ts`, `run` and `agent`, and appends one JSON line to the calling agent's own activity file. It rejects malformed events with an error naming the missing field. When a field comes from a hook payload that lacks it, the writer fills `unknown`.
- **Lifecycle hooks.** Claude Code `SubagentStart` and `SubagentStop` hooks call the event writer to record `agent.start` and `agent.stop` in the file of the agent they describe. They use whatever agent ID and type Claude Code passes.
- **Event reader.** It merges every activity file and the decision log into one stream ordered by `ts`. This is the interface the tests and the dashboard depend on.
- **Decision log.** The pstack **show-me-your-work** skill owns its format and its row-writing helper. Only the orchestrator writes to it. The `phase` column holds a slash path, and the tree is built from those paths.
- **Fetch page.** A Node HTTP server with no dependencies, bound to `127.0.0.1`. It lists open `fetch.failed` events that have no matching `artifact` event, and accepts a file drop per reference. The file is saved into that reference's raw folder and an `artifact` event is written. In piece C it becomes a panel of the dashboard.
- **Checks.** Four check scripts. Each writes a `check` event with `pass` or `fail` and evidence:
  - **Tables:** extracts every `tabular` from the LaTeX source and compares numeric cells with the extracted tables. Unparseable tables are INCONCLUSIVE.
  - **References:** every bibliography key appears in the catalog with a valid status.
  - **Brief:** every parameter row has a paper location and a verdict.
  - **Trail:** records the result of the decision-log audit and the cross-family review.

**API contract: log locations and event schema**

These are kept explicit because the dashboard depends on them.

- Decision log: `factory/decisions.tsv`, committed.
- Activity files: `factory/agents/<run-id>/<agent-id>.jsonl`, one per agent. The orchestrator uses agent ID `orchestrator`.
- Every event carries `ts`, `run`, `agent` and `type`. Required fields per type:

| type | fields |
|---|---|
| `agent.start` | `role`, `parent` |
| `agent.stop` | `role`, `status` (`PASS`, `ISSUES` or `BLOCKED`) |
| `artifact` | `path`, `kind` |
| `fetch.failed` | `ref`, `url`, `reason` |
| `check` | `name`, `result` (`pass` or `fail`), `evidence` |

- Reference statuses: `arxiv`, `oa`, `closed`, `fetch-pending`, `fetched`.

**Intake workflow**

- The pstack **figure-it-out** skill frames the run. The definition of done is that the four checks pass.
- The orchestrator fetches the sources first: the arXiv PDF, HTML and LaTeX source, a clone of `simplescaling/s1`, and the `simplescaling/s1K` and `simplescaling/s1K-1.1` dataset cards.
- The pstack **swarm** skill runs four parallel workers, each with a brief that stands on its own and its own output location:
  - **Section reader:** notes with claim IDs.
  - **Tables and figures:** exact tables and figure descriptions.
  - **Reference cataloger:** the full catalog with Tier 1 flags.
  - **Tool scout:** the report on research repos and skills.
- Then two dependent stages:
  - **Verifier:** the pstack **interrogate** skill with two independent reviewers, after the section reader.
  - **Key-reference readers:** 5 to 10 in parallel, after the cataloger and fetching.
- The orchestrator writes the Tier 1 brief last.
- All workers run on the parent model, per the user's pstack-on-Claude-Code instructions.
- **Fetch order for each Tier 1 reference:** an arXiv ID; then OpenAlex `best_oa_location` or Semantic Scholar `openAccessPdf`; then a direct download into a new empty folder; then a new Chrome tab through the Claude in Chrome extension; then the fetch page. A reference with no open copy is marked `closed` and nothing more is tried.
- **Cross-cutting rules:**
  - Workers return summaries and never raw sources (pstack **guard-the-context-window**).
  - Notes follow pstack **unslop**.
  - The run ends with the show-me-your-work audit, the `qwen3.5:9b` trail review and pstack **reflect**.

## Testing Decisions

- **What makes a good test:** it drives the system through the same entry point a user or agent uses, and asserts only on what they would see: the merged event stream, files on disk, or the rendered fetch page. A test that would still pass if every internal function returned nothing gets deleted.
- **Seam 1, the merged event stream (behavior).** The tests:
  - Event-writer CLI with a valid event, and with each type missing each required field.
  - Hook command fed start and stop payloads shaped like Claude Code's, including one missing the agent type.
  - Two writers appending at the same time: no corrupt lines and no lost events.
  - An HTTP file drop on the fetch page, then a check that the file landed and an `artifact` event appeared.
  - Each check script on fixture research files: one good set, plus one set with a wrong table cell, a missing bibliography key and an unbacked brief row. The good set must give `pass`. Each bad set must give `fail` with evidence naming the cell, key or row.
- **Seam 2, the fetch page in a real browser (UI).**
  - Load the page with two open `fetch.failed` events and confirm both rows show title, link and reason.
  - Drop a file through the UI and confirm its row leaves the list.
  - Take a screenshot as evidence and record a `check` event.
- **Not unit tested:** the agent research run itself (swarm, verifier, readers). Its gate is the four check scripts run on the real output.
- **Test runner:** Node's built-in `node:test`, with no dependencies. The browser seam uses the Claude in Chrome extension or the agent-browser skill. Tests for the event writer and fetch page are written before the code.
- **Prior art:** none. The repo has no code yet, so these tests set the pattern.

## Out of Scope

- Training or evaluating any model. That is piece B, which is specced from the Tier 1 brief.
- The live dashboard (Node, React, three.js) and its periodic screenshot checks. That is piece C. This spec only fixes the log locations and event schema it reads.
- The reusable skill tree. That is piece D, seeded by this run's reflect pass.
- Reading every reference in full. Only Tier 1 references are read.
- Fetching paywalled or closed papers by any means.
- Any GPU work.

## Further Notes

- **Hardware:** one RTX 5090, capped at 8 GB of GPU memory for every later run to match an RTX 5060. Models must be under 8B parameters. Qwen3.5-4B is the leading local candidate.
- **Cross-family review:** `qwen3.5:9b` is far weaker than the orchestrator. Its review is a sanity check, and the scripted checks carry the real weight.
- **Rate limits:** OpenAlex and Semantic Scholar throttle anonymous requests. The cataloger spaces its requests, retries, and logs references it could not resolve.
- **Chrome extension:** if it isn't connected, the Chrome step is skipped and references go straight to the fetch page.
- **Git:** work happens on branch `intake/s1`. Ask before pushing, opening issues or opening pull requests.
- **Tickets:** `/to-tickets #1` breaks this spec into tickets starting at #2, each with #1 as parent.
