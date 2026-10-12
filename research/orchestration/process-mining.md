# Process mining and workflow nets on the event stream

Issue #33, map #26. Written 2026-10-11. Desk research only; nothing installed.

The question: can we find the process the agents actually ran from the event stream (`readStream()` in `factory/read.mjs`), check it against the process spec #1 intended, and use the result for the orchestrator's decisions and the high-dimensional node model?

Short answer: yes for conformance, no for discovery. The spec's blocked-by graph already *is* the reference model. Turned into a workflow net it is sound by construction, and replaying 22 real events against it finds two real deviations. Discovery algorithms have too few traces to work with, and PM4Py is AGPL Python. The parts worth keeping are small enough to write in Node against the stream we already have. The sources are listed at the end, and the citations use their short keys.

## 1. The structure

**Petri net.** A triple (P, T, F): finite sets of places P and transitions T, with arcs F ⊆ (P×T) ∪ (T×P) [Aalst98 §3.1 Def. 1; Murata89 Table 2]. A marking M ∈ ℕ^|P| puts tokens on places. A transition is enabled when each of its input places holds a token. Firing it removes one token from each input place and adds one to each output place. With incidence matrix A, a firing sequence with count vector x ∈ ℕ^|T| (the *Parikh vector*) reaches M = M₀ + Aᵀx. This *state equation* is necessary for reachability [Murata89 §V.B]. In an **acyclic** net it is also sufficient: M_d is reachable iff a non-negative integer x solves it [Murata89 §VI.C Thm. 16]. For general nets, reachability is decidable but needs at least exponential space [Murata89 §IV.A].

**Workflow net (WF-net).** A Petri net with one source place *i* and one sink place *o*, such that adding a transition t* from *o* back to *i* makes the net strongly connected. Equivalently, every node lies on a path from *i* to *o* [Aalst98 §4.1 Def. 6]. A token in *i* is a case to handle, and a token in *o* is a case handled [Aalst98 §4.1]. An AND-split or AND-join is an ordinary transition with several output or input places [Aalst98 §4.2, §5.2].

**Soundness.** A WF-net is *sound* iff three things hold: (i) from every marking reachable from [i], the marking [o] stays reachable; (ii) [o] is the only reachable marking with a token in *o* (proper completion); (iii) no transition is dead [Aalst98 §5.2 Def. 7]. It is sound iff the short-circuited net (with t*) is live and bounded [Aalst98 §5.3 Thm. 1]. Soundness of a free-choice WF-net can be decided in polynomial time [Aalst98 §5.4 Cor. 1].

**Marked graph.** A Petri net in which every place has exactly one input and one output transition [Murata89 §VI.B]. It is live iff every directed circuit holds a token [Murata89 §VI.B Thm. 7]. A live marked graph is safe iff every place lies on a circuit holding exactly one token [Murata89 §VI.B Thm. 9].

**Event log.** XES puts events into traces (one trace per case) inside a log. Its standard extensions name the case (`concept:name` on the trace), the activity (`concept:name` on the event), the resource (`org:resource`), the role (`org:role`), the UTC time (`time:timestamp`) and the lifecycle step (`lifecycle:transition`, standard model: schedule, assign, withdraw, reassign, start, suspend, resume, pi_abort, ate_abort, complete, autoskip, manualskip, unknown) [XES2 §4.1–4.4; concept/org/time/lifecycle `.xesext` files]. Object-centric process mining drops two assumptions: that there is a single case notion, and that each event belongs to exactly one case. Its events point to any number of objects of several types, which avoids *convergence* (one event copied into many cases) and *divergence* (repeated activity instances inside one case looking like loops) [Aalst19 §1, §3, §4 Defs. 1–3].

**What it gives us.** Nodes: places (conditions, such as "#3 closed and #4 may start") and transitions (start/close of a ticket, a check passing). Edges: the arcs F, typed by direction. Vectors: the marking M ∈ ℕ^|P| (where the run *is*), the Parikh vector x ∈ ℕ^|T| (what has *happened*), and conformance counts per trace.

## 2. Mapping

Every field below is in the stream today (`factory/read.mjs`; schema in CONTEXT.md, Factory logs). XES targets are from [XES2 §4].

| What we log | Becomes | Notes |
|---|---|---|
| `ts` | `time:timestamp` | Already ISO 8601 UTC with `Z`, as XES requires. |
| `run` | case of the *run* view; one object type in the object-centric view | Decisions carry `run: null` (#21), so in a run-level view they fall outside every case. |
| `agent` | `org:resource`; also the case of the *agent-lifecycle* view | 45 agent traces in the committed stream (31 in run 14c93a90, 14 in run 99ae39b6). |
| `type` = `agent.start` / `agent.stop` | activity "agent work", `lifecycle:transition` = `start` / `complete` | An exact match. A resumed agent (SendMessage) writes a second `agent.start` that cannot be told apart from a fresh one; XES has `resume` for it. |
| `role` | `org:role` | Always `general-purpose` in all 96 start/stop events, so it carries no information (#25 says the same). |
| `parent` | no XES attribute; a typed edge agent → agent | Hard-coded to `orchestrator` (#21). |
| `status` (PASS/ISSUES/BLOCKED) | event data attribute; a cost weight for alignments | It is an outcome, not a lifecycle step. |
| `check` `name`, `result` | activity `check:<name>`; a `pass` puts a token in the ticket's gate place | No ticket field, so the gate a check feeds must be guessed from its name. |
| `artifact` `kind`, `path`, `ref` | activity `artifact:<kind>`; `ref` is an object id (a reference) | |
| `fetch.failed` `ref` | activity on the reference object | It is closed later by an `artifact` with the same `ref` (fetch page, CONTEXT.md). That is a two-step lifecycle on the reference object. |
| `decision` `phase` | `project/implement/ticket-N` gives the ticket object; other phases are decision nodes | The ticket is the most useful case id, and only decisions carry it, as free text in the path. |
| `decision` `result` (started, closed, open, adopted …) | a rough `lifecycle:transition` for the ticket | Not uniform: there is no `closed #10` row at all. #10's close exists only on GitHub (closedAt 22:04:04Z). |
| `decision` text "supersedes line N" | typed edge decision → decision | Already parsed by `buildGraph` (`factory/viewer/layout.js`, branch `viewer`). |
| GitHub blocked-by (`gh api …/issues/N/dependencies/blocked_by`) | the reference WF-net (§4) | Lives outside the stream. Read on 2026-10-11: #3←2, #4←3, #5←3, #6←2, #7←5,6, #8←2, #9←3, #10←7, #11←4,9,10, #12←8,11. |

**What's missing, and what it costs.**

1. **A ticket id on `agent.start` and `check` events.** This is the precondition for everything below. For the worked example I had to infer which ticket each agent served from artifact paths and from branch names quoted in decision rows. *Cost:* the hook cannot know the ticket (the payload has no such field, CONTEXT.md, Lifecycle hooks). The cheapest route is one line in each dispatch prompt telling the agent to log `assign ticket=N` as its first event, plus an optional `ticket` field on `check`. That is one schema row in `log.mjs` and one test. #21 already lists the related contract drift.
2. **Ticket start and close inside the stream.** Close times live on GitHub; start times live only in decision free text. *Cost:* the orchestrator writes `ticket.start` / `ticket.close` (with `result=closed|wontfix`) through `log.mjs`, which is two calls per ticket. Or the digest reads `gh issue view N --json closedAt` each time, which needs the network.
3. **`resume` vs `start`.** *Cost:* the hook already opens the agent's own file. If that file already ends in `agent.stop`, it can write `lifecycle=resume`. This needs no agent cooperation.
4. **Cancel and skip.** A ticket closed `wontfix` should be XES `manualskip`. Without it, a dead successor looks like one that is merely late (§3). *Cost:* covered by `result=wontfix` in item 2.
5. **Progress between start and stop.** 21 of the 45 agent traces are just `agent.start > agent.stop`. Elapsed time tells "slow" from "fine", but not "slow" from "stuck". *Cost:* nothing to log. The digest can read the age of the agent's transcript file, which Claude Code writes as the agent works. The stop event records that file's path, so a running agent's path would have to be derived from its run and agent id.

## 3. Questions it answers for the orchestrator

| Orchestrator decision today | Question the net answers | How |
|---|---|---|
| **Pick the next ticket** (implement-spec's frontier) | Which tickets may start now? | Exactly the enabled `start` transitions under the current marking. This is the same rule the orchestrator follows by hand from blocked-by links, made into a query. |
| **Pick the next ticket** | Can this ticket ever unblock? | If a blocker is closed `wontfix` (a skip that produces no token), its successors become dead transitions, which breaks soundness criterion (iii) [Aalst98 §5.2 Def. 7]. In the acyclic ticket net, whether a ticket can still start is plain state-equation feasibility [Murata89 §VI.C Thm. 16]. At our size that is a walk up the blocker graph. |
| **Merge / close** | Is the gate met? | A ticket "gated by the X check" (#4, #5, #11) gets a gate place that only `check:X=pass` marks, and `close` consumes it. The net stays free-choice, so soundness remains polynomial [Aalst98 §5.4 Cor. 1]. |
| **Re-dispatch** | Has this agent been running longer than past agents doing the same job? | The sojourn time per state, annotated from past traces [Aalst11 §4.1, measurement l_sojourn], with a z-score threshold per activity, including activities still running [Stertz20 §III.B, Def. 1]. See §4.3 for real numbers. |
| **Re-dispatch** | Is an agent's own lifecycle broken? | Replay of each agent trace against start → running → stop (with resume). Orphan or double stops show up as missing tokens [Rozinat08 §4]. |
| **Supersede / audit** | Did the run do something the spec did not allow, and is that in the decision log? | Every alignment deviation (a log move or a model move [Adriansyah11 §III–IV]) should match a decision row explaining it. A deviation with no row is a gap row, like the audit's "logged late" rows in `factory/decisions.tsv`. |
| **Declare done** | Did the case complete properly? | Proper completion means a token in *o* and nowhere else [Aalst98 §5.2 Def. 7 (ii)]: `close #12` fired, and every gate place was consumed. |

**Token replay vs alignments.** Token replay fires the logged events in order, counts produced (p), consumed (c), missing (m) and remaining (r) tokens, and scores f = ½(1 − m/c) + ½(1 − r/p) [Rozinat08 §4, Metric 3]. It is linear in trace length and names the exact place where a token was missing, which here is a blocker edge. It is heuristic, though: it can misjudge fitness and cannot weigh one deviation against another [Adriansyah11 §I]. Alignments search with A* for the cheapest pairing of log and model, where each event is a synchronous move, a *log move* (inserted activity) or a *model move* (skipped activity). Costs can be set per activity [Adriansyah11 §I, §III–V]. For the orchestrator: replay says *where* the token flow broke. An alignment says *which story is cheapest*, for example "a close was logged late" rather than "three tickets started early". Use replay online and in the digest. Run alignments when a deviation needs explaining.

**Which discovery algorithm.** At the ticket level, none. We have the de jure model, so discovering one would only rediscover a worse version of it. For the agent level, if agents ever log more than start and stop:

- **Alpha** rediscovers a sound SWF-net (free-choice, no short loops) only from a *complete* log [Alpha02 §4 Thm. 4.10]. Completeness needs every possible direct succession to appear at least once. With k parallel branches that means up to k! interleavings, and the HeuristicsMiner authors note that 10 parallel activities is already a practical problem. Alpha also ignores frequency, so one noisy succession spoils it [Heuristics06 §2]. Our ten readers started within five seconds of each other in one run, so the log is nowhere near complete.
- **Heuristics miner** scores a ⇒ b = (|a>b| − |b>a|) / (|a>b| + |b>a| + 1) [Heuristics06 §2.1 eq. 1]. With one observation the best score is 1/2, and the authors say the threshold is sensitive to noise, concurrency and frequency [Heuristics06 §2.1]. A handful of runs gives no usable frequencies. It also guarantees neither soundness nor fitness [IM13 §2].
- **Inductive miner** always returns a process tree that fits the log, in polynomial time [IM13 §4 Thm. 3, §6 "Run Time Complexity"]. Every process tree translates to a sound block-structured WF-net [IM13 §3]. Rediscovering the true model still needs a directly-follows-complete log [IM13 §6.4]. It is the only one of the three worth running, and only as an offline view of how a ticket's agents actually ran.

## 4. Worked example

All rows are from the committed stream at `af3bdea` (`factory/agents/**`, `factory/decisions.tsv`) plus GitHub's `closedAt` and blocked-by data for #2–#12, read on 2026-10-11. The throwaway scripts (`replay.mjs`, `sojourn.mjs`) lived in the session scratchpad and were not committed.

### 4.1 The reference net from spec #1

Each ticket t gets transitions `s_t` (start) and `c_t` (close) with a place `r_t` between them. Each blocked-by edge u → t gets a place `b_u_t` from `c_u` to `s_t`. Source *i* feeds `s_2`, and `c_12` feeds sink *o*. Every ticket from #2 to #11 blocks at least one other, so every node lies on a path from *i* to *o*: this is a WF-net [Aalst98 Def. 6]. Every place has one input and one output transition, so the net is a marked graph. It is acyclic, so in the short-circuited net every circuit passes through t* and place *i*, which holds the single initial token. By [Murata89 Thm. 7] the short-circuited net is live. Every place lies on such a circuit with one token, so by [Murata89 Thm. 9] it is safe, hence bounded. By [Aalst98 Thm. 1] **the spec's ticket net is sound**. This holds for any acyclic blocked-by graph with one root and one final ticket, so checking soundness amounts to checking that the graph is acyclic.

### 4.2 Token replay of the real run

Start of t = the first event attributable to t; close = GitHub `closedAt`. Excerpt:

| ts (UTC) | event | source row |
|---|---|---|
| 21:12:02 | s_2 | `a8ac4f829492d7dc9.jsonl` agent.start (the #2 hooks smoke test; decision row 21:12:38) |
| 21:13:29 | s_3, s_6, s_8 | agent.start of `a9f6203f5bc1caf3e` (writes `paper-pdf` … `notes`), `aac112601878aac33` (branch named in row 21:20:51), `a348f65cf80b95b62` (artifact `research/tools/scout.md`) |
| 21:19:02 | c_2 | #2 closedAt |
| 21:29:17 | c_3 | #3 closedAt |
| 21:30:15 | s_4, s_5, s_9 | agent.start of `a8c3a0e644fed1580`, `aca88395f9aed1a30`, `aa77b1f85ed1233ca` + `aef9eae54254671a5` |
| 21:48:16 | c_5 | #5 closedAt |
| 21:50:47 | s_7 | `orchestrator.jsonl` artifact `ref=aime` |
| 21:54:45 | s_10 | ten reader agent.start events, 21:54:45–21:54:50 (decision row 21:55:02) |
| 21:58:04 | c_7 | #7 closedAt |
| 22:04:36 | s_11 | `a80af6a42eac91925` agent.start |
| 23:14:09 | c_12 | #12 closedAt |

Replaying all 22 events: **p = 27, c = 27, m = 4, r = 4, so f = 1 − 4/27 = 0.852.** The four missing tokens are `b_2_3`, `b_2_6` and `b_2_8` (#3, #6 and #8 started 5.5 min before #2 closed) and `b_7_10` (the #10 readers started 3.3 min before #7 closed). The same four places end up holding leftover tokens. Everything else fits, including #4/#5/#9 starting 58 s after #3 closed, #11 starting 32 s after #10 closed, and #12 after #8 and #11.

**Alignment.** At unit cost, the cheapest explanation of the first cluster is *one* model move `c_2` right after `s_2` plus one log move for the late `c_2`: cost 2. Matching `c_2` instead forces log and model moves for s_3, s_6 and s_8: cost 6. So the alignment reads "#2 was effectively done at 21:13 and closed late". That fits decision row 21:19:03: "closed #2 after the orphan-stop fix merged". The second cluster is a tie at cost 2: "#7 closed late" vs "#10 started early". By 21:52:29 both missing refs were fetched (rows at 21:52:29), so "closed late" is the true story. A higher cost for early starts than for late closes would make the alignment say so. Total optimal cost: 4.

**Gates.** The gate checks match by name, since checks carry no ticket. Each passed before its close: `check:references=pass` 21:44:11 before c_5 21:48:16; `check:tables=pass` 21:47:10 before c_4 21:53:26; `check:brief` fail 22:14:02, pass 22:14:11, then orchestrator pass 22:16:31, all before c_11 22:16:57; `check:trail=pass` 23:02:12 before c_12 23:14:09. The `tables`, `references` and `brief` passes at 22:29 and 23:02 belong to #12's close-out, not to #4, #5 or #11. Only a `ticket` field would let replay tell those apart.

**Agent-lifecycle replay.** 43 of 45 agent traces fit start → stop, counting the three resumed agents (`a1f1f8b6c49ed7089`, `a9f6203f5bc1caf3e`, `aca88395f9aed1a30`) as resumes. Two do not: `a7b213c0b2d2af87a` has an `agent.stop` with no start (21:11:59), and `ae8a2d6aec826209c` has two `agent.stop` events (22:58:46 and 22:58:57). Each is one missing token. Nothing in the decision log explains either one.

**Decision gap.** No decision row records starting #3/#6/#8 before #2 closed, or #10 before #7 closed. Row 21:55:02 records starting the readers but not that #7 was still open. Under the §3 audit rule, both are gap rows.

### 4.3 Sojourn times and a stuck-agent alarm

Agent sojourn (start → stop) over all 47 start/stop pairs: median 209 s, p90 548 s, max 1090 s, mean 253 s, sd 248 s. The ten #10 readers: 193, 212, 234, 254, 256, 264, 280, 287, 346, 375 s (mean 270, sd 56).

- **Leave-one-out on the readers.** Scored against the other nine, the slowest reader `a0fcdc03b51655c19` (375 s) has z = 2.61, so an alarm at κ = 2 fires on it. It and the next slowest, `ae5fa48fe26a4f337` (346 s), are exactly the two readers given *two* references (row 21:55:02: "paired r1+geminithinking and MATH+PRM800K"; `ae5fa48f` wrote two `summary` artifacts). The alarm is right that they were slower, and the extra workload explains why. Workload therefore belongs in the state features [Aalst11 §3.3–3.4 state abstractions] or in a per-activity κ [Stertz20 §III.B].
- **Pooled, without roles.** Against all agents, the #4 tables builder `a8c3a0e644fed1580` (1090 s) has z = 3.38 and the #5 cataloger `aca88395f9aed1a30` (863 s) has z = 2.46. Both passed (`PASS`, `ISSUES` with a passing `check:references`). These are false alarms caused by mixing a 7-second smoke test with a 1000-second builder, which is what happens when `role` is always `general-purpose`.
- **The alarm itself.** For a running agent, elapsed = now − `agent.start`. Raise the alarm when elapsed > μ + κσ of past agents with the same (role, workload). This is Stertz's rule for a task "still being executed" whose duration already exceeds the average [Stertz20 §III.B]. It needs no new events, only the ticket and role fields from §2.

## 5. Cost and fit

**Complexity at our scale.** Building the ticket net from the blocked-by graph costs O(V + E). Soundness for the plain ticket net is an acyclicity check, O(V + E) (§4.1). With gate loops the net is still free-choice, so polynomial [Aalst98 Cor. 1]. Token replay is linear in the events times the arcs per transition, so a few thousand events take milliseconds. Alignments are an A* search over the product of trace and net [Adriansyah11 §IV–V]. Wide parallel regions blow the state space up: ten readers modeled one by one give up to 2¹⁰ partial markings. That is fine at hundreds of nodes. At thousands, keep alignments offline, on demand, and per ticket. Sojourn statistics are a running mean and variance per activity class. All of it is CPU-only, so the 8 GB VRAM cap does not come into it and no model is involved.

**Library.** PM4Py (`process-intelligence-solutions/pm4py`) is mature. It is on release 2.7.23.9 (PyPI, 2026-10-09), with 248 releases since 0.1 in 2018-11. It ships `alpha`, `heuristics`, `inductive`, `tokenreplay`, `alignments`, `temporal_profile`, `transition_system` and `ocel` modules (GitHub API listing of `pm4py/algo`). But it is **AGPL-3.0-or-later** (PyPI `license_expression`; GitHub README). It is Python ≥ 3.11 and pulls in numpy, pandas, scipy, cvxopt, graphviz, lxml, matplotlib and networkx (PyPI `requires_dist`). Our factory is dependency-free Node, and this ticket forbids new dependencies. The parts we need (net from DAG, replay, gate places, sojourn z-scores) come to a few hundred lines of plain JS over `readStream()`. If anyone wants a cross-check, PM4Py's inductive miner and alignments could run once, outside the repo, in a throwaway venv. Not installed here.

**How it reaches the orchestrator.** One more block in the #25 digest, computed from `readStream()` plus the blocked-by graph. The example below is built from the real rows, with each line taken at the moment it would first have appeared (the `frontier` line as of 22:04:10Z):

```
conformance: f=0.85; early starts: #3,#6,#8 before #2 closed (5.5m), #10 before #7 closed (3.3m); no decision row for either
frontier: enabled #11 (all of #4,#9,#10 closed); dead: none
gates: #11 brief pass 22:16:31 (after fail 22:14:02)
running: a0fcdc03 375s, z=2.6 vs 9 readers (workload 2 refs)
lifecycle: a7b213c0 stop without start; ae8a2d6a stopped twice
```

**Dashboard.** Draw the ticket net with its current marking: tokens on blocker edges, enabled tickets highlighted, deviation edges in a warning color. Add p50/p90 sojourn bands for each lane's role to the swimlane view (`swimlanes()` in `factory/viewer/layout.js`).

**How it feeds the high-dimensional node model.**

- *Typed edges:* `blocks` (b_u_t), `gates` (check → ticket), `precedes` (directly-follows within a case [IM13 §6.1]), `deviates` (an alignment move, attached to the event and the ticket), and object links event → {run, agent, ticket, ref} [Aalst19 §4]. The object links avoid flattening the stream into one case notion.
- *Node features:* per ticket, the marking slice (which of its places hold tokens), lead time, missing and remaining tokens, and gate status. Per agent, sojourn z against its peer class, the lifecycle-fit flag and outcome status. Per run, the Parikh vector x ∈ ℕ^|T| and fitness f. These vectors are exact and small, and they can be concatenated onto the learned embeddings.
- *Constraint on embeddings:* a recommender that ranks "next ticket" by embedding similarity must be masked to the enabled transitions. The net is a hard constraint, not a soft feature. An embedding can never place a ticket on the frontier while its blocker places are empty.

These questions are answered exactly by symbolic queries at our scale. An embedding adds nothing to "is #11 enabled" or "did a gate pass". Any gain from the high-dimensional model has to come from the fuzzy questions (which past agent is this one like, which workload class), measured on the real logs as the map's Fog section asks.

## 6. Verdict

**ADAPT.**

- **Adopt.** Workflow-net semantics for the spec's ticket graph with gate places, which makes the net sound by construction. Token replay as the online conformance signal. Alignments with custom costs for explaining deviations. Sojourn-time alarms per (role, workload) class. All of these rest on decades of theory and are cheap at our scale. On real rows they already found two undocumented early starts, two broken agent lifecycles, and a false-alarm problem that the missing role field causes.
- **Change.** Treat the stream as object-centric (run, agent, ticket, ref) rather than as one XES case notion [Aalst19]. Write the few hundred lines in Node over `readStream()` rather than adopting PM4Py, which is AGPL, Python and heavy on dependencies.
- **Skip.** Process discovery at the ticket level (the reference model is given) and alpha or heuristics mining at any level (too few, too parallel traces). The inductive miner is worth a look only once agents log more than start and stop.
- **Precondition:** a ticket id on `agent.start` and `check` events, and ticket start and close events in the stream (§2 items 1–2, #21). Without them, every result above depends on guessing which ticket an agent served from file paths.

## Sources

Every PDF was fetched from the authors' own pages and read as text. The book *Process Mining: Data Science in Action* (2nd ed., Springer 2016) and the IEEE 1849 text are paywalled and were not read. The XES claims come from the XES working group's own definition and extension files.

- **[Aalst98]** W. M. P. van der Aalst, "The application of Petri nets to workflow management", *J. Circuits, Systems and Computers* 8(1):21–66, 1998. https://www.vdaalst.com/publications/p53.pdf
- **[Murata89]** T. Murata, "Petri nets: Properties, analysis and applications", *Proc. IEEE* 77(4):541–580, 1989. Copy on a university course site: https://elearning.unimib.it/pluginfile.php/1372798/mod_resource/content/2/Petri%20Nets%20analysis%20and%20applications.pdf (OCR text; theorem numbers checked against their statements).
- **[IM13]** S. J. J. Leemans, D. Fahland, W. M. P. van der Aalst, "Discovering block-structured process models from event logs – a constructive approach", Petri Nets 2013, LNCS 7927. https://vdaalst.com/publications/p719.pdf
- **[Rozinat08]** A. Rozinat, W. M. P. van der Aalst, "Conformance checking of processes based on monitoring real behavior", *Information Systems* 33(1):64–95, 2008. https://vdaalst.com/publications/p436.pdf
- **[Adriansyah11]** A. Adriansyah, B. F. van Dongen, W. M. P. van der Aalst, "Conformance checking using cost-based fitness analysis", IEEE EDOC 2011, pp. 55–64. https://www.vdaalst.com/publications/p630.pdf
- **[Alpha02]** W. M. P. van der Aalst, A. J. M. M. Weijters, L. Maruster, "Workflow mining: Which processes can be rediscovered?" (technical report version of the TKDE 16(9) 2004 alpha-algorithm paper). https://www.vdaalst.com/publications/p169.pdf
- **[Heuristics06]** A. J. M. M. Weijters, W. M. P. van der Aalst, A. K. Alves de Medeiros, "Process mining with the HeuristicsMiner algorithm", BETA WP 166, TU Eindhoven, 2006. https://www.vdaalst.com/publications/p314.pdf
- **[Aalst11]** W. M. P. van der Aalst, M. H. Schonenberg, M. Song, "Time prediction based on process mining", *Information Systems* 36(2):450–475, 2011 (preprint). https://www.vdaalst.com/publications/p609.pdf
- **[Stertz20]** F. Stertz, J. Mangler, S. Rinderle-Ma, "Temporal conformance checking at runtime based on time-infused process models", arXiv:2008.07262, 2020. https://arxiv.org/abs/2008.07262
- **[Aalst19]** W. M. P. van der Aalst, "Object-centric process mining: Dealing with divergence and convergence in event data", SEFM 2019, LNCS 11724. https://www.vdaalst.com/publications/p1056.pdf
- **[XES2]** C. W. Günther, E. Verbeek, *XES Standard Definition*, version 2.0, 2014. https://xes-standard.org/_media/xes:xesstandarddefinition-2.0.pdf. Extension files: https://www.xes-standard.org/concept.xesext, `org.xesext`, `time.xesext`, `lifecycle.xesext`.
- **PM4Py:** https://github.com/process-intelligence-solutions/pm4py (README and license sidebar); https://pypi.org/pypi/pm4py/json (version, `license_expression`, `requires_dist`, release dates); GitHub contents API for `pm4py/algo/{discovery,conformance}`.
- **Factory and spec:** `CONTEXT.md`, `factory/read.mjs`, `factory/decisions.tsv`, `factory/agents/**` at `af3bdea`; `factory/viewer/layout.js` on branch `viewer`; issues #1–#12 (`closedAt`, blocked-by dependencies), #21, #25, #26.
