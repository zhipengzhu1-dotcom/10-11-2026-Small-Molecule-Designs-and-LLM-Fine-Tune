# Local embedding and judge models under the 8 GB cap

Ticket #38, part of map #26. This reruns the measurement in the text-embeddings findings (#28, `research/text-embeddings`, section 4) with dedicated embedders and with judges under 8 GB. It uses the same log (`factory/decisions.tsv` at `af3bdea`, file lines 2 to 74), the same 12 retrieval pairs, the same 12 contradiction pairs and the same judge prompt. Scripts and raw results are in [`local-models/`](local-models/).

**Answer.**

1. **Embedder: none earns a place.** EmbeddingGemma ties TF-IDF at rank 1 (11/12), and Qwen3-Embedding does worse. Keep TF-IDF.
2. **Judge: `qwen3.5:4b`.** It caught 4 of 4 contradictions with 1 false alarm in 8, and uses 3.9 GiB of VRAM at a 2k context. The cross-family second opinion is `gemma4:e4b`: 3 of 4 caught, 1 false alarm, 4.8 GiB.

## Setup

- **Ollama 0.40.3.** The machine had 0.24.0, which refused to pull `qwen3.5:4b` and `gemma3:4b` (`412: requires a newer version of Ollama`). It was upgraded with the user's approval, and every number below was rerun on 0.40.3. The TF-IDF and qwen2.5:3b results match #28 exactly on both versions.
- **The cap.** A second Ollama server ran on port 11435 with `OLLAMA_GPU_OVERHEAD` set to reserve all but about 8 GiB, so the user's main server was untouched. This cap is approximate, because Ollama's free-memory figure differs from `nvidia-smi`'s by about 1 GiB; its log showed 8.9 to 9.4 GiB allowed. So VRAM is reported as the **`nvidia-smi` memory.used delta** from loading each model alone, against 8,192 MiB. Every model loaded all of its layers on the GPU, and no delta exceeded 8,192 MiB, so the looser server cap never decided where a model was placed.
- **Don't trust `/api/ps` for VRAM.** It reports 0.4 to 1.6 GiB less than the delta (it leaves out the runner's CUDA context and some buffers). For `gemma4` it reports 0.22 to 0.33 GB for models that take 3.3 to 5.3 GiB. The 8.63 GB #28 recorded for qwen3.5:9b was an `/api/ps` figure on 0.24.0.
- **Timings are from the RTX 5090.** A 5060 will be several times slower.

## 1. Embedders against TF-IDF

Each row's text is `decision. why`, with the supersession pointer stripped. Every earlier row is a candidate, ranked by exact cosine. The retrieval pairs are 7 explicit supersessions and 5 hand-labelled precedents, both from #28.

| Method | Recall@1 (all 12) | MRR (all) | Explicit MRR | Hand MRR | Rank of 51→3 | Median cos | VRAM delta |
|---|---|---|---|---|---|---|---|
| **TF-IDF (904-d)** | **11/12** | 0.919 | 1.000 | 0.805 | 37 | 0.018 | none |
| `embeddinggemma:300m`, no prompt (768-d) | **11/12** | **0.925** | 1.000 | 0.820 | 10 | 0.330 | 1,132 MiB |
| `embeddinggemma:300m`, retrieval prompts | **11/12** | 0.923 | 1.000 | 0.815 | 13 | 0.343 | 1,132 MiB |
| `qwen3-embedding:0.6b`, no instruction (1024-d) | 9/12 | 0.822 | 1.000 | 0.574 | 30 | 0.477 | 2,631 MiB (4,153 at 16k) |
| `qwen3-embedding:0.6b`, query instruction | 10/12 | 0.880 | 1.000 | 0.711 | 16 | 0.477 | 2,631 MiB |
| phase tree (no text) | 7/12 | 0.693 | 0.857 | 0.464 | 38 | n/a | none |
| RRF(TF-IDF + EmbeddingGemma) | 11/12 | 0.921 | 1.000 | 0.811 | 18 | n/a | 1,132 MiB |

Prompts are the ones documented for each model: EmbeddingGemma's `task: search result | query:` and `title: none | text:` (arXiv 2509.20354 §2), and Qwen3-Embedding's instruction on the query only (arXiv 2506.05176 §2). RRF uses k = 60. The full table, with every fusion, is in `local-models/results/embed.txt`.

- **No dense model beats TF-IDF at rank 1.** EmbeddingGemma's +0.006 MRR comes from one pair: 51→3 moves from rank 37 to rank 10, which is still outside the top 3 a judge would see.
- **Qwen3-Embedding is worse**, losing 47→43 from rank 1 even with its instruction, and 49→45 as well without it.
- **Fusion adds nothing.** Every RRF mix ties TF-IDF or loses.
- **The 12-pair set is saturated.** TF-IDF already gets 11 of 12, so the set can show a loss but hardly a gain. If Decide the factory node model (#37) wants a dense embedder later, it needs a larger set of pairs that don't share words. EmbeddingGemma is the one to retest: it is smallest (1.1 GiB) and the only one that ties.

## 2. Contradiction judges

Each of #28's 12 pairs (4 contradictions, 8 not) went in one call through `/api/chat`, with `format: json`, temperature 0 and `num_ctx` 2048. `think: false` went to every model that reports the thinking capability. Prompt A is #28's NLI prompt word for word. Every model gave the same labels on a second pass, except qwen3-vl (11/12).

| Judge | Params (Ollama) | Caught (of 4) | False alarms (of 8) | VRAM delta, 2k ctx | VRAM delta, 16k ctx | Median latency on the 5090 | Fits the cap? |
|---|---|---|---|---|---|---|---|
| **`qwen3.5:4b`** | 4.2B | **4** | **1** | 3,985 MiB | 4,566 MiB | 158 ms | yes |
| **`gemma4:e4b`** | 7.5B (4B effective) | 3 | 1 | 4,950 MiB | 5,397 MiB | 112 ms | yes |
| `gemma4:e2b` | 4.6B (2B effective) | 2 | 1 | 3,414 MiB | 3,677 MiB | 146 ms | yes |
| `phi4-mini:3.8b` | 3.8B | 3 | 0 | 3,264 MiB | 5,124 MiB | 147 ms | yes |
| `granite4.1:8b` | 8.8B | 3 | 4 | 5,803 MiB | **8,161 MiB** | 219 ms | only at a short context; over 8B |
| `qwen3.5:9b` (q4_K_M) | 9B | 4 | 6 | 6,695 MiB | 7,250 MiB | 264 ms | VRAM yes; over 8B |
| `gemma3:4b` | 4B | 1 | 2 | 4,351 MiB | 4,723 MiB | 140 ms | yes |
| `qwen2.5:3b-instruct` | 3B | 4 | 7 | 2,437 MiB | 3,096 MiB | 99 ms | yes |
| `qwen3-vl:4b` | 4.4B | 0 (12 empty) | 0 | 4,581 MiB | 6,637 MiB | 5,379 ms | unusable |

- **`qwen3.5:4b` is the only judge that catches every contradiction without flooding.** Its one false alarm is 35→58, a row that only moves a file ("moved that page to the scratchpad and deleted it"). That is the pointer-fix case #28 flagged as an open question for #37.
- **`gemma4:e4b` is the cross-family pick.** It misses 38→59 and makes one false alarm. Use it where the judge must come from a family other than Qwen: for example, if the same judge also grades the s1 replication, whose student may be Qwen (decision line 51 raised that same-family concern).
- **`phi4-mini` never over-flags but misses 41→43**, the grading-plan override, which is one of the two supersessions the log doesn't record.
- **`qwen3.5:9b` now fits the VRAM cap on Ollama 0.40.3** (6.5 GiB at a 2k context, against 8.63 GB on 0.24.0). But it is 9B, over the under-8B rule, and over-flags 6 of 8. Granite 4.1 8B is 8.8B and reaches 8,161 MiB at a 16k context.
- **`qwen3-vl:4b` ignores `think: false`.** It spends the whole 1,500-token budget thinking and returns empty content.
- **Prompt B didn't help.** It adds "compare only what was decided; a later record that only corrects which file, line or source the earlier one cited is not a contradiction". It cut false alarms for some judges but lost catches: `qwen3.5:4b` fell from 4/4 to 2/4. Prompt B was also written after seeing which pairs failed, so even its gains would be optimistic. Per-pair labels for both prompts are in `local-models/results/judge.txt`.
- **Caveat:** this is 12 pairs with 4 positives, labelled by one agent in #28. A one-pair difference is within noise. The ranking rests on catching all 4 with at most 1 false alarm, which only `qwen3.5:4b` does.

**Fitting the embedder and judge together.** `qwen3.5:4b` plus `embeddinggemma:300m` comes to about 5.0 GiB at a 2k context. `qwen3.5:4b` plus `gemma4:e4b` comes to about 8.7 GiB, which is over the cap, so a two-judge check must load them one at a time.

## 3. Trail review: the whole log in one call

Every row's decision and why (about 5.2k tokens), with the `supersedes line N:` pointers stripped, went to each judge at `num_ctx` 16384. The prompt asked it to list every later line that reverses, withdraws or overrides an earlier one. Eight links are known: the 6 `supersedes line N` rows, plus 43→41 and 71→21, which the log doesn't record.

| Judge | Known links found (of 8) | Unrecorded found (of 2) | Other items listed |
|---|---|---|---|
| `qwen3.5:4b` | 6 (all six `supersedes line N`) | 0 | 0 |
| `gemma4:e4b` | 5 | 0 | 0 |
| `gemma4:e2b` | 4 | 0 | 0 |
| `qwen3.5:9b` | 6 | 0 | 7 (line 66 against seven earlier rows) |
| `granite4.1:8b` | 2 | 0 | 8 |
| `phi4-mini`, `gemma3:4b`, `qwen2.5:3b` | 0 | 0 | 1, 9, 11 (adjacent or self pairs) |

**No judge under the cap finds the two unrecorded supersessions by reading the whole log.** The same judges do find them when shown the pair: `qwen3.5:4b` flags both 41→43 and 21→71 in section 2. So the trail review should keep #28's design: TF-IDF top-3 candidates, then one judge call per pair. Asking one call to review the whole log doesn't work at this size.

## What was pulled

All via Ollama, approved by the user on 2026-10-11:

| Tag | Download | Kept for |
|---|---|---|
| `embeddinggemma:300m` | 621 MB | the retest suggested in section 1 |
| `qwen3-embedding:0.6b` | 639 MB | nothing; loses to TF-IDF |
| `qwen3.5:4b` | 3.3 GB | **judge** |
| `gemma4:e4b` | 6.6 GB | **cross-family judge** |
| `gemma4:e2b` | 4.6 GB | nothing |
| `gemma3:4b` | 3.4 GB | nothing |
| `phi4-mini:3.8b` | 2.5 GB | nothing |
| `granite4.1:8b` | 5.3 GB | nothing; over 8B |

Not pulled:

- `qwen3.5:9b-nvfp4` fails: "this model requires MLX support, but the MLX runtime is not available". The library's nvfp4 and mxfp8 tags don't run on this Windows install, so the q4_K_M `qwen3.5:9b` already installed is the only 9B variant tested.
- The user chose not to download Qwen3.5-9B and Qwen3.5-9B-Base as Hugging Face safetensors (about 19 GB each). Whether they fit for fine-tuning belongs to the replication, not this ticket.

## To rerun

```
git show af3bdea:factory/decisions.tsv > research/orchestration/local-models/decisions.tsv
bash research/orchestration/local-models/run.sh                      # embedders + the six original judges
MODELS="granite4.1:8b gemma4:e2b gemma4:e4b" bash research/orchestration/local-models/run.sh
bash research/orchestration/local-models/vram.sh                     # nvidia-smi deltas, models loaded one at a time
```

## Questions for Decide the factory node model (#37)

- Should the judge be `qwen3.5:4b`, with `gemma4:e4b` wherever the judge must come from a different family than the model it judges?
- Is the under-8B rule about parameters or about VRAM? `qwen3.5:9b` now fits 8 GB of VRAM on Ollama 0.40.3 but breaks the parameter rule.
- Does correcting a cited file count as a contradiction (35→58)? Every judge's false alarms concentrate on such rows. Prompt B shows that excluding them in the prompt costs real catches, so a post-filter on the evidence cell may work better.
- Should the dense-embedder question stay open behind a harder pair set, or close on TF-IDF?
