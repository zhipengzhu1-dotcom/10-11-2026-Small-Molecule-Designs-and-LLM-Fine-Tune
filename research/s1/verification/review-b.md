# s1 claim verification: Reviewer B

Issue #9 (spec #1). Reviewer B worked independently of Reviewer A, going through the claims in reverse order (C-182 down to C-01). The table below is in ID order so the two reviews merge easily.

## Inputs and method

- Claims: `research/s1/notes/claims.md` (C-01 to C-182) and `research/s1/notes/sections.md` (D-01 to D-12), on the `intake/s1` tip `bed0046`.
- Code: `simplescaling/s1` at commit `77272c6e925d610257a50b520bad15330b513389`, from the main checkout's `research/s1/raw/code/s1/`. I read the code but never ran it. I printed the notebooks' JSON (cells and saved outputs) without executing them.
- Dataset cards: `research/s1/raw/datasets/s1K.md` and `s1K-1.1.md`.
- Paper: `research/s1/raw/arxiv/latex/main.tex`, read-only. I used it only to quote the paper's side of each mismatch.

Path prefixes used in the evidence column:

- `C/` is `research/s1/raw/code/s1/`.
- `H/` is `C/eval/lm-evaluation-harness/lm_eval/`.
- `RB/` is `C/eval/rebase/inference_scaling/`.
- `DS/` is `research/s1/raw/datasets/`.
- `filter.ipynb:N` and `grading.ipynb:N` are line numbers in the raw `.ipynb` JSON under `C/data/`.

Verdict rules. Every claim starts out presumed wrong.

- **VERIFIED**: the code or a card establishes every factual element of the claim. For a figure or table claim, this means the code contains a unique run configuration that matches every stated parameter.
- **NOT VERIFIED**: the code or data contradicts at least one element.
- **INCONCLUSIVE**: some element (usually a result number, a motive or an external fact) is beyond what the code and data can show. INCONCLUSIVE never counts as a pass. The note says which parts did check out.

Counts: **37 VERIFIED, 10 NOT VERIFIED, 135 INCONCLUSIVE** (182 claims).

## Verdicts

| ID | verdict | evidence | note |
|---|---|---|---|
| C-01 | INCONCLUSIVE | none (`C/CITATION.cff` has no affiliations) | Author affiliations and the shared first-author credit are not in the code or the cards. |
| C-02 | VERIFIED | `DS/s1K.md:24` (num_examples 1000), `DS/s1K.md:101` (thinking_trajectories); `filter.ipynb:139-239` (quality and difficulty filters), `:539-557` (diversity sampling), `:575` (1000) | All three criteria exist as notebook stages. |
| C-03 | VERIFIED | `H/models/vllm_causallms.py:254,401-409` (cap: append end-of-thinking + "Final Answer:"); `:331-378` (on a stop, append the ignore string and continue); `C/eval/commands.sh:32-35` (`thinking_n_ignore_str=Wait`) | |
| C-04 | VERIFIED | `C/train/sft.py:14`; `C/train/sft.sh:4,22`; `C/data/tokenization.py:52-53` | |
| C-05 | INCONCLUSIVE | none | No scores in the repo (`C/README.md:233` links external results). See D-06. |
| C-06 | INCONCLUSIVE | `C/eval/commands.sh:22` (no-BF run), `:32-35` (ignore runs) | Both runs exist; the 50 to 57 scores are not in the code. |
| C-07 | VERIFIED | `C/README.md:35-42` (model, s1K, s1K-1.1, s1-prob, s1-teasers, full-59K links) | |
| C-08 | INCONCLUSIVE | none | External claim about OpenAI. |
| C-09 | INCONCLUSIVE | none | Literature claim. |
| C-10 | VERIFIED | `C/data/gemini.py:25` (`gemini-2.0-flash-thinking-exp`), `:28-29`, `:82-83`; `DS/s1K.md:60,101-102` | |
| C-11 | INCONCLUSIVE | `C/train/sft.sh:2`; `C/README.md:209` | The only runtime in the code is a reference run: 5,268.8 s (87.8 min) at 0.119 steps/s, about 627 steps, which implies batch 8 (8 GPUs). The code has no 16-GPU timing. See M-11. |
| C-12 | VERIFIED | `H/models/vllm_causallms.py:261-267` (cap passed as max_tokens), `:401-409` (on a length stop, append `<\|im_start\|>answer` + "\nFinal Answer:"), `:414-457` (answer generated afterwards) | |
| C-13 | VERIFIED | `H/models/vllm_causallms.py:273-280` (min_tokens=1, stop on the delimiter token), `:360-378` (strip the delimiter, append "Wait", continue); `C/eval/commands.sh:32-35` | |
| C-14 | INCONCLUSIVE | none | The repo has no training configs for the ablation sets. See D-07. |
| C-15 | INCONCLUSIVE | `C/README.md:42` | The repo links the full-59K data but has no result for it. |
| C-16 | INCONCLUSIVE | none | Comparative result. |
| C-17 | INCONCLUSIVE | `C/eval/commands.sh:25-35` | The compute sweep exists; the figure data does not. |
| C-18 | VERIFIED | `C/data/collect_data.py:441-489` (builds the pool, pushes `s50K`); `filter.ipynb:139-575` (filters it to 1,000) | |
| C-19 | INCONCLUSIVE | `C/data/collect_data.py:405-439` (15 sources) + `C/data/add_aime.py:12` (AIME) | The 16 sources match. No code computes 59,029. |
| C-20 | INCONCLUSIVE | `C/data/collect_data.py:408-438` (comments) | Framing. |
| C-21 | INCONCLUSIVE | `C/data/collect_data.py:132-144`, `:414` | The code keeps every aops_forum row, plus non-aops rows only when they appear in `numinamath_500` or a hand-kept list. The comment says "take 500". The code never states 30,660. |
| C-22 | NOT VERIFIED | `C/data/add_aime.py:7-8` (`if year <= 2022`) | The code includes AIME 2022; the paper says 1983-2021. See M-01. |
| C-23 | INCONCLUSIVE | `C/data/collect_data.py:147` (7 subjects match), `:152` (EN, text-only), `:410` (comment "3922") | The subjects check out; 4,250 does not appear and the code comment says 3,922. See M-18. |
| C-24 | INCONCLUSIVE | `C/data/collect_data.py:416-418` (comment "3329") | 4,238 does not appear in the code. See M-18. |
| C-25 | INCONCLUSIVE | `C/data/collect_data.py:215-236` | The code also loads `sat_math`, `aqua_rat`, `logiqa` (labeled math) and MATH level 5, so the subset is not only English, law and logic. 2,385 does not appear. See M-19. |
| C-26 | INCONCLUSIVE | `C/data/collect_data.py:238-242`, `:427` (comment "182") | Only a code comment gives the 182. The Stanford-qualifier origin and handwritten solutions can't be checked. |
| C-27 | INCONCLUSIVE | `C/data/collect_data.py:275-279` | No "Hard"-level filter in the code. The count of 23 is not in the code. |
| C-28 | INCONCLUSIVE | `C/data/gemini.py:24-29` (trace = part 0, answer = part 1), `:82-83` | The mechanism checks out; the 59K count does not appear. |
| C-29 | VERIFIED | `C/data/collect_data.py:445-453` (test sets: aimo-validation-aime, GPQA via `:111` to `gpqa_diamond`, openaimath test), `:459` (`ngram_size=8`), `:475` (cross-source), `:481-488` (exact dedup); `C/data/decontaminate_util.py:14-17,41-49` | The code decontaminates against more sets than the paper names. See M-20. |
| C-30 | VERIFIED | `filter.ipynb:139` (drop any None feature), `:154` (54116) | The count matches, but the rule is broader than "API errors". See M-06. |
| C-31 | NOT VERIFIED | `filter.ipynb:194-201` (rules), `:185` (51607) | 51,607 in the code against 51,581 in the paper. See M-02. |
| C-32 | NOT VERIFIED | `filter.ipynb:435-439` (rule), `:452` (393) | 393 in the code against 384 in the paper. See M-04 and D-09. |
| C-33 | VERIFIED | `C/data/bulk_inference.sh:13,28`; `C/data/bulk_inference.py:18,62-64`; `C/data/featurization.py:65,69,191-194` | The Qwen attempts use temperature 0.05 (`bulk_inference.py:32`), which the paper doesn't state. |
| C-34 | VERIFIED | `C/data/featurization.py:163-168`; `filter.ipynb:549` | |
| C-35 | NOT VERIFIED | `filter.ipynb:239` (rule matches), `:230` (24517) | 24,517 in the code against 24,496 in the paper. See M-03. |
| C-36 | VERIFIED | `C/data/bulk_inference.sh:28`; `C/train/sft.py:14` | The filter model and the fine-tuning base are the same model. |
| C-37 | VERIFIED | `C/data/featurization.py:17,21,33-39`; `C/data/msc.json` (61 top-level MSC codes, including 70-86 physics and astronomy, 91 economics, 92 biology) | |
| C-38 | NOT VERIFIED | `filter.ipynb:540-544` (uniform only while fewer than 700 are selected, then `benchmark_sample`), `:477-484` | The domain is not uniform throughout, and the code has no 50-domain target. See M-05. |
| C-39 | VERIFIED | `filter.ipynb:435` (correctness checked only in stage 1), `:539-557` (no correctness check); `grading.ipynb:1661` (464 of 1000 "No") | |
| C-40 | VERIFIED | `grading.ipynb:1661` (Yes 536/1000 = 53.6%), `:1834` (Yes 630/1000 = 63.0%) | Push commit `96c411f` (`grading.ipynb:1804`) matches the s1K-1.1 card revision. |
| C-41 | INCONCLUSIVE | none | Conceptual. |
| C-42 | VERIFIED | `H/models/vllm_causallms.py:254,401-409` | In the harness, "Final Answer:" is always appended at the cap, not optionally. See M-16. |
| C-43 | VERIFIED | `H/models/vllm_causallms.py:242-245,273-280,360-378`; `C/eval/commands.sh:38` (ignore with no string) | |
| C-44 | INCONCLUSIVE | `C/eval/generate.py:21-23,57-72` | The output is not in the repo, and the code attributes the sample to an earlier model. See M-09. |
| C-45 | INCONCLUSIVE | `H/tasks/aime/utils.py:11-18`; `H/tasks/gpqa/openai/utils.py:15-22`; `C/eval/commands.sh:43-88` | All four baselines exist. "About 100 tokens per step" does not appear in the code. |
| C-46 | VERIFIED | `H/models/vllm_causallms.py:230-234,268-269,286-330` | |
| C-47 | INCONCLUSIVE | none | The repo has no code that computes Control. |
| C-48 | INCONCLUSIVE | none | No Scaling code. |
| C-49 | INCONCLUSIVE | none | No Performance code. |
| C-50 | INCONCLUSIVE | none | Result. |
| C-51 | VERIFIED | `C/eval/commands.sh:33-35` (`thinking_n_ignore=2/4/6`, `thinking_n_ignore_str=Wait`) | |
| C-52 | VERIFIED | `C/eval/commands.sh:91`; `H/tasks/aime/aime24_nofigures_agg64.yaml:15,17`; `H/tasks/aime/utils.py:229,298-300` | |
| C-53 | INCONCLUSIVE | `C/train/sft.sh:25-26` (FSDP full_shard); `C/README.md:209` (16 H100 recommended) | FSDP checks out; 26 minutes does not. See M-11. |
| C-54 | INCONCLUSIVE | `H/tasks/aime/aime24_nofigures.yaml:4`; `H/api/metrics.py:23-27` | Dataset content is not in hand. `aime24_figures` uses a `mean_last30` aggregation, which suggests that file has more than 30 rows. |
| C-55 | INCONCLUSIVE | `C/README.md:228`; `filter.ipynb:199-201` | Dataset content is not in hand. |
| C-56 | INCONCLUSIVE | `H/tasks/openai_math/openai_math.yaml:4,7` | The code doesn't show the size or the OpenAI origin of `simplescaling/openaimath` test. |
| C-57 | INCONCLUSIVE | `H/tasks/gpqa/openai/gpqa_diamond_openai.yaml:3`; every GPQA run in `C/eval/commands.sh` uses `gpqa_diamond_openai` | "GPQA means Diamond" holds in the code; 198 does not appear. |
| C-58 | INCONCLUSIVE | none | External citation. |
| C-59 | VERIFIED | `C/README.md:222`; `H/` present | |
| C-60 | VERIFIED | `H/tasks/aime/aime24_nofigures.yaml:14-15`; `H/tasks/openai_math/openai_math.yaml:13-14`; `H/tasks/gpqa/openai/gpqa_diamond_openai.yaml:35-36`; `H/tasks/aime/utils.py:292-293` (score from the first sample) | Answer equivalence goes through a gpt-4o-mini judge. See M-10. |
| C-61 | INCONCLUSIVE | none | |
| C-62 | INCONCLUSIVE | none | Manual web-interface scoring; no code. |
| C-63 | INCONCLUSIVE | none | |
| C-64 | INCONCLUSIVE | none | See D-05. |
| C-65 | INCONCLUSIVE | `C/eval/commands.sh:22` | The run exists; the scores do not. |
| C-66 | INCONCLUSIVE | `C/eval/commands.sh:11` | The run exists; the scores do not. |
| C-67 | INCONCLUSIVE | none | Scores of external models. |
| C-68 | INCONCLUSIVE | none | |
| C-69 | INCONCLUSIVE | none | |
| C-70 | INCONCLUSIVE | none | |
| C-71 | INCONCLUSIVE | none | |
| C-72 | INCONCLUSIVE | `C/eval/commands.sh:32-35` | |
| C-73 | INCONCLUSIVE | none | Observation. |
| C-74 | INCONCLUSIVE | `C/eval/commands.sh:91` | |
| C-75 | INCONCLUSIVE | none | |
| C-76 | INCONCLUSIVE | none | |
| C-77 | INCONCLUSIVE | none | |
| C-78 | INCONCLUSIVE | none | |
| C-79 | INCONCLUSIVE | `H/models/vllm_causallms.py:262-265` | The "auto" cap is 32,768 minus the longest prompt in the batch, minus the delimiter tokens, minus 100: about 32K, not about 30K. The Table 2 ablation runs are not in `commands.sh`. See M-15. |
| C-80 | INCONCLUSIVE | none | The repo has no bootstrap code. |
| C-81 | INCONCLUSIVE | none | |
| C-82 | INCONCLUSIVE | none | |
| C-83 | INCONCLUSIVE | none | |
| C-84 | INCONCLUSIVE | none | |
| C-85 | INCONCLUSIVE | none | |
| C-86 | INCONCLUSIVE | `C/train/sft.sh:2` | The repo has no 59K config. See M-11 for the 7-hour figure. |
| C-87 | INCONCLUSIVE | none | Conclusion. |
| C-88 | INCONCLUSIVE | `C/eval/commands.sh:25-35` | The code has 7 max-token runs plus 4 ignore runs, not a set of 5. |
| C-89 | INCONCLUSIVE | `C/eval/commands.sh:51-60` | Only 4 caps exist per condition. See M-12. |
| C-90 | INCONCLUSIVE | `C/eval/commands.sh:63-74` | |
| C-91 | INCONCLUSIVE | `C/eval/commands.sh:87-88` | Exactly 2 runs exist. |
| C-92 | INCONCLUSIVE | `H/models/vllm_causallms.py:286-330` | The loop guarantees 100% Control by construction; the Scaling and Performance numbers can't be checked. |
| C-93 | INCONCLUSIVE | none | Motive. |
| C-94 | INCONCLUSIVE | `C/eval/commands.sh:33` | |
| C-95 | INCONCLUSIVE | `C/eval/commands.sh:31,38-40`; `H/models/vllm_causallms.py:366` | All four configs exist; the scores do not. |
| C-96 | INCONCLUSIVE | none | |
| C-97 | INCONCLUSIVE | none | |
| C-98 | INCONCLUSIVE | none | |
| C-99 | INCONCLUSIVE | `C/eval/commands.sh:43-48` (temperature=1, AIME only) | |
| C-100 | NOT VERIFIED | `C/eval/commands.sh:43-48` | The code runs six caps: 3500, 4000, 5000, 6000, 8000 and 16000. The caption lists five and omits 6,000. See M-07 and D-02. |
| C-101 | INCONCLUSIVE | none | Hypothesis. |
| C-102 | INCONCLUSIVE | none | Related work. |
| C-103 | INCONCLUSIVE | none | |
| C-104 | INCONCLUSIVE | none | |
| C-105 | INCONCLUSIVE | none | |
| C-106 | INCONCLUSIVE | none | |
| C-107 | INCONCLUSIVE | none | |
| C-108 | INCONCLUSIVE | none | |
| C-109 | INCONCLUSIVE | none | |
| C-110 | INCONCLUSIVE | none | |
| C-111 | INCONCLUSIVE | `RB/scripts/run_reward.sh:6` (`tkitsers/Llemma-reward-model`); `RB/finetune/gpt-accelera/scripts_finetune/finetune_rm.sh:5` (base `EleutherAI/llemma_7b`); `RB/exp_results/rebase_16/results.txt:1` ("majority_vote weighted: True") | The code points to a reward model built on Llemma-7B and to weighted majority voting. The reward model's checkpoint is not in hand. See M-17. |
| C-112 | INCONCLUSIVE | none | |
| C-113 | INCONCLUSIVE | `RB/hype-parameters/rebase16.yaml:10` (width 16); `C/eval/rebase/run.sh:1` (PROMPTSTEP=64, 16 parallel) | The 16 trajectories check out. The 32/256/512 step runs and the token accounting are not in the code. |
| C-114 | INCONCLUSIVE | none | |
| C-115 | INCONCLUSIVE | none | Motive. |
| C-116 | VERIFIED | `DS/s1K-1.1.md:122` (Ryan Marten), `:44` (tag `curator`); `C/data/bulk_inference.sh:6` (`--account=marlowe-m000027`) | |
| C-117 | NOT VERIFIED | `DS/s1K-1.1.md:74,25-28,40`; `C/README.md:209`; `C/train/sft.sh:17` | The same 1,000 questions with r1 traces check out. The training was not unchanged: s1.1 used block size 20,000 against 32,768 for s1. The README gives month precision only, so "seven days" can't be checked. See M-08. |
| C-118 | INCONCLUSIVE | `DS/s1K-1.1.md:74` | The card makes the same assertion, but it is a self-report, not evidence. |
| C-119 | INCONCLUSIVE | none | No Claude 3.7 distillation code. |
| C-120 | INCONCLUSIVE | `H/tasks/aime/aime25_nofigures.yaml:4` | |
| C-121 | INCONCLUSIVE | `C/eval/commands.sh:17` | The only s1.1 "no Wait" run sets `max_tokens_thinking=auto`, which is a thinking cap, not "without budget forcing". See M-14. |
| C-122 | INCONCLUSIVE | `C/eval/commands.sh:15,19` | The 1x-Wait run covers AIME 2025 only. See M-13. |
| C-123 | INCONCLUSIVE | `C/eval/commands.sh:22` | No s1 command runs AIME 2025. See M-13. |
| C-124 | INCONCLUSIVE | `C/eval/commands.sh:32-34` | No AIME 2025 task. See M-13. |
| C-125 | INCONCLUSIVE | none | |
| C-126 | INCONCLUSIVE | none | |
| C-127 | INCONCLUSIVE | none | |
| C-128 | INCONCLUSIVE | `C/eval/commands.sh:11-92` (`--model vllm`) | vLLM use checks out; "fastest we tried" can't be checked. |
| C-129 | INCONCLUSIVE | `C/eval/commands.sh` (`--batch_size auto`, `tensor_parallel_size=8`) | Observation. |
| C-130 | INCONCLUSIVE | none | Observation. |
| C-131 | VERIFIED | `C/eval/commands.sh:11,22,25-92` (`dtype=float32`) | |
| C-132 | INCONCLUSIVE | none | No Table 6 code. |
| C-133 | INCONCLUSIVE | none | |
| C-134 | INCONCLUSIVE | none | |
| C-135 | INCONCLUSIVE | `filter.ipynb:575` | 1,000 checks out; 4.7M and "(51)" do not appear. See D-01. |
| C-136 | VERIFIED | `C/data/featurization.py:165-168` | |
| C-137 | NOT VERIFIED | `C/data/add_aime.py:8`; `C/data/collect_data.py:446` | The code keeps AIME through 2022. "2022-2023" is also 60 questions, not 90. See M-01 and D-13. |
| C-138 | INCONCLUSIVE | `C/data/collect_data.py:409,413,420,422,424,430,432,434,438` | All nine sources exist; the counts are not in the code, and code comments differ. See M-18. |
| C-139 | NOT VERIFIED | `C/data/add_aime.py:8` | The code's range is 1983-2022. A full 1983-2021 run would be 915 questions (17x15 + 22x30); 890 can't be checked. |
| C-140 | INCONCLUSIVE | none | |
| C-141 | VERIFIED | `C/data/featurization.py:21,69` (`claude-3-5-sonnet-20241022`); `grading.ipynb:1449,1562,1677` (`claude-3-7-sonnet-20250219`) | |
| C-142 | VERIFIED | `C/data/grading.txt:1-18`; `C/data/featurization.py:65,70` | |
| C-143 | VERIFIED | `filter.ipynb:435-439` | The rule matches. See R-1 for a reproduction break. |
| C-144 | NOT VERIFIED | `filter.ipynb:539-557` | The 2^-rank weighting (`:549-550`) and the removal of empty domains (`:555-557`) match. The domain choice does not. See M-05. |
| C-145 | INCONCLUSIVE | `C/data/collect_data.py:445-459`; `C/data/add_aime.py:8` | The mechanism supports the claim, but it can't be checked without the data. |
| C-146 | VERIFIED | `C/data/collect_data.py:111,445-453,459`; `C/data/decontaminate_util.py:6-17,46-48` | One shared word-level 8-gram is enough. See D-10. |
| C-147 | INCONCLUSIVE | none | External comparison. |
| C-148 | VERIFIED | `C/data/tokenization.py:27-33` | The assistant turn is `<\|im_start\|>assistant\n` + `<\|im_start\|>think\n` + trace + `\n<\|im_start\|>answer\n` + answer. Also, `:26` prefixes "Answer: " to the attempt when it is missing. |
| C-149 | VERIFIED | `C/train/sft.sh:7,9`; `C/train/sft_slurm.sh:6,35` | ceil(1000/16) = 63 steps x 5 epochs = 315. In `sft.sh` the batch size equals the GPU count. See M-11. |
| C-150 | VERIFIED | `C/train/sft.sh:5,24,27,31,32` | ceil(0.05 x 315) = 16 warmup steps, with a cosine decay to 0, both from HF Trainer defaults (the library is not vendored). `min_lr=0` at `:6` is unused. |
| C-151 | VERIFIED | `C/train/sft.sh:8,33-35` | No optimizer flag is set, so HF's default AdamW applies. |
| C-152 | VERIFIED | `C/train/sft.py:52-66`; `C/data/tokenization.py:27-33` | |
| C-153 | INCONCLUSIVE | `C/train/sft.sh:17`; `C/train/sft.py:15,68` | 32,768 is set, but no sample lengths are in hand. |
| C-154 | INCONCLUSIVE | `C/README.md:209` | Only a wandb link. |
| C-155 | INCONCLUSIVE | `C/train/sft.py:15` | No 4,096 run in the repo. |
| C-156 | INCONCLUSIVE | none | |
| C-157 | INCONCLUSIVE | none | |
| C-158 | INCONCLUSIVE | none | |
| C-159 | INCONCLUSIVE | `C/train/sft.sh:17` | The 32,768 choice checks out; the reason can't be checked. |
| C-160 | INCONCLUSIVE | `C/data/gemini.py:24-27,39`; `C/data/collect_data.py:147,238-242,275-279` | Generation from the question alone checks out; the content of Tables 9 to 11 does not. |
| C-161 | VERIFIED | `H/tasks/aime/utils.py:12,14`; `C/eval/compute_sample_stats.py:64,69`; `C/eval/commands.sh:70`; `C/train/sft.py:58-66` | |
| C-162 | INCONCLUSIVE | `filter.ipynb:10884-10887`; `C/data/tokenization.py:36-37` | The token-conditional data script is not released. See R-2. |
| C-163 | INCONCLUSIVE | `C/eval/commands.sh:51-54` | No 1,024 run. See M-12. |
| C-164 | INCONCLUSIVE | `C/eval/commands.sh:57-60` | No 1,024 run. See M-12. |
| C-165 | INCONCLUSIVE | `C/eval/commands.sh:51-60` | 4 runs per condition, not 5. See M-12. |
| C-166 | INCONCLUSIVE | none | Citation. |
| C-167 | INCONCLUSIVE | none | The step-format data script is not released. |
| C-168 | INCONCLUSIVE | `C/eval/commands.sh:70-74`; `H/models/vllm_causallms.py:246,282,411` | Forcing at 0 steps checks out; the negative-step behavior can't be checked. |
| C-169 | INCONCLUSIVE | `C/eval/commands.sh:63-67` | The caps 16-256 match. See R-7. |
| C-170 | INCONCLUSIVE | `C/eval/commands.sh:70-74` | |
| C-171 | INCONCLUSIVE | none | |
| C-172 | INCONCLUSIVE | none | |
| C-173 | VERIFIED | `C/README.md:236`; `RB/scripts/run_policy_our.sh:7`; `H/tasks/aime/aime_2024_rebase.yaml:4` | |
| C-174 | INCONCLUSIVE | none | External API. |
| C-175 | INCONCLUSIVE | `H/tasks/aime/utils.py:18` | |
| C-176 | INCONCLUSIVE | `H/tasks/aime/utils.py:16` | |
| C-177 | INCONCLUSIVE | `H/tasks/aime/utils.py:20` | |
| C-178 | INCONCLUSIVE | none | Arithmetic on the paper's own numbers. |
| C-179 | INCONCLUSIVE | `C/eval/commands.sh:44,47` | |
| C-180 | INCONCLUSIVE | `H/models/vllm_causallms.py:289-330` | The code logs a batch-level iteration count, not tries per example. See R-8. |
| C-181 | INCONCLUSIVE | none | |
| C-182 | INCONCLUSIVE | `C/README.md:12-16` | |

## Mismatches between the paper and the code

There are 21 in all: M-01 to M-17 are hard, M-18 to M-21 are soft (code comments, scope or approximation). Paper lines are in `main.tex`.

| # | Topic | Paper | Code | Claims |
|---|---|---|---|---|
| M-01 | AIME years in the pool | 1983-2021 (L198, L810) | `year <= 2022` (`C/data/add_aime.py:8`) | C-22, C-137, C-139 |
| M-02 | Count after the formatting filter | 51,581 (L209) | 51,607 (`filter.ipynb:185`) | C-31 |
| M-03 | Count after the Qwen-solved filter | 24,496 (L211, L881) | 24,517 (`filter.ipynb:230`) | C-35 |
| M-04 | Samples from trusted sources | 384 (L209) | 393 (`filter.ipynb:452`) | C-32 |
| M-05 | Domain choice in stage 2 | uniform at random throughout (L213; Algorithm 1 L899) | uniform only for the first 700; the last 300 are drawn from a GPQA- and AIME-weighted domain mix (`filter.ipynb:477-484,540-544`) | C-38, C-144 |
| M-06 | First quality filter | "any API errors" (L209), giving 54,116 | drops a row when any featurized field is None, which also removes every question with no reference solution, such as USACO and LiveCodeBench (`filter.ipynb:139`; `C/data/featurization.py:56-63,124-130`; `C/data/collect_data.py:270,288`); same count, 54,116 | C-30 |
| M-07 | Rejection-sampling caps | 5 caps: 3500, 4000, 5000, 8000, 16000 (L620) | 6 caps: 3500, 4000, 5000, **6000**, 8000, 16000 (`C/eval/commands.sh:43-48`) | C-100 |
| M-08 | s1.1 training setup | "unchanged" (App. A L686) | block size 20,000 for s1.1 (`C/README.md:209`) against 32,768 for s1 (`C/train/sft.sh:17`) | C-117 |
| M-09 | Model in Figure 3 | s1-32B (caption L224) | "an earlier version of s1", `qfq/1k_qr_bt_dm_po_steps` (`C/eval/generate.py:21-22`) | C-44 |
| M-10 | Benchmark scoring | "accuracy" with no grader named (L269); `main.tex` never mentions gpt-4o | a gpt-4o-mini judge decides answer equivalence for non-integer answers, and for MATH it is required (`H/tasks/aime/utils.py:237-284`; `H/tasks/openai_math/utils.py:255-259`; `H/tasks/gpqa/openai/utils.py:170-172`; `PROCESSOR=gpt-4o-mini` in every `commands.sh` line) | C-60 |
| M-11 | Training time and steps | 26 min on 16 H100, 7 GPU-hours, 315 steps (L267, L566, L931) | the only recorded run took 5,268.8 s (87.8 min) at about 627 steps, which implies 8 GPUs at batch 8, or about 11.7 GPU-hours (`C/train/sft.sh:2`); `sft.sh` sets the global batch to the GPU count (`:9-10`) | C-11, C-53, C-86, C-149 |
| M-12 | Token-conditional caps | 1024, 2048, 4096, 8192, 16384, so 5 runs (L2548, L2610) | 2048, 4096, 8192, 16384 only, so 4 runs (`C/eval/commands.sh:51-60`) | C-89, C-163-C-165 |
| M-13 | AIME 2025 runs in Table 5 | s1 at 0x, 1x, 2x and 4x and s1.1 at 1x, on all four benchmarks | s1 has no `aime25` task (`C/eval/commands.sh:22-35`); s1.1 at 1x runs `aime25` only (`:15`) | C-122-C-124 |
| M-14 | s1.1 "w/o BF" row | no budget forcing | `max_tokens_thinking=auto`, which is a thinking cap (`C/eval/commands.sh:17`) | C-121 |
| M-15 | Thinking cap for the ablations | "around 30,000" (L546) | `auto` = 32,768 minus the longest prompt minus about 110 tokens (`H/models/vllm_causallms.py:264`) | C-79 |
| M-16 | "Final Answer:" at the cap | optional (L232) | always appended (`H/models/vllm_causallms.py:254,401-409`) | C-42 |
| M-17 | REBASE reward model and aggregation | initialized from LLaMA-34B; plain majority vote (L649) | the reward-model fine-tune script starts from `EleutherAI/llemma_7b` (`RB/finetune/gpt-accelera/scripts_finetune/finetune_rm.sh:5`); the checkpoint used is `tkitsers/Llemma-reward-model` (`RB/scripts/run_reward.sh:6`); results report a *weighted* majority vote (`RB/exp_results/rebase_16/results.txt:1`) | C-111 |
| M-18 | Source sizes (code comments) | OlympicArena 4,250, Omni-MATH 4,238, TheoremQA 747, OlympiadBench 896, JEEBench 515, USACO 519, SciEval 227, xword 999, MATH 11,999, NuminaMATH 30,660 | comments give 3922, 3329, 720, 626, 483, 520, 250 (selected), 1000, "12K" and "take 500", although the code keeps every aops_forum row (`C/data/collect_data.py:408-438,132-144`) | C-21, C-23, C-24, C-138 |
| M-19 | AGIEval scope | "English, law and logic" (L198) | also `sat_math`, `aqua_rat`, `logiqa` (labeled math) and MATH level 5 (`C/data/collect_data.py:216-231`) | C-25 |
| M-20 | Decontamination sets | MATH500, GPQA Diamond, AIME24 (L202, L925) | also AIME 2022-2023 (`AI-MO/aimo-validation-aime`), LiveCodeBench `release_v4`, and 8-gram dedup across sources (`C/data/collect_data.py:445-450,475`) | C-29, C-146 |
| M-21 | Answer delimiter in training text | not stated | "Answer: " is prepended to the Gemini attempt when it is missing (`C/data/tokenization.py:26`) | C-148 |

### Problems inside the code that affect reproduction

- **R-1.** The MATH branch of Algorithm 1 matches the string `'qfq/openaimath'` (`filter.ipynb:438`). The released collect script writes `simplescaling/openaimath/<subject>` instead (`C/data/collect_data.py:120`). Run from scratch, that branch selects nothing. The saved run's data used `qfq/...` names (e.g. `filter.ipynb:721`).
- **R-2.** `filter.ipynb:10884-10887` calls `mathcot_sft(time_limit=..., model_type=..., rollout_path=..., step_format=...)`. The released `C/data/tokenization.py:36-37` accepts none of these arguments, so the code that tokenized s1K is not the code that was released.
- **R-3.** Stage-2 sampling uses `np.random` with no seed (`filter.ipynb:483-495,551`), so the code cannot regenerate s1K exactly.
- **R-4.** `C/data/add_aime.py:26,35` and `C/data/fix_gpqa.py:54,59` read from and push to a hard-coded `simplescaling/s1K`. The AIME rows are appended outside the decontamination step in `collect_data.py`.
- **R-5.** `C/data/bulk_inference.sh:3,18` runs shards 0-5, but `C/data/bulk_inference.py:73` reads shards 0-6.
- **R-6.** When thinking overruns the cap after "Wait" extensions, the code truncates only the token IDs and leaves the text untruncated (`H/models/vllm_causallms.py:381-384` and `:406,412`). The logged thinking can therefore be longer than the trace the answer was generated from, which inflates reported thinking-token counts.
- **R-7 (suspected; I did not run it).** The step-conditional runs without forcing (`C/eval/commands.sh:63-67`) pass `max_tokens_thinking=auto`. The harness then falls back to `thinking_start="<|im_start|>think"` and stops at `"<|im_start|>"` (`H/models/vllm_causallms.py:237-246,282`). That is the same token that opens each step (`C/eval/commands.sh:70`; `C/eval/compute_sample_stats.py:69`), so as written, thinking may end at the first step. Table 13's averages of 80-136 steps (C-169) would then not come from these commands.
- **R-8.** In rejection sampling, the code prints the number of batch iterations until every sample fits, and refills finished slots with copies of unfinished requests (`H/models/vllm_causallms.py:320-330`). That is not an "average tries per sample" (C-100, C-180).

## D-items

- **D-01: not resolved by the code.** `C/data/msc.json` lists 61 MSC codes. `filter.ipynb:493,539-557` has no 50-domain target, and no saved output counts the final domains. The code can't decide between 50 and 51.
- **D-02: resolved.** The code runs six caps (`C/eval/commands.sh:43-48`), and the caption leaves out 6,000. The six try counts then line up one to one: 655 at 3,500, 97 at 4,000, 8 at 5,000, 3 at 6,000, 2 at 8,000 and 1 at 16,000. That pairing is my inference. The code doesn't print the counts, and its counter is batch-level (R-8).
- **D-03: not code-checkable.** The typo stands, from comparing the paper with itself.
- **D-04: not code-checkable.** These are scores taken from other models' reports.
- **D-05: not resolved.** The code runs the s1 ignore-1/2/4/6 configurations (`C/eval/commands.sh:32-35`), but the repo has no per-run scores. The code doesn't say how the Table 1 row was built.
- **D-06: arithmetic confirmed; not code.** 56.7 / 44.6 = 1.271 relative, and 12.1 points absolute.
- **D-07: arithmetic confirmed; not code.** The drops are 13.3, 23.3 and 16.7 points, with a mean of 17.8 points, or 35.5% relative to 50.0. That is not "around 30%".
- **D-08: resolved.** The MATH rows in the pool come from the `simplescaling/openaimath` *train* split (`C/data/collect_data.py:118-120`; selected at `filter.ipynb:438`). MATH500 is the *test* split, used for evaluation and decontamination (`H/tasks/openai_math/openai_math.yaml:4,7`; `C/data/collect_data.py:448`). The "MATH500" comment in Algorithm 1 is wrong.
- **D-09: resolved, as a mismatch.** The rule in `filter.ipynb:435-439` gives **393** (`:452`), not 384 (M-04).
- **D-10: resolved.** One shared word-level 8-gram, after lowercasing and collapsing whitespace, is enough to drop a question (`C/data/decontaminate_util.py:6-17,46-48`; `C/data/collect_data.py:459`). The GPQA set is `gpqa_diamond` (`C/data/collect_data.py:111,447`), so "GPTQA" is a typo.
- **D-11: not code-checkable.** It is a matter of presentation.
- **D-12: partly resolved.** The units are not comparable. The code's "tries" is a batch iteration count (R-8). Figure 6 was run on `simplescaling/s1-32B` (`C/eval/commands.sh:43-48`), while Table 15 used an earlier model. The numbers can't be reconciled from the code.
- **D-13 (new).** `main.tex:798` says the authors left out "AIME questions from 2022-2023 ... these 90 questions". Two years of AIME is 60 questions (2 x 30). The only 90-question AIME set in the code is the decontamination set `AI-MO/aimo-validation-aime` (`C/data/collect_data.py:446`). The code also keeps AIME 2022 in the pool (`C/data/add_aime.py:8`), which contradicts leaving it out.
- **D-14 (new).** Figure 3 is captioned as s1-32B, but the code says the sample came from an earlier model (M-09).
