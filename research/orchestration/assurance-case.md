# Assurance case: linking spec #1 to its evidence

Ticket #32, part of map #26. Desk research; no code changed. Throwaway script and hand mapping kept outside the repo (see the worked example).

**Verdict: ADAPT.** Take GSN's goal / strategy / solution / undeveloped structure and SACM's assertion states as a typed layer over the event stream, with eliminative (Baconian) residual-doubt counts as the confidence measure. Skip the full notation, the modular extensions, numeric confidence propagation and any library. Details in section 6.

## Sources

Primary sources read for this note. Section numbers below refer to these.

- **[GSN1]** *GSN Community Standard Version 1*, Origin Consulting (York) on behalf of the contributors, November 2011. Read from the FAA-hosted copy (`faa.gov/.../redac-sas-201503-gsn-community-standard-v1.pdf`, via the Wayback Machine because the live URL now returns 404).
- **[GSN3Δ]** SCSC Assurance Case Working Group, *Goal Structuring Notation Standard: Changes from Version 2 to Version 3*, slides, 4 May 2021 (`scsc.uk/file/gc/GSNv2-to-v3_changes-1092.pdf`). Cited by slide number.
- **[SACM]** OMG, *Structured Assurance Case Metamodel*, v2.3, formal/23-05-08 (`omg.org/spec/SACM/2.3/PDF`). A 2.4 Beta 1 also exists; not read.
- **[A2]** R. Bloomfield and J. Rushby, "Assurance 2.0: A Manifesto", arXiv:2004.10474v3, January 2021.
- **[GWK]** J. Goodenough, C. Weinstock, A. Klein, "Eliminative Induction: A Basis for Arguing System Confidence", ICSE 2013 NIER, pp. 1161–1164 (SEI copy, `sei.cmu.edu/documents/1426/2013_021_001_88010.pdf`).

**Not obtained.** The *GSN Community Standard Version 3* (SCSC-141C) itself. `scsc.uk/r141C:1` resolves to a forwarder page that serves no file, both to a script and in a Chrome tab. This note therefore uses the v1 text for the core notation (the v2-to-v3 slides group their changes as administrative, patterns, modular, confidence, dialectics and "other", with no change to the core elements; slides 3–28) and the official change slides for what v3 added. Kelly and Weaver (DSN 2004): no open copy found. [GSN1] lists Kelly as a contributor and supersedes the 2004 paper as the normative definition. Both gaps are logged as `fetch.failed` events (`gsn-v3`, `kelly2004gsn`).

**A count correction.** Ticket #32 says spec #1 has 42 user stories. It has **47** (issue #1, "User Stories", items 1–47). This note uses 47.

## 1. The structure

**Nodes.** GSN has six core element types: goal (a claim), strategy (the inference from a goal to its sub-goals), solution (a reference to evidence), context, assumption and justification [GSN1 §1.2.1, Fig. 7]. Two decorators matter here:

- *Undeveloped*: "a line of argument has not been developed", applicable to goals and strategies [GSN1 Fig. 7].
- *Away goal*: repeats a claim made in another argument module [GSN1 §B1.2.4].

Version 3 adds three things:

- *Assurance claim points* (ACPs), a solid square on a relationship or element where a confidence argument attaches [GSN3Δ slides 21–23].
- A *Challenges* relationship and a *Defeated* decorator, for counter-evidence and the claims it defeats [GSN3Δ slides 24–26].
- Away assumptions and away justifications [GSN3Δ slide 17].

SACM states the same thing as data. A `Claim` carries an `assertionDeclaration` from {asserted, needsSupport, assumed, axiomatic, defeated, asCited} [SACM §11.8, §11.11]. Evidence is an `ArtifactReference` [SACM §11.9]. Every link is an `AssertedRelationship` with `source[1..*]`, `target[1]`, an optional `reasoning`, and `isCounter` for counter-evidence [SACM §11.13].

**Edges.** GSN has two edge types [GSN1 §1.2.5, Fig. 8]:

- *SupportedBy* (inferential or evidential), allowed goal→goal, goal→strategy, goal→solution and strategy→goal.
- *InContextOf*, from a goal or strategy to a context, assumption or justification.

SACM splits SupportedBy into `AssertedInference` (claims to a claim) and `AssertedEvidence`, whose source must be an `ArtifactReference` (OCL constraint in [SACM §11.15]). It also has `AssertedContext` [SACM §11.16]. Both standards stress that a link is itself an assertion by someone [GSN1 §0.4.12; SACM §11.14–11.15]. That matters for automatic derivation (section 3, Q6).

**Math.** A goal structure is a typed directed graph *G = (V, E, τ_V, τ_E)*:

- *τ_V : V → {goal, strategy, solution, context, assumption, justification}*, plus decorator flags.
- *τ_E : E → {supportedBy, inContextOf, challenges}*.
- SupportedBy is acyclic. The graph is a tree only when nothing is shared: once a side claim is established in one place and used in many, "the overall argument is no longer a tree" [A2 §2.2].
- Assumptions are inherited. An assumption on G1 "is taken to be connected to the entirety of the argument supporting G1" [GSN1 §1.3.9].

Two confidence calculi are on offer:

- **Eliminative (Baconian).** Each node carries a set of defeaters: rebutting (a counter-example to the claim), undermining (doubt about the evidence) or undercutting (doubt about the inference rule) [GWK §II]. Confidence is *i|n*, "i out of n", where *n* counts the defeaters at or nearest the leaves of the doubt refinement and *i* counts those eliminated. *n − i* is the **residual doubt** [GWK §I, §IV]. The authors say the denominator "is not so interesting"; the residual count is what you act on [GWK §IV].
- **Assurance 2.0.** A reasoning step should be deductive, with side conditions (e.g. "this enumeration is complete") that need their own evidence [A2 §1, §2.2]. Confidence in a deductive conjunctive step is the product of the sub-claim confidences when they are independent. For an inductive step, doubt (1 − confidence) is bounded by the sum of the sub-claim doubts [A2 §3.1]. Weight of evidence uses a confirmation measure such as Kemeny–Oppenheim, (P(e|c) − P(e|¬c)) / (P(e|c) + P(e|¬c)): positive for support, near zero for useless evidence, negative for counter-evidence [A2 §2.1]. The authors "do not advocate" numeric values except for what-if runs, suggesting 95 % for high, 5 % for low and 1 % for an unsupported "something missing here" side claim [A2 §2.1, §2.2, §3.1]. Confidence is a "weakest link" phenomenon [A2 §3.1].

## 2. Mapping

What each logged field or event becomes. The event schema is from issue #1 ("API contract") and `factory/read.mjs`.

| We log | Where | Becomes | Note |
|---|---|---|---|
| Spec #1 "User Stories" items 1–47 | issue #1 body | 47 **goals** G1…G47 under a top goal G0 "the intake meets spec #1", with strategy S0 "argue over each user story" | Derivable by parsing the numbered list. S0 needs the side condition "the 47 stories are the whole spec" [A2 §2.2]; the spec's "Done when" gives a second strategy (section 4) |
| `check` event (`name`, `result`, `evidence`) | activity files | **solution** (SACM `ArtifactReference` + `AssertedEvidence`), `isCounter = true` when `result = fail` | The only event type whose content a script judges. Has no field naming the goal it supports |
| `artifact` event (`path`, `kind`) | activity files | **solution** of weaker standing: shows the thing exists, not that it is right | [GWK §V]: confirmatory evidence alone "is, by itself, meaningless" until you say which doubt it removes |
| `fetch.failed` event | activity files | **challenge** (rebutting defeater) on the goal that needs that reference; closed by a later `artifact` with the same `ref` | The fetch page's open/closed rule (CONTEXT.md, "Fetch page") is already a defeater-elimination rule |
| `agent.stop` `status` ISSUES / BLOCKED / unknown | activity files | a **challenge** on the goal the agent's ticket serves; `unknown` is an undermining defeater on the stop record itself | No ticket id on the event, so the goal must be found by the agent's `run` and timing (see #21's sibling fog in #26) |
| `decision` row `phase` | `factory/decisions.tsv` | **context** for the claim (which part of the work) | Phase paths are not goals; one goal draws on many phases |
| `decision` row `decision` + `why` | `factory/decisions.tsv` | a **claim** asserted by the orchestrator, with `why` as **justification** [GSN1 §1.3.10] | Judgement, not evidence |
| `decision` row `result` | `factory/decisions.tsv` | the SACM `assertionDeclaration`: adopted/closed/pass → `asserted`; open/started/flagged → `needsSupport` (undeveloped); dropped → withdrawn | Free text today; a script has to guess the state |
| `decision` row `evidence` | `factory/decisions.tsv` | `ArtifactReference` pointers (transcript moments, files, commits) | The audit already re-resolves them |
| "supersedes line N" rows; audit verdict `superseded` | decisions.tsv, `factory/audit/<run>.tsv` | `challenges` edge + **Defeated** decorator on row N [GSN3Δ slides 25–26]; SACM `defeated` | 6 such edges: 55→15, 56→18, 57→28, 58→35, 59→38, 60→51 |
| Trail review flags (qwen3.5:9b) | `factory/audit/<run>.review.md` | candidate **challenges** (reviewer-proposed defeaters), each with the orchestrator's note marking it eliminated ("misread") or open ("holds") | Exactly the "countercase" role in [A2 §3.2.5]; free text today |
| `ts`, `run`, `agent` | every event | SACM `Event.date`, `Participant` [SACM §12.9, §12.13] | Lets you tell when evidence predates the artifact it vouches for |

**What's missing, and what it would cost to log.**

1. **A story id on evidence.** Nothing links a `check` or test to a user story. Cost: an optional `story` field on `check` events, or a committed `stories.tsv` (story → check name or test name) the orchestrator writes when a spec is ticketed. That is about 50 rows for spec #1. Without it, every SupportedBy edge is a judgement call (section 3, Q6).
2. **Per-test results.** `npm test` checks log only a count ("83/83 pass at 3db4f73"). The story-to-test link lives in test names (`factory/test/*.test.mjs`). Cost: write the built-in `node --test` TAP output as an artifact, or one `check` per test. No new dependency.
3. **Test results after the last merge.** The last `npm-test` check event is at 21:57:39Z. The 106/106 and Docker CI results at 23:01:49Z exist only as decision row 70. Cost: run the existing writer after `npm test` in the CI script.
4. **Challenge events.** Defeaters are scattered across supersede rows, the audit TSV and review prose. Cost: one new event type `challenge` with `target` (event ts or row line), `kind` (rebut / undermine / undercut) and `status` (open / eliminated), plus a `by` pointer to the eliminating evidence. About 10–20 events per run at our rate.
5. **A machine-readable claim state.** Map the `result` column to SACM's enum, either as a new column or by convention on the first word. Cost: a trail-check rule.
6. **A "closes" link.** Row 57 ("open: handed to #9") is closed in substance by row 39 (#9 merged, with a D-items section in `research/s1/verification.md`), but they sit in different phases. Nothing links them, so a script sees row 57 as dangling. Cost: a `closes line N` phrase, parsed like `supersedes line N` already is in `factory/viewer/layout.js` on branch `viewer`.

## 3. Questions it answers for the orchestrator

| # | Question | Orchestrator decision today | What the case adds |
|---|---|---|---|
| Q1 | Which story goals are undeveloped or rest only on judgement? | **Declare done.** Today: four checks pass plus judgement (issue #1, "Solution"). | Lists the goals with no check-backed solution. On spec #1 the four done-checks reach only 14 of 47 stories (section 4). GSN's guidance when evidence doesn't cover a claim is to weaken the claim and re-check every claim above it [GSN1 §2.3.8.1]. That is the honest alternative to declaring done |
| Q2 | Where is residual doubt highest? | **Pick the next ticket.** | Rank tickets by the uneliminated defeaters on the goals they serve [GWK §IV]. Stories 18, 44 and 46 have no evidence, and 33 has an open rebutting defeater (#21). A ticket that closes one of those removes more doubt than one that adds a fifth check to an already check-backed story |
| Q3 | Does this merge's evidence remove a defeater, add one, or make a solution stale? | **Merge.** | A merge that edits an artifact after its check ran raises an undermining defeater ("the reviewed design is not the current design", [GWK Fig. 3, UM5.1]) until the check reruns on the merged copy. Real case in section 4 |
| Q4 | Did the rework eliminate the challenge that sent it back? | **Re-dispatch.** | An `agent.stop` ISSUES is an open challenge; the next PASS on the same goal should name the challenge it eliminates. Example: row 13's unknown-status issue, eliminated by the #2 fix (row 16). No unknown stop after 21:19:03Z |
| Q5 | Which decisions still stand? | **Supersede.** | Rows with a Defeated decorator drop out of the argument; their superseding rows inherit their SupportedBy edges. This is the same graph the viewer draws (`supersedes` links in `layout.js`), now with a meaning |
| Q6 | Can the tree be built without a person? | (none; tickets are written by hand) | **Partly.** G0, the 47 story goals and S0 are parsed from the spec. Candidate solutions come from the stream, ranked by text similarity between story text and check/test/artifact text (#28's retrieval). That is GSN's bottom-up method, inferring "evidence assertion" goals from what the evidence shows [GSN1 §2.4.3]. But a SupportedBy edge "is itself an assertion on behalf of the user" [SACM §11.15], and GSN "does not establish the truth" of an argument [GSN1 §0.4.12]. So retrieval proposes and the orchestrator confirms, one decision row per accepted edge, until item 1 of the missing list puts `story` on the evidence directly |

**Which GSN extras earn a place?**

- **Undeveloped: yes.** It is the whole point: it keeps gaps visible, which is what story 11 asks for INCONCLUSIVE. It maps 1:1 to SACM `needsSupport`.
- **Assumption and justification: yes, as edge labels, not new node kinds.** The `why` column already plays justification [GSN1 §1.3.10]. Assumption's inherited scope [GSN1 §1.3.9] fits the 8 GB cap (row 3), which every replication goal assumes.
- **Away goal: later.** Only needed once a second spec argues against the same evidence (piece B citing intake goals). An away goal names the module holding the original claim [GSN1 §B1.2.4].
- **Confidence-argument ACPs and the dialectic Challenges / Defeated: yes, in their simplest form.** This is the challenge event of missing-list item 4 [GSN3Δ slides 22, 25]. It is the extension that answers "how sure", not just "is it green".

**Can confidence say how sure we are?** Yes, if you count rather than multiply. Baconian *i|n* and its residual *n − i* need nothing we can't log, and they point straight at work [GWK §IV]. Products of probabilities are fragile. [A2 §3.1] cites Graydon and Holloway: by perturbing the original authors' own examples, they showed all 12 published quantitative schemes can give implausible results. The product of 27 "high" (0.95) leaves is already 0.25 (section 4), which illustrates [A2]'s remark that many highs multiply down to medium. Use the numbers only for what-if ranking, as [A2 §3.1] does.

## 4. Worked example

Applied by hand to the real spec #1 and the real event stream (`node factory/read.mjs`, 247 events at HEAD `af3bdea`: 73 decisions, 32 checks, 42 artifacts, 47 starts, 49 stops, 4 `fetch.failed`). The mapping (`stories.tsv`, 47 rows) and a throwaway checker (`case.mjs`) live in this run's scratchpad, not in the repo. The checker confirmed that all 69 cited events and rows resolve.

**Leaf classes.** For each story goal Gk, the strongest solution found:

- **C, check-backed (27):** 1, 4, 5, 6, 11, 13, 19, 20, 21, 23–32, 34, 37–43. A scripted `check` event with `pass` covers the story, directly or through a named test inside a passing `npm-test` check.
- **A, artifact only (8):** 2, 3, 7, 9, 10, 12, 14, 17. The output exists but nothing judged it. Example: G10 "every claim checked with a verdict" rests on artifact `research/s1/verification.md` (21:51:09Z) and row 39's counts (37 / 12 / 133). No check confirms every claim ID has a verdict.
- **J, judgement only (8):** 8, 15, 16, 22, 35, 36, 45, 47. Only decision rows. Example: G22 "downloads never executed" rests on row 63, the layout note, which the audit and the qwen review (flag L65) say was never committed.
- **N, nothing (3):** 18 (stop and ask at a login or captcha), 44 (Attention section in the final reply: lives only in the transcript) and 46 (plain language).
- **D, open rebutting defeater (1):** 33 (stable event schema). Code review (row 68) found three contract drifts, filed as #21 (row 73), still open.

**Top goal.** G0 is supported two ways:

- **S0, the spec's own definition of done.** "The intake is done when four scripted checks pass" (issue #1, "Solution"). The four checks (`tables`, `references`, `brief`, `trail`, all `pass` at 23:02:12–14Z) are solutions for 14 stories: 4, 5, 6, 13, 23, 24, 25, 27, 37, 39, 40, 41, 42, 43. S0 needs the side condition "the four checks cover the 47 stories" [A2 §2.2]. The case shows that side condition is false. **This is the main finding: the definition of done reaches 14 of 47 stories.**
- **S1, argue over each story.** Treat each "unless story k is not met" as a rebutting defeater on G0. Baconian confidence is 27|47 if only checks eliminate a defeater, or 35|47 if artifacts count. Residual doubt is 20 (or 12).

What-if run with [A2 §3.1]'s numbers (C = 0.95, A and J = 0.05, N and D = 0.01): the product over the 27 check leaves alone is 0.25, and over all 47 it is about 4×10⁻³⁰. The sum-of-doubts bound is 20.5, so the bound says nothing. As [A2] warns, the numbers only rank; the residual list is the usable output.

**One sub-goal developed by doubt refinement [GWK §III]:** G13/G40, "the Tier 1 brief lists every parameter with a paper location, verdict and planned value within 8 GB".

| Defeater | Kind | Real evidence | State |
|---|---|---|---|
| R1: unless a parameter row lacks a location or verdict | rebut | `check brief pass` 23:02:14.890Z, "67 parameter rows; all have a location and a valid verdict" | refined into UM1 |
| UM1: but the check ran on a draft, not the committed brief | undermine | `check brief` at 22:14:02Z (fail), 22:14:11Z and 22:14:30Z (pass) ran on a scratchpad `brief-draft/brief.md`. The orchestrator's `check brief pass` at 22:16:31Z ran on `research/s1/brief.md` | eliminated |
| UC1: unless the check's own logic is wrong | undercut | `factory/test/brief.test.mjs` has 8 tests, but the last `npm-test` check event (21:57:39Z) predates the brief check (#11, rows 49–50). The later 106/106 is only in decision row 70 | judgement only |
| UC2: unless a location does not actually support its value | undercut | the check tests presence and form, not truth. Verdicts come from `research/s1/verification.md` (row 39), which no check ties to brief rows | open |
| R2: unless a planned value breaks the 8 GB / under-8B rule | rebut | row 60 (superseding 51): "the tier-2 judge qwen3.5:9b is over 8B … Qwen3.5-4B is unsourced … QLoRA replaces full fine-tuning", `result = open` | open |

The leaves are UM1, UC1, UC2 and R2, so Baconian confidence is **1|4**, or 2|4 if row 70's judgement eliminates UC1. Residual doubt: UC1, UC2 and R2. The brief check says `pass`; the case says the brief goal has two open, named reasons for doubt, and one of them is a planned value that breaks the project's own cap.

**The same undermining pattern recurs** elsewhere in the stream:

- The first `references` passes (21:44:11Z, 21:56:40Z) point at a worktree copy, `.claude/worktrees/agent-aca88395f9aed1a30/research/refs/catalog.tsv`. That is Goodenough's "reviewed design is not the current design" [GWK Fig. 3, UM5.1]. The 22:29:35Z and 23:02:14Z runs on `research/refs/catalog.tsv` eliminate it.
- Story 43 shows a rebutting defeater appearing and going: `check trail fail` at 22:28:32Z ("reviewed by no one"), then `pass` at 22:40:20Z ("reviewed by qwen3.5:9b").
- Story 34: of 49 `agent.stop` events, 3 have status `unknown`, all before #2 closed (row 16, 21:19:03Z), and none after. A defeater eliminated by a fix, visible in the stream.

**Decision-log states.** Read through SACM's enum, 14 rows read as `needsSupport` (open, started or flagged: lines 11, 15, 22, 28, 29, 30, 31, 42, 46, 49, 51, 53, 57, 60), and 6 rows are `defeated` by the six supersede edges. Four open rows have no later row in their phase: 30, 53, 57 and 60. Of these, 57 is closed in substance by row 39 (missing-list item 6). 60 is genuinely undeveloped and feeds R2 above.

## 5. Cost and fit

**Complexity at our scale.**

- **Building the case from an explicit story map:** O(S + E) for S goals and E events. Spec #1 is 47 goals against 247 events, under a millisecond in Node.
- **Retrieval-proposed edges (Q6):** S × E similarities. 47 × 247 ≈ 12 k dot products now. At thousands of nodes (say 500 goals × 50 k events) it is 25 M dot products at 768 dimensions, seconds on CPU, and an embedding model from #28 fits well inside 8 GB.
- **Baconian counts:** one post-order fold over the SupportedBy DAG, O(V + E).
- **Doubt refinement:** grows with defeaters, roughly 4–6 per developed goal in the example above.

The expensive part is not compute. It is the person confirming edges and naming defeaters, which [GWK §V] calls the point: doubt identification is explicit, reviewable work.

**Libraries (licenses checked on GitHub, 2026-10-11).**

- `jonasthewolf/gsn2x`: MIT, Rust, 42 stars, last push 2026-09. Renders GSN from YAML to SVG and treats several input files as modules. A renderer only, and a Rust binary, so a new dependency.
- `alan-turing-institute/AssurancePlatform`: MIT, TypeScript, 42 stars. A full web app for building cases, heavier than the factory.
- `isabelle-utp/Isabelle-SACM`: no license file.
- `kit-sdq/SACM-Metamodel`: EPL-2.0, Java.

None is needed. The structure is a typed graph plus a fold, about 150 lines of dependency-free Node next to `read.mjs`. That respects the no-new-dependencies rule. If a person wants a GSN picture, gsn2x can be run outside the repo on exported YAML.

**How it reaches the orchestrator.** One digest line for #25:

```
spec #1: 27/47 stories check-backed, 8 artifact-only, 8 judgement-only, 3 none (18, 44, 46), 1 defeated (33 by #21); done-checks reach 14/47; residual doubt 20
```

Two queries: `undeveloped(spec)` (goals not check-backed, ranked by residual doubt) and `defeaters(goal)` (open challenges with their pointers).

**How it feeds the node model (#37).**

- **Typed edges.** `supportedBy`, `inContextOf`, `challenges` and `defeated` become relation types for the KG embeddings in #27, next to `supersedes`, `mentions` and `evidence`, which `layout.js` already extracts. Unlike those, these carry a meaning: support versus attack. The #31 argumentation-semantics ticket can compute acceptability over the `challenges` edges.
- **Node features.** SACM `assertionDeclaration` one-hot (6 values), leaf class C/A/J/N/D, Baconian (i, n), residual doubt n − i, and evidence age relative to the artifact's last `artifact` event.
- **Constraint on embeddings.** Similarity may *propose* a SupportedBy edge but never *create* one. Undeveloped is a hard label, so a goal near lots of evidence in embedding space is still undeveloped until an edge is asserted [SACM §11.15; GSN1 §0.4.12].
- **Dashboard.** Goal tiles coloured by leaf class, with the residual-doubt list beside them. It is a tree-shaped panel; it does not need three.js.

## 6. Verdict

**ADAPT.**

**Adopt the core.** Take the GSN goal / strategy / solution / undeveloped skeleton [GSN1 §1.2], SACM's assertion states and the counter-evidence flag [SACM §11.8, §11.13], and GSN v3's challenge / defeated idea [GSN3Δ slides 24–26]. Confidence is Baconian residual doubt [GWK §IV]. On real data this answers the orchestrator's hardest call better than "four checks pass". The spec's definition of done reaches 14 of 47 stories. Twenty stories have no check behind them, three have nothing at all, and the brief, which passes its check, still has three named doubts, one a planned value that breaks the 8 GB cap.

**Change two things.**

- Edges are proposed by retrieval and asserted by the orchestrator, not drawn by hand from scratch.
- The tree is computed from the stream plus a small story map, not authored as a separate document.

**Skip the rest.**

- Modular extensions and away goals, until a second spec exists.
- Numeric confidence propagation: fragile per [A2 §3.1], and our what-if gives 4×10⁻³⁰.
- Pattern and template notation.
- Any library.

**Prerequisites, all cheap:** a `story` field or `stories.tsv`, per-test results, test results logged after the last merge, a `challenge` event, a machine-readable claim state, and a `closes line N` phrase.
