# wu2024inference: Inference Scaling Laws (Wu, Sun, Li, Welleck, Yang; ICLR 2025)

Source read: `raw/2408.00724.pdf` (arXiv v3, 3 Mar 2025, 22 pages). Page numbers below are PDF pages.
Also checked: s1's vendored copy of the REBASE code (`research/s1/raw/code/s1/eval/rebase/inference_scaling/`)
and the Hugging Face metadata for the reward model s1's code serves (fetched 2026-10-11).

## What it is

An empirical study of how accuracy on math benchmarks trades off against inference FLOPs, across model sizes
and five answer-selection strategies. It proves that majority voting and weighted voting saturate as samples
grow, and proposes REBASE, a tree search that uses a process reward model (PRM) to decide how many children
each partial solution gets. s1 cites it for REBASE, which it runs on top of its own model in Figure 7 (L649).

## Facts Tier 1 needs

### Strategies and their definitions (p. 4-5, §3.1)
- Greedy search: one deterministic sample.
- Best-of-n: sample n candidates and keep the one the reward model scores highest. The paper says best-of-n
  is "also known as rejection sampling" (p. 4, §3.1). s1 uses that name for a different method (see conflicts).
- Majority voting: sample n candidates, return the most frequent final answer. Needs no reward model.
- Weighted majority voting: each candidate's vote is weighted by its reward-model score.
- "Sampling-based" means temperature sampling produces the candidates. A "tree-search variant" uses MCTS or
  REBASE to produce them and then applies the same selection rule (p. 5).
- Theorems 1 and 2: majority and weighted-voting accuracy converge almost surely as n grows, to a limit set by
  the policy's (and reward model's) answer distribution, with error shrinking as O(c^-n) (p. 5; proofs App. A,
  p. 16-17). Weighted voting has the higher limit if the reward model is better than random (p. 5).
- In their runs weighted voting beat plain majority voting with sampling, so majority-vote results sit in
  App. D.1 (p. 5, p. 20). The gap between the two is much smaller under REBASE (App. D.1, p. 20).

### REBASE algorithm (p. 6-7, §3.1.2, Eq. 1, Fig. 3)
- Root is the question. Each node is one solution step. The PRM scores every node at the current depth.
- Start by sampling N first steps, with budget B0 = N. After scoring depth i, subtract the Ci completed
  solutions: Bi = Bi-1 - Ci. Stop when Bi = 0, giving N full solutions.
- Each open node nj gets Wj = Round(Bi * softmax(R(nj)/Tb)) children. No rollouts, unlike MCTS.
- Paper hyperparameters (App. C, p. 19): temperature 1.0 for every strategy, max 1024 output tokens, max 256
  tokens per step, balance temperature Tb = 0.1.
- MCTS settings (App. B and C, p. 18-19): UCT constant C = 1, 4/8/16 root children, 2 children elsewhere,
  32/64/128 total expansions. MCTS lost to sampling at equal compute (p. 9) and was dropped from GSM8K (Fig. 5).

### Data, splits, metric (p. 7-8, §4.1; p. 9-10)
- Test sets: MATH500 (the Lightman et al. subset of MATH) and GSM8K test (p. 7). App. D.2 adds MBPP for code
  (Table 3, p. 21). MATH-easy is levels 1-2 and MATH-hard is levels 3-5 (Fig. 8, p. 9).
- Policy fine-tuning data: MetaMath, reformatted into numbered steps; Pythia trained on GSM8K problems only
  (App. C, Table 2, p. 19). PRM data: Math-Shepherd (p. 8, §4.1).
- Metric: test error rate (lower is better) against inference FLOPs per question, with FLOPs from the Kaplan et
  al. formula (p. 8, §4.2). No pass@k. Points use 2^i samples; each configuration is run "multiple times" for
  mean and variance, with the run count not given (p. 8, §4.1).
- The paper does not describe answer extraction. The code has `math_evaluate.py` and `evaluate/`, unread here.
- Reference numbers (Table 4, p. 22), MATH500 accuracy at 32 samples for Llemma-7B: sampling + MV 41.7, +
  BoN 43.5, + WV 46.1; REBASE + MV 44.1, + BoN 46.8. Greedy is 30.0. Table 1 (p. 10): REBASE + WV at 32
  samples beats sampling + WV at 256 (Mistral-7B, Llemma-7B) or 64 (Llemma-34B) samples with fewer FLOPs.
- Compute-optimal size fit on Pythia/GSM8K: log10(C) = 1.19 log10(N) + 2.03 (p. 8, §4.2).

### Models (p. 7-8, §4.1; Table 2, p. 19)
- Policies: Pythia 410M to 12B, Llemma-7B and Llemma-34B (math-specialized Code Llama derivatives), Mistral-7B,
  and Llama3-8B-Instruct (App. D.2, p. 20). All except Llama3 are full-SFT on MetaMath for 1 epoch, batch 128,
  LR 8e-5 (Pythia-410M) down to 8e-6 (Llemma), max sequence length 768 or 1024. The text layer of Table 2
  does not align dtype and length with rows cleanly; most rows are FP32, one is BF16.
- PRM: "the same Llemma-34B reward model" for all experiments, fine-tuned 2 epochs on Math-Shepherd at LR 1e-5,
  with a reward head that outputs a scalar at the end of each step (p. 8, §4.1; Table 2, p. 19).
- Released PRM `tkitsers/Llemma-reward-model` (HF API and config.json): `LlamaForCausalLM`, 33.74B parameters
  in BF16 (about 67 GB), 48 layers, hidden 8192, 64 heads, 8 KV heads, vocab 32000 (Llama SentencePiece),
  `max_position_embeddings` 4096, rope_theta 1e6, `_name_or_path` llemma_34b. The code reads the step score
  from the logit of token id 8094 (`rebase.py:114`), so the "reward head" is a vocabulary logit.
- Chat template: none. The code feeds the raw `problem` string as the prompt (`rebase.py:26-31`) and splits
  steps on the stop string "Step k" (`rebase.py:113`).

### License
- Paper: CC BY 4.0 (research/refs/catalog.tsv row for this key). PRM checkpoint: Apache-2.0 (HF card metadata).
  The REBASE code inside s1's repo has no license file of its own; the s1 repo LICENSE is Apache-2.0.

## Conflicts with s1

1. PRM base model. s1 says the REBASE PRM "is initialized from LLaMA-34B" (C-111, main.tex L649). Wu et al.
   say Llemma-34B (p. 8, §4.1; Table 2, p. 19), and the released config's `_name_or_path` is llemma_34b.
   Llemma-34B is Code Llama 34B with continued math pretraining. Verification M-20 also found a llemma_7b RM
   fine-tune script in s1's code, but the checkpoint s1 serves has 33.7B parameters, so it is the 34B model.
2. Aggregation. s1 says REBASE outputs are combined by majority voting (C-111, L649). Wu et al.'s headline
   REBASE results use weighted majority voting (p. 5, Table 1), and s1's own `exp_results/rebase_16/results.txt`
   reports `majority_vote weighted: True`. Under REBASE the two rules differ by about 1 to 3 points on MATH500
   (Table 4, p. 22), so the label matters for Figure 7's 56.7.
3. Name clash on "rejection sampling". s1's rejection sampling resamples until a generation fits a length
   budget (C-46, L234). Wu et al. use "rejection sampling" as a synonym for best-of-n with a reward model
   (p. 4, §3.1). These are different methods; do not borrow numbers or code across them.
4. Balance temperature. Wu et al. set Tb = 0.1 (App. C, p. 19). s1's `hype-parameters/rebase16.yaml:6` sets
   `softmax_temperature: 0.2`. s1's paper does not state Tb.
5. Expansion rounding. Eq. 1 rounds each width independently (p. 7). The code takes the ceiling and subtracts
   it from the remaining budget node by node, in descending reward order (`rebase.py:130-149`). Total width
   still equals the budget, but low-reward nodes get fewer children than Eq. 1 gives.
6. Length limits. Wu et al.'s setup caps output at 1024 tokens (p. 19), and s1's `rebase16.yaml` keeps
   `max_tokens: 1024`, `max_step_tokens: 256`, with a depth cap of 25 (`rebase.py:218`). s1's Figure 7 puts
   REBASE at about 229,000 tokens for 16 trajectories, about 14,000 per trajectory (figure-07 notes, C-113).
   The released config cannot produce that, so the config s1 used for Figure 7 is not the one in the repo.

C-106, C-107, C-108 and C-112 agree with the paper: REBASE beats sampling and MCTS at equal compute
(p. 3, p. 8-9) and costs one PRM forward pass per step (p. 6).

## Caveats for a local, under-8B, 8 GB replication

- REBASE as s1 ran it does not fit. The PRM alone is 33.7B parameters, about 67 GB in BF16 and roughly 17 GB
  at 4-bit, before the policy model or any KV cache. Running it would mean CPU offload at a very slow rate.
- Its context is 4096 positions, but s1-style traces run to about 14,000 tokens. The PRM was not trained on
  inputs that long, so its scores on late steps of long traces are untested.
- The PRM expects "Step k" numbered steps in MetaMath format and a Llama tokenizer. A Qwen-based s1 policy
  emits different step markers, so the stop string in `rebase.py:113` must change to match.
- The code needs the authors' SGLang fork on its `reward-model` branch; stock SGLang "may not support" the PRM
  (inference_scaling/README.md). SGLang is Linux-only, so run it in the project's Docker container.
- `rebase.py` has live `bp()` breakpoints (lines 112 and 253) that halt execution. `rebase_ori.py` has them
  commented out and uses `paras["num_threads"]`; start from `rebase_ori.py`.
- Majority voting is the baseline that does fit. It needs only the policy model, temperature 1.0 sampling
  (Wu p. 19; s1 Fig. 4b caption L257 also uses temperature 1), an answer extractor and an equality check.
  Sweep n over powers of two (Wu p. 8) and repeat with several seeds, since Theorem 1 predicts an early plateau.
- KV-cache budget for majority voting with long traces (the reader's arithmetic, from public Qwen2.5 configs,
  not from this paper): Qwen2.5-7B uses about 56 KB per token in FP16 (28 layers x 4 KV heads x 128 x 2 x 2
  bytes). With 4-bit weights near 5 GB, about 2.5 GB is left, roughly 45,000 tokens, so 3 concurrent 14k-token
  samples. Qwen2.5-1.5B uses about 28 KB per token and fits far more. Plan n=16 as sequential batches.
- To keep a reward-guided baseline at all, swap in a small open PRM that fits beside the policy. That changes
  the method, so report it as "REBASE with PRM X", not as s1's REBASE. Candidates were not checked here.
- Compute accounting differs. Wu et al. count FLOPs for policy plus PRM (p. 8). s1 counts thinking tokens and
  excludes the PRM (C-113, L645). Report both if a local REBASE variant is run.
- Wu et al.'s results come from short MetaMath-style solutions (at most 1024 tokens) on MATH500 and GSM8K.
  Gains on AIME24 with long reasoning traces are s1's result, from a single 16-trajectory point.
