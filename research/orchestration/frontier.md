# Ranking the ticket frontier: critical path, list scheduling, Little's law, value of information

Ticket #34, map #26. Desk research plus throwaway scripts kept outside the repo. Every number in the worked
example comes from committed activity files, the decision log, GitHub's issue-dependency API, or the two
orchestrator transcripts of runs `14c93a90` and `99ae39b6`. Source keys like [KW59] are listed at the end.
Statements marked **(derived)** are my own reasoning from the cited result, not a quote from it.

## 1. The structure

**Ticket DAG and critical path.** Each ticket is a job; a `Blocked by` link is an arrow from blocker to
dependent. Kelley and Walker assume "each job in a project is defined so that it is fully completed before
any of its successors can begin" and note this "is always possible to do" by how jobs are cut [KW59 Part I
§1, p.161]. With duration y_ij, the earliest event times are t_j(0) = max_i [t_i(0) + y_ij]. The latest
times t_i(1) come from a backward pass from the completion time [KW59 Part I §2, eq. 1-2, p.163]. A job whose
available time equals its duration is *critical*. A delay to a critical job delays the project. A chain of
critical jobs from origin to terminus is a *critical path*. Other jobs are *floaters*, and *total float* is
t_j(1) − t_i(0) − y_ij [KW59 p.163]. Kelley and Walker frame this as "management by exception": float tells
the people running a job "when to start worrying about a slippage" [KW59 Part I §2, p.162].

**Three-point estimates (PERT).** PERT asks the people responsible for each activity for an optimistic *a*, a
most likely *m* and a pessimistic *b* time [MRCF59 p.651]. It assumes a beta distribution with σ = (b − a)/6
and uses t_e = (a + 4m + b)/6 and σ²(t_e) = ((b − a)/6)² [MRCF59 eq. 1-2, p.652]. Slack is T_L − T_E per
event, where T_L is the "latest time" found by working backward from the objective date [MRCF59 Fig. 6 and
"Computation of the 'Latest Time'", p.655]. Kelley and Walker's critique: running expected times through
the max in eq. (1) "biases all the computed event times in the direction of the project start time" [KW59
Part II §9 "A Parallel Effort", p.171].

**List scheduling on m agents.** Graham's model: n identical processors, tasks with a partial order and
times μ, and a priority list L. A free processor starts the first *ready* task in L [G69 §2, p.416]. Bounds:

- Any list, against any other list: ω'/ω ≤ 1 + (n − 1)/n′, which is 2 − 1/n when n = n′, and this bound is
  best possible [G69 §3, Theorem 1, pp.419-420]. The proof gives a usable bound for one schedule: makespan
  ≤ (total work)/n + (1 − 1/n)·(longest chain) [G69 eq. 5, p.420] **(derived** reading of eq. 5).
- Longest-chain-first (critical path first), and "largest sum of descendant times" first: both are still
  only ≤ 2 − 2/(n + 1) of optimal in the worst case, "a slight improvement" [G69 §4, p.421].
- No precedence, longest task first: ≤ 4/3 − 1/(3n), best possible [G69 §5, Theorem 2, p.421].
- Anomalies: "relaxing ≺, decreasing μ, or increasing n can all cause ω to increase" [G69 §2-3, p.419].

**Little's law.** Over a window [0, T] that is empty at both ends, with A the area under n(t), L = A/T,
λ = N/T and W = A/N, so L = λW holds exactly [L11 §2.1.2, Theorem LL.1]. It needs no stationarity and no
assumed queue discipline [L11 §2.1.4]. It also holds with nonzero start and end queues [L11 §2.2.2, LL.2]
and per class of items [L11 §2.2.3(3)]. Little's own caution: on a finite window "we are in the measurement
business, not the forecasting business" [L11 §2.1.4]. Its main use is computing the third quantity from two
measured ones [L11 §2.3]. The generalization H = λG lets each item carry a cost f_i(t) while in the system
[L11 §3.2.1].

**Value of information.** The expected value of clairvoyance on x is the expected value with x revealed
before deciding minus the value without it: ⟨v_cx|ℰ⟩ = ⟨v|C_x,ℰ⟩ − ⟨v|ℰ⟩. The first term averages the best
decision for each revealed x over the prior on x [H66, "Clairvoyance", eq. 13-14, p.24]. "Clairvoyance has
economic value only when it might change the decisions to be made; otherwise it merely satisfies
curiosity" [H71 §8]. The expected value of clairvoyance "cannot be negative" [H71 §8, eq. 8.4]. The value of
clearing several uncertainties together "can have a value that differs from the sum" of clearing each alone
[H66 abstract]. In a worked case the joint value is less than the sum [HM81 §15.1, p.754]. An influence
diagram is a directed graph with no loops. Decision nodes are boxes and chance nodes are circles.
*Informational* arrows into a decision show exactly what is known when it is made. *Conditioning* arrows into
a chance node show what its probability is conditioned on [HM81 §10, p.735]. The "no forgetting" condition
holds when each decision node and its direct predecessors directly influence every later decision [HM81
§13, p.744]. The value of clairvoyance on a variable is computed by adding one informational arrow from that
variable to the decision, and it "furnishes an upper limit on the value of real information gathering"
[HM81 §15.1, p.750].

**Probability-free screen (derived).** EVPI(x) = E_x[max_d V(d,x) − V(d₀,x)], where d₀ is the decision taken
without x. Every term is ≥ 0, so EVPI(x) = 0 exactly when d₀ is optimal for every x that could happen. And
EVPI(x) ≤ max_x [max_d V(d,x) − V(d₀,x)], the maximum regret. Neither needs a probability. The first sorts
unknowns into zero and positive. The second ranks two unknowns whenever one's worst-case regret clearly
dominates the other's.

## 2. Mapping

| What we log today | Where | What it becomes here |
|---|---|---|
| GitHub `blocked_by` issue dependencies | GitHub API only (`issues/N/dependencies/blocked_by`) | DAG arrows [KW59 §1]. **Not in the event stream.** |
| `agent.start` / `agent.stop` `ts` | `factory/agents/<run>/<agent>.jsonl` | Agent sessions: n(t), area A, then L, λ, W per run [L11 LL.1] |
| `agent.stop` `status` (PASS / ISSUES / BLOCKED) | same | Rework loop. A resumed agent shows up as a second start/stop pair under the same id (`a9f6203f…`, `a1f1f8b6…`, `aca88395…`) |
| `artifact` events | same | The moment a blocker's work product exists. This is the edge that actually gates successors (see §4) |
| `check` events (e.g. `brief pass`) | same | PERT-style milestone events [MRCF59 p.646 abstract: "network of interrelated events"] |
| `fetch.failed` | same | An open chance node: an unknown not yet resolved |
| decision rows with phase `project/implement/ticket-N`, result `started` / `closed` | `factory/decisions.tsv` | Ticket dispatch and close. `layout.js` (PR #24) already parses `ticket-N` phases into nodes |
| decision rows like line 30 `project/implement/frontier` | same | The orchestrator's actual frontier choice, to compare against the ranked one |
| `INCONCLUSIVE` / `NOT VERIFIED` verdict and planned value per row | `research/s1/brief.md` tables | Candidate chance nodes and decision nodes of an influence diagram [HM81 §10] |
| assistant `usage` (input + cache tokens) | orchestrator transcript, outside `factory/` | Orchestrator context over time. Per ticket it is the item cost G in H = λG [L11 §3.2.1] |

**Missing, and what it would cost:**

1. **Ticket and role per agent.** Every `agent.start` says `role: general-purpose`. I had to recover the ticket
   from the transcript's `Agent` call `description` ("Implement ticket #4 tables+figures", "Merge #4 into
   intake/s1"). Cost: one orchestrator event per dispatch, written after the launch ack returns the
   `agentId` (`dispatch agent=<id> ticket=<n> role=implement|merge|review|reader`), about one log call per
   agent. This is the same gap as #21 and #25's "agent roles".
2. **The DAG itself.** `blocked_by` lives only in GitHub. Cost: a snapshot event or TSV written when tickets
   are filed (11 API calls for spec #1). Without it, `readStream()` can't compute slack.
3. **Duration estimates.** No *a/m/b* is recorded anywhere. One run gives exactly one realized duration per
   ticket, since each ticket runs once (§4). Cost: zero if estimates come from history by ticket *kind*
   (implement, merge, review, reader, research). That needs item 1 first.
4. **Unknown → planned-value links.** The brief records a verdict per row, but not which unknown a planned
   value is conditional on. Cost: one `depends_on` column in the brief tables.
5. **Context cost per hand-back or ticket.** Present only in transcripts. Cost: the `SubagentStop` hook already
   opens `agent_transcript_path` (CONTEXT.md, Lifecycle hooks). Recording the parent session's own context
   size would also need the parent transcript path in the payload, which should be checked before relying
   on it.

## 3. Questions it answers for the orchestrator

| Orchestrator decision today | Question this structure answers | Rule |
|---|---|---|
| **Pick the next ticket** ("first open, unblocked ticket in map order") | When ready tickets outnumber free agents, which goes first? | Lowest total float first, ties by longest tail chain (critical path first) [KW59 §2; G69 §4]. For independent tickets, such as #27-#36 now, longest expected duration first, which is within 4/3 − 1/(3m) of optimal [G69 Theorem 2]. When agents ≥ ready tickets, order doesn't matter (§4) |
| **Pick the next ticket** (research) | Is this research ticket worth an agent at all? | Zero-EVPI screen: if no answer it could return changes a planned value or a pending decision, its value is 0 [H71 §8] |
| **How many agents at once** | What WIP limit? | No gain past the frontier's width [G69 §3 eq. 4: makespan ≥ the length of any chain]. Beyond that the binding limit is context per session, not agents (§4). Don't assume more agents is never worse [G69 §2 anomalies] |
| **Merge** | Which finished ticket to merge first when several wait? | The one with less float, since its successors are critical. Measure the close queue with Little's law: L_q = λ·W_q [L11 §2.2.3(3), per class] |
| **Re-dispatch** | Is an agent stuck? | Elapsed time past the pessimistic bound *b* of its kind, or past estimate + total float, means it now delays the project [KW59 §2 "when to start worrying"; MRCF59 p.651 *b*] |
| **Supersede / wontfix** | Can a ticket be dropped? | A ticket whose EVPI fell to 0 because another ticket or a user decision settled its question. A zero-EVPI ticket on the critical path is the first candidate, because cutting it shortens the project |
| **Declare done** | Is the remaining work worth doing? | Done when the sink closes. Early stop for a decision ticket like #37: once every open research ticket that feeds it has EVPI 0, the decision can be made now [H71 §8; HM81 §15.1 upper bound] |

**Slack and value of information: two columns, not one score.** Slack is measured in minutes. EVPI is
measured in decision value. Combining them needs a time-to-value exchange rate we don't have. Also, values
of information don't add: the joint value can differ from the sum [H66 abstract; HM81 p.754]. So a sum of
per-unknown scores is not even a valid VOI for a ticket that resolves several unknowns. Recommendation:
keep both columns and sort lexicographically.

1. When agents are scarce, critical (slack 0) before floaters.
2. Among research tickets, EVPI > 0 before EVPI = 0. EVPI = 0 becomes a wontfix candidate, not a low priority.
3. Ties broken by longest tail chain.

**How it feeds the high-dimensional node model (map #26).** This structure contributes **typed edges** and
**node features**. It is not a learned embedding.

- Edges: `blocked_by` (ticket → ticket, gated on the blocker's artifact, §4); `resolves` (research ticket →
  unknown); `informs` (unknown → decision or planned value, an informational arc [HM81 §10]); `conditions`
  (unknown → unknown).
- Node features, recomputed on every event: point duration estimate, kind-history *a/m/b*, ES, LS, total
  float, tail-chain length, descendant count, critical flag, EVPI class {0, >0}, regret rank, context cost.
- Constraint on embeddings (a proposal for #27 and #30 to check, not a cited result): a vector layout must
  keep every `blocked_by` pair in order along some coordinate. And it should never be used to *predict*
  slack or the critical path. One linear pass computes those exactly (§5), so an embedding can only add error
  there. This bears on the map's first Fog item: for this piece, plain graph queries win.

## 4. Worked example: spec #1, run `14c93a90` (tickets #2-#11)

**Inputs.** Edges from `gh api repos/.../issues/N/dependencies/blocked_by`: 3←2, 4←3, 5←3, 6←2, 7←5,6, 8←2, 9←3,
10←7, 11←4,9,10 (12←8,11 ran in the next session and is left out). Dispatch times are the transcript's `Agent`
tool calls, mapped to agent ids through the launch ack. "Work available" is the merge agent's `agent.stop`,
or the orchestrator's decision row where there was no merge agent (#10 row 45 at 22:03:36, #11 row 50 at
22:16:46). Close is GitHub `closedAt`.

| Ticket | dispatched | work available | p (min) | closed | lead time (min) | ES | LS | total float | tail chain |
|---|---|---|---|---|---|---|---|---|---|
| #2 tracer | 21:01:14 | 21:11:58 | 10.7 | 21:19:02 | 17.8 | 0.0 | 0.0 | **0** | 74.75 |
| #3 sources + notes | 21:13:14 | 21:28:34 | 15.3 | 21:29:17 | 16.05 | 10.7 | 10.7 | **0** | 64.05 |
| #4 tables + figures | 21:29:50 | 21:49:08 | 19.3 | 21:53:26 | 23.6 | 26.0 | 43.25 | 17.25 | 31.5 |
| #5 reference catalog | 21:29:59 | 21:47:31 | 17.5 | 21:48:16 | 18.3 | 26.0 | 26.0 | **0** | 48.75 |
| #6 fetch page | 21:13:21 | 21:21:12 | 7.85 | 21:21:31 | 8.2 | 10.7 | 35.65 | 24.95 | 39.1 |
| #7 missing refs | 21:48:04¹ | 21:57:43 | 9.65 | 21:58:04 | 10.0 | 43.5 | 43.5 | **0** | 31.25 |
| #8 tool scout | 21:13:27 | 21:19:25 | 6.0 | 21:19:40 | 6.2 | 10.7 | 68.75 | 58.05 | 6.0 |
| #9 verify claims | 21:30:07 | 21:52:21 | 22.2 | 21:53:27 | 23.3 | 26.0 | 40.35 | 14.35 | 34.4 |
| #10 key-reference readers | 21:54:11 | 22:03:36 | 9.4 | 22:04:04 | 9.9 | 53.15 | 53.15 | **0** | 21.6 |
| #11 brief | 22:04:34 | 22:16:46 | 12.2 | 22:16:57 | 12.4 | 62.55 | 62.55 | **0** | 12.2 |

¹ #7 is dated from the fix sent to the #5 implementer (decision row 35). The aime fetch failure that opened
it was logged at 21:45 by the #5 merge agent (`ad35dec3…`, `fetch.failed`).

**Critical path:** #2 → #3 → #5 → #7 → #10 → #11, length **74.75 min**. Total work W = 130.1 ticket-minutes.
The realized makespan from #2's dispatch to the brief row is 21:01:14 → 22:16:46 = **75.5 min**, within 1% of
the critical-path bound. Measured against *close* times, the critical path is 84.45 min, *longer* than what
happened. The orchestrator started successors on the blocker's merged work or artifacts, before its close:
#3, #6 and #8 at 21:13 after #2's merge at 21:11:58 (close 21:19), and #10 at 21:54:11 after the aime and
geminithinking artifacts at 21:52:29 (rows 37-38; #7 closed 21:58). So in practice the edge means "blocker's
artifact exists", not "blocker closed". Kelley and Walker's fix fits: cut each ticket into a *work* job and a
*close* job, and draw the edge from work [KW59 §1].

**Does the priority rule matter here?** I simulated Graham list scheduling with the p column:

| agents m | lower bound max(CP, W/m) | Graham upper bound W/m + (1 − 1/m)·CP | map order | longest tail first | most descendants first |
|---|---|---|---|---|---|
| 1 | 130.1 | 130.1 | 130.1 | 130.1 | 130.1 |
| 2 | 74.8 | 102.4 | 79.7 | 79.5 | 79.7 |
| 3 | 74.8 | 93.2 | 74.8 | 74.8 | 74.8 |
| 4+ | 74.8 | ≤ 88.6 | 74.8 | 74.8 | 74.8 |

On this 10-node DAG the rules differ by 0.2 min at m = 2 and not at all from m = 3. The run actually peaked at
11 concurrent agents, during #10's reader fan-out. So ranking the frontier would not have shortened spec #1.
What the structure *does* show is float. #8 had 58 min of float and #6 had 25 min, so those two could have
waited without delaying anything.

**Little's law, measured.**

| Level | window | n | area | L = A/T | λ | W | λW | peak |
|---|---|---|---|---|---|---|---|---|
| agent sessions, run `14c93a90` | 21:12:02-22:16:01 (64.0 min) | 33 | 165.0 agent-min | 2.58 | 0.516/min | 5.00 min | 2.58 | 11 |
| agent sessions, run `99ae39b6` (#12) | 22:21:21-23:01:01 (39.7 min) | 14 | 33.0 agent-min | 0.83 | 0.353/min | 2.36 min | 0.83 | 3 |
| tickets #2-#11 (dispatch → close) | 21:01:14-22:16:57 (75.7 min) | 10 | 145.75 ticket-min | 1.93 | 0.132/min | 14.6 min | 1.93 | — |
| orchestrator close queue (last implement stop → close) | same | 10 | 20.8 ticket-min | 0.27 | 0.132/min | 2.1 min | 0.27 | 2 (#4, #9 at 21:49-21:53) |

λW equals L exactly, as LL.1 says it must on a window that is empty at both ends [L11 §2.1.2]. That is a
consistency check on the event stream, not a finding. The findings are in the ratios. The orchestrator's
close queue held 0.27 tickets on average, so merging was not the bottleneck; the DAG was. Two sessions
(`a3e2cb2c…` 0.7 min, `a7b213c0…` with no start) come from the hooks being installed mid-run (decision row
13). They are excluded from the agent rows.

**Context cost per ticket (H = λG).** Orchestrator prompt size (input + cache tokens of each assistant turn):
81.1k when #2 was dispatched, 391.98k at the last turn (22:17:42). That is 311k tokens over 10 tickets, G ≈
31k tokens per ticket, accrued at H ≈ 4.1k tokens/min. 35 hand-backs totalled 177k characters (median 1.8k,
max 33.2k for #11's brief draft). The single biggest jump was #10: 255.7k → 363.6k (+108k) between #7's
close and #10's close. That covers ten reader hand-backs of 1.3k-14.5k characters each, plus the orchestrator
writing the twelve summaries itself (row 45). The session passed spec #1's 150k stop point (user story 36)
at 21:21:18, after #2 and #8 had closed. So at about 31k per ticket, a 150k session that starts at 81k fits
about **two tickets**. Context, which is consumed and never freed within a session, is the binding resource.
Agent count is not. Run `99ae39b6` shows the same: its context went from 57.1k to 399.2k.

**Value of information on the Tier 1 brief.** The brief has 67 parameter rows: 29 VERIFIED, 5 NOT VERIFIED
and 33 INCONCLUSIVE. The zero-EVPI screen [H71 §8] asks of each row: would any resolution of its verdict
change its planned value?

- **EVPI = 0, 28 of 33 INCONCLUSIVE rows:** P-04, P-13, P-16, P-27, P-28, P-29, P-30, P-31, P-32, P-35, P-38,
  P-40, P-42, P-46, P-47, P-48, P-51, P-52, P-54, P-57, P-58, P-59, P-61, P-62, P-63, P-65, P-66, P-67. In each,
  the planned value is fixed by our own constraints, whatever the paper's claim turns out to be. Examples:
  P-13's plan is "choose by memory fit and license, not size ranking". P-16's QLoRA is forced by 8 GB. P-65's
  REBASE "cannot fit" either way. P-04 is resolved by the run itself. Of the NOT VERIFIED rows, P-03, P-06,
  P-08 and P-64 also score 0.
- **EVPI > 0: P-15, P-26, P-36, P-41, P-53 and NOT VERIFIED P-07.** Each planned value is conditional on
  something not yet measured. In influence-diagram terms each *already has an informational arc*: the plan
  says "measure, then choose" (P-26 "16,384 if peak memory allows", P-36 "if one sequence's KV cache fits",
  P-41 "if tier 1 cannot parse over 10%", P-07 "drop nothing unless a hit is found", P-53 "center the caps on
  the student's measured length"). So the plan already captures their value [HM81 §15.1: the arc *is* the
  clairvoyance]. Resolving them earlier only matters for decisions upstream of them.

The unknown that matters most is not an INCONCLUSIVE verdict. It is the open question on P-12 (a VERIFIED
row): Qwen3.5-4B's template, thinking mode, vocabulary and license are unsourced (brief "Where the plan
departs" item 1; open questions; decision row 60, still `open`). A small diagram:

```
 [Q: Qwen3.5-4B facts] ──► (D_model: P-12) ──► (D_seq: P-26) ◄── [S: share of s1K over 8,192 tokens]
        │                        │         ──► (D_gen: P-36) ◄── [K: KV cache per sequence]
        ├──────────► [S], [K], [M: QLoRA peak memory] ──► (D_seq)
        └──────────► (D_ctx: P-15)          ──► (D_caps: P-53) ◄── [N: no-intervention length]
                                                         all ──► <V: fits 8 GB AND comparable to the paper>
 [H: 8-gram hits] ──► (D_decon: P-07)        [U: unparsed AIME share] ──► (D_prompt: P-41)
```

Q is a parent of S, K, M and of D_model, and it has **no** informational arc into D_model yet, since spec B
has to commit. If Q shows a built-in thinking mode, the brief already says a 1,000-sample SFT "is not a clean
test" of s1's claim, so D_model flips to a Qwen2.5 fallback. Ordinal ranking by maximum regret, with no
probabilities: **Q** (worst case: the Tier 1 result doesn't test the claim) **> S, M** (can flip D_model only
through the fit) **> K, N, H, U** (worst case: one extra or relabeled run each). The research ticket worth
dispatching before spec B is "source Qwen3.5-4B's model card". Not one of the 28 zero-EVPI rows is.

## 5. Cost and fit

**Complexity.** The forward and backward passes are one topological sort plus two sweeps, O(V + E). Kelley and
Walker report the earliest and latest times plus total and free float for 3,000 jobs and 1,000 events in
"under 10 minutes" on 1959's 1100-series computers [KW59 Part II §8 "Computational Experience", p.170]. List
scheduling is O(V log V + E). Little's law is one pass over start/stop events. All three are instant at
hundreds or thousands of nodes. The zero-EVPI screen is one judgement per brief row, or one lookup per row
once a `depends_on` column exists. Exact EVPI over a general influence diagram needs probabilities, and we
skip it.

**Libraries.** NetworkX (3-clause BSD, `LICENSE.txt` checked) has `topological_sort`, `dag_longest_path` and
`dag_longest_path_length` in `networkx/algorithms/dag.py`, but it is Python. `graphology-dag` 0.4.1 (MIT,
`src/dag/package.json` checked) has `topologicalSort` and `hasCycle` but no longest path or float. The repo
has zero runtime dependencies (`package.json`), and the whole calculation is about 60 lines of plain Node.
This ticket's script was 70 lines including the list-scheduling simulation. **Use no library.**

**How it reaches the orchestrator.** A frontier block in #25's digest, recomputed from `readStream()` once
missing items 1-2 are logged:

```
frontier: ready=#27..#36 (10, independent) agents≈10 → order irrelevant; if m<10 dispatch longest-estimate first
critical: #2→#3→#5→#7→#10→#11 74.8m | float: #8 58m, #6 25m, #4 17m, #9 14m
wip: agents L=2.6 peak 11 | close queue L=0.27 | ctx 31k/ticket, ~2 tickets left before 150k
voi: 6 rows >0 (all gated by a measurement), 32 rows =0 (wontfix candidates); top unknown: Qwen3.5-4B facts (no arc)
```

On the dashboard: a float bar on each ticket node in the swimlane view, critical tickets highlighted, and
the WIP and context lines as two small time series. The 3-D view needs nothing new. Float and criticality
are node colours.

**Fit with the 8 GB cap.** No model runs, so no GPU memory is used. Nothing hosted.

## 6. Verdict

**ADAPT.**

- **Adopt:**
  - deterministic CPM float and the critical path [KW59]
  - Graham's bounds as the honest statement of what a dispatcher can gain [G69]
  - longest-first ordering for independent research tickets [G69 Theorem 2]
  - Little's law as a measurement identity on the event stream [L11]
  - Howard's zero-value-of-clairvoyance screen as a probability-free filter [H71 §8; HM81 §15.1]
- **Change:**
  - draw edges from a blocker's *work* (its artifact or merge), not its close, because that is how the run
    behaved
  - keep slack and VOI as two columns sorted lexicographically, not one score [H66 abstract]
  - add the missing ticket/role-per-dispatch and DAG-snapshot fields before any of it runs from the stream
- **Skip:**
  - PERT probabilities: biased [KW59 Part II §9] and fed by estimates we don't have
  - numeric EVPI: needs made-up probabilities

The reason it is ADAPT and not ADOPT: at our scale the frontier is usually narrower than the agents
available. Spec #1 hit its critical-path bound within 1%, and every rule gives the same makespan from m = 3.
So ranking adds little. The payoff is float as an exception signal, the VOI screen as a wontfix signal, and
context per ticket as the real capacity limit.

## Sources

- **[KW59]** J. E. Kelley Jr. and M. R. Walker, "Critical-path planning and scheduling", *Proc. Eastern Joint
  Computer Conference*, 1959, pp. 160-173, doi:10.1145/1460299.1460318. Read from the Computer History
  Museum scan at <https://mosaicprojects.com.au/PDF/PM-History_Critical_Path_Planning_&_Scheduling_Kelley_and_Walker_1959.pdf>.
- **[MRCF59]** D. G. Malcolm, J. H. Roseboom, C. E. Clark and W. Fazar, "Application of a technique for research
  and development program evaluation", *Operations Research* 7(5), 1959, pp. 646-669, doi:10.1287/opre.7.5.646.
  Scan at <https://mosaicprojects.com.au/PDF-Gen/PM-History_PERT-Original_Paper.pdf>.
- **[G69]** R. L. Graham, "Bounds on multiprocessing timing anomalies", *SIAM J. Applied Mathematics* 17(2), 1969,
  pp. 416-429. Scan at <https://mathweb.ucsd.edu/~ronspubs/69_02_multiprocessing.pdf>, pages read as images.
- **[L11]** J. D. C. Little, "Little's Law as viewed on its 50th anniversary", *Operations Research* 59(3), 2011,
  pp. 536-549, doi:10.1287/opre.1110.0940. Copy at <https://people.cs.umass.edu/~emery/classes/cmpsci691st/readings/OS/Littles-Law-50-Years-Later.pdf>.
  It restates and reproves the 1961 result [L61: "A proof for the queuing formula L = λW", *Operations
  Research* 9(3)], which I did not read directly.
- **[H66]** R. A. Howard, "Information value theory", *IEEE Trans. Systems Science and Cybernetics* SSC-2(1), 1966,
  pp. 22-26. Read in the reprint, ch. 39 of R. A. Howard and J. E. Matheson (eds.), *Readings on the Principles
  and Applications of Decision Analysis*, Vol. II, Strategic Decisions Group, 1984, pp. 779-783. Scan at
  <https://gwern.net/doc/statistics/decision/1983-howard-readingsondecisionanalysis-v2.pdf>.
- **[HM81]** R. A. Howard and J. E. Matheson, "Influence diagrams", 1981, ch. 37 of the same *Readings* Vol. II
  (from p. 719). Page numbers above are that printing's. Reprinted in *Decision Analysis* 2(3), 2005,
  pp. 127-143. The INFORMS PDF returned HTTP 403, so the 2005 printing was not read.
- **[H71]** R. A. Howard, "Proximal decision analysis", *Management Science* 17(9), May 1971, §8 "Clairvoyance".
  Reprinted in the same *Readings* Vol. II (§8 on p. 856). It is not in the ticket's starting list. I added
  it because it states the zero-value condition outright.
- Factory and repo inputs: `factory/decisions.tsv` (rows cited by line), `factory/agents/14c93a90-…/` and
  `factory/agents/99ae39b6-…/`, `research/s1/brief.md`, `CONTEXT.md`, `factory/read.mjs`,
  `factory/viewer/layout.js` (branch `viewer`, PR #24), issues #1, #21, #25, #26, and the GitHub issue-dependency
  API for #2-#12. Orchestrator transcripts:
  `~/.claude/projects/<slug>/14c93a90-c178-4f4b-b20f-235aebe7f882.jsonl` and `…/99ae39b6-466d-4630-a835-56ff7c650197.jsonl`.
