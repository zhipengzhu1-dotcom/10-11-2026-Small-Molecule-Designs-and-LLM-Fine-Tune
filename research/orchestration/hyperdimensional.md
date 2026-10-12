# Hyperdimensional computing for structured factory records

Issue #29, map #26. Written 2026-10-11. Desk research plus one throwaway script, which is kept outside the repo.

The question: can each factory record (a decision with its phase, evidence and supersession, or an agent's run of events) become one vector of about 10,000 dimensions, built by algebra with no training, and does that vector help the orchestrator more than plain queries on the fields we already log?

Short answer: the algebra works on our real rows exactly as the theory predicts, and at our scale it adds nothing that the typed fields behind it don't already give exactly and more cheaply. **Verdict: SKIP** the hypervectors. Keep the role–filler schema, which carries over to any node model.

## Sources

Each source was read from the paper itself, not from a summary. PDFs and text extracts are in the session scratchpad, not in git.

| Key | Source | Copy read |
|---|---|---|
| K09 | P. Kanerva, "Hyperdimensional computing: an introduction to computing in distributed representation with high-dimensional random vectors", *Cognitive Computation* 1:139–159, 2009. doi:10.1007/s12559-009-9009-8 | Author PDF, rctn.org/vs265/kanerva09-hyperdimensional.pdf (OpenAlex lists it as closed access) |
| P95 | T. Plate, "Holographic reduced representations", *IEEE Trans. Neural Networks* 6(3):623–641, 1995 | Author preprint (plate.ieee95.pdf, 21 pp.). Page numbers below are the preprint's |
| G03 | R. Gayler, "Vector symbolic architectures answer Jackendoff's challenges for cognitive neuroscience", ICCS/ASCS 2003 | arXiv cs/0412059 |
| KP1 | D. Kleyko, D. Rachkovskij, E. Osipov, A. Rahimi, "A survey on HDC aka VSA, Part I: models and data transformations", *ACM Computing Surveys* 55(6), 2022 | arXiv 2111.06077v2 |
| KP2 | Same authors, "Part II: applications, cognitive models, and challenges", *ACM Computing Surveys* 55(9), 2023 | arXiv 2112.15424v3 |
| F18 | E. P. Frady, D. Kleyko, F. Sommer, "A theory of sequence indexing and working memory in recurrent neural networks", *Neural Computation* 30(6), 2018 | arXiv 1803.00412 |
| S21 | K. Schlegel, P. Neubert, P. Protzel, "A comparison of vector symbolic architectures", *Artificial Intelligence Review*, 2021 | arXiv 2001.11797v4 (accepted version) |
| T21 | A. Thomas, S. Dasgupta, T. Rosing, "A theoretical perspective on hyperdimensional computing", *JAIR* 72, 2021 | arXiv 2010.07426v3 |
| TH | Torchhd, github.com/hyperdimensional-computing/torchhd | `LICENSE`, `setup.py`, `torchhd/structures.py` and `torchhd/tensors/` via the GitHub API, 2026-10-11 |
| NS | NengoSPA, github.com/nengo/nengo-spa | `LICENSE.rst` via the GitHub API, 2026-10-11 |

Factory files read: `CONTEXT.md` (Factory logs), `factory/read.mjs`, `factory/decisions.tsv` (73 rows, lines 2–74), every activity file under `factory/agents/**` (2 runs, 45 subagents plus the orchestrator, 174 events), and `factory/viewer/layout.js` from branch `viewer` (PR #24; it is not on main).

## 1. The structure

**Space.** Atomic symbols are random vectors in d dimensions, typically d ≈ 10,000. Two random 10,000-bit vectors differ in about 5,000 bits with a standard deviation of 50, so "less than a millionth of the space is closer than 0.476" (normalized Hamming distance). Every new random vector is therefore almost orthogonal to all earlier ones, and "we run out of time before we run out of vectors" (K09, "Hyperdimensional Representation", p. 143). An *item memory* (also called clean-up memory) stores the meaningful vectors. Its job is nearest-neighbour search, which turns a noisy result back into the stored symbol (K09, "Item Memory", p. 146; KP1 §2.2.5).

**Three operations** (G03, "Vector Symbolic Architectures"; KP1 §2.2.3):

- **Bundling** (superposition, ⊕): an elementwise sum, optionally normalized. The result stays similar to every input, so it represents a set (K09, "Representing Sets with Sums", p. 146; KP1 §2.2.3.1).
- **Binding** (⊗): a multiplication-like operation. The result is dissimilar to both inputs, but bound pairs of similar inputs are similar. Unbinding with one input recovers the other, plus crosstalk noise when the binding sits inside a bundle (KP1 §2.2.3.2).
- **Permutation** (ρ): a fixed reordering of coordinates. ρ(a) is dissimilar to a and is inverted by ρ⁻¹. It encodes order or "quotes" a vector so that other operations leave it alone (G03; KP1 §2.2.3.2).

**A record** is a bundle of role⊗filler pairs. Kanerva's example is H = X⊗A ⊕ Y⊗B ⊕ Z⊗C, for name, sex and year of birth. To query role X, compute X⊗H = A + R₁ + R₂. A is in the item memory and R₁, R₂ act as random noise, so clean-up returns A. Adding fields to a record leaves it similar to the old record, because "each 'field' spans the entire vector" (K09, "Representing Data Records with Sets of Bound Pairs", pp. 150–151). KP1 §3.1.3 calls role–filler bindings "a very general way of representing structured data records". A record vector can itself be a filler, which gives nesting (P95 §V.E; KP1 §3.5.2).

**Graphs and sequences.** An edge is the binding of its two node vectors, and a graph is the bundle of its edges: g = a⊗b ⊕ a⊗e ⊕ … A directed edge permutes its head, a⊗ρ(b). For graphs over the same node vectors, the dot product of two graph vectors measures their overlapping edges (KP1 §3.5.1, eqs. 20–21). A sequence is s = ρ⁰(a) ⊕ ρ¹(b) ⊕ ρ²(c) …, or the bound product of the same terms (KP1 §3.3.3, eqs. 17–18; K09, "Representing Sequences by Permuting Sums", p. 149). An n-gram profile is a bundle of n-gram vectors (KP1 §3.3.4).

**Flavours compared:**

| Flavour | Atoms | Bind / unbind | Cost of one bind | Notes |
|---|---|---|---|---|
| HRR (P95) | real, N(0, 1/d) | circular convolution / circular correlation, an approximate inverse (P95 §II.F) | O(d log d) (S21 §2.4) | Unbinding is approximate, so clean-up is always needed (KP1 §2.3.3) |
| FHRR (Plate 1994, via KP1 §2.3.5) | unit phasors | elementwise complex multiply / conjugate | O(d) | Fewest dimensions: 340 for 99% retrieval of 15 bundled pairs, against 520 for HRR and 780 for MAP-B (S21 §3.3, Table 2). Not self-inverse |
| MAP, bipolar (Gayler 1998; G03) | {−1, +1} | elementwise multiply; self-inverse, since a⊗a = 1 (G03, Response 1) | O(d) | Isomorphic to BSC (KP1 §2.3.7). Integer arithmetic only |
| BSC (Kanerva; KP1 §2.3.6) | {0, 1} | XOR; self-inverse | O(d) | A special case of FHRR with angles 0 and π. Bit-packable |

Self-inverse binding is what makes Kanerva's record-to-record mapping work ("What is the dollar of Mexico?"). FHRR and HRR can't do that directly (S21 §2.5 and §5).

**Capacity.** Retrieval is a detection problem. The correct item's similarity has to beat the m − 1 distractors in the item memory. Frady et al. give the accuracy as p_corr = ∫ φ(h) Φ(h + s)^(m−1) dh (F18 §2.2.1, eq. 12; restated as KP1 §2.4, eq. 14). In their notation the dimension is N and the alphabet is D. For superposing M items they show that one "universal" sensitivity, s = √(N/M), fits HDC, HRR and FHRR alike (F18 §2.3.1). Plate's earlier closed form is d ≈ 4.5(k + 0.7) ln(m / 30q⁴): the dimension needed for k bound pairs, with an m-item memory and probability q of any error (P95 Appendix B). Thomas et al. prove that d = O(s ln m) suffices to decode a given set of size s with high probability. A uniform guarantee over *every* set needs s ≪ √d (T21 §3.1.2–3.1.3). Capacity is linear in d and only logarithmic in the vocabulary size.

## 2. Mapping

Rules for what each logged field becomes. The parsing reuses the rules in `factory/viewer/layout.js` `buildGraph`, so this layer and the viewer agree on what counts as an edge.

| Logged now | Where | Becomes |
|---|---|---|
| decision row (line *n*) | `decisions.tsv` | record vector H_n = ⊕ role⊗filler, plus `SELF⊗row:n`, so other records can point at it |
| `phase` (slash path) | `decisions.tsv` | `PHASE⊗phase:<path>` and `PARENT⊗phase:<parent path>`. The tree edge becomes a bound pair |
| `phase` ending in `ticket-N` | `decisions.tsv` | `TICKET⊗ticket:N` |
| `#N` in decision, why or result | `decisions.tsv` | `MENTIONS⊗ticket:N` (the viewer's `mentions` edge) |
| `supersedes line N` | `decisions.tsv` | `SUPERSEDES⊗row:N` (the viewer's `supersedes` edge) |
| each `;`-separated evidence source, with `@time` stripped | `decisions.tsv` | `EVID⊗src:<source>`, one per source (the viewer's `evidence` node) |
| `result`, first word | `decisions.tsv` | `RESULT⊗result:<word>` (adopted, closed, open, …) |
| run | not a column; derived from the `start` rows at lines 11 and 53 | `RUN⊗run:<id>` |
| `decision`, `why` text | `decisions.tsv` | `TEXT⊗(R·e)`: a local text embedding *e*, randomly projected to d (KP1 §3.2.3) and bound to a TEXT role |
| agent episode (`agent.start` … `agent.stop`) | `factory/agents/<run>/<agent>.jsonl` | trajectory vector = ⊕ over consecutive token pairs of ρ(tᵢ)⊗tᵢ₊₁ (bigram profile, KP1 §3.3.4). Tokens are `type`, plus `kind` for artifacts, `result` for checks and `status` for stops |
| `check` (`name`, `result`) | activity files | a trajectory token, and a `CHECK⊗<name>:<result>` pair if checks become records |
| `fetch.failed` (`ref`) | activity files | a trajectory token, and `REF⊗ref:<key>`, which links to the `artifact` that closes it |

How this feeds the node model (map #26): as **node features**. Each node gets a fixed-width vector that is the superposed set of its typed (role, filler) facts. Typed edges become features of their source node (`SUPERSEDES⊗row:15` lives in row 55's vector). The scheme gives no constraint on learned embeddings. It is a deterministic encoder, a hash of typed features into ℝᵈ.

**What's missing from our logs, and what it costs:**

| Gap | Why it matters here | Cost to start logging |
|---|---|---|
| A typed supersedes field | Line 43 says "supersedes the grading part of project/replication/local-models-only" in prose. The `supersedes line N` regex misses it, so the vector misses it too | One optional column or field in the decision writer; existing rows stay append-only |
| Ticket id and real role on agent events (#21) | Every agent is `general-purpose`, so a trajectory can't be bound to a ticket or role, and "unusual for a reader" can't be asked | One field passed through the `SubagentStart` hook payload or the orchestrator's prompt. Small |
| Run on decision rows | Derived here from `start` rows. That holds only while rows stay in order | One column, or keep deriving it |
| Decision → agent link | A row names an agent only when an evidence path contains its activity file (e.g. lines 13, 48, 59) | An optional `agent` field on decisions |
| Progress events inside an episode (tool calls, heartbeats) | Episodes have a median of 2 events (start, stop), so there is no trajectory to call "stuck". A stuck agent looks like any running one | A `PostToolUse` hook writing one event per tool call. Cheap per event, but it multiplies stream volume by roughly the tool-call count. A periodic heartbeat is cheaper |

## 3. Questions it answers for the orchestrator

| Orchestrator decision today | VSA query | What a plain query does instead |
|---|---|---|
| **Supersede**: does a later row already replace this one? | unbind: probe the record memory with `SUPERSEDES⊗row:N`, take the top record | look up the `supersedes` edge |
| **Merge / declare done**: which decisions rest on this evidence (a commit, a transcript, a file)? | probe with `EVID⊗src:<s>`; records above threshold | inverted index from source to rows |
| **Pick the next ticket**: what was decided under ticket N, and what mentions it? | probe with `TICKET⊗ticket:N` and `MENTIONS⊗ticket:N` | filter on phase prefix, or regex on `#N` |
| **Re-dispatch**: is this agent's episode unlike any past episode (an unusual or stuck run)? | cosine of its trajectory vector to past episodes; flag a low nearest-neighbour score | cosine of exact bigram-count vectors |
| **Supersede or merge**: which earlier decisions look like this new one, by text *and* structure? | cosine in one joint index of `TEXT⊗Re ⊕ Σ role⊗filler` | concatenate [text embedding ; typed-feature vector] |

Every row has an exact counterpart. VSA's claimed edge is doing them all as dot products in one fixed-width space (KP1 §3, intro). Section 4 measures whether that edge shows up on our data.

## 4. Worked example

Script: `hdc_example.py` in the session scratchpad (not committed). It uses Python and numpy, which were already on this machine, so no repo dependency. MAP with bipolar atoms and integer bundling (no sign threshold), 20 random seeds per setting. Inputs are the real `factory/decisions.tsv` and the output of `node factory/read.mjs`.

### One real row, by hand

Line 55: `2026-10-11T22:27:29Z  project/implement/ticket-2  supersedes line 15: asked #2 implementer to drop agent.stop events …  evidence: transcript 14c93a90-… @21:16:32; commits 4e010e9, 9843fdb  result: fixed in 4e010e9; …`

H₅₅ = SELF⊗row:55 ⊕ PHASE⊗phase:project/implement/ticket-2 ⊕ PARENT⊗phase:project/implement ⊕ TICKET⊗ticket:2 ⊕ MENTIONS⊗ticket:2 ⊕ SUPERSEDES⊗row:15 ⊕ EVID⊗src:transcript 14c93a90-c178-4f4b-b20f-235aebe7f882 ⊕ EVID⊗src:commits 4e010e9, 9843fdb ⊕ RESULT⊗result:fixed ⊕ RUN⊗run:99ae39b6

That's 10 bound facts. "Which row supersedes line 15?" becomes cos(SUPERSEDES⊗row:15, H_n) over all 73 records. H₅₅ scores about 1/√10 ≈ 0.32, and every other record scores about 0 ± 1/√d.

### The whole log

The 73 rows give 9 roles, 279 distinct fillers and 579 bound facts, with 6 to 11 facts per row (median 8).

| Query on all 73 real rows | d = 1,000 | d = 4,000 | d = 10,000 |
|---|---|---|---|
| "What phase is row n in?" Clean-up against all 279 fillers | 100% | 100% | 100% |
| "Which row supersedes row N?" (6 real pairs: 55→15, 56→18, 57→28, 58→35, 59→38, 60→51) | 6/6 | 6/6 | 6/6 |
| "Which rows cite source s?" R-precision over the 13 sources cited by ≥ 2 rows | 1.000 | 1.000 | 1.000 |
| Record-to-record cosine vs exact shared-fact overlap: residual std | 0.029 | 0.015 | 0.010 (corr 0.997) |

The residual std matches 1/√d (0.032, 0.016, 0.010). The record cosine is the exact count of shared (role, filler) pairs, normalized, plus noise of size 1/√d. That is the noise model of F18 and KP1 §2.4.

**Capacity at the ticket's three dimensions.** Bundle k random role⊗filler pairs into one vector, unbind each role, and clean up against m = 279 fillers (this log's vocabulary). Empirical accuracy matched F18 eq. 12 with s = √(d/(k−1)) to within about 0.01 everywhere. Example at d = 4,000: k = 200 gave 0.937 empirical vs 0.935 theory, and k = 400 gave 0.607 vs 0.617.

| d | largest k with ≥ 99% per-fact accuracy, m = 279 (theory / tested) | same, m = 5,000 (theory) | Plate App. B, all k pairs right with q = 0.01 |
|---|---|---|---|
| 1,000 | 35 / 32 | 27 | ≈ 10 |
| 4,000 | 139 / 128 | 107 | ≈ 42 |
| 10,000 | 346 / 256 (400 gave 97.9%) | 266 | ≈ 107 |

Plate's figure is much lower because it asks for *every* pair in the trace to be right, not each fact on average (P95 Appendix B).

Our records hold at most 11 facts, so **d = 1,000 already holds every record with room to spare.** The one use that would strain capacity is bundling the whole log into one vector (579 facts). Theory gives per-fact accuracy of 0.075 at d = 1k, 0.42 at 4k and 0.89 at 10k. One "graph vector" for the whole factory is unreliable even at 10,000 dimensions, so the item memory has to stay one vector per record.

### Trajectories (activity files)

The stream holds 48 start-to-stop episodes from the 45 subagents (some were resumed). Most are trivial: 15 are just `agent.start → agent.stop:ISSUES` and 8 are `agent.start → agent.stop:PASS`. I encoded each one as a bigram bundle at d = 10,000, with repeated tokens collapsed. The cosine between trajectory vectors correlated **0.9997** with the cosine of exact bigram-count vectors. Both methods flagged the **same 6 of 6** most unusual episodes (lowest nearest-neighbour similarity):

- `14c93a90/a9f6203f5bc1caf3e` (nn 0.38): the #3 source reader, `start → paper-pdf → paper-html → latex → code → dataset-card → notes → stop:PASS`. Unusual because it is the only fetch-everything run.
- `14c93a90/a7b213c0b2d2af87a` (nn 0.42): a lone `agent.stop:unknown` with no start. This is the orphan-stop pattern that lines 15 and 55 decided to drop.
- `a1f1f8b6c49ed7089`, `a8ac4f829492d7dc9` (nn 0.58): episodes ending `stop:unknown`.

The second and third bullets are already caught by plain rules ("stop with no start", "status unknown"). No episode in the log is stuck, and with a median of 2 events there is nothing to tell a stuck agent from one that is still running. Permutation encoding does capture order. What's missing is the data, not the algebra.

### One index for text and structure

Each row's decision, why and result text was embedded with the local `qwen2.5:3b-instruct` through Ollama's `/api/embed` (2,048-d; the model file is 1.9 GB, well inside the 8 GB cap). The embedding was randomly projected to d = 10,000, bound to a TEXT role and added to the structural bundle at weight 0.5. Results:

- The joint cosine correlated **0.996** with 0.5·(exact text cosine) + 0.5·(exact structural overlap).
- PHASE unbinding from the joint vectors still got 73/73 right.
- Nearest neighbours of line 43 (tiered grading): text only gave lines 41, 45, 8; structure only gave 41, 17, 51; joint gave 41, 17, 12. Line 41 is the row that line 43 supersedes in prose, and every method ranks it first.

So yes, VSA record vectors and learned text embeddings can share one index. But the joint vector reproduces a weighted concatenation [√w·e ; √(1−w)·f] with noise added, and the concatenation is exact. One side note: this generative model's embeddings are anisotropic (row-to-row cosine 0.53–0.98, mean 0.87). Picking a real embedding model is #28's question.

### Against plain queries (map #26 Fog item 1)

On our real logs, every VSA query gave the same answer as a dictionary lookup or exact sparse-vector cosine on the same fields. VSA gave the *same* answer, never a better one, plus 1/√d noise. Nothing in the log needed a capability that only superposition provides.

## 5. Cost and fit

- **Complexity.** Encoding a record costs O(k·d), with k ≤ 11 here. A brute-force query against n records costs O(n·d). Measured: one probe against 5,000 × 10,000 bipolar vectors took 68 ms in numpy on this CPU. Storage is 6.2 MB bit-packed (BSC) or 50 MB as int8. At hundreds of rows now and thousands later it is trivial, and no GPU is needed. The exact alternatives (a dict or inverted index, a sparse 279-feature vector) cost less still.
- **Dimension.** Capacity is linear in d and logarithmic in vocabulary size (F18 §2.3.1; T21 §3.1.3). Our records would fit at d = 1,000 even with a 5,000-filler vocabulary (theory: 27 facts at 99%). There is no reason to use 10,000.
- **Flavour.** If the encoding is ever used, use MAP-bipolar or BSC. It is self-inverse, integer-only and needs no FFT, and BSC packs to bits. FHRR's dimension advantage (S21 Table 2) doesn't matter when d = 1,000 already has headroom. HRR's O(d log d) binding and approximate unbinding buy nothing here.
- **Libraries.** Torchhd is the mature one: MIT license, v5.8.4 (2025-06-19), with MAP, BSC, HRR, FHRR, VTB and MCR in `torchhd/tensors/` and `Graph`, `HashTable` and `BundleSequence` in `torchhd/structures.py` (TH). It needs `torch`, `scipy` and `numpy` (`setup.py`), which is a new Python and PyTorch dependency for a Node factory, so the ticket's rule rules it out. NengoSPA is GPL v2 (NS), a copyleft risk for this repo. Writing it ourselves takes about 40 lines of Node with `Int8Array`, using only the operations in G03, Response 1.
- **How it would reach the orchestrator.** One digest line for #25, e.g. `unusual: a9f6203f nn-cos 0.38 to past episodes`, plus a `nearest(record, k)` query. A digest line for the dashboard and the #30 projections would come from the same similarity matrix. Both are just as easy to compute from the exact feature vectors.

## 6. Verdict

**SKIP.** On the real log, every query the orchestrator would ask came back 100% correct at d = 1,000. But the typed fields behind it give the same answers exactly: record cosine correlates 0.997 with exact overlap, trajectory cosine 0.9997 with exact bigram cosine, and both flag the same 6 of 6 unusual episodes. VSA's one unique ability is holding many facts in one fixed-width vector, and that is unreliable exactly where it would be needed: the whole log in one 10,000-d vector gives 89% per-fact accuracy.

**What carries over to #37** (not VSA-specific):

1. The role–filler schema in section 2 is a sound way to turn typed edges into node features.
2. Bigram trajectory profiles are a good way to compare agent episodes.
3. The joint-index result: a weighted concatenation of a text embedding and the typed-feature vector puts text and structure in one cosine space.

**Revisit if** any of these happens:

- an approximate-nearest-neighbour index needs every node in one fixed width while the typed vocabulary grows past what sparse vectors handle comfortably;
- nested records (records of records) need to be compared as wholes;
- episodes gain enough events (see the progress-event gap) that order-sensitive sequence encodings matter.

If one does, use MAP-bipolar at d ≈ 1,000–4,000 in plain Node.
