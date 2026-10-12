# Causal order and tamper evidence for the event stream

Research ticket #36, part of map #26. Desk research on primary sources plus the factory's own logs, read at commit `af3bdea` (the merged `intake/s1`), with the viewer read from `origin/viewer` (`fcb3c16`). Throwaway scripts ran from the session scratchpad and are not committed.

Source keys used below: **[L78]** Lamport 1978, **[M89]** Mattern 1989, **[CW09]** Crosby and Wallach 2009, **[RFC9162]**, **[V16]** Vendrov et al. 2016, **[CC-hooks]** the Claude Code hooks reference, **[Git]** Pro Git §10.2. Full references are at the end. Fidge 1988 could not be fetched (logged as `fetch.failed ref=fidge1988timestamps`), so every vector-clock claim here cites Mattern, who credits Fidge with the same idea found independently ([M89] §10).

## 1. The structure

**Events and processes.** A system is a set of processes. Each process is a sequence of events in a fixed order, and sending or receiving a message is an event ([L78] "The Partial Ordering").

**Happened-before.** `→` is the smallest relation where (1) a comes before b in the same process, (2) a sends a message that b receives, and (3) it is transitive. Two events are *concurrent* when neither happened before the other. `→` is an irreflexive partial order ([L78] Definition, "The Partial Ordering"). It is defined only by events that actually happened, with no reference to physical time (same section).

**Lamport clock.** A clock is any map C from events to numbers that satisfies the *Clock Condition*: a → b implies C(a) < C(b). Two rules give one: IR1, tick between successive local events; IR2, stamp each message with the sender's clock, and on receipt set the clock above that stamp ([L78] "Logical Clocks"). The converse does not hold: C(a) < C(b) does not imply a → b, so a scalar clock cannot detect concurrency (same section). Breaking ties by process id gives a total order that extends `→`, but it is "not unique" and "only the partial ordering ... is uniquely determined by the system of events" ([L78] "Ordering the Events Totally").

**The anomaly that matters here.** If precedence travels over a channel outside the system (Lamport's example is a phone call), no algorithm that sees only system events can order the two events correctly. The first remedy is to "explicitly introduce into the system the necessary information about the ordering" ([L78] "Anomalous Behavior").

**Vector clock.** Each process P_i keeps a vector C_i of length n, one slot per process. It increments its own slot on each event. Every message carries the sender's vector, and the receiver sets C_i := sup(C_i, t), the componentwise maximum ([M89] §7). Vectors are compared componentwise (u ≤ v iff u[i] ≤ v[i] for all i; u ∥ v iff neither u < v nor v < u; [M89] Def. 4). The main result is that the order is captured exactly: e < e′ iff C(e) < C(e′), and e ∥ e′ iff C(e) ∥ C(e′) ([M89] Thm. 10). If e occurs at P_i, a single comparison suffices: e < e′ iff C(e)[i] ≤ C(e′)[i] ([M89] Thm. 11).

**Cuts.** A cut is a left-closed prefix of every process. It is *consistent* when it is closed under `<`: if an event is in the cut, so is everything that happened before it ([M89] §3, Defs. 1 and 3). Cuts form a lattice (Thm. 1), and so do consistent cuts (Thm. 2). A cut X is consistent iff its time sup(C(c_i)) equals (C(c_1)[1], …, C(c_n)[n]) (Thm. 6). Only a consistent cut gives a meaningful global state ([M89] §4).

**Hash chain.** C_i = H(C_{i−1} ‖ X_i). A proof that two commitments are consistent, or that one event is a member, must include every intermediate event ([CW09] §3.1).

**Merkle tree (CT form).** MTH({}) = HASH(). MTH({d0}) = HASH(0x00 ‖ d0). For n > 1, with k the largest power of two below n, MTH(D_n) = HASH(0x01 ‖ MTH(D[0:k]) ‖ MTH(D[k:n])). The 0x00 and 0x01 prefixes provide the domain separation that second-preimage resistance needs ([RFC9162] §2.1.1). An *inclusion proof* is the list of nodes missing on the path from a leaf to the root (§2.1.3). A *consistency proof* shows that the tree over the first m entries is a prefix of the tree over n entries, which is "the append-only property" (§2.1.4). Both proofs are O(log n), against O(n) for a hash chain ([CW09] §3.4, Table 1). RFC 9162 notes that its tree is "essentially the same as the history tree" of [CW09] (§2.1.1).

**Tamper evidence requires an audit.** "If the log is never examined, then tampering cannot be detected" ([CW09] §2). Commitments must also reach auditors other than the logger, through gossip or public posting, or a logger can show different views to different parties ([CW09] §2.2; [RFC9162] §8.3, "consistency of the log view presented to all query sources").

## 2. Mapping

| What we log today | Where | What it becomes |
|---|---|---|
| Line order inside one activity file | `factory/agents/<run>/<agent>.jsonl` | Program order of process P_agent: [L78] condition (1) and rule C1. The line number already works as the local counter. |
| `agent` (the file name) | `log.mjs` `activityFile` | A process. Resumed agents (`a1f1f8b6c49ed7089`, `a9f6203f5bc1caf3e`, `aca88395f9aed1a30`) are one process with two start/stop spans. |
| `run` (the folder) | same | One system. Runs share only `decisions.tsv` and git, so cross-run order travels only through those two. |
| `agent.start` | hook, `SubagentStart` | The *receive* of a dispatch message. **Its send is not logged.** |
| `agent.stop` (+ the `SubagentHandback` report) | hook, `SubagentStop` | The *send* of a hand-back message. **Its receive is not logged.** |
| `artifact`, `check`, `fetch.failed` | agent's own file | Local events. Their `path`, `evidence` sha or `ref` is a payload the orchestrator reads later through files or git, which is an external channel in [L78]'s sense unless a decision cites it. |
| Decision row | `decisions.tsv` | A local event of process O (orchestrator). Its line number is O's counter for decisions. |
| Decision `evidence` naming an agent file, a `worktree-agent-<id>` branch, a sha in an agent's check, or an agent's artifact path | `decisions.tsv` | A receive edge from that agent's events into O. Recoverable for **22 of 73 rows** (path 11, sha 9, branch 4, file 3). |
| `supersedes line N` | `decisions.tsv`, parsed by `layout.js buildGraph` | Already implied by O's program order. Keep it as a typed edge, since it is semantic rather than causal. |
| `orchestrator.jsonl` | O's activity file | A **second log for the same process O**. It interleaves with `decisions.tsv` only by `ts`, so O has no single counter. |
| `ts` | stamped by `log.mjs` (ms) or written by hand in the TSV (whole seconds) | A physical clock reading ([L78] "Physical Clocks"). Keep it as an attribute, never as the order. |
| Git commits and their parents | the repo | Already a happens-before DAG over commits, since a commit names its parents ([Git] §10.2 "Commit Objects"). Example: `d4b3bae` is an ancestor of `30d0898`. |
| Git history of `decisions.tsv` | `trail.mjs historyCheck` | Prefix check against content-addressed commits. Each commit hash commits to its tree, which commits to the file blob ([Git] §10.2). This is the Merkle structure the trail check already rests on. |
| Audit verdict `(line, ts, verdict, …)` | `factory/audit/<run>.tsv` | A membership claim keyed by position and ts, **not by content**. |
| `check name=trail` evidence | O's activity file | The natural place for a tree head `(size, root)`, as the analogue of CT's Signed Tree Head ([RFC9162] §4.9–4.10). |

**Missing, and what each costs to start logging:**

- **Dispatch (O's send).** `SubagentStart` input carries `agent_id` and `agent_type` but no `tool_use_id` and no parent field ([CC-hooks] "SubagentStart input"). The orchestrator transcript does link them: the `Agent` tool result's `toolUseResult.agentId` names the child, next to the `tool_use` id. Example: `toolu_01GV1Ly9mWNWPWR99SWc1Yak` → `aad7a197d0fd66513` at 21:20:43.707Z. A `PostToolUse` hook matched on `Agent` (and on `SendMessage`, for resumes) could write `dispatch child=<agentId> tool_use=<id>` to `orchestrator.jsonl`. That needs one `SCHEMA` entry, one hook script entry and its tests. One line per dispatch. Not verified: whether `PostToolUse`'s `tool_response` for an async `Agent` launch carries `agentId`. The docs page section I read did not show it.
- **Hand-back receipt (O's receive).** No hook fires when a task notification reaches the orchestrator. The cheapest fix is a rule: a decision that acts on a hand-back cites `agent:<id>` in `evidence`, in the pointer grammar `trail.mjs` already has (`file:`, `commit:`, `transcript:`). The cost is discipline plus one trail-check rule.
- **`cause` on agent-written events.** This works today with no code change: `writeEvent` copies any extra `key=value` field into the event (`log.mjs`, the loop after the enum check). It needs an event id. `<run>/<agent>:<line>` is free at read time because files are append-only. A `seq` stamp in `log.mjs` would make the id explicit, at about 3 lines.
- **One counter for O.** Either O stamps `seq` on both of its logs, or decision rows get a pointer to the last `orchestrator.jsonl` line they follow. The TSV cannot take a seventh column: `read.mjs readDecisions` throws on anything other than 6 cells.

## 3. Questions it answers for the orchestrator

| Orchestrator decision today | Question the structure answers | How |
|---|---|---|
| **Merge** a worker branch | Was this agent dispatched after the merges it builds on? | The worker's `agent.start` vector has O-slot ≥ the merge event's O-counter ([M89] Thm. 11). Git ancestry answers this for code; the vector answers it for instructions and decisions, which git does not see. |
| **Re-dispatch** or follow up | Which hand-backs has no decision acted on? | An `agent.stop` that lies in the causal past of no O event is an unreceived message. Today 20 of 45 worker agents have no recorded receipt, 10 of them with `ISSUES`. In run `99ae39b6` that is all 14 workers, because the only citing row (line 66) points at the whole `factory/agents/99ae39b6…/` folder. |
| **Supersede** a row | Did the superseding row see the event that proved the old row wrong? Does an audit verdict still describe the same row content? | The superseding row should have the auditor's `agent.stop` in its past. Audit verdicts should carry the row's leaf hash, so a verdict cannot outlive an in-place edit (see §5). |
| **Declare done** | Is the "done" claim made at a consistent cut, with no hand-back in flight? | The final decision's causal past must contain every worker's last `agent.stop`. That is a consistent cut with no message crossing it ([M89] Def. 3, Thm. 6, §4). |
| **Pick the next ticket** | Is a "blocked by" relation already met, or only met by the clock? | A ticket is unblocked when its blockers' closing decisions lie in the causal past of the dispatch, not merely earlier by `ts`. The ticket DAG itself belongs to another ticket on the map; causal order only certifies that the dispatch saw the closes. |
| **Is a run stuck?** | Is the orchestrator waiting on an agent, or an agent waiting on the orchestrator? | A resumed agent's second `agent.start` has, as its cause, the `SendMessage` that resumed it. Without that edge a gap between two spans of one agent cannot be read. |

**How a view should draw it.** [M89] §2 separates the *time diagram* (positions are physical times) from the *poset diagram* (Hasse diagram with transitive edges omitted), and calls diagrams with the same causality relation *equivalent*: stretching a process line leaves the order unchanged (§3). For the swimlane that means:

1. Keep lanes and the `ts` axis, but draw each cause edge as an arrow, and flag any arrow that points backwards in `ts` (a clock or write-time inversion).
2. Selecting an event shades its causal past and future, the "light cone" analogy of [M89] §9. Everything left unshaded is concurrent with it, which is the concurrency region the ticket asks for.
3. Optionally, a causal mode lays events out by longest-path layer instead of `ts`. That is one valid equivalent diagram, and like any total extension it is not unique ([L78] "Ordering the Events Totally").

**How it feeds the high-dimensional node model.**

- **Typed edges:** `dispatch→start`, `stop→decision` (receive), `program-order`, and `cites` (evidence that is not a cause; see §4 finding 4).
- **Node feature:** the vector clock itself, an exact coordinate block. Vector order is the product order on ℕⁿ, and the map from events to vectors is an order isomorphism ([M89] Thm. 10). An order-embedding is a map that turns a partial order into coordinatewise order ([V16] §2.1, Def. 1, which uses the reversed product order on ℝ₊ᴺ). So a vector clock is a zero-violation order-embedding by construction, and its order-violation penalty E(x, y) = ‖max(0, y − x)‖² ([V16] §2.2, eq. 2) is exactly 0 on every causal pair.
- **Constraint on embeddings:** add the same penalty as a soft constraint, so that learned node vectors stay consistent with the causal edges. The model does not then have to learn order from text.
- **Size:** n is the number of processes in a run (up to 32 activity files per run so far). Because workers talk only to O (a star), a worker event's vector is O's vector at dispatch plus its own counter, so a compact feature is "O's knowledge at dispatch" plus the local count.

## 4. Worked example

**Slice.** Run `14c93a90`, 21:13–21:21Z: tickets #8 and #6 being merged. Processes O = orchestrator, S = `a348f65cf80b95b62` (#8 scout), F = `aac112601878aac33` (#6 fetch-page builder), M8 = `af97cbffc8783c39a` (#8 merger), M6 = `aad7a197d0fd66513` (#6 merger). Events come from their activity files, decision lines 16–20, and the two merge commits (git commit time). The two dispatch events come from the orchestrator transcript, because no factory log has them: `Agent` tool calls at 21:19:00.521Z ("Merge #8 into intake/s1") and 21:20:43.707Z ("Merge #6 into intake/s1"). Receive edges come only from what the rows cite: line 18 cites `research/tools/scout.md` and `d4b3bae`, line 19 cites branch `worktree-agent-aac112601878aac33`, line 20 cites `30d0898`. Vector components are `[O,S,F,M8,M6]`, computed by [M89] §7.

| ts (Z) | proc | vector | event |
|---|---|---|---|
| 21:13:29.366 | F | [0,0,1,0,0] | agent.start |
| 21:13:29.780 | S | [0,1,0,0,0] | agent.start |
| 21:17:43.709 | S | [0,2,0,0,0] | artifact research/tools/scout.md |
| 21:17:55.203 | S | [0,3,0,0,0] | agent.stop PASS |
| 21:19:00.521 | O | [1,0,0,0,0] | *dispatch M8 (transcript only)* |
| 21:19:03 | O | [2,0,0,0,0] | decision line 16 (closed #2) |
| 21:19:03 | O | [3,0,0,0,0] | decision line 17 (github-sync) |
| 21:19:05.479 | M8 | [1,0,0,1,0] | agent.start |
| 21:19:13 | M8 | [1,0,0,2,0] | commit d4b3bae (merge #8) |
| 21:19:22.695 | M8 | [1,0,0,3,0] | check npm-test |
| 21:19:25.305 | M8 | [1,0,0,4,0] | agent.stop PASS |
| 21:19:41 | O | [4,3,0,4,0] | decision line 18 (merged and closed #8) |
| 21:20:00.478 | F | [0,0,2,0,0] | check fetch-page-browser |
| 21:20:39.005 | F | [0,0,3,0,0] | agent.stop PASS |
| 21:20:43.707 | O | [5,3,0,4,0] | *dispatch M6 (transcript only)* |
| 21:20:49.455 | M6 | [5,3,0,4,1] | agent.start |
| 21:20:51 | O | [6,3,3,4,0] | decision line 19 ("accepted fetch page … merging") |
| 21:20:57 | M6 | [5,3,0,4,2] | commit 30d0898 (merge #6) |
| 21:21:10.134 | M6 | [5,3,0,4,3] | check npm-test-after-merge-6 |
| 21:21:12.852 | M6 | [5,3,0,4,4] | agent.stop PASS |
| 21:21:34 | O | [7,3,3,4,4] | decision line 20 (closed #6) |

**What it shows.**

1. **An effect before its cause in `ts` order.** Line 19 records the decision to merge #6, yet `readStream()` puts it 1.5 s *after* the merger it caused had started (21:20:49.455 vs 21:20:51). Causally, line 19 and M6's start are **concurrent** ([5,3,0,4,1] ∥ [6,3,3,4,0]). The real cause is the dispatch at 21:20:43.707, which the row records 7.3 s after the fact. Line 15 shows the same pattern: the row "asked #2 implementer to drop agent.stop events…" has ts 21:16:40Z, but the resumed implementer `a1f1f8b6c49ed7089` logged its second `agent.start` at 21:16:33.415Z, and the audit later dated the ask to the transcript at 21:16:32 (line 55). A decision row's `ts` is when it was written, not when it was acted on. This is [L78]'s anomalous behavior: the precedence ran through a channel the log does not see, the `Agent` tool call.
2. **The logs alone can't order the merges.** With only logged events, M6's start is `[0,0,0,0,1]`, so nothing shows that #6 was dispatched after #8's hand-back. With the two dispatch events, M6's start carries M8-slot 4: the #6 merge causally follows the whole #8 merge. Git agrees (`d4b3bae` is an ancestor of `30d0898`), but git only knows this because both are commits.
3. **How much order the missing sends hide.** Of the 143 cross-process pairs among the 19 logged events, 112 are concurrent when only the evidence-derived receive edges are used. Adding the two transcript dispatches orders 40 more, leaving 72 concurrent. With no evidence parsing at all, the logs have no cross-process edge, and all 143 pairs are concurrent. Lines 16 and 17 really are concurrent with all of M8's run, and the vectors say so.
4. **Evidence is not always a cause.** Lines 5 and 8 cite commit `17b5ee0`, made 547 s and 363 s *after* their ts. That evidence is a consequence of the decision. So evidence links must be typed `cites`. They can be promoted to happens-before edges only when the target is an event in the logs and lies in the row's causal past.

**`ts` problems across the whole committed log** (scratchpad script over `af3bdea`):

- Ties: 10 same-second ties among decision rows (for example lines 55/56 at 22:27:29Z). 3 exact-millisecond ties between agent starts (for example `a43c29c94c97a11d3` and `a60b83f0a28d46cce`, both at 23:00:36.127Z), which `sortByTs` breaks by directory read order.
- Mixed precision: decision rows are whole seconds, activity events are milliseconds.
- Back-dated and late rows: lines 2–10 were committed 1288–3440 s after their own ts (seeded from the spec session). Lines 61–65 are "logged late by the audit" and describe events from 20:36Z to 22:07Z under ts 22:27:33–37Z. Through `summarize`'s run-by-time-window rule they land in run `99ae39b6`'s timeline, not the runs where the events happened.
- Lifecycle oddities: 1 orphan stop (`a7b213c0b2d2af87a`, stop with no start), 1 double stop (`ae8a2d6aec826209c`, two `agent.stop` 11 s apart with no second start), 3 resumed agents.
- No row's ts is earlier than the row above it, and no row was committed before its own ts. So the log is monotone; the problem is semantics (write time vs act time), not clock skew. All writers share one machine clock.

**Tamper evidence on the same data.** I hashed the 73 decision rows (six cells joined by tab, UTF-8, no newline) by [RFC9162] §2.1.1 with SHA-256. MTH = `b59efd8db1ea097e…`; the hash-chain head is `4655381ec0b1b39d…`. 100 MTH computations took 10.8 ms in Node. Git covers the log only at commit granularity: 21 commits for 73 rows, with a row-to-first-commit lag of median 157 s and max 3440 s. Commit `9843fdb` deleted 10 activity files from history (orphan stop-only files). The deletion was legitimate, but no check notices it, because `trail.mjs` applies the append-only rule only to `decisions.tsv`.

## 5. Cost and fit

**Causal order.**

- **Data:** store edges, not clocks. A `dispatch` event, `cause=` and `agent:` pointers are enough. Happens-before is then program order ∪ cause edges, closed transitively, which is exactly [L78]'s definition.
- **Compute:** derive vector clocks at read time with one topological pass. That is O(V+E) plus O(V·n) vector work, with n ≤ the processes in a run. Today: 174 activity events + 73 rows. At 10,000 events and 50 processes per run: at most 500k small integers, under a second in Node, and sparse in practice because of the star topology.
- **Why not a Lamport counter:** a counter needs IR2's piggybacked stamp on the message ([L78] "Logical Clocks"). Our messages (the `Agent` prompt, the `SubagentStart` payload, the hand-back) give hooks nowhere to read one ([CC-hooks]). Even with a stamp, a counter only gives a linear extension and cannot answer "concurrent?" ([L78], converse of the Clock Condition).
- **Library:** none needed. The algorithm is a few dozen lines and has no dependency.

**Tamper evidence.**

- **Hash chain:** O(1) per row, but it needs a place to store the chain. A seventh TSV column breaks `read.mjs` and the show-me-your-work format, so the chain head would live outside the file.
- **Merkle tree (RFC 9162):** O(n) to compute from scratch, which at our size is 0.1 ms. O(log n) inclusion and consistency proofs ([CW09] Table 1) matter only for a verifier that does not hold the whole log: the cross-family reviewer, the #25 digest, or a root posted in a GitHub issue comment.
- **Libraries:** Node's built-in `crypto` covers SHA-256. Mature open-source implementations exist: `google/trillian` and `transparency-dev/merkle`, both Apache-2.0 per the GitHub API, both active as of 2026-10. Both are Go, so adopting either would add a toolchain for ~20 lines of logic. I don't recommend either.

**What each adds over the git check in `trail.mjs`:**

- *Granularity:* a tree head recorded at every `check name=trail` catches an in-place edit made between commits, at check time. The git check sees only committed versions.
- *Coverage:* the same prefix and tree-head rule over each activity file would catch silent deletions like `9843fdb`. A deletion would then need a decision row to pass.
- *Content binding:* an audit verdict that stores the row's leaf hash `HASH(0x00 ‖ row)` stays tied to that content. Today it is keyed by `(line, ts)` only.
- *External witness:* git history is local and rewritable. Crosby and RFC 9162 both rely on commitments seen by someone other than the logger ([CW09] §2.2; [RFC9162] §8.3). Posting `size` and `root` in the GitHub progress comments the orchestrator already writes gives that at no extra cost. A hash chain without a witness adds nothing git does not already give.

**How it reaches the orchestrator (#25 digest line):**

```
order: run 99ae39b6 — 41 events; 14/14 hand-backs not cited by any decision (8 ISSUES); 0 cause inversions; decisions 73 rows root b59efd8d…, consistent with last trail head
```

A query function beside `readStream()` would answer `causalPast(eventId)`, `concurrent(a, b)` and `unreceived(run)`.

**Dashboard:** cause arrows on the swimlane, flagged where they point backwards in `ts`, and the selected event's past and future shaded (see §3). The 3-D graph gains `dispatch` and `receive` edge layers next to `supersedes`, `mentions` and `evidence`.

## 6. Verdict

**ADAPT.**

- **Causal order: log edges, not clocks.** Add a `dispatch` event (PostToolUse on `Agent` and `SendMessage`) and a `cause` / `agent:` pointer convention. Derive vector clocks at read time. This is the smallest change that gives a sound happens-before, and it fixes the real inversions found above (lines 15 and 19). Adopting Lamport or vector clocks as stamped fields would need message piggybacking the hook payloads cannot carry, and stamps alone would not recover the unlogged dispatches.
- **Tamper evidence: RFC 9162 tree heads inside the existing trail check.** Record `(size, root)` for `decisions.tsv` and each activity file in the `trail` check event. Check consistency with the previous head by recomputing over the first m rows ([RFC9162] §2.1.2). Extend append-only to activity files, pin audit verdicts to leaf hashes, and post the root in issue comments as the outside witness.
- **What is skipped:** a hash column in the TSV, Merkle proof generation, and any library. At hundreds to thousands of rows the auditor reads everything, so log-size proofs buy nothing until a party without the log has to verify.

## Open questions for the node-model decision (#37)

- Does `PostToolUse` on an async `Agent` launch receive `agentId` in `tool_response`? If not, dispatch→start can only be joined through the transcript.
- Is a decision row an event at decision time or a record at write time? Lines 15 and 19 show the two differ by up to 8 s, and lines 61–65 by up to 1.5 h. The node model needs one meaning for `ts`.
- Should the vector-clock feature be per run (n = agents in the run) or the fixed-size "O's knowledge at dispatch" summary?
- Should activity files fall under the append-only rule, and how is a legitimate deletion like `9843fdb` recorded?
- Where is the external witness for tree heads: GitHub issue comments, the pushed `origin`, or both?

## Sources

- **[L78]** L. Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System", *CACM* 21(7):558–565, 1978. https://lamport.azurewebsites.net/pubs/time-clocks.pdf (sections cited by heading: "The Partial Ordering", "Logical Clocks", "Ordering the Events Totally", "Anomalous Behavior", "Physical Clocks").
- **[M89]** F. Mattern, "Virtual Time and Global States of Distributed Systems", *Parallel and Distributed Algorithms*, North-Holland, 1989. https://www.vs.inf.ethz.ch/publ/papers/VirtTimeGlobStates.pdf (§§2–4, 7–10; Defs. 1–5; Thms. 1, 2, 6, 10, 11).
- **[CW09]** S. A. Crosby and D. S. Wallach, "Efficient Data Structures for Tamper-Evident Logging", USENIX Security 2009. https://www.usenix.org/legacy/event/sec09/tech/full_papers/crosby.pdf (§2, §2.2, §3, §3.1, §3.4 Table 1).
- **[RFC9162]** B. Laurie, E. Messeri, R. Stradling, *Certificate Transparency Version 2.0*, RFC 9162, 2021. https://www.rfc-editor.org/rfc/rfc9162.txt (§2.1.1–2.1.4, §4.9–4.10, §8.3).
- **[V16]** I. Vendrov, R. Kiros, S. Fidler, R. Urtasun, "Order-Embeddings of Images and Language", ICLR 2016. https://arxiv.org/abs/1511.06361 (§2.1 Def. 1, §2.2 eq. 2).
- **[CC-hooks]** Claude Code hooks reference, "SubagentStart input", "SubagentStop input", "Common input fields". https://code.claude.com/docs/en/hooks (read 2026-10-11).
- **[Git]** S. Chacon and B. Straub, *Pro Git*, 2nd ed., §10.2 "Git Objects", "Commit Objects". https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
- Not read: C. J. Fidge, "Timestamps in Message-Passing Systems That Preserve the Partial Ordering", 11th Australian Computer Science Conference, 1988. The indexed copy at ics.uci.edu returned 404, and the QUT host does not resolve (`fetch.failed` logged).
- Factory files read: `CONTEXT.md`, `factory/read.mjs`, `factory/log.mjs`, `factory/decisions.tsv`, `factory/checks/trail.mjs`, `factory/hooks/subagent.mjs`, `factory/agents/**` (commit `af3bdea`); `factory/viewer/layout.js` and `factory/viewer.mjs` (`origin/viewer` at `fcb3c16`); orchestrator transcript `14c93a90-c178-4f4b-b20f-235aebe7f882.jsonl` (the `Agent` tool calls at 21:19:00.521Z and 21:20:43.707Z).
