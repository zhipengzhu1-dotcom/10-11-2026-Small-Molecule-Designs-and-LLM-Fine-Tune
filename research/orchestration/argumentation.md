# Argumentation semantics for the decision log

Issue #31, map #26. Written 2026-10-11. Desk research only. The worked example ran a throwaway script, kept outside the repo, on the committed `factory/decisions.tsv`, `factory/audit/99ae39b6-466d-4630-a835-56ff7c650197.tsv` and `factory/agents/**`, as of `af3bdea`.

The question: can Dung's abstract argumentation, together with IBIS and QOC design rationale, tell the orchestrator which decisions are still in force and which options were rejected and why? Short answer: yes, but only in a reduced form. Our log is append-only, so every attack points back in time. Under that condition all of Dung's semantics give the same answer. The useful parts are a three-way label per row (in, out, undecided) and a few typed edges. The search for extensions adds nothing at our scale.

Source keys used below:

- **[Dung95]**: Dung, *Artificial Intelligence* 77 (1995) 321–357.
- **[KR70]**: Kunz and Rittel, IURD Working Paper 131 (1970). Its paragraphs are numbered.
- **[CL13]**: Cayrol and Lagasquie-Schiex, *IJAR* 2013. Its §2.2 restates their ECSQARU 2005 definitions.
- **[DD17]**: Dvořák and Dunne, "Computational Problems in Formal Argumentation and their Complexity".
- **[QOC91]**: MacLean, Young, Bellotti and Moran, *HCI* 6(3–4), 1991. Only the publisher's abstract was read.

Full links are in Sources at the end.

## 1. The structure

**Dung frameworks.** An argumentation framework is a pair AF = (AR, attacks), where AR is a set of arguments and attacks ⊆ AR × AR. An argument is abstract: "its role is solely determined by its relations to other arguments" [Dung95 §2.1, Def 2]. The definitions build up as follows:

- **Conflict-free:** a set S is conflict-free if no member of S attacks another member [Def 5].
- **Acceptable:** an argument A is acceptable with respect to S if S attacks every attacker of A [Def 6(1)].
- **Admissible:** S is admissible if it is conflict-free and each of its arguments is acceptable with respect to S [Def 6(2)].
- **Characteristic function:** F(S) = {A | A is acceptable with respect to S} [Def 16]. F is monotonic [Lemma 19].

The four semantics follow from these:

| Semantics | Definition | Source |
|---|---|---|
| Grounded | the least fixed point of F, the "skeptical" semantics | Def 20 |
| Complete | an admissible S that contains every argument acceptable with respect to S, i.e. S = F(S) | Def 23, Lemma 24 |
| Preferred | a maximal admissible set, the "credulous" semantics | Def 7 |
| Stable | a conflict-free S that attacks every argument outside S | Def 13 |

How they relate:

- The grounded extension is the least complete extension [Thm 25(2)].
- Every stable extension is preferred, but not the reverse [Lemma 15].
- On a two-cycle (the Nixon diamond) the grounded extension is empty, while there are two preferred extensions [Ex 9, Ex 22].
- **The result that matters for us:** an AF is *well-founded* if it has no infinite chain A₀ ← A₁ ← A₂ … in which each Aᵢ₊₁ attacks Aᵢ [Def 29]. Every well-founded AF "has exactly one complete extension which is grounded, preferred and stable" [Thm 30].
- For a finite AF, well-founded means the attack graph has no cycle (my inference: an infinite chain over a finite set must repeat an argument). [DD17 §3.4.1] says the same for acyclic AFs: each argument is either in the grounded extension or attacked by it, and "all the semantics under our consideration coincide".

**Labellings.** The same extensions can be written as a three-valued labelling. An argument is `in` when it is accepted, `out` when an accepted argument attacks it, and `undec` otherwise. Complete labellings correspond one-to-one with complete extensions (Caminada and Gabbay 2009, as stated in [DD17 §3.6]). For the orchestrator, `in`, `out` and `undec` are the node labels.

**Bipolar frameworks** add a second relation: BAF = ⟨A, R_att, R_sup⟩ [CL13 Def 4]. Support creates "complex attacks" [CL13 Def 5]:

- **Supported attack** from a to b: a supports x (one or more support steps), and x attacks b.
- **Secondary attack** from a to b: a attacks x, and x supports b.
- **Mediated attack** (deductive support) from a to b: b supports x, and a attacks x [CL13 Def 8].

Which complex attacks apply depends on what support means [CL13 §3]:

| Kind of support | Meaning of "a supports b" | Complex attack it calls for | Source |
|---|---|---|---|
| Deductive | accepting a implies accepting b | supported and mediated attacks | CL13 §4.1 |
| Necessary | accepting b requires accepting a | secondary attacks | CL13 §4.2 |
| Evidential | an argument "cannot be accepted unless it is supported by evidence", and only supported arguments may attack | (evidence decides which arguments can count at all) | CL13 §5 |

**IBIS** [KR70]:

- **Elements:** topics, issues, questions of fact, positions, arguments and model problems (abstract; ¶8).
- **Issues** "have the form of questions". They are "raised, argued, settled, 'dodged', or substituted" (¶5).
- **Positions** answer an issue. Arguments are "constructed in defense or against the different positions until the issue is settled" (¶2).
- **Relations between issues** (¶6):
  - *Direct successor:* I₂ "challenges a statement made in support of one of the positions" of I₁.
  - *Generalization:* I₂ generalizes I₁.
  - *Relevant analogy:* I₂'s arguments carry over to I₁.
  - Positions on two issues can be *compatible*, *consistent* or *incompatible*.
- **Issue types** (¶7): factual, deontic, explanatory, instrumental.
- **Issue bank** (¶9): living (S-11), settled or abandoned (S-12) and latent (S-13) issues.
- **Evidence bank** (¶9): questions of fact, answered (S-21) or open (S-22).
- **Settling** (O-6, ¶11): an issue is settled "by accepting one of the positions". Otherwise further evidence is requested, or a supporting statement is challenged and a new issue opens. An issue can also be denied significance and replaced by a substitute.

**QOC** [QOC91 abstract]:

- **Questions** identify key design issues. **Options** are possible answers to them. **Criteria** are for "assessing and comparing the Options".
- The analysis keeps "possible alternative designs" alongside the justification for the chosen one.
- It is "a coproduct of design", not "a record of the design process". IBIS, by contrast, records the discourse as it happens [KR70 ¶4].

## 2. Mapping

The first table is the reading this report proposes. Where a row cites a source, it is the source of the concept; the mapping itself is mine.

| What we log today | Where | What it becomes |
|---|---|---|
| decision row (`decision` cell) | `factory/decisions.tsv` | an argument; in IBIS terms, a position on an issue [KR70 ¶2] |
| `phase` | same | the IBIS *topic*, not the issue. A topic is "a crude organization principle" [KR70 ¶8]. 47 phases hold 73 rows, and only 18 phases have more than one row |
| `why` | same | an argument *for* the position. Arguments *against* and rejected options are not logged as such |
| `evidence` | same | evidential support, the IBIS evidence bank (S-2) [KR70 ¶9; CL13 §5] |
| `result` = `open…`, `started`, `handed…` | same | the issue is living (S-11) |
| `result` = `adopted`, `closed`, `approved`, `applied`, `filed` | same | the issue is settled (S-12) |
| `result` = `dropped` (L2) | same | the issue is abandoned (S-12) |
| "supersedes line N" text | same; picked up by the regex in `origin/viewer:factory/viewer/layout.js` | **replacement**: an attack on N, plus N's content restated (see §3 and §4) |
| audit `verdict=superseded`, `superseded_by=M` | `factory/audit/<run>.tsv` | an attack M → N. On today's data it is the same set as the text links (§4). `trail.mjs:143` requires M > N, so these edges always point back in time |
| audit `verdict=ok` with pointers that resolve | same | evidential support. When the pointers stop resolving, the support is lost. That is the reason given for superseding L15 and L35 |
| `check` event with `result=fail` | activity files | an argument that attacks the decision claiming that check passes |
| a later `check` event with the same name and the opposite result | same | an attack on the earlier check. A later pass therefore *reinstates* the claim (defence, [Dung95 Def 6]) |
| `agent.stop` with `status=ISSUES` or `BLOCKED` | same | an attack on "ticket done". A re-dispatch is the orchestrator's counter-argument |
| `artifact` events | same | the targets of evidence pointers; not arguments |
| `start` rows (L11, L53) | `decisions.tsv` | run markers, not arguments. They should be left out of the framework |

**Missing from our logs, and what it would cost to log it:**

1. **An attack that isn't a replacement.**
   - *Example:* L71 withdraws the standing push consent recorded in L21, but no text links the two rows.
   - *Cost:* a `withdraws line N` phrase, written only when it applies (one row so far). The audit could flag it like a superseded row.
2. **Partial supersession.**
   - *Example:* L43 says it "supersedes the grading part of project/replication/local-models-only" (L41). It gives no line number, so the viewer's regex misses it, and Dung's framework has no way to attack part of an argument.
   - *Cost:* none for the format. Require the superseding row to restate the part that survives, so it becomes a whole replacement. The other option, splitting arguments, makes the log harder to write.
3. **Rejected options and arguments against.**
   - A regex flags 22 of 73 rows as naming an alternative. By hand, at least 7 really do name an option they rejected: L29, L38, L41, L45, L46, L64 and L68. For example, L45: "the user chose orchestrator writes over changing the guard".
   - *Cost:* one `rejected: <option> (<reason>)` clause in `why`, only on rows that weighed options.
   - Splitting `why` into separate position and argument columns would break `readDecisions` (it throws unless a row has exactly 6 cells, `factory/read.mjs`) and the trail check's no-empty-cell rule. It would also break the upstream pstack format. The inline clause avoids all three.
4. **An issue key.**
   - A phase is a topic, so an issue settled in another phase is never linked back.
   - *Example:* L57 (22:27:30Z) still reads "open: handed to #9", but #9 closed at L39 (21:53:12Z).
   - *Cost:* a ticket or issue id on each row and event. This is the same field the map's Fog and #21 ask about. Until that field exists, a `settles line N` phrase would do.
5. **Which decision a check attacks.** Checks carry no ticket or row id. The worked example matched checks to rows by hand, using the check name. This also waits on #21.

## 3. Questions it answers for the orchestrator

1. **Which decisions must I still honour?** *(Any dispatch, because standing rules go into worker prompts.)* These are the `in` rows whose result marks a settled policy (`adopted`, `approved`, `applied`). Today the answer is wrong in two places:
   - L21 ("will push after each merge from now on") comes out `in`, although L71 withdrew that consent.
   - L41 ("only local open-source models") stays `in` whole, although L43 replaced its grading part.

   With the two missing edges added, the labelling is right (§4).
2. **Is `supersedes` an attack, a replacement, or both?** *(Supersede.)* It is both, and it matters which one you model.
   - If it is modelled as a plain attack, Dung's *reinstatement* applies: superseding a correction would bring back the row the correction replaced (§4, AF3).
   - So a supersede must also carry the attacks of the row it replaces. With that rule, replacement chains behave as version chains.
   - Withdrawing (L71 → L21) and a failed check are plain attacks, and reinstatement is right for them: a later pass should clear an earlier fail.
3. **Grounded, preferred or stable?** *(All of them.)* Use grounded.
   - Grounded is the unique, skeptical and polynomial choice [Dung95 Def 20; DD17 Table 1: grounded is P-complete, while credulous preferred is NP-complete and skeptical preferred is Π₂ᴾ-complete].
   - Grounded is the only one of the three that leaves two open, mutually attacking options undecided rather than picking one of them [Dung95 Ex 22]. Undecided is the right reading of an IBIS living issue.
   - While attacks only point backward, all the semantics coincide anyway [Dung95 Thm 30].
4. **May I merge or declare done?** *(Merge, declare done.)* A ticket's done-claim is `in` only if no `in` check failure or `ISSUES`/`BLOCKED` stop attacks it.
   - L40 closed #4 while its own result cell named an unresolved defeater ("PowerShell-only hooks test failure left for code review"). That defeater was cleared only at L68. A done-gate on the labelling would have held #4 open, or forced an explicit deferral.
5. **Should I re-dispatch?** *(Re-dispatch.)* A stop with `ISSUES` attacks the ticket claim, and re-dispatching is the counter-argument.
   - L13: the hooks-live smoke test came back with status unknown, and the orchestrator sent it back to the #2 implementer.
   - L16: #2 closed once the fix landed.
6. **What's still open?** *(Pick the next ticket, or ask the user.)* These are the IBIS living issues: an `in` head row whose result is open. On today's data there are two:
   - **L60:** three plan points waiting on the user. This one is genuinely open, and it blocks piece B.
   - **L57:** stale. It was settled in another phase (see §2, item 4).
7. **If I drop this decision, what else falls?** *(Supersede.)* Use necessary support plus secondary attacks [CL13 §4.2, Def 5].
   - L43 (tiered grading) rests on the local-models-only part of L41.
   - Defeating that part would raise a secondary attack on L43.
   - Today this dependency lives only in prose.

## 4. Worked example

The script read the 73 non-header rows of the real `factory/decisions.tsv` (lines 2–74), the 73 audit verdicts and the 32 `check` events. It computed the grounded labelling by iterating F from ∅ [Dung95 Def 20]. Its output, quoted where load-bearing:

**AF1, explicit links only.**

- Edges from the `supersedes line N` regex in `layout.js`: `55>15 56>18 57>28 58>35 59>38 60>51`.
- Edges from the audit's `superseded_by`: the same six. `same set: true`.
- `|AR|=73 |attacks|=6 acyclic=true rounds=3`. Labelled `out`: L15, L18, L28, L35, L38, L51. Labelled `undec`: none.

The audit and the text links agree. The graph is acyclic, as `trail.mjs:143` guarantees, so by [Dung95 Thm 30] the labelling is the only complete one. Grounded, preferred and stable all give the same answer.

**AF2, adding the two attacks found by reading.**

- L71 ("standing push-after-merge consent is withdrawn") attacks L21 ("will push after each merge from now on").
- L41 is split. L41a is "the replication and its evaluation use only local open-source models". L41b is the grading plan, which L43 attacks: "supersedes the grading part of project/replication/local-models-only".
- Result: `|attacks|=8 acyclic=true rounds=3`. Labelled `out`: L15, L18, L21, L28, L35, L38, L51, L41b. L41a stays `in`.

L21 is the real hazard. Under AF1 a fresh orchestrator reading the log would conclude that it holds standing consent to push. Only the memory file says otherwise (`implement-spec-status.md`, which L71 cites).

**AF3, the reinstatement trap.** This is a hypothetical row L75 that supersedes L57, which is itself the correction of L28.

- Treated as a plain attack: `L28 under plain attack: in`. Knocking out L57 reinstates the wrong row L28.
- Treated as a replacement, where L75 also attacks what L57 attacked: `L28 under replacement: out`.

So "supersedes" has to be modelled as attack plus inheritance (§3, question 2).

**AF4, checks as arguments.** Each check is an argument. A later check with the same name and the opposite result attacks the earlier one. A failing check attacks the row that claims that check:

| Row | Check that claims it | Failing check that attacks it | Later result | Label |
|---|---|---|---|---|
| L50 (brief written; check passes) | `brief` | 22:14:02Z fail ("P-48 … INCONCLUSIVE with no assumption") | pass at 22:14:11Z | `in` |
| L54 and L66 | `trail` | 22:28:32Z fail | pass at 22:40:20Z | `in` |
| L14 | `npm-test` | 21:15:38Z fail ("decisions.test.mjs:57 exact SEEDED match rejects new … rows") | the passes that follow | `in` |

The script reports `acyclic=true`. Each failure is `out` and each claim is reinstated. This is Dung's defence at work: S attacks every attacker of the claim [Def 6].

**IBIS reading.** Taking each phase as an issue and its last `in` row as the head, the living issues are `start` (L53, a run marker that should be left out), `project/intake/notes/discrepancies` (L57, stale; see §2, item 4) and `project/replication/open-decisions` (L60, genuinely open).

**What the example shows:**

- On our real log, Dung's computation is trivial: 3 rounds, no undecided arguments, and every semantics agrees.
- The value is elsewhere. The labelling exposed two attacks that were never linked (L71 → L21, L43 → L41b), one stale living issue (L57) and one modelling trap (AF3).

## 5. Cost and fit

**Complexity.**

- In general, grounded acceptance is P-complete and computable in polynomial time. The least fixed point is "reached after at most linearly many iterations" [DD17 §3.3.1, Table 1].
- On acyclic frameworks every semantics reduces to computing the grounded extension [DD17 §3.4.1, Table 2].
- The naive loop in the script costs O(rounds × (|AR| + |attacks|)). It took 3 rounds on 73 rows. Thousands of rows would take milliseconds in Node.
- If symmetric attacks are ever added (two open QOC options attacking each other), grounded stays polynomial. Only preferred and stable get hard [DD17 Table 1], and we don't need them.

**Libraries** (licenses checked on GitHub, 2026-10-11):

| Library | License | Language | Notes |
|---|---|---|---|
| TweetyProject | LGPL-3.0 from v1.6 (README §License; the GitHub API reports GPL-3.0 from `gpl_license.txt`) | Java | Mature and active (pushed 2026-10-11). Has `arg-dung` and `arg-bipolar` modules |
| pygarg | LGPL-3.0 (LICENSE file) | Python | Pushed 2024-11 |
| arguegraph | MIT | JS | 1 star, last push 2024-06; not mature |

None is worth adding. A Java or Python dependency is new to this Node repo, which the ticket's rules forbid. The grounded labelling is about 20 lines, the `grounded()` function in the script. **Write it, don't import it.**

**How it reaches the orchestrator.**

- **Digest line for #25:** `decisions: 73 rows (2 run markers); 63 in, 7 out (6 superseded, 1 withdrawn), 1 partly out (L41); living: L60 (awaits user), L57 (stale?)`. The counts are computed from the AF2 labelling. Exact wording is for #25 to decide.
- **Query:** `honour()` returns the `in` rows that are settled policy. `whatFalls(line)` returns the arguments that lose all defence if a given line goes `out`. That second query needs the support edges from §2.

**How it reaches the dashboard.** The viewer already draws `supersedes` links (`origin/viewer:factory/viewer/layout.js`, `buildGraph`). The label maps onto its black, white and grey style: solid for `in`, outline for `out`, grey for `undec`.

**How it feeds the high-dimensional model.**

- **Node features:** the label (`in`/`out`/`undec`), the node kind (position, check, stop, evidence), the IBIS state (living, settled, abandoned, latent) [KR70 ¶9], and later the IBIS issue type (factual, deontic, explanatory, instrumental) [KR70 ¶7]. A local model under 8 GB, such as `qwen2.5:3b-instruct` (already pulled), could tag the issue type. That is untested.
- **Typed edges for the KG-embedding tickets:** `replaces`, `withdraws`, `refutes` (check → claim), `evidential-support` (row → pointer), `necessary-support` (row → the row it rests on), and the issue relations from [KR70 ¶6]: `successor`, `generalization`, `analogy`.
- **A constraint, not a learned feature:** the labelling is derived from the edges, so recompute it rather than learn it. An embedding should instead *propose missing attack edges*, which a person or the orchestrator then confirms.
  - L71 → L21 and L43 → L41 are two real positive test cases from this report.
  - Conflict-freeness [Dung95 Def 5] is a hard check on any proposed edge set: no attack between two rows that both stay `in`.

## 6. Verdict

**ADAPT.**

Keep:

- the grounded labelling (`in`/`out`/`undec`) as a node label;
- typed attack and support edges: replace with inheritance, withdraw, refute by check, evidential support, necessary support;
- IBIS living and settled states for "what's open".

Drop:

- the search over semantics: on an append-only log the attack graph is acyclic, so every semantics coincides [Dung95 Thm 30; DD17 §3.4.1];
- any solver library.

The real gap is logging, not computing. Two attacks were never written down (L71 → L21, L43 → L41), rejected options sit only in prose, and the phase is a topic rather than an issue key. QOC's criteria fit as the standing `in` policy rows, such as the 8 GB cap (L3) and local-only models (L41a). Later options get assessed against those. This is a mapping I propose, not something QOC91's abstract states.

## Sources

All accessed 2026-10-11.

- **[Dung95]** P. M. Dung, "On the acceptability of arguments and its fundamental role in nonmonotonic reasoning, logic programming and n-person games", *Artificial Intelligence* 77(2) (1995) 321–357, doi:10.1016/0004-3702(94)00041-X. Read from the copy at https://cse-robotics.engr.tamu.edu/dshell/cs631/papers/dung95acceptability.pdf (sha256 c78ee6d0…fba3). The ScienceDirect PDF returned HTTP 403.
- **[KR70]** W. Kunz and H. W. J. Rittel, "Issues as elements of information systems", Working Paper No. 131, IURD, UC Berkeley, July 1970. https://escholarship.org/uc/item/5cj786v8. A scan with no text layer, read page by page.
- **[CL13]** C. Cayrol and M.-C. Lagasquie-Schiex, "Bipolarity in argumentation graphs: Towards a better understanding", *International Journal of Approximate Reasoning* (2013). https://hal.science/hal-01123535. Its §2.2 restates the definitions of C. Cayrol and M.-C. Lagasquie-Schiex, "On the acceptability of arguments in bipolar argumentation frameworks", ECSQARU 2005, LNCS 3571, 378–389, doi:10.1007/11518655_33. The 2005 paper itself is paywalled; only its abstract was read, at https://link.springer.com/chapter/10.1007/11518655_33. Logged as `fetch.failed` `cayrol2005acceptability`.
- **[DD17]** W. Dvořák and P. E. Dunne, "Computational Problems in Formal Argumentation and their Complexity", Handbook of Formal Argumentation, also *IfCoLog J. Logics and their Applications* 4(8) (2017) 2557–2622. https://www.dbai.tuwien.ac.at/staff/dvorak/files/HOFA-complexity-updated-v1.pdf.
- **[QOC91]** A. MacLean, R. M. Young, V. M. E. Bellotti and T. P. Moran, "Questions, Options, and Criteria: Elements of Design Space Analysis", *Human–Computer Interaction* 6(3–4) (1991), doi:10.1080/07370024.1991.9667168. Only the abstract was read, at https://www.tandfonline.com/doi/abs/10.1080/07370024.1991.9667168. The full text is paywalled; logged as `fetch.failed` `maclean1991qoc`.
- **Library licenses:**
  - https://github.com/TweetyProjectTeam/TweetyProject (README "License")
  - https://github.com/jgmailly/pygarg/blob/main/LICENSE
  - https://github.com/mattsouth/arguegraph
- **Factory files read:**
  - `CONTEXT.md`
  - `factory/read.mjs`
  - `factory/decisions.tsv`
  - `factory/audit/99ae39b6-466d-4630-a835-56ff7c650197.tsv`
  - `factory/checks/trail.mjs:143`
  - `factory/agents/**`
  - `origin/viewer:factory/viewer/layout.js` and `origin/viewer:CONTEXT.md` (Viewer section). Both are on PR #24's branch and not yet on main.
