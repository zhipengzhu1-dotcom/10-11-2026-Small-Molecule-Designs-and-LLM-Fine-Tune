# Honest views of high-dimensional structure

Issue #30, map #26. Written 2026-10-11. Verdict: **ADAPT**.

The question: if the node model lives in hundreds of dimensions, what should a person see, and how do we say how much the picture distorts? I read the primary sources listed at the end, then measured four projections and two topological summaries on the 73 real rows of `factory/decisions.tsv`. I compared them with the 3-D force layout in PR #24 (`factory/viewer/layout.js` on `origin/viewer`).

Citations look like [vdM&H 2008, §3.2]. Short names are listed under Sources. Numbers marked *measured* come from the throwaway script described in section 4. It was kept outside the repo.

## 1. The structure

**Points.** Each decision row *i* is a vector x_i in R^D, and d(x_i, x_j) is the distance between two rows. In the worked example, x_i embeds the row's `decision`, `why` and `result` text. That is the same text `buildGraph` in `layout.js` reads. D is 378 for TF-IDF and 2048 for a local LLM.

**Projections** map each x_i to y_i in R^2 or R^3.

- *PCA* projects onto the directions of greatest variance. Its axes mean something, and it has factor loadings. Non-linear methods have neither [UMAP 2018, §6].
- *t-SNE* turns distances into joint probabilities. The input side uses Gaussian p_ij, each tuned to a user-set perplexity, "a smooth measure of the effective number of neighbors" [vdM&H 2008, §2]. The map side uses Student-t q_ij = (1+‖y_i−y_j‖²)⁻¹ / Σ_{k≠l}(1+‖y_k−y_l‖²)⁻¹. The method minimises KL(P‖Q) [vdM&H 2008, §3.1, eq. 4]. The heavy tail fights the "crowding problem": the area of a 2-D map cannot hold the moderately distant neighbours of a 10-D manifold [§3.2–3.3]. The cost function is not convex [§6.2], so different seeds give different maps.
- *UMAP* builds a weighted k-NN graph. Each edge weight is w(x_i, x_ij) = exp(−max(0, d(x_i,x_ij)−ρ_i)/σ_i), where ρ_i is the distance to the nearest neighbour. It symmetrises the graph as B = A + Aᵀ − A∘Aᵀ, then lays it out by minimising edge-wise cross-entropy with a force-directed scheme [UMAP 2018, §3.1–3.2]. n_neighbors trades fine detail against the big picture, and min_dist is "essentially aesthetic" [§4.3].

**Distortion** is measured on neighbourhoods. Let r(i,j) be the rank of j by distance from i in the data, and r̂(i,j) its rank in the map. U_k(i) holds the points in i's k-neighbourhood on the display but not in the data. V_k(i) holds the reverse.

- Trustworthiness: M1(k) = 1 − 2/(Nk(2N−3k−1)) · Σ_i Σ_{j∈U_k(i)} (r(i,j) − k).
- Continuity: M2(k) has the same form, over V_k(i) with r̂ [Venna&Kaski 2005, §2.1, eqs. 1–2].

Low trustworthiness means the map shows false neighbours. Low continuity means it hides true ones. "Every nonlinear projection method needs to make a compromise" between the two, which is the precision–recall trade-off [Venna&Kaski 2005, abstract and §1; Venna et al. 2010, §2.1]. The normalisation keeps the score in [0,1] only for k < N/2 [sklearn `trustworthiness` docstring].

**Topological summaries** need no choice of axes.

- *Mapper*: pick a filter f: X→R and cover its range with intervals of length l and overlap p. Cluster each preimage, make one vertex per cluster, and add an edge where two clusters share points (the nerve of the cover) [Singh et al. 2007, §2.1, §3]. The paper's clustering is single linkage, cut at the first empty bin of a k-bin histogram of merge lengths [§3.1].
- *Persistent homology*: the Vietoris–Rips complex VR(X, ε) spans a simplex wherever all pairwise distances are ≤ ε [Carlsson 2009, Def. 2.5]. Tracking homology over all ε at once gives a barcode of (birth, death) intervals [§2.3, Prop. 2.12]. The H0 barcode is exactly single-linkage clustering at every scale, and a long gap between bar ends is a "stability interval" where the cluster count holds [Carlsson 2009, §3.4].

**Multi-dimensional chart forms.** A SPLOM shows "axis-aligned views for every possible pair of reduced dimensions" [Sedlmair et al. 2013, §1]. Parallel coordinates [Inselberg 1985] and small multiples (Munzner's chapter 12, "Facet into Multiple Views") are the other two named in the ticket. I could not read either text (see Sources), so this note relies on neither for any claim.

## 2. Mapping

| What we log now | Where | What it becomes here |
|---|---|---|
| `decision`, `why`, `result` text | decisions.tsv | The vector x_i (TF-IDF or an embedding). Same text `buildGraph` scans. |
| `phase` (slash path) | decisions.tsv | A label, not an input. It colours the view, and it is the test of whether neighbours are "same phase" (same-phase@5 below). The first two segments (`project/implement`, `start`…) give a coarser label for k-NN accuracy. |
| `ts` | decisions.tsv | A Mapper filter (time lens), and the x-axis of the linked swimlane. |
| `supersedes line N` inside the text | decisions.tsv | A pair constraint: a superseding row should be its predecessor's nearest neighbour. `layout.js` finds it with `/supersedes line (\d+)/` in decision/why/result. |
| "supersedes the grading part of …" in **evidence** | decisions.tsv line 43 | The same constraint, but `layout.js` misses it: the phrase is in the evidence column and does not cite a line. Measured: the viewer draws 6 supersedes links, but there are 7. |
| `evidence` | decisions.tsv | A second relation (co-citation). `layout.js` already builds evidence nodes from it. Left out of the vectors so the label test stays clean. |
| `agent.start`/`agent.stop` ts, `status` | activity files | Duration and status axes of a parallel-coordinates row per agent. |
| `artifact` (count, `kind`), `check` (`result`), `fetch.failed` | activity files | Further axes: artifacts, checks passed, checks failed, failed fetches. |
| `role` | activity files | Would facet small multiples by role, but all 47 `agent.start` events say `general-purpose`, so it carries nothing (measured). |
| `run` | activity files | Facet: one small multiple per run. |

**Missing, and what it would cost:**

- **Ticket id on agent events.** Without it there are no small multiples per ticket, and no "same ticket" neighbour test. One optional field in `log.mjs` and the hook, already asked for in #21. Cheap.
- **Supersession as a field, not prose.** Either a 7th TSV column, which changes the reader, `layout.js` and the trail check and is a moderate cost, or let the viewer's regex also scan `evidence` and accept phase names, which is cheap. Today one of seven supersessions is invisible.
- **Stored vectors and projection scores.** Nothing records which embedding or which projection a picture used, or its T(k)/C(k). Cheap: compute on read (the whole worked example runs in about 7 s) and print the scores beside the view.
- **Per-agent cost (tokens, wall time beyond start/stop).** Not logged. It would be another parallel-coordinates axis. It needs the hook to read the transcript, which is a moderate cost.

## 3. Questions it answers for the orchestrator

Projections are views for people. The orchestrator should query the full space, not a picture of it. On TF-IDF, every measured view scores between 0.63 and 0.85 on T(10), where the full space scores 1 and random scores 0.53. Measured against each decision the orchestrator makes today:

- **Supersede.** "Before I append this row, is its nearest neighbour an earlier row on the same topic?" In TF-IDF space, all 7 supersession pairs are mutual rank-1 neighbours (measured). This is a full-space k-NN query, not a projection. It is the most useful thing this research found for the orchestrator. It also surfaces unlinked near-duplicates: lines 52 and 65 (see §4).
- **Pick the next ticket.** Not answered. Projections and Mapper say nothing about blocking order or value. That belongs to #34.
- **Re-dispatch.** Partly. A parallel-coordinates row per agent (duration, artifacts, checks failed, status) shows agents that stopped with ISSUES and a failed check. The digest can list them without any chart, though. Per-ticket views need the ticket field.
- **Merge.** Not answered.
- **Declare done.** Not answered directly. The H0 barcode can back a sanity line ("decision text has no persistent cluster structure"), but it doesn't test the spec.
- **Trust a picture at all.** Every view the dashboard shows should carry its T(k) and C(k), so neither the orchestrator nor a person reads a cluster into a projection that the scores don't support. t-SNE "cluster sizes … mean nothing" and "distances between clusters might not mean anything" [Wattenberg et al. 2016, §2–3]. UMAP "can tend to find manifold structure within the noise" [UMAP 2018, §6].

**How it feeds the node model (#37):**

- *As a constraint on embeddings.* Any embedding chosen in #27/#28 should pass the neighbour tests in §4: supersession pairs at rank 1, and same-phase@5 at least the TF-IDF baseline of 0.66. This is a test, not a feature.
- *As typed edges.* Two candidates: `near` edges (the full-space k-NN graph, or UMAP's fuzzy graph B), and `near-duplicate` edges below a distance threshold. Each edge needs a source and a threshold recorded.
- *Not as node features.* 2-D/3-D coordinates are lossy views and should never feed the model. Mapper and H0 cluster membership could become features, but at our scale they are degenerate (§4).

## 4. Worked example

**Data.** All 73 rows of `factory/decisions.tsv` at `af3bdea`, numbered by file line as the viewer branch numbers them (`line = i + 1`). The 47 agents in the two runs under `factory/agents/` come from `readStream()`.

**Method.** A throwaway Node script lived in the session scratchpad and is not committed. It read the decision log and a copy of `origin/viewer:factory/viewer/layout.js`. It embedded the decision+why+result text two ways:

1. TF-IDF: 378 terms with document frequency ≥ 2, sublinear tf, L2-normalised.
2. `qwen2.5:3b-instruct` through the local Ollama `/api/embed`: 2048 dimensions. GPU memory went from 3.4 GB idle to 7.2 GB with the model loaded, so the model took about 3.8 GB, under the 8 GB cap.

It then computed these views:

- PCA (Gram-matrix power iteration).
- Exact t-SNE as in [vdM&H 2008, §3.4]: exaggeration 4 for 50 iterations, momentum 0.5→0.8 at 250, learning rate 100 with adaptive gains, 1000 iterations. Perplexity was 10, because perplexity must be below N [Wattenberg et al. 2016, §1, note of 2016-10-18].
- UMAP (umap-js 1.4.0, n_neighbors 10, min_dist 0.1).
- The viewer's own `buildGraph` + `createSimulation`, run to rest (300 ticks, 147 nodes, 206 links).
- A random 3-D cloud as the floor.

The stochastic methods ran 5 seeds each (random: 20 draws), shown as mean [min–max]. T and C are M1 and M2 above. **same-phase@5** is the mean share of a row's same-phase rows (up to 5) found among its 5 nearest neighbours. **top-kNN** is leave-one-out 5-NN accuracy on the first two phase segments, the measure [Venna et al. 2010, §4.3.1] use. **sup in top-5** counts the 7 supersession pairs where the older row sits in the newer row's 5-NN.

**TF-IDF space (D = 378; PC1–3 explain 4.0, 3.5, 3.3% of variance):**

| View | T(5) | C(5) | T(10) | C(10) | same-phase@5 | top-kNN | sup in top-5 |
|---|---|---|---|---|---|---|---|
| full space | 1 | 1 | 1 | 1 | 0.663 | 0.63 | 7/7 (all rank 1) |
| PCA 2-D | 0.758 | 0.815 | 0.775 | 0.804 | 0.424 | 0.74 | 7/7 |
| PCA 3-D | 0.825 | 0.846 | 0.803 | 0.821 | 0.492 | 0.74 | 7/7 |
| t-SNE 2-D | 0.828 [.808–.854] | 0.783 [.747–.812] | 0.718 [.702–.734] | 0.697 [.675–.717] | 0.608 | 0.62 | 7/7 |
| t-SNE 3-D | 0.866 [.854–.874] | 0.853 [.831–.871] | 0.785 [.768–.795] | 0.769 [.739–.788] | 0.629 | 0.64 | 7/7 |
| UMAP 2-D | 0.901 [.894–.906] | 0.864 [.860–.873] | 0.832 [.825–.841] | 0.815 [.806–.826] | 0.576 | 0.67 | 7/7 |
| UMAP 3-D | 0.914 [.907–.925] | 0.884 [.877–.889] | 0.846 [.836–.857] | 0.838 [.830–.848] | 0.606 | 0.69 | 7/7 |
| viewer 3-D force layout | 0.659 | 0.663 | 0.626 | 0.636 | 1.000 | 0.86 | 7/7 |
| random 3-D | 0.516 | 0.506 | 0.531 | 0.530 | 0.074 | 0.51 | 0.2/7 |

**qwen2.5:3b-instruct space (D = 2048; PC1–3 explain 18.1, 11.9, 7.0%):**

| View | T(10) | C(10) | same-phase@5 | sup in top-5 |
|---|---|---|---|---|
| full space | 1 | 1 | 0.328 | 3/7 (ranks 1, 71, 27, 9, 15, 1, 1) |
| PCA 2-D | 0.882 | 0.926 | 0.098 | 2/7 |
| t-SNE 2-D | 0.858 | 0.895 | 0.332 | 3.8/7 |
| UMAP 2-D | 0.851 | 0.895 | 0.258 | 3.2/7 |
| viewer 3-D force layout | 0.591 | 0.598 | 1.000 | 7/7 |

What the numbers say:

1. **PCA vs t-SNE vs UMAP.** On TF-IDF, UMAP 2-D scores best on both T and C at k = 5 and 10. t-SNE 2-D keeps the most same-phase neighbours (0.61 vs UMAP 0.58, PCA 0.42), but it has the worst continuity at k = 10 (0.70). All three keep every supersession pair in the top 5, because those pairs repeat text and are rank-1 in the full space. PCA 2-D does best on coarse phase (top-kNN 0.74, above the full space's 0.63). That suggests coarse phase lies along the top variance directions, and PCA drops some within-phase noise. UMAP's authors warn that their approximations can hurt "for small (less than 500 samples) dataset sizes" [UMAP 2018, §6]. We have 73.
2. **The viewer's 3-D graph does not show content similarity.** Against text neighbourhoods it scores T(10) 0.63, barely above random (0.53). It keeps every same-phase pair together (1.00) because tree springs tie each decision to its phase node (`STRENGTH.tree = 1` in `layout.js`). It is an honest picture of the phase tree and supersedes links, and a poor picture of which decisions are alike.
3. **3-D over 2-D** adds 0.01–0.07 to T and C in every method here (e.g. t-SNE T(10) 0.718 → 0.785). The gain is small and real.
4. **qwen2.5:3b-instruct is not a usable embedding model here.** Row 55 restates row 15 ("supersedes line 15: asked #2 implementer to drop agent.stop events…"). Yet row 15 is the 71st of 72 neighbours of row 55. The cosine is 0.777 (`55↔15`), against 0.925 to the unrelated row 70. Batch and single calls agree, so this is not a batching bug. The top PC alone carries 18% of variance, a sign the vectors crowd into one direction. A decoder chat model is the wrong tool. #28 should test a real embedding model.

**Supersession as near-duplicate detection (TF-IDF).**

- The pair distances (√(2−2cos)) are 0.38 (59↔38), 0.59 (60↔51), 0.60 (57↔28), 0.69 (55↔15), 0.89 (56↔18), 0.91 (58↔35) and 0.95 (43↔41).
- Among rows in no pair, the closest 1-NN is 0.73: lines 11↔53, the two `start` rows. Next is 0.91: lines 52↔65, both `project/implement/handoff`. Row 52 is the 22:17 handoff. Row 65 is the audit's late row about the same handoff, and nothing links the two.
- The median 1-NN distance for rows in no pair is 1.17, against √2 = 1.41 for orthogonal texts.
- A 0.70 threshold catches 4 of 7 supersessions with no false flags. Rank 1 alone catches all 7, but every row has a rank-1 neighbour, so rank needs the distance as well to be precise. A 0.92 threshold catches 6 of 7 and flags 4 other rows (11, 53, 52, 65). All four are real near-duplicates.
- In qwen space the pair distances (0.26–0.67) sit inside the ordinary 1-NN range (median 0.31), so it cannot tell a supersession from any other row.

**Mapper** used 8 intervals at 50% overlap, and the paper's single-linkage cut with 10 bins [Singh et al. 2007, §3.1]:

- *TF-IDF, PC1 lens:* 112 nodes, 101 singletons, largest node 2 rows, 63 components, 0 loops. *Time lens:* 123 nodes, 112 singletons. This is degenerate. The histogram heuristic finds an empty bin almost at once, because TF-IDF distances are nearly uniform (above). Node purity (0.98) means nothing when nodes hold one row.
- *qwen, PC1 lens:* 36 nodes, 14 components, 0 loops. The largest nodes hold 35, 27 and 25 rows. Exact-phase purity is 0.32. *Time lens:* 57 nodes, 28 components, 0 loops. Top-level purity is 0.84 against 0.73 for random membership with the same node sizes. The only tight node both lenses find is lines 24–27 and 32–34. Those are seven `project/intake/...` rows the orchestrator logged from the #3 reader and #5 cataloger reports, with results such as "adopted (#3 reader)". It is a writer-and-template cluster, not a phase.
- **Does Mapper show phase structure better than the force layout?** No. The force layout encodes phase by construction. Mapper on these 73 rows either breaks into singletons or forms mixed blobs barely purer than chance. Neither space showed a loop or a flare.

**H0 barcode** (single-linkage merge heights, [Carlsson 2009, §3.4]):

- *TF-IDF:* bars end between 0.38 and 1.28. The widest stability interval (0.21) leaves 72 components. No scale holds a handful of persistent clusters. The last to join the rest is the pair {15, 55}.
- *qwen:* the widest gap (0.25) leaves 2 components: row 37 (the aime fetch in a Chrome tab) against everything else. The next gaps are 0.04 and 0.03.
- In both spaces the decision text has no multi-cluster shape at today's size.

**Agent activity (parallel-coordinates axes).** There are 47 agents in 2 runs. 44 have both start and stop. Status counts: PASS 20, ISSUES 23, unknown 2, plus 2 orchestrators with no stop. Five real rows, with their axes (minutes, artifacts, checks passed, checks failed, failed fetches, status):

| agent (run/agent) | min | art | pass | fail | ff | status |
|---|---|---|---|---|---|---|
| 14c93a90/aca88395f9aed1a30 | 8.8 | 11 | 2 | 0 | 2 | PASS |
| 14c93a90/a8c3a0e644fed1580 | 18.2 | 2 | 1 | 0 | 0 | PASS |
| 14c93a90/a3e2cb2ca7737289b | 0.7 | 0 | 0 | 1 | 0 | ISSUES |
| 14c93a90/a80af6a42eac91925 | 11.4 | 0 | 2 | 1 | 0 | PASS |
| 99ae39b6/ace5facb31c3b2567 | 5.1 | 0 | 0 | 1 | 0 | ISSUES |

Six numeric-or-ordinal axes over 47 lines is easy to read as parallel coordinates or a sorted table. But 24 of the 47 have no artifact, check or failed fetch at all, so half the lines would pile up at zero. With no ticket field, small multiples per ticket are impossible.

## 5. Cost and fit

**Complexity at our scale.**

- Exact t-SNE costs time and memory quadratic in N. The paper calls it infeasible "for data sets that contain many more than, say, 10,000 points" [vdM&H 2008, §5].
- UMAP's cost is bounded by approximate nearest-neighbour search, empirically about O(N^1.14) [UMAP 2018, §4.2].
- T(k)/C(k) need full rank lists: O(N² log N), which is 25 M pairs at N = 5,000. Fine for a batch read.
- Mapper here is single linkage per interval, O(n²) per interval. H0 is a minimum spanning tree, O(N²) on a dense distance matrix.
- Measured: two embeddings, PCA, 20 t-SNE and 20 UMAP runs, the force layout, Mapper and H0 on 73 rows took about 7 s in total. Hundreds of rows now and thousands later both fit in a batch step.

**Libraries** (license and last push from the GitHub REST API, read 2026-10-11):

| Library | What | License | Note |
|---|---|---|---|
| scikit-learn | PCA, t-SNE, `trustworthiness` | BSD-3-Clause | Has no continuity function. Continuity is M2, i.e. `trustworthiness` with the two spaces swapped (eqs. 1–2). Python: a new stack for this Node repo. |
| lmcinnes/umap (umap-learn) | reference UMAP | BSD-3-Clause | Python. |
| PAIR-code/umap-js | UMAP in JS | Apache-2.0 (LICENSE file) | npm `package.json` says MIT; the LICENSE file says Apache-2.0. Check before vendoring. |
| scikit-tda/kepler-mapper | Mapper | MIT | Python. |
| scikit-tda/ripser.py | Vietoris–Rips persistence | MIT | Python. |
| giotto-ai/giotto-tda | TDA suite | AGPL-3.0 | Avoid: copyleft, last push 2024-06. |
| saehm/DruidJS | DR in JS | LGPL-3.0 | Copyleft. |
| karpathy/tsnejs | t-SNE in JS | none stated | Do not use: no license. |
| flekschas/regl-scatterplot | WebGL scatter | MIT | Only if a scatter outgrows canvas. |
| mrdoob/three.js | 3-D | MIT | What PR #24 loads, from jsDelivr at 0.170.0. |

At our scale none of these is needed. T(k)/C(k) take about 15 lines, PCA about 20, and H0 about 10, all in plain Node with no dependency (the throwaway was about 300 lines including t-SNE). UMAP is the one piece worth a library, and the small-data caveat [UMAP 2018, §6] makes PCA the safer default below 500 rows.

**How it reaches the orchestrator.** One digest line for #25, computed on read. For example: `views: pca2d T10=.78 C10=.80, umap2d T10=.83 C10=.82 (n=73, tfidf) · clusters: none persist (H0 widest gap leaves 72) · near-dups unlinked: 11~53 .73, 52~65 .91`. Add one query for the orchestrator's own use: `nearest(row text) → [line, distance, phase]` over the full space, run before it appends a decision.

**How it reaches the dashboard.** A 2-D scatter (PCA by default, UMAP as an option) coloured by phase, with its T(10)/C(10) printed on the panel. Supersedes and mentions are drawn as overlays. Brushing links it to the swimlane and to a 2-D phase tree. Hover shows the row. SVG or canvas is enough at hundreds to a few thousand points.

**Is 3-D worth its interaction cost?** For projections, no. A study of 816 scatterplots found 2-D "often 'good enough'" and that "interactive 3D rarely helps but often hurts in terms of poorer class separation and usability" [Sedlmair et al. 2013, abstract, §1]. An earlier study it cites found 2-D as good as or better than 3-D for search "even when the data variance accounted for by the 2D representation was only 50-70% of that of the 3D representation" [§3.1, citing Westerman and Cribbin]. The counter-evidence is about node-link graphs, not projections. Head-coupled stereo let people understand graphs about 3× larger [Ware&Franck 1996, abstract]. Stereo plus motion let unskilled viewers trace paths in 333-node graphs at under 10% error, and skilled viewers in 1000-node graphs, which the authors report as roughly an order of magnitude better than 2-D [Ware&Mitchell 2008, abstract]. Those gains need stereo or structured motion and graphs in the hundreds to thousands. Our graph has 147 nodes, and every supersedes chain is one hop. Our own +0.01–0.07 gain in T/C from a third axis does not pay for orbit controls.

## 6. Verdict

**ADAPT.**

- *Adopt* the measurement. Every projection a person sees carries T(k) and C(k) at k = 5, 10 (Venna & Kaski), computed on read from the full space. The H0 barcode becomes one digest line on whether the decisions cluster at all.
- *Adopt* full-space nearest-neighbour queries for the orchestrator. The supersede check works at rank 1 for all 7 real pairs, and it found two unlinked near-duplicates.
- *Adapt* the human view. A 2-D PCA scatter (UMAP optional, with its small-data warning shown) sits beside a 2-D phase tree with linked brushing. The 3-D force graph stays, at most, as an optional view of the phase tree. On our rows it scores 0.63 trustworthiness against text neighbourhoods, near random's 0.53. three.js is not needed for anything this research recommends.
- *Skip for now* Mapper and higher persistent homology. On 73 rows Mapper is either all singletons (TF-IDF) or mixed blobs barely purer than chance (qwen), and there are no loops to find. Revisit at 500+ rows or with a real embedding model.
- *Skip* t-SNE as the default. It is no better than UMAP on T/C here, it varies by seed, and it has its known misreadings [Wattenberg et al. 2016, §2–3].

**New questions for the node-model decision (#37):**

- Which local embedding model? TF-IDF beat `qwen2.5:3b-instruct` on every neighbour test, so #28 must measure a real embedding model under 8 GB on these same tests.
- Should supersession become a structured field? One of the 7 is invisible to the viewer today because it sits in `evidence`.
- The ticket field on agent events (#21) is a precondition for per-ticket views and per-ticket neighbour tests.
- What does "neighbour" mean in the node model: text only, or text + phase + time + evidence? Every T/C score depends on that choice.
- Does piece C keep three.js at all? This evidence says 2-D is enough at our size.

## Sources

- [vdM&H 2008] L. van der Maaten, G. Hinton, "Visualizing Data using t-SNE", *JMLR* 9:2579–2605, 2008. https://www.jmlr.org/papers/volume9/vandermaaten08a/vandermaaten08a.pdf. Read §2, §3.1–3.4, §5, §6.2.
- [UMAP 2018] L. McInnes, J. Healy, J. Melville, "UMAP: Uniform Manifold Approximation and Projection for Dimension Reduction", arXiv:1802.03426v3. https://arxiv.org/pdf/1802.03426v3. Read §3.1–3.2, §4.2–4.3, §6.
- [Venna&Kaski 2005] J. Venna, S. Kaski, "Local multidimensional scaling with controlled tradeoff between trustworthiness and continuity", WSOM 2005. https://research.cs.aalto.fi/pml/papers/wsom05_lmds.pdf. Read §1, §2.1. This was used in place of the ticket's *Neural Networks* 19(6–7):889–899 (2006) paper by the same authors, DOI 10.1016/j.neunet.2006.05.014, which is paywalled (logged as `fetch.failed`).
- [Venna et al. 2010] J. Venna, J. Peltonen, K. Nybo, H. Aidos, S. Kaski, "Information Retrieval Perspective to Nonlinear Dimensionality Reduction for Data Visualization", *JMLR* 11:451–490, 2010. https://www.jmlr.org/papers/volume11/venna10a/venna10a.pdf. Read §2.1, §4.3.
- [sklearn] scikit-learn `sklearn/manifold/_t_sne.py`, `trustworthiness` docstring, main branch, read 2026-10-11.
- [Wattenberg et al. 2016] M. Wattenberg, F. Viégas, I. Johnson, "How to Use t-SNE Effectively", *Distill*, 2016. https://distill.pub/2016/misread-tsne/. Read §1–6 and the 2016-10-18 edit note.
- [Singh et al. 2007] G. Singh, F. Mémoli, G. Carlsson, "Topological Methods for the Analysis of High Dimensional Data Sets and 3D Object Recognition", Eurographics SPBG 2007. https://research.math.osu.edu/tgda/mapperPBG.pdf. Read §2–3.2, §4.1.
- [Carlsson 2009] G. Carlsson, "Topology and Data", *Bull. AMS* 46(2):255–308, 2009. https://www.ams.org/journals/bull/2009-46-02/S0273-0979-09-01249-X/. Read §1, §2.2–2.3, §3.1, §3.4.
- [Sedlmair et al. 2013] M. Sedlmair, T. Munzner, M. Tory, "Empirical Guidance on Scatterplot and Dimension Reduction Technique Choices", *IEEE TVCG* 19(12), 2013. https://www.cs.ubc.ca/labs/imager/tr/2013/ScatterplotEval/ScatterplotEval.pdf. Read abstract, §1–3.
- [Ware&Franck 1996] C. Ware, G. Franck, "Evaluating Stereo and Motion Cues for Visualizing Information Nets in Three Dimensions", *ACM TOG* 15(2):121–140, 1996, DOI 10.1145/234972.234975. Abstract only, from the author's institution: https://scholars.unh.edu/ccom/939.
- [Ware&Mitchell 2008] C. Ware, P. Mitchell, "Visualizing Graphs in Three Dimensions", *ACM TAP* 5(1), 2008, DOI 10.1145/1279640.1279642. Abstract only: https://scholars.unh.edu/ccom/467.
- [Inselberg 1985] A. Inselberg, "The plane with parallel coordinates", *The Visual Computer* 1(2):69–91, 1985, DOI 10.1007/BF01898350. Not read: behind a login wall (logged as `fetch.failed`). Cited for the chart form's name only.
- [Munzner 2014] T. Munzner, *Visualization Analysis and Design*, CRC Press, 2014. Only the chapter list on https://www.cs.ubc.ca/~tmm/vadbook/ was read. The book text is not open (logged as `fetch.failed`).
- Library licenses: GitHub REST API `https://api.github.com/repos/<owner>/<repo>` and each repo's LICENSE file, read 2026-10-11.
- Factory: `CONTEXT.md`, `factory/read.mjs`, `factory/decisions.tsv` (main at `af3bdea`), `factory/agents/**`, and `factory/viewer/layout.js` and `factory/viewer.mjs` on `origin/viewer` (`fcb3c16`).
