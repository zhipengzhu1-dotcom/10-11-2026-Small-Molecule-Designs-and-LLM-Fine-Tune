# Text embeddings and vector search over decisions and tickets

Ticket #28, part of map #26. This is desk research plus one throwaway measurement on the real `factory/decisions.tsv` at `af3bdea` (73 rows, file lines 2 to 74). The scripts and their output stay in the session scratchpad and are not committed.

**Verdict: ADAPT.** Keep the vector structure, but search it exactly (brute-force cosine). Start with a lexical TF-IDF vector, which needs no model and no GPU. Add a dedicated small embedding model only if it beats TF-IDF on the pair set in section 4. Leave every contradiction call to a local NLI-style judge on the top few hits. Don't use approximate indexes (HNSW, IVF-PQ) at this scale. Section 6 gives the reasons.

Source keys (full list at the end): **[SBERT]** Reimers & Gurevych 2019; **[MTEB]** Muennighoff et al. 2023; **[HNSW]** Malkov & Yashunin 2020; **[FAISS]** Johnson, Douze & Jégou 2019; **[MRL]** Kusupati et al. 2022; **[RRF]** Cormack, Clarke & Büttcher 2009; **[SNLI]** Bowman et al. 2015; **[MNLI]** Williams et al. 2018; **[Q3E]** Qwen3 Embedding 2025; **[EG]** EmbeddingGemma 2025; **[NOMIC]** Nussbaum et al. 2025; **[OLLAMA]** Ollama API docs.

---

## 1. The structure

**Nodes and vectors.** Every text the factory writes becomes a node: a decision row (its `decision` and `why` cells), a ticket body, a hand-back report, a claim note. An encoder `f` maps each text `x` to a vector `f(x) ∈ R^d`, normalized to unit length. Two kinds of `f` matter here:

- *Dense sentence embedding.* A transformer that has been fine-tuned so that cosine similarity between pooled outputs tracks meaning. SBERT adds a pooling layer (MEAN by default) to BERT and trains it in a siamese setup with tied weights, so that "the produced sentence embeddings are semantically meaningful and can be compared with cosine-similarity" [SBERT §3]. Current LLM-based embedders take the last-layer hidden state at an appended `[EOS]` token [Q3E §2].
- *Lexical TF-IDF.* One dimension per vocabulary word, weighted `(1 + ln tf) · ln(N/df)`. This is the classical baseline, not from the sources above. Its `d` is the vocabulary size (904 on our log) and the vectors are sparse.

Raw LLM hidden states are **not** a usable `f`. SBERT found that averaged BERT outputs and the CLS token "return sentence embeddings that are infeasible to be used with cosine-similarity" [SBERT §5]. MTEB found that self-supervised LLMs "still require supervised fine-tuning for competitive embedding performance" [MTEB §4.2]. Section 4 reproduces this on our own log.

**Similarity and the query.** `cos(u, v) = u·v / (‖u‖‖v‖)`, which is just `u·v` for unit vectors. A precedent query is a k-nearest-neighbour search, `L = k-argmax_i cos(q, y_i)` over the stored `y_i` [FAISS §2, eq. 1, using the "highest values" comparator for cosine]. The exact solution computes every distance, and the bottleneck reduces to the matrix product `XYᵀ` [FAISS §2, eq. 2]. Its cost is `O(n·d)` per query. "The complexity of the naïve approach scales linearly with the number of stored elements" [HNSW §1].

**Approximate search, for when exact is too slow.**

- *HNSW.* A stack of proximity graphs. Each element gets a maximum layer `l = ⌊−ln(unif(0,1)) · mL⌋` [HNSW Alg. 1, line 4], with `mL = 1/ln(M)` "a simple choice for the optimal mL" [HNSW §4.1]. A search descends greedily from the top layer. Under stated assumptions the number of distance evaluations per layer is bounded by a constant, so the overall complexity scales as `O(log N)` [HNSW §4.2.1]. Construction runs in `O(N log N)`, at least for relatively low-dimensional data [HNSW §4.2.2]. Memory is `(Mmax0 + mL·Mmax) · bytes_per_link` per element, about 60 to 450 bytes per object beyond the vectors themselves [HNSW §4.2.3]. M ranges from 5 to 48 and Mmax0 = 2M [HNSW §4.1]. HNSW is approximate: its quality is the recall, "the ratio between the number of found true nearest neighbors and K" [HNSW §1].
- *IVF-PQ (IVFADC).* A coarse k-means quantizer `q1` groups the vectors into inverted lists, and a search scans only τ of them. A product quantizer `q2` splits each residual into `b` sub-vectors, each quantized to one of 256 centroids, so it fits in one byte [FAISS §2, building on Jégou et al. 2011]. The original PQ paper could not be fetched (HAL served a bot check; a `fetch.failed` event is logged), so these PQ claims rest on the FAISS paper's restatement.

**Shorter vectors.** Matryoshka Representation Learning trains each prefix `z_{1:m}` of the vector, for `m` in a nested set `M` with `|M| ≤ log d`, to work as a representation on its own [MRL §3, eq. 1]. A model trained this way can be truncated (and renormalized) to 512, 256 or 128 dimensions without re-encoding [EG §2.2; Q3E Table 1].

**Combining several rankings.** Reciprocal rank fusion scores `RRFscore(d) = Σ_{r∈R} 1/(k + r(d))` with `k = 60` [RRF §1]. It needs only ranks, so the systems' score scales never have to agree.

**Contradiction is a different relation.** Natural language inference labels a premise and hypothesis pair as entailment, contradiction or neutral ("semantic independence") [SNLI §1; MNLI §1]. In SNLI a contradiction pair shares its topic ("A man inspects the uniform …" / "The man is sleeping") [SNLI §1, examples table]. Topical closeness is exactly what cosine measures, so a high cosine says "same subject", not "agrees". Judging a pair needs both texts in one model call (a cross-encoder), which costs `n(n−1)/2` calls over all pairs (49,995,000 for n = 10,000, about 65 hours on a V100) [SBERT §1]. That is affordable only on the few candidates a vector search returns.

**What the structure adds to the node model (#26, #37).**

- *Node features:* a text vector on every decision, ticket, report and claim node, for the graph-embedding model in #27 to use as input features.
- *Proposed typed edges:* `similar-to(a, b)` when cos is in the top k, upgraded to `supersedes` or `contradicts` only after the NLI judge or the orchestrator confirms. They are candidates, never ground truth.
- *Not a constraint on embeddings:* nothing here forces vectors to respect the graph.

## 2. Mapping

What each field we already log becomes. "Stream" means `readStream()` in `factory/read.mjs`.

| Logged now | Where | Becomes |
|---|---|---|
| `decision` + `why` | `decisions.tsv` → stream `type: decision` | The text of a decision node, embedded. Strip any `supersedes line N:` prefix first, because a row being drafted doesn't have one yet. |
| `phase` (slash path) | `decisions.tsv` | Not embedded. It's the graph-side signal: the phase-tree baseline in §4 and a filter. |
| `evidence` | `decisions.tsv` | Not embedded (pointers). Exact match on a shared source is already a viewer edge (`evidence` links in `factory/viewer/layout.js` on branch `viewer`). |
| `result` (`adopted`, `open`, `closed`, …) | `decisions.tsv` | Metadata filter: "standing decisions only". |
| `ts` | all events | Recency filter. Candidates are only rows before the query. |
| line number | `decisions.tsv` (the stream adds `line` on branch `viewer`) | Node id. |
| `supersedes line N` in prose | `decisions.tsv` decision cell (6 rows) | Ground truth for evaluation, and a typed edge. |
| `supersedes the grading part of <phase>` | `decisions.tsv` **evidence** cell (line 43) | The same relation in a second format. `buildGraph` scans only `decision`, `why`, `result` and only `supersedes line N`, so the viewer misses this edge. |
| `verdict`, `superseded_by` | `factory/audit/<run>.tsv` | Labels. Rows marked `superseded` drop out of precedent results unless asked for. |
| `agent.start` `role`, `parent` | activity files | Metadata only. Every role is `general-purpose` (#21, #25). |
| `agent.stop` `status`, `transcript` | activity files | Status metadata. The hand-back text itself is **not** logged, only the transcript path. |
| `artifact` `note` | activity files (14 events have one) | Short text, embedded as an artifact node. |
| `fetch.failed` `reason`, `title` | activity files (4 events) | Embedded, so a repeat failure can be matched to an earlier one. |
| `check` `evidence` | activity files (32 events) | Templated text. Little value in embedding it; keep exact match. |
| Ticket title and body | GitHub issues, not in the stream | Embedded via `gh issue view`, for duplicate-ticket detection. |
| Claims C-01 to C-182 | `research/s1/notes/claims.md` | Claim nodes, embedded. |

**Missing, and what it would cost to start logging:**

1. **The hand-back report text.** `factory/hooks/subagent.mjs` already finds the last `SubagentHandback` report to set `status` (CONTEXT.md, Lifecycle hooks). Writing a `report` field on `agent.stop`, or its sha256 plus the transcript path, is one more field in one hook. Reports are typically a few hundred words (this ticket caps its own at 200), so each event grows by about 1 to 3 KB.
2. **A typed supersession field** in place of prose. Today it comes in two formats in two different cells, and the viewer parses only one. Adding a `supersedes` column changes the TSV header, `read.mjs` `COLUMNS` and the trail check: small, but the change is append-only-sensitive.
3. **The vectors themselves.** These should be a derived cache, not committed: rebuilt from the stream, keyed by `sha256(text) + model digest`, because vectors from different models can't be compared. At 768 float32 dimensions that is 3 KB per node, about 220 KB for today's 73 rows.
4. **Ticket id on `agent.start`** (#21), so a report can be tied to the ticket it answers.

## 3. Questions it answers for the orchestrator

| Question | Orchestrator decision it informs | What runs |
|---|---|---|
| "Have we decided this before, and is it still standing?" | **Supersede**: whether to write `supersedes line N` | Precedent query on the drafted row's decision and why, over earlier rows the audit hasn't marked superseded |
| "Does this new row contradict a standing one?" | **Supersede**, and **declare done** (no standing decision is silently overridden) | Top-3 precedent hits → local NLI judge, one call per pair |
| "Does this hand-back or deliverable contradict a decision?" | **Merge** | Embed the report, or the changed summary lines, and query decisions. Line 47 is the real case: a MATH summary still said "do not use an LLM judge" after the line 43 grading decision. |
| "Has this failure happened before?" | **Re-dispatch** (same fix as last time, or escalate) | Embed the `fetch.failed` reason or ISSUES report and query earlier failures (e.g. three AoPS 403 failures for `aime`, from three different agents between 21:43Z and 21:59Z) |
| "Is this ticket a duplicate or near-duplicate?" | **Pick the next ticket** / file a new one | Embed the ticket body and query open issues (#21 and #25 both ask for a role field) |

Section 4 shows that the first two questions have real misses in today's log: two partial supersessions that no link records.

## 4. Worked example

**Setup.** File lines 2 to 74 of `factory/decisions.tsv` at `af3bdea`. Each row's text is `decision. why`, with the supersession pointer stripped. For each test row, the candidates are every earlier row (41 to 69 of them), ranked by cosine. Two pair sets:

- **Explicit (7 pairs):** the six `supersedes line N` rows (55→15, 56→18, 57→28, 58→35, 59→38, 60→51), plus 43→41 (`supersedes the grading part of project/replication/local-models-only`, in the evidence cell).
- **Hand-labelled (5 pairs, my reading; no link exists):**
  - 71→21: line 71 says "standing push-after-merge consent is withdrawn", while line 21 says "will push after each merge from now on".
  - 51→3: the tier-2 judge "qwen3.5:9b is over 8B", against the cap "models under 8B".
  - 47→43: the MATH summary was edited to the tiered grading plan.
  - 49→45: "subagents can't write report files".
  - 64→44: the catalog script was made idempotent.

**Methods.**

- *TF-IDF:* pure JS, exact cosine.
- *qwen2.5:3b-instruct:* the only installed model that Ollama's `/api/embed` accepts. It's a chat model, not an embedder, so it tests the warning in §1. `qwen3.5:9b` returned `501 this model does not support embeddings`.
- *phase tree:* no text at all; rank by path distance in the `phase` tree, then recency. This is the "plain graph query" baseline the map's Fog asks about.

No dedicated embedding model is installed, and pulling one would mean a new download, so dense embedders are **not measured** (see the questions at the end).

| Method | Explicit MRR | Explicit rank-1 | Hand MRR | Hand rank-1 | Median cos, all pairs |
|---|---|---|---|---|---|
| TF-IDF (904-d sparse) | **1.000** | 7/7 | **0.805** | 4/5 | 0.018 |
| phase tree (no text) | 0.857 | 5/7 | 0.464 | 2/5 | n/a |
| qwen2.5:3b-instruct `/api/embed` (2048-d) | 0.394 | 2/7 | 0.229 | 1/5 | 0.873 |

Ranks per pair:

| Pair | TF-IDF rank (cos) | phase tree rank | qwen2.5:3b rank (cos) |
|---|---|---|---|
| 43→41 | 1 (0.281) | 1 | 13 (0.904) |
| 55→15 | 1 (0.901) | 2 | 6 (0.934) |
| 56→18 | 1 (0.286) | 1 | 3 (0.944) |
| 57→28 | 1 (0.844) | 1 | 6 (0.933) |
| 58→35 | 1 (0.466) | 2 | 1 (0.938) |
| 59→38 | 1 (0.858) | 1 | 1 (0.924) |
| 60→51 | 1 (0.829) | 1 | 56 (0.810) |
| 71→21 | 1 (0.221) | 1 | 67 (0.797) |
| 51→3 | **37** (0.008) | 38 | 21 (0.784) |
| 47→43 | 1 (0.223) | 24 | 20 (0.853) |
| 49→45 | 1 (0.226) | 4 | 30 (0.799) |
| 64→44 | 1 (0.143) | 1 | 1 (0.943) |

**What it shows.**

1. **The explicit supersessions are lexically easy.** The superseding rows restate the old row nearly word for word, so TF-IDF finds all seven at rank 1. Most of them share a phase too, which is why the phase tree alone gets 5/7.
2. **TF-IDF beats the phase tree on the cross-phase pairs.** 47→43 goes from rank 24 to rank 1 and 49→45 from rank 4 to rank 1. These are the links a graph query can't make, because nobody wrote them down. This is the measured part of the map's Fog question: at 73 rows, text helps exactly where the graph has no edge.
3. **51→3 is the one semantic miss.** The words differ ("8 GB of GPU memory … models under 8B" against "qwen3.5:9b is over 8B"), and no method here finds it. This pair is the test a dense embedder must pass to earn a place.
4. **A chat model's hidden states are no substitute for an embedder.** qwen2.5:3b's cosines are bunched together (median 0.873 over all 2,628 row pairs, maximum 0.971), and it loses to plain TF-IDF on every summary number. This matches [SBERT §5] and [MTEB §4.2].
5. **Two partial supersessions in the real log have no record.** Line 71 withdraws line 21's standing push consent, and line 43 overrides line 41's grading plan. Yet the audit `factory/audit/99ae39b6-….tsv` marks both 21 and 41 `ok` with an empty `superseded_by`. A precedent query at write time ranks 21 first for 71 and 41 first for 43, which would have prompted the pointer.
6. **Score scales differ by orders of magnitude** (median 0.018 against 0.873). So a fixed cosine threshold doesn't carry from one model to another, and fusing systems should use ranks (RRF), not raw scores.

**Contradiction check on the top hits.** I sent 12 pairs to a local model through `/api/chat` with `think: false`, `format: json` and temperature 0, using an NLI prompt (premise = earlier row, hypothesis = later row). My hand labels were 4 contradictions (41→43, 21→71, 18→56, 38→59) and 8 non-contradictions: four pointer-fix supersessions, 43→47, 45→49, the two `start` rows 11→53, and 3→51.

| Judge | Contradictions caught | False alarms (of 8) | Prompt size | Warm latency |
|---|---|---|---|---|
| qwen2.5:3b-instruct | 4/4 | 7 | 190–294 tokens | 0.3–0.8 s per pair |
| qwen3.5:9b | 4/4 (one answer wrapped in a code fence, unparsed) | 5 | 194–298 tokens | 0.3–0.6 s per pair |

- **Both judges catch every real contradiction** and quote the right span: "standing push-after-merge consent is withdrawn" for 21→71, and "then Claude as judge" for 41→43.
- **Both over-flag the pointer-fix supersessions.** For example, 9b flags 28→57 on "line 28 pointed at claims.md, but the D-rows are in sections.md". Each of those rows does contradict the earlier row's *evidence*, just not its decision. So the judge must be told which cells count: decision and why only.
- **The 3B judge is not usable alone.** It flagged 11 of 12 pairs.
- **The 9b result is informational only.** As Ollama loaded it here, `/api/ps` reported `size_vram` 8,632,894,080 bytes at context 2048. That is above 8 GiB, so it breaks the cap (compare decision line 51). qwen2.5:3b reported 2,314,803,200 bytes.

## 5. Cost and fit

**Exact search at our scale.** Brute force costs `n·d` multiply-adds per query.

| Rows (n) | 768-d float32 vectors | Work per query |
|---|---|---|
| 73 (today) | 220 KB | 56 k multiply-adds |
| 1,000 | 3 MB | 0.8 M multiply-adds |
| 10,000 | 30 MB | 7.7 M multiply-adds |

That is microseconds to milliseconds in plain JS (my arithmetic, not a cited benchmark). Exact search has no recall loss, needs no build step, and handles inserts by appending. HNSW's case rests on large datasets where linear scaling is "infeasible" [HNSW §1]. Its own memory overhead of 60 to 450 bytes per object [HNSW §4.2.3] and its recall below 1 buy nothing at thousands of rows. IVF-PQ is built for billion-scale, memory-bound collections [FAISS §1–2]. **Brute force stops being enough only around hundreds of thousands to millions of vectors with interactive latency targets.** This factory won't reach that.

**Embedding models that fit 8 GB.** These are shortlisted from MTEB numbers as the model papers report them. The live leaderboard is a client-side app that couldn't be read, and a `fetch.failed` event is logged.

| Model | Params | Dim (MRL) | MTEB(Eng, v2) mean (task) | Context | License | Ollama tag (download) |
|---|---|---|---|---|---|---|
| EmbeddingGemma | 308M | 768 (512/256/128) | 69.7 at 768-d; 66.7 at 128-d [EG Table 7] | 2048 | Gemma Terms of Use (not OSI) | `embeddinggemma:300m` (622 MB) |
| Qwen3-Embedding-0.6B | 0.6B | 1024 (32 to 1024) | 70.70 [Q3E Table 3] | 32K | Apache-2.0 [Q3E abstract] | `qwen3-embedding:0.6b` (639 MB) |
| nomic-embed-text-v1 | 137M | not stated in the paper | 62.39 on the original MTEB [NOMIC Table 1] | 8192 | Apache-2.0 [NOMIC abstract] | `nomic-embed-text` |

- **Either of the first two fits the cap with room to spare.** That holds beside qwen2.5:3b (2.3 GB), but **not** beside qwen3.5:9b, which alone is at the cap.
- **Ollama is already installed** (v0.24.0, MIT). Its `POST /api/embed` takes a list of inputs and an optional `dimensions` for MRL truncation [OLLAMA, Generate Embeddings]. Its embeddings doc names `embeddinggemma` and `qwen3-embedding` as recommended models [OLLAMA embeddings.mdx].
- **Qwen3-Embedding is instruction-aware:** the query is prefixed `{Instruction} {Query}<|endoftext|>`, and documents are left as they are [Q3E §2]. That suits a precedent query ("Given a new project decision, find earlier decisions on the same question").
- **No new dependency is needed.** TF-IDF, brute-force cosine, RRF and the Ollama calls are all `fetch` plus array math in Node, matching how the factory is written today (`node:` built-ins only).
- **If an index is ever needed,** the mature options are hnswlib (Apache-2.0, the HNSW authors' library) and FAISS (MIT). Licenses were checked via the GitHub API on 2026-10-11.

**How it reaches the orchestrator.**

- **A query.** A proposed `node factory/precedent.mjs --text "<drafted decision. why>" -k 3`, not built: fuse TF-IDF and phase-tree ranks with RRF (plus a dense rank once a model earns it), then run the NLI judge on the top 3. It prints at most 3 lines:
  `L21 project/implement/push adopted 21:21Z rank1 · NLI contradiction: "standing push-after-merge consent is withdrawn"`
- **Context cost.** About 40 tokens per hit, so about 150 tokens per check. Run 14c93a90 wrote about 42 rows; checking each costs about 6k tokens, roughly 4% of the 150k budget in decision line 52. The judge's ~250-token prompts run locally and never enter the orchestrator's context.
- **A digest line for #25.** Something like "2 standing decisions contradicted by later rows without a supersedes pointer: 21←71, 41←43". This is computed by the same pass over all row pairs, at 2,628 pairs today: TF-IDF top-3, then the judge on about 200 pairs, at ~0.5 s each, about 2 minutes. It belongs to a nightly or close-out run, not every frontier step.
- **The dashboard.** A "similar earlier rows" panel for the selected decision node, a contradiction badge on a pair the judge flagged, and the vectors handed to #30 for honest projections. The 3-D graph's `supersedes` layer would gain the line 43→41 edge it misses today.

**Combining with graph embeddings (#27).** Keep them as **separate indexes queried together, fused by rank (RRF, k = 60)** [RRF §1]. Concatenation is equivalent to a fixed weighted mix of the two cosines: for unit blocks `[αu; βg]` with `α² + β² = 1`, the dot product equals `α²·cos(u) + β²·cos(g)` (my derivation). That needs a tuned weight, and §4 shows the score scales don't match. Pass the text vectors to #27 as node features if it chooses a feature-based model, but keep the retrieval indexes apart, so each can be re-embedded on its own.

## 6. Verdict

**ADAPT.**

- **Adopt** the vector-space node structure and exact k-NN precedent search over decisions, reports, failures and tickets. On our real log, text retrieval recovers cross-phase precedents the phase graph misses (47→43 from rank 24 to 1; 49→45 from 4 to 1). It also exposes two live supersessions that neither the log nor the audit records (21←71, 41←43).
- **Adapt** it in three ways:
  1. Start lexical. TF-IDF scored a perfect explicit MRR and 0.805 on the hand set with zero dependencies and no GPU.
  2. Admit a dense embedder (EmbeddingGemma-300M or Qwen3-Embedding-0.6B via Ollama) only if it beats TF-IDF on the 12-pair set, the 51→3 pair in particular.
  3. Never treat cosine as agreement. Contradiction goes to a local NLI judge on the top 3 hits, told to compare decision and why cells only.
- **Skip** HNSW and IVF-PQ. At hundreds to thousands of rows, exact cosine is cheap, has no recall loss, and needs no index [HNSW §1, §4.2.3; FAISS §2].

## Questions this surfaces for the node-model decision (#37)

- Should supersession become a typed column? Today it is prose in two formats and two cells, and the viewer parses only one.
- May we pull one embedding model (`embeddinggemma:300m`, 622 MB, or `qwen3-embedding:0.6b`, 639 MB) to rerun §4? Its `size_vram` would need measuring too. This research didn't pull one, to respect "no new dependencies".
- qwen3.5:9b loads at about 8.63 GB in Ollama here, above the cap. Which local model is the NLI judge, and the trail reviewer, under 8 GB?
- Should `agent.stop` log the hand-back report text, so reports can be embedded and checked against decisions at merge time?
- When a later row corrects only an earlier row's evidence pointer, does that count as a contradiction for the argumentation model (#31)?

## Sources

- [SBERT] N. Reimers, I. Gurevych. "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks." EMNLP 2019. arXiv:1908.10084. §1, §3, §5 (SentEval discussion), §6.
- [MTEB] N. Muennighoff, N. Tazi, L. Magne, N. Reimers. "MTEB: Massive Text Embedding Benchmark." EACL 2023. arXiv:2210.07316v3. Abstract, §3.2, §4.2.
- [HNSW] Yu. A. Malkov, D. A. Yashunin. "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs." IEEE TPAMI 42(4), 2020. Preprint arXiv:1603.09320. §1, Alg. 1–2, §4.1, §4.2.1–4.2.3, §6.
- [FAISS] J. Johnson, M. Douze, H. Jégou. "Billion-scale similarity search with GPUs." IEEE Trans. Big Data, 2019. arXiv:1702.08734v1. §1, §2 (eqs. 1, 2, 6), §5.1.
- [PQ] H. Jégou, M. Douze, C. Schmid. "Product quantization for nearest neighbor search." IEEE TPAMI 33(1), 2011. **Not fetched** (HAL bot check; `fetch.failed` ref `jegou2011pq`). Cited only through [FAISS] §2.
- [MRL] A. Kusupati et al. "Matryoshka Representation Learning." NeurIPS 2022. arXiv:2205.13147v4. §3, eq. 1.
- [RRF] G. V. Cormack, C. L. A. Clarke, S. Büttcher. "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods." SIGIR 2009. https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf §1.
- [SNLI] S. R. Bowman, G. Angeli, C. Potts, C. D. Manning. "A large annotated corpus for learning natural language inference." EMNLP 2015. arXiv:1508.05326v1. §1.
- [MNLI] A. Williams, N. Nangia, S. R. Bowman. "A Broad-Coverage Challenge Corpus for Sentence Understanding through Inference." NAACL 2018. arXiv:1704.05426v4. Abstract, §1.
- [Q3E] Y. Zhang et al. "Qwen3 Embedding: Advancing Text Embedding and Reranking Through Foundation Models." arXiv:2506.05176v3. Abstract, §2, Table 1, Table 3 (leaderboard snapshot of 2025-06-04). Model card https://huggingface.co/Qwen/Qwen3-Embedding-0.6B (license apache-2.0, dims 32 to 1024).
- [EG] H. Schechter Vera et al. "EmbeddingGemma: Powerful and Lightweight Text Representations." arXiv:2509.20354v3. §2.2, Table 7. Model card https://huggingface.co/google/embeddinggemma-300m (license "gemma", 2048-token context).
- [NOMIC] Z. Nussbaum, J. X. Morris, B. Duderstadt, A. Mulyar. "Nomic Embed: Training a Reproducible Long Context Text Embedder." TMLR 2025. arXiv:2402.01613v2. Abstract, Table 1.
- [OLLAMA] Ollama `docs/api.md` ("Generate Embeddings", `POST /api/embed`) and `docs/capabilities/embeddings.mdx`, github.com/ollama/ollama at `eab97e9`. Library pages https://ollama.com/library/embeddinggemma and https://ollama.com/library/qwen3-embedding (tag sizes, read 2026-10-11).
- MTEB live leaderboard https://huggingface.co/spaces/mteb/leaderboard. **Not readable** (client-side app; `fetch.failed` ref `mteb-leaderboard`). Scores above come from the model papers' leaderboard snapshots.
- Licenses via the GitHub API, 2026-10-11: facebookresearch/faiss MIT; nmslib/hnswlib Apache-2.0; UKPLab/sentence-transformers Apache-2.0; ollama/ollama MIT.
- Factory files read: `CONTEXT.md`, `factory/read.mjs`, `factory/decisions.tsv`, `factory/audit/99ae39b6-466d-4630-a835-56ff7c650197.tsv`, `factory/agents/**`, `skills/orchestrator-lessons/SKILL.md`, and `factory/viewer/layout.js` on branch `viewer` (`fcb3c16`). The viewer is not on `main`.
