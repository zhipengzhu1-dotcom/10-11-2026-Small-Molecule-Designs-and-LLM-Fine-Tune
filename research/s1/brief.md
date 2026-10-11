# s1 Tier 1 brief

Issue #11 (spec #1). This brief lists every setting a small-scale replication of s1 (arXiv 2501.19393v3)
needs, with where the paper states it, whether the released code and data back it, and the value we plan
to use on a model under 8B parameters, in 8 GB of GPU memory, with local open-source models only. Piece B's
spec should be writable from this file without rereading the paper.

Sources: `research/s1/notes/claims.md` (C-IDs), `research/s1/notes/sections.md`, `research/s1/tables/`,
`research/s1/figures/`, `research/s1/verification.md` (verdicts, M-, R- and D-items), the reference
summaries under `research/refs/*/summary.md`, and the `project/replication/` and `project/hardware/` rows of
`factory/decisions.tsv`.

How to read the tables:

- `paper location` is a `main.tex` line (`L931`), a table or figure, a C-ID, or a summary path. `main.tex`
  lines show what the paper says. They are never evidence that it is true.
- `verdict` is the final verdict in `verification.md` for the claim the row cites. When a row cites several
  claims, the verdict is the weakest of them. INCONCLUSIVE never counts as a pass.
- `assumption` says what we take as true where the verdict is NOT VERIFIED or INCONCLUSIVE, and records
  any other caveat.
- `npm run check:brief` checks that every row has a real location, a valid verdict and, where needed, an
  assumption.

## Where the plan departs from the paper

1. **Base model.** s1 fine-tunes Qwen2.5-32B-Instruct (C-04). We train a model under 8B. The spec (#1)
   names Qwen3.5-4B as the leading candidate, but no reference we read covers Qwen3.5
   (`research/refs/qwen2024qwen25technicalreport/summary.md`). Its tokenizer, chat template, context
   length, license and whether it ships a built-in thinking mode all need a source before spec B commits
   to it. Qwen2.5-1.5B-Instruct and Qwen2.5-3B-Instruct are the fallbacks the references do cover. The 3B
   model is under the "Qwen Research" license, not Apache 2.0.
2. **Fine-tuning method.** s1 runs full-parameter SFT with FSDP on 16 H100s (C-53). Full fine-tuning does
   not fit in 8 GB even at 1.5B: bf16 weights and gradients plus fp32 AdamW states and master weights come
   to about 16 bytes per parameter, or about 24 GB for 1.5B. We plan QLoRA (4-bit base weights, bf16 LoRA
   adapters, gradient checkpointing). This adds settings the paper never had: LoRA rank, alpha, target
   modules and a learning rate suited to adapters. The Qwen2.5 summary says 0.5B and 1.5B "might" allow
   full fine-tuning in 8 GB. The arithmetic above says 1.5B does not.
3. **Training sequence length.** s1 trains at 32,768 tokens so no sample is cut off (C-153). That does not
   fit in 8 GB. We start at 8,192 and raise it to 16,384 if peak memory allows. Table 6's total of 4.7M
   tokens gives about 4.7K tokens per sample (C-135, unchecked), so 8,192 should hold most rows. The count
   must be measured with the student's tokenizer. We drop over-length rows instead of truncating them,
   because truncation cuts the answer and teaches the model not to stop (Table 8, C-155 to C-158). s1's
   4,096-token model lost 20 points on AIME24.
4. **Batch.** The paper's batch of 16 stays, reached with micro-batch 1 and gradient accumulation 16. We do
   not run `train/sft.sh` as written, because it sets the global batch to the GPU count and would train at
   batch 1 for 5,000 steps on one GPU (R-09, verification act-on item 1).
5. **Learning rate.** The paper's 1e-5 is a full fine-tuning rate. We plan 1e-4 for the LoRA adapters, with
   one 1e-5 run as a check. That 1e-4 is common LoRA practice, not something s1 or its references state.
6. **Evaluation precision.** s1 evaluates in fp32 (C-131). A 4B model in fp32 is about 16 GB of weights,
   twice the cap. We evaluate in bf16, and in 8-bit weights only if bf16 plus the KV cache does not fit.
   Precision changes long generations (C-130), so every result records it.
7. **Generation length.** s1 allows 32,768 new tokens (C-109). We keep that if the KV cache for one
   sequence fits in 8 GB, else 16,384. A lower cap changes the no-intervention baseline and the `auto`
   budget-forcing cap.
8. **Grading.** s1's harness sends non-integer answers to a `gpt-4o-mini` judge at temperature 0.5 and
   turns unparseable GPQA answers into "A" (M-15, R-10). The paper calls this greedy pass@1 and names no
   grader. We grade in three tiers: rules, then a local model, then Claude as judge. The next section
   gives each tier's departure. Scores will not match the paper's grading exactly, so every comparison to a
   paper number states the grader.
9. **Held-out sets and seeds.** s1 reports single greedy runs on AIME24, MATH500 and GPQA Diamond. Any base
   model released after February 2024 may have seen AIME24 in pretraining
   (`research/refs/aime/summary.md`). We add AIME 2025 (`TIGER-Lab/AIME25`) to every run, and AIME 2026 if
   the student's data cutoff predates it. We add sampled runs on the AIME sets and paired bootstrap
   confidence intervals on every comparison.
10. **Baselines.** We drop REBASE (its 33.7B reward model does not fit, `research/refs/wu2024inference/summary.md`),
    token-conditional and step-conditional control (both need training data that is not released, C-161,
    C-162), and the Table 2 data ablations (selection code not released, C-14). We scale majority voting
    from 64 samples to 16 and cap rejection sampling at 32 tries per question.
11. **Data.** We train on the released s1K and do not rebuild it, as verification act-on item 4 says. No
    traces are regenerated, so no Gemini or r1 calls (`factory/decisions.tsv`
    `project/replication/local-models-only`). The released set contains AIME 2022 and was not drawn by the
    uniform rule the paper describes (M-04, M-06). s1K-1.1 is a second run, not the first.
12. **Token counts.** s1 counts thinking tokens with the Qwen2.5 tokenizer (C-34, C-136). We count with the
    student's tokenizer. If that is not Qwen2.5, our token counts cannot be compared with Tables 6 to 8
    or Figure 4 without recounting.

## Tiered grading

Set by the user on 2026-10-11 (`factory/decisions.tsv` `project/replication/grading`, which supersedes the
grading part of `project/replication/local-models-only`). The models we train and evaluate stay local and
open-source. Claude acts only as a judge.

**Tier 1, rules.** Every answer goes through a deterministic grader first. Extraction follows the harness:
take the text after the answer delimiter, then the last `\boxed{}`, else the last `Answer:` line
(`H/tasks/aime/utils.py:247-261`). AIME strips `$`, `\text{}`, commas, spaces and a trailing period, then
compares `int()` values. MATH500 applies the MATH normalization rules (Hendrycks et al., p. 5) and a SymPy
equivalence check for expressions. GPQA parses a letter from `\boxed{X}`, `Answer: X` or `The correct answer
is (X)`. The result is correct, incorrect or unparsed. Departure from the paper: the harness gives every
non-integer answer to `gpt-4o-mini`, and string rules are stricter. They will mark some equivalent MATH
answers wrong, such as `\sqrt{8}` against `2\sqrt{2}`. For AIME integers tier 1 matches the harness, which
also compares `int()` values.

**Tier 2, local model.** `qwen3.5:9b` through Ollama, at temperature 0, grades:

- every answer tier 1 left unparsed;
- every MATH500 answer tier 1 marked incorrect, since that is where rule false negatives fall;
- a random 10% of the answers tier 1 graded, so the two tiers have an overlap to compare.

The judge sees the question, the reference answer and only the answer section after the thinking
delimiter, never the trace. That keeps its input short. It runs as a separate pass after generation and
never shares the GPU with the model under test. Departure from the paper: a 9B local model replaces
`gpt-4o-mini`, runs deterministically instead of at temperature 0.5, and judges a narrower set of answers.
Two caveats need the user's sign-off. At 9B the judge is over the under-8B rule, which we read as applying
to the models under study, not the grader. And it is the same family as a Qwen3.5 student, so it may share
the student's blind spots.

**Tier 3, Claude.** Claude settles every answer where tiers 1 and 2 disagree and every answer tier 2 could
not parse. It also grades a random 10% of tier 2's verdicts, at least 30 per benchmark where that many
exist, to measure how often the local judge agrees with it. Departure from the paper: Claude is a stronger
judge than `gpt-4o-mini`, but it sees only a subset of answers. It is an API model, used here only because
the user allowed it as a judge.

**Final verdict.** Tier 3 if it ran, else tier 1 if it parsed the answer and tier 2 did not disagree, else
tier 2. A GPQA answer that no tier can parse is wrong. We also report the score with s1's "A" fallback, so
the number can sit next to Table 1.

**Recording.** Every graded answer is one JSON line next to the run's generations, with: `benchmark`,
`item_id`, `run_id`, `sample`, `extracted`, `tier1` (verdict and the rule that fired), `tier2` (verdict, model
name and digest, prompt hash), `tier3` (verdict, model ID, one-line reason), `final` and `graded_by` (1, 2 or
3). Each run's summary reports accuracy, the count of answers graded by each tier, the tier 1 against
tier 2 disagreement rate, the local judge's agreement rate with Claude on the spot-check sample, and a
rules-only score (tier 1, unparsed counted wrong) as a lower bound.

## Open questions for spec B

- Qwen3.5-4B: tokenizer, chat template, end-of-thinking token, context length and license. If it already
  has a trained thinking mode, a 1,000-sample SFT on top of it is not a clean test of s1's sample-efficiency
  claim, the same problem the r1 summary raises for R1-Distill models.
- The measured share of s1K over 8,192 and 16,384 tokens with the student's tokenizer.
- Peak memory for QLoRA at 8,192 and 16,384 tokens, and whether the loss needs a chunked cross-entropy to
  fit. With Qwen2.5's 151K-token vocabulary, fp32 logits take about 0.6 MB per position, about 5 GB at
  8,192 tokens. Qwen3.5's vocabulary size is unsourced.
- Which paper numbers to compare against. Rows backed by a command in `eval/commands.sh` are safer: Table 1
  "s1 w/o BF" and Table 5 "s1 with Wait" for AIME24, MATH500 and GPQA. Table 1's s1-32B row matches no
  single setting (D-05), and Table 5's s1 AIME 2025 cells have no command (M-21).

## Data

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-01 | training set | s1K, 1,000 questions with reasoning traces, chosen for difficulty, diversity and quality | main.tex L156 (C-02) | VERIFIED | `simplescaling/s1K`, split `train`, 1,000 rows, fields `question`, `thinking_trajectories`, `attempt` | Field names from `research/s1/raw/datasets/s1K.md:4-20`. License apache-2.0. |
| P-02 | trace source | Gemini 2.0 Flash Thinking; trace from `parts[0]`, answer from `parts[1]` | main.tex L172, L202 (C-10, C-28) | VERIFIED | released traces as they are; no traces regenerated | Gemini's output cap was 8K tokens, so s1K traces are short enough for an 8 GB block size (`research/refs/geminithinking/summary.md`). |
| P-03 | second training set | s1K-1.1, same 1,000 questions with DeepSeek r1 traces, training procedure unchanged | main.tex L686 (C-117) | NOT VERIFIED | `simplescaling/s1K-1.1`, fields `deepseek_thinking_trajectory`, `deepseek_attempt`; a second run after s1K | The questions and r1 traces match. "Training unchanged" fails: s1.1 used block size 20,000, s1 used 32,768 (M-10). r1 traces are longer (about 8.8K thinking tokens on hard 2024 problems, `research/refs/r1/summary.md`), so more rows will exceed our block size. License MIT. |
| P-04 | s1.1 better than s1 | s1.1 performs significantly better | main.tex L686 (C-118) | INCONCLUSIVE | test it ourselves with the s1K-1.1 run | No numbers in the repo. Table 5 reports 94.4 / 60.6 / 56.7 against 92.6 / 56.6 / 50.0 without budget forcing. |
| P-05 | incorrect traces kept | 53.6% of s1K and 63.0% of s1K-1.1 graded correct; wrong ones kept on purpose | main.tex L215 (C-39, C-40) | VERIFIED | keep every row, correct or not | |
| P-06 | AIME years in training pool | 1983-2021, with 2022-2023 held out for development | main.tex L198, L798 (C-22, C-137) | NOT VERIFIED | use s1K as released; never evaluate on AIME 2022 or the 2022-2024 dev set | The code keeps `year <= 2022`, so AIME 2022 is in the pool (M-06). "90 questions" is 60 by count (M-24). AIME 2024 and 2025 stay out by the year filter. |
| P-07 | decontamination | 8-gram overlap against MATH500, GPQA Diamond and AIME24; all samples deduplicated | main.tex L202, L925 (C-29, C-146) | NOT VERIFIED | rerun exact-match and word 8-gram overlap of s1K against every eval set we use, AIME 2025 included; report hits; drop nothing unless a hit is found | The AIME rows skip decontamination (M-07). One shared 8-gram drops a question (M-08). |
| P-08 | selection pipeline | 59K pool, quality and difficulty filters, then uniform domain sampling to 1,000 | main.tex L191-L215, L886-L898 (C-38, C-144) | NOT VERIFIED | do not rebuild; train on the released set | Domains are uniform only below 700 picks (M-04). Sampling is unseeded (R-02), the MATH branch never fires as released (R-03), and notebook outputs come from an earlier version (R-01). Verification act-on item 4. |
| P-09 | training text format | `<\|im_start\|>think` newline trace newline `<\|im_start\|>answer` newline answer | main.tex L931 (C-148) | VERIFIED | same delimiters in the student's chat template; "Answer: " prepended to any attempt missing it | `data/tokenization.py:26` adds the "Answer: " prefix, which the paper omits (M-25). Whether Qwen3.5-4B uses `<\|im_start\|>` is unsourced. |
| P-10 | pre-tokenized data | `simplescaling/s1K_tokenized` | main.tex L156 (C-04) | VERIFIED | re-tokenize from s1K with the student's template; reuse `s1K_tokenized` only for a Qwen2.5 student whose template matches | All Qwen2.5 sizes share one vocabulary (`research/refs/qwen2024qwen25technicalreport/summary.md`). |
| P-11 | length tokenizer | Qwen2.5-32B-Instruct tokenizer | main.tex L211, L798 (C-34, C-136) | VERIFIED | student's tokenizer; recount with Qwen2.5 when comparing to Tables 6 to 8 | |

## Base model

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-12 | base model | Qwen2.5-32B-Instruct | main.tex L156, L931 (C-04) | VERIFIED | Qwen3.5-4B (spec #1); fallback Qwen2.5-1.5B-Instruct or Qwen2.5-3B-Instruct | No reference covers Qwen3.5 (`research/refs/qwen2024qwen25technicalreport/summary.md`). Tokenizer, template, context, license and thinking mode need a source. `factory/decisions.tsv` `project/hardware/8gb-cap` sets the under-8B limit. |
| P-13 | reason for the base | 32B-Instruct matches or beats 72B-Instruct on math | main.tex L931 (C-147) | INCONCLUSIVE | choose by memory fit and license, not size ranking | The Qwen2.5 report supports C-147 (Tables 6, 7 and 11 in the summary). Our choice is set by the 8 GB cap. |
| P-14 | filter model equals trained model | Qwen2.5-32B-Instruct both filters difficulty and is fine-tuned | main.tex L211 (C-36) | VERIFIED | not reproducible; s1K's difficulty filter used Qwen2.5 7B and 32B, both stronger than the student | s1K is harder relative to a 4B student than to s1-32B, so expect smaller absolute gains (Qwen2.5 summary caveats). |
| P-15 | base model context | 32,768 training context; Instruct models post-trained to emit up to 8,192 tokens | `research/refs/qwen2024qwen25technicalreport/summary.md` (C-153) | INCONCLUSIVE | the student's native context, measured; no context extension | s1 traces and forced generations run past the 8K generation length Qwen2.5 Instruct was trained for. Qwen2.5 0.5B to 3B have a 32K context with no YARN. |

## Training

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-16 | fine-tuning method and hardware | full-parameter SFT, PyTorch FSDP, 16 H100s | main.tex L267 (C-53) | INCONCLUSIVE | QLoRA on one RTX 5090 capped at 8 GB | FSDP `full_shard` and 2x8 GPUs are in the code. Full fine-tuning needs about 16 bytes per parameter, over 8 GB even at 1.5B. LoRA rank, alpha and target modules are new settings for spec B. |
| P-17 | epochs | 5 | main.tex L931 (C-149) | VERIFIED | 5 | |
| P-18 | global batch size | 16 | main.tex L931 (C-149) | VERIFIED | 16, as micro-batch 1 with gradient accumulation 16 | `train/sft.sh:9-12` sets the global batch to the GPU count (R-09). The one recorded run used batch 8 (M-09). Verification act-on item 1. |
| P-19 | gradient steps | 315 (63 per epoch) | main.tex L931 (C-149) | VERIFIED | 315, or ceil(rows / 16) x 5 if over-length rows are dropped | |
| P-20 | learning rate | 1e-5 | main.tex L931 (C-150) | VERIFIED | 1e-4 for LoRA adapters; one 1e-5 run as a check | 1e-4 is common LoRA practice, not stated by s1 or its references. Confirm with a short run. |
| P-21 | warmup | linear over 5% of training, 16 steps | main.tex L931 (C-150) | VERIFIED | linear, 5% of steps | |
| P-22 | schedule | cosine decay to 0 over 299 steps | main.tex L931 (C-150); Figure 9 | VERIFIED | cosine to 0 | `min_lr=0` in `train/sft.sh:6` is unused. |
| P-23 | optimizer | AdamW, beta1 0.9, beta2 0.95, weight decay 1e-4 | main.tex L931 (C-151) | VERIFIED | AdamW with the same betas and weight decay; paged 8-bit AdamW if fp32 states do not fit | The code uses the HF Trainer default `adamw_torch` (transformers 4.46.1). |
| P-24 | precision | bfloat16 | main.tex L931 (C-150) | VERIFIED | bf16 compute and adapters, 4-bit NF4 base weights | |
| P-25 | loss mask | loss on traces and answers only | main.tex L931 (C-152) | VERIFIED | same; mask system prompt and question | The code uses `DataCollatorForCompletionOnlyLM` (`train/sft.py:52-66`). |
| P-26 | sequence length | 32,768, so no sample is cut off | main.tex L931 (C-153); Table 8 | INCONCLUSIVE | 8,192; 16,384 if peak memory allows; drop over-length rows | Whether any s1K row exceeds 32,768 is unchecked. At 4,096, 74% of rows were cut and AIME24 fell from 50.0 to 30.0 (C-155 to C-157). Measure the over-length share before training and log the dropped count. |
| P-27 | training time | 26 minutes on 16 H100s, 7 H100-hours | main.tex L172, L267, L566 (C-11, C-86) | INCONCLUSIVE | not a target; log wall-clock time and peak memory | The only recorded run took 87.8 minutes at batch 8 (M-09). |

## Evaluation

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-28 | AIME24 | 30 problems from AIME 2024, integer answers 000-999 | main.tex L269 (C-54) | INCONCLUSIVE | `simplescaling/aime24_nofigures`, split `train` | AIME I was Feb 1 and AIME II Feb 7, 2024, not "January 31 to February 1" (`research/refs/aime/summary.md`). A base model trained on later web data may have seen these problems. |
| P-29 | AIME figures | figure problems given as Asymptote code | main.tex L269 (C-55) | INCONCLUSIVE | `nofigures` variant, as s1 reports | The README says `nofigures` keeps a figure only where it matters. |
| P-30 | MATH500 | the 500 problems OpenAI selected in "Let's verify step by step" | main.tex L269 (C-56) | INCONCLUSIVE | `simplescaling/openaimath` test, checked against the `openai/prm800k` list of 500; record its hash | `research/refs/lightman2023letsverifystepstep/summary.md`. Report accuracy by level too. |
| P-31 | GPQA Diamond | 198 questions in biology, chemistry and physics | main.tex L269 (C-57) | INCONCLUSIVE | `Idavidrein/gpqa`, config `gpqa_diamond` | The dataset is gated. Keep raw questions out of commits, logs and the dashboard (`research/refs/rein2023gpqagraduatelevelgoogleproofqa/summary.md`). |
| P-32 | held-out set | AIME 2025, for s1.1 only | main.tex L690 (C-120) | INCONCLUSIVE | `TIGER-Lab/AIME25` on every run; AIME 2026 too if the student's data cutoff predates Feb 2026 | s1 has no AIME 2025 command for s1 itself (M-21). |
| P-33 | decoding | temperature 0 (greedy); accuracy, equal to pass@1 | main.tex L269 (C-60) | VERIFIED | greedy for headline numbers | The harness scores `exact_match` on the first sample. |
| P-34 | sampled runs | none for headline numbers | main.tex L269 (C-60) | VERIFIED | AIME24 and AIME 2025: 8 samples per question at temperature 1, mean accuracy with 95% CI | Departure. One AIME problem is 3.3 points. Temperature 1 matches s1's only sampled setting (C-52, C-99). |
| P-35 | confidence intervals | 95% paired bootstrap of the difference, 10,000 resamples | main.tex L546, Table 2 (C-80) | INCONCLUSIVE | same, for every comparison | No bootstrap code is in the repo. |
| P-36 | max new tokens | 32,768 | `research/refs/aime/summary.md` (C-109) | INCONCLUSIVE | 32,768 if one sequence's KV cache fits in 8 GB, else 16,384 | `aime24_nofigures.yaml:12-16` sets 32,768. Any lower cap changes the baseline. |
| P-37 | eval precision | full precision | main.tex L736 (C-131) | VERIFIED | bf16; 8-bit weights only if bf16 does not fit | Every command sets `dtype=float32`. fp32 4B weights are about 16 GB. |
| P-38 | inference engine | vLLM | main.tex L729 (C-128) | INCONCLUSIVE | vLLM with its GPU memory fraction set to 8 GB, inside the project's Docker container | vLLM use is verified. "Fastest option" is not checkable. |
| P-39 | eval harness | lm-evaluation-harness fork at commit 4cec66e | main.tex L269 (C-59) | VERIFIED | s1's fork at s1 commit 77272c6, with the tiered grader in place of the judge | |
| P-40 | seed | fixed vLLM seed; scores still vary across runs | main.tex L729 (C-129) | INCONCLUSIVE | 1234 for greedy runs; seeds 0 to 7 for sampled runs; log batch size and engine settings | Seed 1234 is in `H/models/vllm_causallms.py:58, 94`. The judge's temperature 0.5 added variance (R-10). |
| P-41 | AIME prompt | bare question; the 000-999 hint is commented out | `research/refs/aime/summary.md` (C-54) | INCONCLUSIVE | bare question | If tier 1 cannot parse over 10% of the base model's AIME answers, add the 000-999 line in a separate, labeled run. |
| P-42 | GPQA option order | harness shuffles options under `random.seed(0)`, in process order | `research/refs/rein2023gpqagraduatelevelgoogleproofqa/summary.md` (C-57) | INCONCLUSIVE | run GPQA alone in its own process with seed 0; save the letter permutation | The mapping depends on every earlier `random` call in the same process. |
| P-43 | answer extraction | text after the answer delimiter, then last `\boxed{}`, else last `Answer:` | `research/refs/aime/summary.md` (C-60) | VERIFIED | same order in tier 1 | |

## Grading

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-44 | grader | paper: accuracy, no grader named; code: `gpt-4o-mini` judge at temperature 0.5 for non-integer answers | main.tex L269 (C-60); M-15 | VERIFIED | tier 1 rules, tier 2 `qwen3.5:9b` via Ollama, tier 3 Claude (see Tiered grading) | `factory/decisions.tsv` `project/replication/grading`. Verification act-on item 2. Scores are not directly comparable with the paper's. |
| P-45 | GPQA unparsed answer | the harness turns it into "A" | M-15 (C-60) | VERIFIED | wrong once no tier can parse it; also report the "A"-fallback score | The fallback gives about 25% credit to unparsed answers. Small models skip the answer line more often. |
| P-46 | AIME equality | `int()` comparison when both strings are digits | `research/refs/aime/summary.md` (C-54) | INCONCLUSIVE | `int()` after stripping `$`, `\text{}`, commas, spaces and a trailing period | Without the judge, the harness compares raw strings, so `$23$` would score wrong. |
| P-47 | MATH500 equality | judge for every non-integer answer | M-15; `research/refs/hendrycks2021measuringmathematicalproblemsolving/summary.md` (C-56) | INCONCLUSIVE | MATH normalization rules plus SymPy; rule-incorrect answers go to tier 2 | String rules give false negatives such as `\sqrt{8}` against `2\sqrt{2}`. |
| P-48 | judge temperature | 0.5 | R-10 (C-129) | INCONCLUSIVE | 0 for tier 2; Claude's default for tier 3, verdict and reason logged | The paper never mentions the judge, so it gives no reason for 0.5. A deterministic local judge removes one source of run-to-run variance. |

## Budget forcing

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-49 | cap thinking | append the end-of-thinking delimiter and, optionally, "Final Answer:" | main.tex L232 (C-42, C-12) | VERIFIED | append the delimiter and "Final Answer:" every time, as the harness does | The harness always appends `"\nFinal Answer:"` at the cap (M-12). |
| P-50 | extend thinking | suppress the end-of-thinking delimiter and append "Wait" | main.tex L172, L232 (C-13, C-43) | VERIFIED | same | |
| P-51 | extension string | "Wait" beats no string, "Hmm" and "Alternatively" | Table 4, main.tex L598-L614 (C-94, C-95) | INCONCLUSIVE | "Wait"; 2x "Hmm" and 2x no string only if time allows | No Table 4 results are in the repo. |
| P-52 | number of extensions | 1x, 2x, 4x and 6x "Wait"; gains flatten at 6 | Figure 4a, main.tex L257, L352 (C-51, C-72) | INCONCLUSIVE | 0, 1, 2, 4 and 6 | The runs exist (`eval/commands.sh:32-35`). The plateau is a result. Watch for loops (C-73). |
| P-53 | thinking caps for forcing an end | 2,048 and 4,096 shown; seven caps from 500 to 16,000 plus `auto` in the code | Figure 4a, main.tex L253-L259 (C-88) | INCONCLUSIVE | 1,024, 2,048, 4,096 and 8,192, plus no cap | A small model's natural length differs. Center the caps on the student's measured no-intervention length. |
| P-54 | `auto` cap | about 30,000 thinking tokens | main.tex L546 (C-79) | INCONCLUSIVE | max new tokens minus prompt minus delimiters, logged per run | The code computes 32,768 minus the prompt minus about 110 tokens, about 32.5K (M-11). |
| P-55 | thinking-token count | not specified | R-06 (C-12) | VERIFIED | count the token IDs the model conditioned on, and say so | After "Wait" rounds the harness truncates token IDs but not text, does not shrink the per-round budget, and a truncated sample skips "Final Answer:" (R-06). Verification act-on item 3. |
| P-56 | stop string | `<\|im_start\|>` ends thinking | main.tex L931 (C-148) | VERIFIED | the student's end-of-thinking token, confirmed before any run | Step-format runs may stop at the first step boundary with this stop string (R-07). |
| P-57 | metrics | Control, Scaling and Performance over a set of runs | main.tex L241-L249 (C-47, C-48, C-49) | INCONCLUSIVE | compute all three with our own script | No code in the repo computes them. |

## Baselines

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-58 | untuned base model | Qwen2.5-32B-Instruct: 26.7 / 84.0 / 49.0 on AIME24 / MATH500 / GPQA | Table 1, main.tex L291 (C-66) | INCONCLUSIVE | the untuned student, same harness, grader and budgets | The config exists (`eval/commands.sh:11`). The score is s1's own run, not from the Qwen2.5 report. |
| P-59 | fine-tuned, no budget forcing | 50.0 / 92.6 / 56.6, no thinking cap | Table 1, main.tex L302 (C-65) | INCONCLUSIVE | the fine-tuned student with no cap and no "Wait" | The s1.1 "w/o BF" row ran with an `auto` cap (M-23). |
| P-60 | majority voting | base model, temperature 1, 64 samples, maj@2 to maj@64 | Figure 4b, main.tex L257 (C-52) | VERIFIED | untuned student, temperature 1, 16 samples, maj@2, 4, 8 and 16, on GPQA and AIME24 | Scaled down for time. Theorem 1 in `research/refs/wu2024inference/summary.md` predicts an early plateau. |
| P-61 | token-conditional control | a token cap in the prompt | main.tex L234, Table 3 (C-45, C-89) | INCONCLUSIVE | not run | It needs a model trained on conditional-format data that is not released (C-161, C-162). |
| P-62 | step-conditional control | a step cap in the prompt | main.tex L234, Table 3 (C-45, C-90) | INCONCLUSIVE | not run | Same training-data gap, and the stop-string problem in R-07. |
| P-63 | class-conditional control | short and long thinking prompts | Table 3, Table 14 (C-91, C-175, C-176) | INCONCLUSIVE | both prompts on the fine-tuned student | The prompt text is in `H/tasks/aime/utils.py:15-18`. |
| P-64 | rejection sampling | temperature 1, caps of 3,500, 4,000, 5,000, 8,000 and 16,000 | Figure 6, main.tex L620 (C-99, C-100) | NOT VERIFIED | optional: caps 4,000, 8,000 and 16,000, at most 32 tries per question, report the share that never fits | The code runs six caps, adding 6,000 (M-13). Its try counter is batch-level (R-08). |
| P-65 | REBASE | process reward model from LLaMA-34B, majority vote, 16 trajectories | main.tex L649 (C-111, C-113) | INCONCLUSIVE | not run | The served reward model is Llemma-34B, 33.7B parameters, and outputs use weighted voting (M-20). At about 17 GB in 4-bit it cannot fit (`research/refs/wu2024inference/summary.md`). |
| P-66 | data ablations | 1K-random, 1K-diverse, 1K-longest and 59K-full | Table 2, main.tex L545-L564 (C-14, C-82 to C-85) | INCONCLUSIVE | not in Tier 1; 1K-random from the released 59K pool is optional | The selection code and results are not released (C-14). |
| P-67 | distilled reference models | r1-distill: 72.6 / 94.3 / 62.1 | Table 1, main.tex L294 (C-70) | INCONCLUSIVE | quote R1-Distill-Qwen-1.5B (28.9 / 83.9 / 33.8) and -7B (55.5 / 92.8 / 49.1) as context only, with their protocol | Those scores average 64 samples at temperature 0.6 (`research/refs/r1/summary.md`), not greedy. They were trained on about 800K traces, so they are an upper reference, not a 1K baseline. |
