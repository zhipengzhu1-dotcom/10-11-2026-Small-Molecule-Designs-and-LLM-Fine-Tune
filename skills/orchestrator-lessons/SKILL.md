---
name: orchestrator-lessons
description: "Local additions to implement-spec, implement and tdd, learned from the s1 intake run."
disable-model-invocation: true
---

# Orchestrator lessons

Additions to the upstream `implement-spec`, `implement` and `tdd` skills, from the s1 intake run's reflect pass (issue #12). An upstream update overwrites edits made in those skills, so the lessons live here. Where the two disagree, this file wins.

## The orchestrator routes

The orchestrator merges, reads evidence and talks to the user. Code edits, fetches and deliverable text all go to subagents, so its context lasts through the final gates: code review and the trail audit.

When a merger reports ISSUES, the ticket stays open and the fix goes to the original implementer by SendMessage. The message starts with `git reset --hard <integration branch>`.

## Context budget (after step 6)

At every frontier step, check context use against the spec's budget. While the run marker names your session, the context meter (`factory/hooks/context-meter.mjs`) adds a `Context meter: N tokens in context` line after each prompt and tool call: use that N. Estimate from the conversation's length only when no meter line shows. Once it's over budget, finish the merges in flight, post the status note and hand off.

## Binding constraints

Keep every binding constraint in one shared **brief**, in the user's exact words and with its scope: who and what it covers. When one changes, update the brief and SendMessage every running agent whose output it touches, before any other work.

## Shared notes (step 2)

Agent worktrees branch from the orchestrator's checkout (`worktree.baseRef: head` in `.claude/settings.json`), so keep the main checkout on the integration branch while agents run. `.worktreeinclude` copies gitignored source data into each new worktree, so agents use repo-relative paths. Data an agent needs that the file doesn't list gets a line there before the fan-out. Notes go in a fixed folder outside the session scratchpad, linked from the status note.

The lifecycle hooks log only the run the marker names. Before the fan-out, run `node factory/run-marker.mjs start --run <session-id> --branch <integration branch>` in the main checkout, and run `node factory/run-marker.mjs stop` at close-out.

## Push asks (step 3)

Every push ask carries a recommendation and its risks. Ask about a one-off push and a standing push policy as two separate questions. A yes covers only the one asked.

A push or PR gets no decision row: its commit would land after the push and strand. Git and GitHub hold the record, and the trail check rejects such rows.

## Fan-out (steps 4 and 6)

Every `Agent` launch's description follows `<role> #<n|-> <what>`: a lowercase role word, the ticket it serves (`#-` when it serves none), then the work, such as `implementer #53 pointer grammar`, `merger #53 into integration` or `audit #- trail rows 77-87`. During an orchestrated run, the description hook (`factory/hooks/agent-description.mjs`) refuses any other form, and the dispatch prompt you give each worker tells it to name its own subagents the same way.

**Smoke-test** each new kind of deliverable. Run one agent, confirm its write reached disk, then launch the rest. Claude Code refuses subagent writes to report-like files: `summary.md` was refused, while `notes.md`, `scout.md` and `review-a.md` went through. When a write is refused, rename the deliverable for the whole batch. If renaming fails, have one writer subagent take the bodies, so they stay out of the orchestrator's context.

## Reading the node model

The digest (`npm run digest`, the **Digest** in `CONTEXT.md`) answers the questions you face at the moments you already act. Read it at those moments, not on a schedule:

- **Dispatch**: before you write a worker's prompt, run `npm run digest -- dispatch <ticket>` and put the rows it lists into the prompt, by their `row:<N>` pointers, as the rules in force. Run `npm run frontier -- <spec>` first at each frontier step: the read finds blockers and the spec through the ticket-graph snapshot that the frontier logs.
- **Frontier**: right after `npm run frontier -- <spec>`, run `npm run digest -- frontier <spec>`. Start the zero-slack tickets it lists first, since any delay to them delays the spec. For each early start it lists (a ticket dispatched before a blocker's `Merge #<n>` commit), either log a row naming both tickets (`#<ticket>` and `#<blocker>`) that says why, or stop the work.
- **Done**: before you declare a spec done, run `npm run frontier -- <spec>` (so the snapshot lists the spec's stories), then `npm run digest -- done <spec>`. Each item it lists is residual doubt: give a story evidence, eliminate a challenge (`challenge.eliminated`, `decide --closes`, a later pass or PASS), settle an `undec` row, or accept it in a row that cites the read. Done means that list is known and accepted, not that four checks pass.

A read is one line when clean and at most about 15 lines, ending with `+N more: <command>` when cut; run that command only when the cut part matters to the action at hand.

The digest never acts. Log a decision row only when you act on something a read flagged, or deliberately defer it, and cite the transcript moment of the read (`transcript:<session>@<iso>`) in the evidence. A clean read, or one you only passed into a prompt, gets no row: the log records choices, not readings.

## Merges (step 5)

- Run one merger at a time in the main checkout.
- The merger writes the merge message (subject `Merge #<n>: <title>`, then the Co-Authored-By trailer) to a file with the Write tool and merges with `npm run merge -- <branch> -F <file>`, the **Merge script** in `CONTEXT.md`. A multi-line `-m` loses its newlines through npm on Windows. If the merge conflicts, the merger resolves it and commits.
- At close-out, run `npm run merge -- --factory-only -F <file>` (the file holds the trailer) before `run-marker.mjs stop`. It commits the last merger's `agent.stop` and the final decision rows.
- The merger re-runs every generator the branch touches, twice, and diffs the output. Any difference counts as ISSUES.
- If the merger finds a bug, the ticket stays open until the fix merges.

## GitHub sync (steps 5 and 8)

- Comment when a ticket starts and when it merges.
- Tick an acceptance box only against evidence the orchestrator opened itself. Leave boxes that wait on the user for the user.
- The spec issue stays open until step 7's code review lands.

## Close-out (after step 9)

The final reply opens with the user's to-do list, numbered, or with "Nothing is waiting on you." The run's record (CI, merges, cleanup, GitHub, memory) follows it.

## Tests (tdd)

Add **live-data-coupled** to the anti-patterns: a test that reads the project's real, growing data, such as a decision log or a catalog, breaks the test gate whenever that data grows. Tests run on fixtures. Rules about the real data belong in a data check the project runs.
