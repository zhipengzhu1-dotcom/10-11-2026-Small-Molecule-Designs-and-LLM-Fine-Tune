# Graph and knowledge-graph embeddings for factory nodes

Issue #27, map #26. Written 2026-10-11. Desk research plus one throwaway script run on the real log. The script lived in the session scratchpad and is not committed.

**Question.** Should each factory node (phase, decision, evidence source, and later ticket, agent and artifact) get a vector in a space of tens to hundreds of dimensions, where distance and direction carry the graph's structure? If so, which family of embedding fits a small, typed graph that keeps growing?

**Short answer.** Partly. Two training-free structures earn a place. The phase tree goes into the Poincaré disk by Sarkar's construction, which reconstructs it perfectly in 2 dimensions. Laplacian eigenmaps give a structural coordinate block. The learned families (DeepWalk, node2vec, TransE, RotatE, GCN, GraphSAGE) don't pay at 147 nodes and 206 edges. Structure alone can't tell 18 of the 73 decisions apart, and the text of a row predicts its supersession links better than any embedding. Verdict: **ADAPT** (§6).

Sources are cited inline as `[key §section]`. Keys, links and versions are listed at the end. Every number about our graph comes from the run described in §4.

---

## 1. The structure

**Graph.** The factory graph is G = (V, E, τ). V holds typed nodes and E typed edges. Today the viewer's `buildGraph` (`factory/viewer/layout.js`, branch `viewer` at fcb3c16) makes four node kinds (root, phase, decision, evidence) and four edge kinds:

- `tree`: phase path parent to child, and phase to decision
- `supersedes`: parsed from "supersedes line N"
- `mentions`: from `#N` to a `ticket-N` phase outside the row's own phase
- `evidence`: a source cited in two or more phases, linked to each decision that cites it

An embedding is a map f: V → M into a d-dimensional space M. The goal is that a distance in M reproduces some relation in G.

**Spectral (Laplacian eigenmaps).** Take a weight matrix W, with W_ij = 1 when i and j share an edge (the "simple-minded" choice [LE §2 step 2b]), degree matrix D_ii = Σ_j W_ji and Laplacian L = D − W. Solve the generalized eigenproblem **L f = λ D f** (eq. 2.1), drop f₀ (the constant vector, λ = 0), and embed node i as x_i = (f₁(i), …, f_m(i)) [LE §2 step 3]. This minimizes Σ_ij ‖y_i − y_j‖² W_ij = tr(YᵀLY) under YᵀDY = I. Put plainly, it is the best way to keep linked nodes close [LE §3.1, eq. 3.1]. The graph must be connected [LE §2 step 3]. Ours is.

**Random-walk families (DeepWalk, node2vec).** Treat short truncated random walks as sentences and nodes as words, then train SkipGram over a window w [DW §4.1–4.2, Alg. 1–2]. node2vec biases the walk with a return parameter p and an in-out parameter q, which trade structural equivalence against homophily [N2V §3.2.2, Alg. 1]. With negative sampling, DeepWalk is implicitly factorizing a closed-form matrix built from the random-walk transition matrix D⁻¹A. NetMF computes that matrix and factorizes it with an SVD, with no training [NetMF abstract, §2.2 eq. 7, §3 Alg. 3].

**Knowledge-graph embeddings (TransE, RotatE).** Facts are triples (h, ℓ, t). TransE wants **h + ℓ ≈ t** under an L1 or L2 energy d(h + ℓ, t). It trains a margin ranking loss against corrupted triples, with entity vectors held to unit norm [TransE §2, eq. 1–2, Alg. 1]. RotatE wants **t = h ∘ r** in ℂᵏ with |r_i| = 1, so each relation rotates each coordinate [RotatE §3.2, eq. 2]. That lets it model symmetric, inverse and composed relations. TransE can't model symmetric relations, because a symmetric relation is forced to a zero translation [RotatE §3.1, §3.2 "Connection to TransE"].

**Graph neural networks (GCN, GraphSAGE).** A GCN layer is H⁽ˡ⁺¹⁾ = σ(D̃^−½ Ã D̃^−½ H⁽ˡ⁾ W⁽ˡ⁾), with Ã = A + I and H⁽⁰⁾ = X, the node features [GCN §2, eq. 2]. It is semi-supervised, needs node features and labels, and is "limited to undirected graphs" without edge features [GCN §7.2]. GraphSAGE learns aggregator functions over sampled neighbourhoods rather than a vector per node, so it can embed unseen nodes from their features [SAGE §1 "Present work", §3.1].

**Hyperbolic (Poincaré).** Points live in the open unit ball, and the distance is d(u, v) = arcosh(1 + 2‖u − v‖² / ((1 − ‖u‖²)(1 − ‖v‖²))) [Poincaré §3, eq. 1]. Trees embed in the 2-D Poincaré disk with arbitrarily low distortion, which Euclidean space can't match in any number of dimensions [Sala §1, §3 citing Sarkar and Bourgain]. Sarkar's construction does this with no optimization and in linear time. Each node's children go evenly round a hyperbolic circle of radius τ (Euclidean radius (e^τ − 1)/(e^τ + 1)), as far from the parent as possible [Sala §3.1, Alg. 1]. Its cost is precision: the bits needed grow linearly with the longest path and logarithmically with degree [Sala §3.2].

---

## 2. Mapping

Each field we already log, and what it becomes here.

| Logged today | Where | Becomes | Notes |
|---|---|---|---|
| `phase` (slash path) | `decisions.tsv` | `tree` edges, root → phase → … → decision. 60 phase nodes, 133 tree edges | A hierarchy. Embedded in the Poincaré disk (§4b), it acts as a **constraint on the embedding**. |
| `decision`, `why`, `result` text | `decisions.tsv` | `supersedes` edges (6) from "supersedes line N", `mentions` edges (27) from `#N`. The full text also becomes **node features** | The edges are regex-derived, so predicting them from structure is partly circular (§3). Text vectors are #28's job. |
| line number (`line`, added on branch `viewer` by `read.mjs`) | derived | the decision node's id | Needed for supersedes. |
| `evidence` (`;`-separated pointers) | `decisions.tsv` | `evidence` nodes (13) and edges (40) for sources cited in two or more phases | Sources cited in one phase are dropped by `buildGraph`, so most pointers never become edges. |
| `result` (open, adopted, closed, …) | `decisions.tsv` | node label | A label, not an edge. Free text, with no closed vocabulary. |
| `ts` | both | a node attribute. Not an edge in `buildGraph` | Time order sits beside the embedding as an attribute. |
| `agent.start` `role`, `parent` | activity files | agent node, plus a `spawned-by` edge | **No information today.** All 47 starts say `role: general-purpose` and `parent: orchestrator` (see #21, #25). |
| `agent.stop` `status` | activity files | agent label (22 PASS, 24 ISSUES, 3 unknown) | Useful as a label to predict, once agents are nodes. |
| `artifact` `path`, `kind`, `ref` | activity files | artifact node, a `produced` edge from the agent, a `ref` edge to the reference | 42 events, 13 kinds. |
| `check` `name`, `result`, `evidence` | activity files | check node, plus a `verifies` edge to the evidence path | 32 events. Names are free-form (`npm-test` and `npm test` are both logged). |
| `fetch.failed` `ref` | activity files | a `failed` edge from the agent to the ref, closed by a later `artifact` with the same `ref` | 4 events. |

**What's missing, and what it costs to start logging it.**

- **Ticket id on agent events.** 0 of the 174 activity events have a ticket or issue field. Without it, agents and artifacts have no edge into the decision graph. Only 8 of 45 worker agents are named by id in any decision row (for example, line 13 cites `a8ac4f829492d7dc9`). Only 8 of 40 artifact paths appear verbatim in a row. *Cost:* the orchestrator puts the ticket in the dispatch prompt and the agent passes `ticket=N` on its events. That is one optional field, plus a test. It overlaps #21 and #25.
- **Structured supersession.** Line 43 supersedes "the grading part of project/replication/local-models-only" (line 41), but it names a phase rather than a line, so `buildGraph` draws no edge. *Cost:* `factory/checks/trail.mjs` could require `supersedes line N` whenever a row says it supersedes an earlier row. Line 66, which only reports that other rows were superseded, shows the rule has to tell the two cases apart. This needs no schema change: the 6-column format stays.
- **Decision → agent and decision → artifact edges.** These exist today only as free-text evidence pointers. *Cost:* a parser for `factory/agents/<run>/<agent>.jsonl` and `branch worktree-agent-<id>` pointers, which already follow a fixed shape. No new logging is needed.
- **A closed vocabulary for `result`.** It would turn labels into relation types. *Cost:* a trail-check rule. The 73 existing rows would need a mapping, and they can't be edited (append-only), so the mapping would live in a lookup table.

---

## 3. Questions it answers for the orchestrator

Each question is tied to a decision the orchestrator makes today, with what the measurement on our log says (§4).

| Orchestrator decision | Embedding query | Does it work on our log? |
|---|---|---|
| **Supersede**: which earlier row does a new row correct? | Nearest earlier decisions to the new row | Structure helps, but text helps more. Holding out each of the 6 supersedes edges: eigenmaps (d = 16) rank the true target with MRR 0.644, Adamic–Adar 0.608, TransE 0.077 to 0.293 (by epochs), a plain "same phase" rule 0.806, and word overlap of the decision text **1.000** (top in 6 of 6). Use text plus phase, and structure as a tie-break. |
| **Supersede**: is this decision likely to be superseded? | Density or outlier score of the row | **No.** Of the 6 superseded rows, 4 fell for an evidence pointer that didn't resolve or pointed at the wrong file (lines 55, 57, 58, 60). 2 fell for overclaiming (56, 59). None of those is a graph property. It is the trail check's job. |
| **Supersede**: is there a supersession the log missed? | Pairs of decisions at near-zero distance | **Yes, once.** Line 43's nearest neighbour is line 41 at distance 0.000, because both share the evidence node `user message 2026-10-11` and each sits alone in a sibling leaf phase under `project/replication`. Text overlap also puts 41 first. The graph has no edge between them (§2). |
| **Pick the next ticket**: which ticket should this decision mention? | Link prediction on `mentions` | **Weak, and circular.** Best is TransE at MRR 0.270 (1000 epochs), against 0.033 for random choice. The edge comes from `#N` in the text, so the regex is exact by construction. Picking a ticket needs the ticket DAG (blocked-by), which is a separate structure. |
| **Re-dispatch**: does this agent's run look like past ISSUES runs? | Nearest agent nodes | **Not answerable yet.** Agents aren't linked to decisions or tickets (§2), and every role is `general-purpose`. |
| **Merge**: is this evidence already cited elsewhere? | Neighbours of an evidence node | A plain adjacency lookup answers it exactly. An embedding adds nothing here. |
| **Declare done**: are there open decisions with no closing row? | Density or coverage | A plain query on `result` and phase answers it. No embedding needed. |
| **Any view a person sees**: how much does this picture lie? | Reconstruction MAP of the view | **Yes. This is the clearest win.** The viewer's 3-D force layout scores MAP 0.690 on the phase tree. The 2-D Poincaré disk scores 1.000 (§4b). |

On our log, the high-dimensional model only beats plain graph queries in two places: finding the missed supersession at line 43, and scoring how much a view distorts. Both come from training-free methods. This answers the map's first Fog item for this family.

---

## 4. Worked example

**Input.** The real `factory/decisions.tsv` at HEAD af3bdea (73 rows, lines 2–74). It is rebuilt exactly as the viewer does it: `tree()` from `factory/viewer.mjs` and `buildGraph` from `factory/viewer/layout.js` at fcb3c16. The result is **147 nodes** (1 root, 60 phases, 73 decisions, 13 evidence) and **206 edges** (133 tree, 6 supersedes, 27 mentions, 40 evidence). The graph is connected. Everything is plain JavaScript in Node 24 with no dependencies, written for this ticket and not committed. It uses a cyclic Jacobi eigensolver, Sarkar's construction with complex Möbius maps, TransE following [TransE Alg. 1], and the MAP metric of [Poincaré §4.1]. For each node u, all other nodes are ranked by distance, and the score is the average precision of u's true neighbours in that ranking.

### a. Reconstruction quality against dimension (choosing d)

All 147 nodes, all edge kinds:

| Embedding | d | MAP |
|---|---|---|
| Laplacian eigenmaps | 2 | 0.278 |
| | 3 | 0.466 |
| | 4 | 0.505 |
| | 8 | 0.576 |
| | 16 | 0.647 |
| | 32 | 0.766 |
| | 64 | 0.847 |
| Viewer's 3-D force layout (`createSimulation`, settled after 300 ticks) | 3 | 0.541 |

The eigenmap curve never levels off. At d = 64 it is using 64 of the 146 non-trivial eigenvectors, so it is close to storing the graph rather than compressing it. That pattern fits a graph made mostly of tree: Euclidean space keeps needing dimensions for trees [Sala §1]. The solve takes 68 ms for n = 147.

### b. The phase tree: Euclidean against hyperbolic

The phase tree alone has 134 nodes, maximum degree 22 and depth 6.

| Embedding | d | MAP | Worst distortion |
|---|---|---|---|
| Laplacian eigenmaps | 2 / 8 / 16 / 32 | 0.232 / 0.316 / 0.385 / 0.758 | (not computed) |
| Sarkar in H², τ = 1 | 2 | 0.230 | 66.6 |
| Sarkar in H², τ = 2 | 2 | 0.564 | 33.9 |
| **Sarkar in H², τ = 4** | **2** | **1.000** | **2.34** |
| Sarkar in H², τ = 6 | 2 | 1.000 | 1.52 |
| Viewer's 3-D force layout | 3 | 0.690 | (not computed) |

Adding the supersedes and mentions edges on the same 134 nodes: Sarkar H² gets 0.898 and the viewer layout 0.653.

So yes: hyperbolic space holds the hierarchy in far fewer dimensions. 2 hyperbolic dimensions beat 32 Euclidean ones on our tree. That matches the WordNet results, where Poincaré in 5 dimensions got MAP 0.823 against 0.168 for Euclidean in 200 [Poincaré Table 1], and Sarkar's construction in 2 dimensions got 0.989 [Sala abstract, §5]. The precision cost [Sala §3.2] is visible already. At τ = 6 the outermost point sits 3.8 × 10⁻¹⁵ from the disk's edge, close to the limit of float64. τ = 4 (1 − 6.1 × 10⁻¹⁰) is the safe setting at depth 6. A deeper phase tree would need more bits or more dimensions. On WordNet, cutting the precision from about 500 bits to 32 cost going from 2 dimensions to 10 [Sala §1].

### c. What structure can't see

**18 of the 73 decisions fall into 7 groups of twins**: decisions with exactly the same neighbour set. The largest group is lines 42, 45, 46, 47 and 48, all in `project/implement/ticket-10`, each linked only to that phase. In the eigenmap they coincide at every d up to 64. Their largest gap is 6.5 × 10⁻⁹, against a mean pair distance of 0.6. At d = 3 and d = 16, 35 decisions share an exact position with some other node.

This isn't an eigenmap defect. Any method that sees only structure gives twins the same vector, or different vectors only through training noise. The GCN paper ties its propagation rule to the Weisfeiler–Lehman test [GCN App. A], and the WL-1 test gives two nodes with the same neighbour labels the same colour. The fix is node features: GraphSAGE's own premise is to "leverage node features (e.g., text attributes …)" [SAGE §1]. Here, that means text (#28).

### d. Link prediction, holding out one cross-link at a time

Ranks are filtered [TransE §4.2] among nodes of the right kind, and ties count against the method. Eigenmaps use d = 16. TransE uses k = 32, L1, margin 1 and 300 epochs, averaged over 3 seeds; one 1000-epoch run is in brackets.

| Held-out kind (n, about how many candidates) | Eigenmaps MRR | Adamic–Adar MRR | TransE MRR | Random choice MRR |
|---|---|---|---|---|
| supersedes (6, ~72) | **0.644** | 0.608 | 0.077 [0.293] | 0.027 |
| mentions (27, ~59) | 0.109 | 0.040 | **0.195** [0.270] | 0.033 |
| evidence (40, ~69) | **0.184** | 0.014 | 0.033 | 0.029 |

Training-free beats learned on 2 of the 3 relations. The learned KG model wins only on `mentions`, and that edge is recovered exactly by a regex anyway. TransE was trained on 141k (WordNet) to 17.5M (FB1M) triples over 41k to 1M entities [TransE §4.1, Table 2]. We have 206 triples. RotatE's extra power (symmetric, inverse and composed relations [RotatE §3.1]) doesn't apply either: none of our four relations is symmetric, and none is the inverse of another.

### e. Embedding new nodes without re-solving

The test embeds lines 2–64 (the graph before the audit's late rows), then adds the 18 nodes that lines 65–74 bring. Each new node is placed from the eigen-equation alone: f(u) = Σ_{v∼u} f(v) / (d_u (1 − λ)), which is eq. 2.1 [LE §2] solved at one node with the old λ.

Whole-graph MAP is 0.619 inserted against 0.647 re-solved. On the new nodes it is 0.380 against 0.660. Cheap insertion costs a lot of quality, while re-solving the whole graph costs 68 ms. DeepWalk can be updated with walks from the changed region "without the need for global recomputation" [DW §3.1, §4.4.1]. GraphSAGE reports DeepWalk as 100 to 500 times slower at test time on unseen nodes, because it needs fresh walks and SGD [SAGE §4.3]. GraphSAGE itself needs features and a trained aggregator [SAGE §3.1–3.2]. **At hundreds to low thousands of nodes, the inductive answer is to recompute.** The catch is that re-solved eigenvectors can flip sign or rotate inside degenerate eigenspaces. Our spectrum has eigenvalue 0.293 four times, 0.5 three times, and 1.0 fifteen times. Stored coordinates from yesterday therefore aren't comparable with today's, so the digest should store query answers, not raw vectors.

### f. Nearest neighbours of real rows (eigenmaps, d = 16)

- **Line 43** (`replication/grading`): nearest is line 41 (`local-models-only`) at 0.000. Text overlap also ranks 41 first, with Jaccard 0.21. This is the real, unlinked supersession from §2.
- **Line 30** (`implement/frontier`, "started #4, #5, and both #9 reviewers"): nearest are lines 40 (ticket-4), 56 and 18 (ticket-8), then 63 (layout). These are pulled in by its four `mentions` edges. Its text neighbours (23, 42, 29) are different rows. The two channels disagree, so they carry different information.
- **Line 66** (ticket-12 audit): nearest is line 67 at 0.000, a twin in the same phase, followed by 53 (the run's `start` row) and 54. Structure places it by phase and run, which is correct but not new.

---

## 5. Cost and fit

**Measured cost at our scale.** One run of everything in §4 takes about 11 s on CPU, and that is mostly the 219 TransE trainings in the hold-out loop. One eigenmap solve takes 68 ms, and Sarkar's construction takes microseconds. Nothing needs a GPU, so the 8 GB cap isn't a constraint for this family.

| Method | Complexity | At thousands of nodes | Library (license, checked 2026-10-11 via GitHub API) |
|---|---|---|---|
| Laplacian eigenmaps | Dense Jacobi O(n³). Sparse Lanczos/ARPACK for k vectors is about O(k·\|E\|) per iteration | Dense plain JS: about 20 s at n = 1000 (extrapolated from 68 ms at n = 147) and about 45 min at n = 5000, so switch to a sparse solver | scikit-learn `SpectralEmbedding` (`sklearn/manifold/_spectral_embedding.py`, **BSD-3-Clause**). scipy `eigsh` (ARPACK, **BSD-3-Clause**). networkx (**BSD-3**, per its `LICENSE.txt`). Or about 60 lines of in-repo JS, no dependency. |
| Sarkar H² | Linear time [Sala §3.1] | Trivial | HazyResearch/hyperbolics has **no license file** (GitHub returns 404 for its license), so its code can't be reused. About 40 lines of in-repo JS. |
| Poincaré (trained) | Riemannian SGD [Poincaré §3.1] | Fine | facebookresearch/poincare-embeddings is **CC BY-NC 4.0 and archived**, so avoid it. geoopt is **Apache-2.0**. |
| DeepWalk / node2vec | Walks plus SkipGram SGD [DW §4.2, N2V §3.2.3] | Fine | PyG `Node2Vec` (**MIT**). aditya-grover/node2vec (**MIT**). gensim (**LGPL-2.1**). phanein/deepwalk (its LICENSE says GNU Library GPL v3). karateclub (**GPL-3.0**). |
| TransE / RotatE | SGD over triples [TransE Alg. 1, RotatE §3.3] | Fine | PyKEEN (**MIT**; `models/unimodal/trans_e.py`, `rotate.py`). DeepGraphLearning/KnowledgeGraphEmbedding (**MIT**). |
| GCN / GraphSAGE | Training needs labels and features. Memory O(\|E\|) [GCN §3.1] | Fine | PyG `GCNConv`, `SAGEConv` (**MIT**). tkipf/gcn (**MIT**). williamleif/GraphSAGE (**MIT**). |

Every Python library above would be a new dependency for a Node repo. Under this ticket's rules, the only adoptable route right now is in-repo JS for eigenmaps and Sarkar's construction. scipy or scikit-learn become worth it only once the graph passes a few thousand nodes.

**How it reaches the orchestrator (#25).** It would be one digest line built from query answers, never raw vectors. For example:

```
graph: 147 nodes / 206 edges · view MAP: phase disk 1.00, 3-D 0.69 · 35/73 decisions indistinguishable by structure · unlinked supersession? line 43 ≈ line 41 (shared evidence, similar text)
```

It could also be a query, for example `node factory/viewer.mjs --near <line>`, that returns the k nearest rows from structure and text side by side. This is a proposal only; nothing here builds it.

**How it reaches the dashboard.** First, show each view's MAP next to it, so the distortion is stated. Second, draw the phase tree as a 2-D Poincaré disk, which has MAP 1.000 against the 3-D layout's 0.690, with cross-links laid over it. Third, outline twin groups, so a person can see where structure runs out. This bears on the map's Fog question of whether the dashboard keeps three.js. For the tree, a 2-D hyperbolic view is strictly more faithful.

**How it feeds the node model (#37).** It feeds the model in three ways.

- **As a constraint on embeddings:** the phase hierarchy is placed in H², by construction rather than by training.
- **As typed edges:** supersedes, mentions, evidence and parent stay explicit and are answered by lookup.
- **As node features:** a 16-dimensional eigenmap block, plus per-type degree, can sit beside the text vector from #28.

---

## 6. Verdict

**ADAPT.**

Adopt the two training-free structures:

1. **Sarkar's H² construction for the phase tree.** 2 dimensions, MAP 1.000, linear time, no dependency.
2. **Laplacian eigenmaps** as a structural coordinate block (d around 16) and as the distortion yardstick for every view. They are re-solved each time, at 68 ms.

Both are cheap, exact or close to it at our scale, and the papers back them [LE §3.1, Sala §3].

Skip the learned families for now. On our graph:

- The learned families lose to training-free methods on 2 of 3 relations (§4d).
- Structure can't separate 18 of 73 decisions (§4c).
- Text predicts supersession perfectly where structure doesn't (§3).
- KG embeddings were validated on 141k triples and up, not hundreds [TransE Table 2].
- GCN needs labels and is limited to undirected graphs without edge features [GCN §3, §7.2].

Revisit TransE, RotatE or GraphSAGE once agents and tickets are linked nodes (§2), the graph reaches thousands of nodes, and there is a text-feature channel for GraphSAGE to aggregate. The logging fixes in §2 (ticket id on events, a supersedes pointer the trail check enforces) come first, because they create the edges that any embedding would need.

---

## Sources

All read on 2026-10-11. Arguments were checked against the full text, not abstracts, unless marked.

- **[LE]** M. Belkin, P. Niyogi, "Laplacian Eigenmaps for Dimensionality Reduction and Data Representation", *Neural Computation* 15(6):1373–1396, 2003. https://www2.imm.dtu.dk/projects/manifold/Papers/Laplacian.pdf
- **[DW]** B. Perozzi, R. Al-Rfou, S. Skiena, "DeepWalk: Online Learning of Social Representations", KDD 2014. arXiv:1403.6652. https://arxiv.org/abs/1403.6652
- **[N2V]** A. Grover, J. Leskovec, "node2vec: Scalable Feature Learning for Networks", KDD 2016. arXiv:1607.00653. https://arxiv.org/abs/1607.00653
- **[NetMF]** J. Qiu, Y. Dong, H. Ma, J. Li, K. Wang, J. Tang, "Network Embedding as Matrix Factorization: Unifying DeepWalk, LINE, PTE, and node2vec", WSDM 2018. arXiv:1710.02971v4. https://arxiv.org/abs/1710.02971
- **[TransE]** A. Bordes, N. Usunier, A. Garcia-Durán, J. Weston, O. Yakhnenko, "Translating Embeddings for Modeling Multi-relational Data", NeurIPS 2013. https://proceedings.neurips.cc/paper_files/paper/2013/file/1cecc7a77928ca8133fa24680a88d2f9-Paper.pdf
- **[RotatE]** Z. Sun, Z.-H. Deng, J.-Y. Nie, J. Tang, "RotatE: Knowledge Graph Embedding by Relational Rotation in Complex Space", ICLR 2019. arXiv:1902.10197v1. https://arxiv.org/abs/1902.10197
- **[Poincaré]** M. Nickel, D. Kiela, "Poincaré Embeddings for Learning Hierarchical Representations", NeurIPS 2017. arXiv:1705.08039v2. https://arxiv.org/abs/1705.08039
- **[Sala]** C. De Sa, A. Gu, C. Ré, F. Sala, "Representation Tradeoffs for Hyperbolic Embeddings", ICML 2018. arXiv:1804.03329v2. https://arxiv.org/abs/1804.03329
- **[GCN]** T. Kipf, M. Welling, "Semi-Supervised Classification with Graph Convolutional Networks", ICLR 2017. arXiv:1609.02907. https://arxiv.org/abs/1609.02907
- **[SAGE]** W. Hamilton, R. Ying, J. Leskovec, "Inductive Representation Learning on Large Graphs", NeurIPS 2017. arXiv:1706.02216. https://arxiv.org/abs/1706.02216
- **Licenses:** `gh api repos/<owner>/<repo>` (`.license.spdx_id`), plus `gh api repos/<owner>/<repo>/license` where the SPDX id was NOASSERTION or missing. Both run on 2026-10-11.
- **Factory files read:** `CONTEXT.md`, `factory/read.mjs` (main and branch `viewer`), `factory/decisions.tsv` (af3bdea), `factory/agents/**` (2 runs, 46 agents, 174 events), and `factory/viewer.mjs` and `factory/viewer/layout.js` (branch `viewer`, fcb3c16).
