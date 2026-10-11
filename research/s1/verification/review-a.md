# s1 claim verification: Reviewer A

Issue #9. This review checks every claim in `research/s1/notes/claims.md` (C-01 to C-182) and the
inconsistencies D-01 to D-12 from `research/s1/notes/sections.md` against the released code and the
dataset cards. The code was read and never run. Reviewer B worked on the same claims independently, and
this review did not read B's file.

## Sources and notation

- Code: `simplescaling/s1` at commit `77272c6`, in the main checkout's `research/s1/raw/code/s1/`.
  Evidence paths are relative to that directory.
- `H/` stands for `eval/lm-evaluation-harness/lm_eval/`, the harness fork that the authors modified.
- Dataset cards: `cards/s1K.md` and `cards/s1K-1.1.md` mean `research/s1/raw/datasets/s1K.md` and
  `research/s1/raw/datasets/s1K-1.1.md`.
- Notebooks: `data/filter.ipynb#c21:4` is cell 21, source line 4. `data/filter.ipynb#out15` is the saved
  output of cell 15. Cells and lines are counted from 0 and 1 in the notebook JSON.
- `main.tex:L` refers to the paper. It is cited only to show the paper's value, never as evidence.

Verdicts:

- VERIFIED: the code or a dataset card shows the claim, and nothing in them contradicts it.
- NOT VERIFIED: the code or data contradicts the claim.
- INCONCLUSIVE: the code and data cannot settle the claim. This covers every result number, because the
  run outputs live in `hf.co/datasets/simplescaling/results` (README.md:233), which is outside the inputs
  given for this review. INCONCLUSIVE never counts as a pass.

A provenance caveat applies to every count taken from notebook outputs. The saved outputs of
`data/filter.ipynb` come from an earlier version of the notebook than the source shown. `#out26` pushes
to `qfq/s1k_v1` while `#c26:1` pushes to `qfq/s1K`, and `#c27` calls `mathcot_sft` with keyword arguments
(`time_limit`, `model_type`, `rollout_path`, `step_format`) that the released `data/tokenization.py:36-37`
does not accept. The selection loop also draws from `np.random` without a seed (`#c17:12`, `#c18:3`,
`#c21:15`), so a re-run would not reproduce s1K exactly.

## Claim verdicts

| ID | verdict | evidence | note |
|---|---|---|---|
| C-01 | INCONCLUSIVE | README.md:262 | The citation lists the authors but no affiliations or equal-contribution marks. |
| C-02 | VERIFIED | cards/s1K.md:24; data/filter.ipynb#c7, #c9, #c19-21 | 1,000 examples. The notebook filters on quality (format strings), difficulty (Qwen correctness, trace length) and diversity (domain sampling). |
| C-03 | VERIFIED | H/models/vllm_causallms.py:331-384, 401-409 | Ignores the stop delimiter and appends a string N times. When the thinking cap is hit, it appends the answer delimiter. |
| C-04 | VERIFIED | train/sft.py:14; train/sft.sh:4, 22 | Base model Qwen/Qwen2.5-32B-Instruct, trained on simplescaling/s1K_tokenized. |
| C-05 | INCONCLUSIVE | eval/commands.sh:22-35 | Run configs exist. The scores are not in the repo. |
| C-06 | INCONCLUSIVE | eval/commands.sh:22, 32-35 | The no-forcing and Wait-ignore runs exist. The 50% and 57% are not in the repo. |
| C-07 | VERIFIED | README.md:35-42 | Model, data and code links are listed. |
| C-08 | INCONCLUSIVE | none | A statement about OpenAI. Code cannot speak to it. |
| C-09 | INCONCLUSIVE | none | A literature claim. |
| C-10 | VERIFIED | data/gemini.py:25-29; cards/s1K.md:60, 101-102 | The model is `gemini-2.0-flash-thinking-exp`. The trace is `parts[0]` and the answer `parts[1]`. |
| C-11 | INCONCLUSIVE | train/sft.sh:2, 9-12; train/launch.sh:6, 10; README.md:209 | 16 H100s is recommended, and launch.sh asks for 2 nodes of 8 GPUs. The only recorded run (sft.sh:2) took 5,268.8 s, about 88 min, at about 627 steps, which points to batch 8 on 8 GPUs. 26 min appears nowhere. See M-09. |
| C-12 | VERIFIED | H/models/vllm_causallms.py:262-271, 401-409, 414 | When `finish_reason == "length"` it appends the answer delimiter, then generates the answer. |
| C-13 | VERIFIED | H/models/vllm_causallms.py:273-280, 361-368 | `min_tokens=1` with stop_token_ids. Strips the stop token and appends `thinking_n_ignore_str` ("Wait" in eval/commands.sh:32-35). |
| C-14 | INCONCLUSIVE | none | The ablation selection code and results (1K-random, diverse, longest) are not in the repo. |
| C-15 | INCONCLUSIVE | README.md:42 | The full 59K set is released. No 59K training config or result is in the repo. |
| C-16 | INCONCLUSIVE | none | A result and comparison claim. |
| C-17 | INCONCLUSIVE | eval/commands.sh:25-35 | Budget-forcing sweep configs exist. The figure data does not. |
| C-18 | VERIFIED | data/collect_data.py:441-489; data/filter.ipynb#c4-c22 | Pool collection, then filtering and selection to 1,000. |
| C-19 | VERIFIED | data/filter.ipynb#out1 (59029/59029); data/collect_data.py:405-439; data/add_aime.py:27 | 59,029 featurized questions. DS_TO_SELECTION has 15 sources and add_aime.py adds the 16th, AIME. |
| C-20 | INCONCLUSIVE | data/collect_data.py:408-438 | The source comments ("Very high-quality so take all") reflect the principle. A stated design principle cannot be verified. |
| C-21 | INCONCLUSIVE | data/collect_data.py:132-144, 414 | The code keeps every aops_forum row plus a 500-question subset (`numinamath_500`), although the comment says "take 500". 30,660 cannot be checked. See M-18. |
| C-22 | NOT VERIFIED | data/add_aime.py:7-8 | The code keeps AIME rows with `year <= 2022`, so 2022 is in the pool. The paper says 1983-2021. See M-06. |
| C-23 | INCONCLUSIVE | data/collect_data.py:146-155, 410 | The seven subjects match (Math, Physics, Chemistry, Biology, Geography, Astronomy, CS), filtered to English and text-only. 4,250 cannot be checked, and the code comment says 3,922. |
| C-24 | INCONCLUSIVE | data/collect_data.py:418 | Omni-MATH test split, all rows. 4,238 cannot be checked. |
| C-25 | INCONCLUSIVE | data/collect_data.py:215-236 | The subsets also include sat_math, aqua_rat and math_agieval level 5, which are math, not only English, law and logic. 2,385 cannot be checked. See M-17. |
| C-26 | INCONCLUSIVE | data/collect_data.py:238-242, 427 | Loads simplescaling/s1-prob, and the comment says "(182)". The Stanford source and handwritten solutions cannot be checked. |
| C-27 | INCONCLUSIVE | data/collect_data.py:275-279 | Loads simplescaling/s1-teasers. The count of 23 and the "Hard" filter are not in the code. |
| C-28 | VERIFIED | data/gemini.py:17-34, 39-44, 70-86; data/filter.ipynb#out4 | One Gemini call per question gives the triplet. Gemini output exists for 58,986 of the 59,029 questions (#out4). |
| C-29 | NOT VERIFIED | data/collect_data.py:387-403, 445-459, 475, 481-488; data/add_aime.py:25-35 | 8-gram decontamination and exact dedup exist. The eval sets are wider than stated: AIMO AIME (2022-2024), GPQA Diamond, openaimath test and LiveCodeBench v4. The AIME rows are added after decontamination, so not "all samples" are checked. See M-07. |
| C-30 | VERIFIED | data/filter.ipynb#out5 (54116) | The count matches. The filter drops any row with a None feature, which is broader than API errors. See M-19. |
| C-31 | NOT VERIFIED | data/filter.ipynb#c7, #out7 (51607) | The code gives 51,607 against the paper's 51,581. The patterns are `[asy]` (kept for AIME), `![Image]`, `p{i}.` numbering, and bold numbers. See M-01. |
| C-32 | NOT VERIFIED | data/filter.ipynb#c14, #out15 (393) | The code gives 393 against the paper's 384. See M-02 and D-09. |
| C-33 | VERIFIED | data/bulk_inference.sh:13, 28; data/featurization.py:65-74, 189-194; data/grading.txt:1-18 | Qwen 7B and 32B attempts, graded by `claude-3-5-sonnet-20241022` against the reference solution. Qwen sampled at temperature 0.05 (data/bulk_inference.py:32). |
| C-34 | VERIFIED | data/featurization.py:163-184; data/filter.ipynb#c21:11 | `gemini_length` is the length of the Gemini trace under the Qwen2.5-32B-Instruct tokenizer, and selection uses it. |
| C-35 | NOT VERIFIED | data/filter.ipynb#c9:5, #out9 (24517) | The rule matches (drop a question if either model is correct). The count is 24,517 against the paper's 24,496. See M-03. |
| C-36 | INCONCLUSIVE | data/bulk_inference.sh:28; train/sft.py:14 | The premise holds: the same Qwen2.5-32B-Instruct both filters and trains. The rest is the authors' remark. |
| C-37 | VERIFIED | data/featurization.py:15-48, 142-161; data/msc.json | Claude 3.5 Sonnet classifies into MSC codes. msc.json has 61 subjects, including 92 Biology, 81 Quantum theory and 91 Game theory/economics. |
| C-38 | NOT VERIFIED | data/filter.ipynb#c17, #c21:2-7, #out19 | Domains are uniform only while fewer than 700 are selected. After that they are drawn from a GPQA+AIME domain distribution. The pool has 51 domains, not 50. See M-04 and M-05. |
| C-39 | VERIFIED | data/filter.ipynb#c9, #c21 (no Gemini-correct check in sampling); cards/s1K.md:88; data/grading.ipynb#out8 | Only the benchmark stage (#c14) requires Gemini to be correct. The card's own example attempt ends with a wrong conclusion. |
| C-40 | VERIFIED | data/grading.ipynb#out8 (Yes 536 / No 464), #out11 (Yes 630 / No 370) | 53.6% and 63.0%. |
| C-41 | INCONCLUSIVE | none | A conceptual framing. |
| C-42 | VERIFIED | H/models/vllm_causallms.py:254, 401-409 | The answer delimiter is appended at the cap. The harness always appends "\nFinal Answer:" there. It is optional only in the README example (README.md:146). See M-12. |
| C-43 | VERIFIED | H/models/vllm_causallms.py:242-245, 273-280, 361-368 | The string is optional: with `thinking_n_ignore` set and no string, nothing is appended (eval/commands.sh:38). |
| C-44 | INCONCLUSIVE | eval/generate.py:21-23; README.md:92, 159 | The repo says the exact raspberry sample came from `qfq/1k_qr_bt_dm_po_steps`, "an earlier version of s1". The caption credits s1-32B (main.tex:223). See M-22. |
| C-45 | VERIFIED | H/tasks/aime/utils.py:11-18; eval/commands.sh:43-88 | All four baselines are implemented through the PROMPTTOKEN, PROMPTSTEP, PROMPTLONG and PROMPTSHORT variables and `rejection_sample`. The "about 100 tokens per step" is not in the code. |
| C-46 | VERIFIED | H/models/vllm_causallms.py:268-269, 286-330 | Resamples until the thinking length is at or under the cap. "Oracle" is the authors' description. |
| C-47 | INCONCLUSIVE | eval/compute_sample_stats.py:63-66, 110-111 | No code computes run-level Control. The stats script counts samples over the limit within one run. |
| C-48 | INCONCLUSIVE | none | No code computes the Scaling metric. |
| C-49 | INCONCLUSIVE | none | No code computes the Performance metric. |
| C-50 | INCONCLUSIVE | none | A result. |
| C-51 | VERIFIED | eval/commands.sh:32-35 | Wait-ignore runs exist for 1, 2, 4 and 6. The 2, 4 and 6 runs are the largest. The mapping to figure points is the authors'. |
| C-52 | VERIFIED | eval/commands.sh:91; H/tasks/aime/aime24_nofigures_agg64.yaml:15, 17, 45-62; H/tasks/aime/utils.py:229, 298-300 | Qwen2.5-32B-Instruct, temperature 1, 64 repeats, maj@2 through maj@64. |
| C-53 | INCONCLUSIVE | train/sft.sh:25-26; train/fsdp_config_qwen.json:1; train/launch.sh:6, 10 | FSDP full_shard and 2x8 GPUs are verified. The H100 type is in README.md:209 only. 26 min is contradicted by the sft.sh:2 reference run. See M-09. |
| C-54 | INCONCLUSIVE | H/tasks/aime/utils.py:22-23, 263; H/tasks/aime/aime24_figures.yaml:21-22; H/api/metrics.py:23-28 | The 000-999 integer answer format appears in comments. The figures dataset scores its last 30 items as AIME24. The exam dates are not in the code. |
| C-55 | INCONCLUSIVE | README.md:228; data/filter.ipynb#c7:10-12 | The README says aime24_nofigures keeps figures only where they matter. The eval datasets are not in the inputs, so the Asymptote form cannot be confirmed. |
| C-56 | INCONCLUSIVE | H/tasks/openai_math/openai_math.yaml:4, 7; data/collect_data.py:448 | The eval uses simplescaling/openaimath test, which is also the decontamination target. The 500 count cannot be checked. |
| C-57 | INCONCLUSIVE | H/tasks/gpqa/openai/gpqa_diamond_openai.yaml:1-4; eval/commands.sh (all GPQA runs use gpqa_diamond_openai) | The Diamond subset is verified. The count of 198 and the domains cannot be checked. |
| C-58 | INCONCLUSIVE | none | A citation. |
| C-59 | VERIFIED | README.md:222; H/ (the fork itself) | Forked from lm-evaluation-harness commit 4cec66e. |
| C-60 | VERIFIED | H/tasks/aime/aime24_nofigures.yaml:14-15; H/tasks/openai_math/openai_math.yaml:11-14; H/tasks/gpqa/openai/gpqa_diamond_openai.yaml:35-36; H/tasks/aime/utils.py:292-293 | Greedy decoding, scored as exact_match on the first sample. Grading uses gpt-4o-mini, and GPQA falls back to "A", neither of which the paper discloses. See M-15. |
| C-61 | INCONCLUSIVE | eval/commands.sh:11-92 | Only Qwen, s1 and s1.1 runs are in the repo. |
| C-62 | INCONCLUSIVE | H/models/gemini.py:61-75 | The harness Gemini wrapper retries on `FinishReason.RECITATION`, which fits the claimed API problem. The web-interface scoring cannot be checked. |
| C-63 | INCONCLUSIVE | none | Score provenance. |
| C-64 | INCONCLUSIVE | none | A result. See D-05. |
| C-65 | INCONCLUSIVE | eval/commands.sh:22 | The config exists. The scores do not. |
| C-66 | INCONCLUSIVE | eval/commands.sh:11 | The config exists. The scores do not. |
| C-67 | INCONCLUSIVE | none | External model scores. |
| C-68 | INCONCLUSIVE | none | External model score. |
| C-69 | INCONCLUSIVE | none | External model scores. See D-04. |
| C-70 | INCONCLUSIVE | none | External model scores. See D-03 and D-04. |
| C-71 | INCONCLUSIVE | none | External model scores. |
| C-72 | INCONCLUSIVE | eval/commands.sh:35 | The 6-ignore config exists. The plateau is a result. |
| C-73 | INCONCLUSIVE | none | A behavioral observation. |
| C-74 | INCONCLUSIVE | eval/commands.sh:91 | The majority-voting config exists. The comparison is a result. |
| C-75 | INCONCLUSIVE | none | A comparative claim. |
| C-76 | INCONCLUSIVE | none | External model facts. |
| C-77 | INCONCLUSIVE | none | A result. |
| C-78 | INCONCLUSIVE | none | Figure content. |
| C-79 | INCONCLUSIVE | H/models/vllm_causallms.py:261-265; eval/commands.sh:31 | The Table 2 ablation runs are not in commands.sh. The `auto` cap is 32,768 minus the prompt minus about 110 tokens, which comes to about 32.5K, not 30K. See M-11. |
| C-80 | INCONCLUSIVE | none | No bootstrap code is in the repo outside unrelated REBASE files. |
| C-81 | INCONCLUSIVE | none | A result. |
| C-82 | INCONCLUSIVE | none | A result. |
| C-83 | INCONCLUSIVE | none | A result. |
| C-84 | INCONCLUSIVE | none | A result. |
| C-85 | INCONCLUSIVE | none | A result. |
| C-86 | INCONCLUSIVE | none | No 59K training log is in the repo. |
| C-87 | INCONCLUSIVE | none | The authors' conclusion. |
| C-88 | INCONCLUSIVE | eval/commands.sh:25-31 | Seven budget-forcing caps exist (500 to 16,000 and auto). Which 5 runs Table 3 used is unknown. |
| C-89 | INCONCLUSIVE | eval/commands.sh:51-60 | Only 4 token-conditional runs are listed per mode. See M-14. |
| C-90 | INCONCLUSIVE | eval/commands.sh:63-74 | 5 step-conditional runs per mode, which matches the run count. The scores are not in the repo. |
| C-91 | INCONCLUSIVE | eval/commands.sh:87-88 | Exactly 2 class-conditional runs exist, which matches "2 runs". The scores are not in the repo. |
| C-92 | INCONCLUSIVE | eval/commands.sh:43-48 | 6 rejection-sampling runs. The scores are not in the repo. |
| C-93 | INCONCLUSIVE | none | The authors' rationale. |
| C-94 | INCONCLUSIVE | eval/commands.sh:33 | The config exists. The scores do not. |
| C-95 | INCONCLUSIVE | eval/commands.sh:31, 38-40 | Configs exist for no-extrapolation (auto), 2 ignores with no string, Hmm and Alternatively. The scores do not. |
| C-96 | INCONCLUSIVE | none | A result and interpretation. |
| C-97 | INCONCLUSIVE | none | A result. |
| C-98 | INCONCLUSIVE | none | A result. |
| C-99 | INCONCLUSIVE | eval/commands.sh:43-48 | Temperature 1 is verified. Inverse scaling is a result. |
| C-100 | NOT VERIFIED | eval/commands.sh:43-48 | The code has six caps: 3,500, 4,000, 5,000, 6,000, 8,000 and 16,000. The caption lists five and omits 6,000. See M-13 and D-02. |
| C-101 | INCONCLUSIVE | none | A hypothesis. |
| C-102 | INCONCLUSIVE | none | A literature claim. |
| C-103 | INCONCLUSIVE | none | A priority claim. |
| C-104 | INCONCLUSIVE | none | A hypothesis. |
| C-105 | INCONCLUSIVE | none | A literature claim. |
| C-106 | INCONCLUSIVE | none | A literature claim. |
| C-107 | INCONCLUSIVE | none | A literature claim. |
| C-108 | INCONCLUSIVE | none | A literature claim. |
| C-109 | INCONCLUSIVE | H/models/vllm_causallms.py:264, 381-384 | Budget forcing is capped at max_tokens (32,768), which supports the context limit. The flattening is a result. |
| C-110 | INCONCLUSIVE | none | Future work. |
| C-111 | INCONCLUSIVE | eval/rebase/inference_scaling/finetune/gpt-accelera/scripts_finetune/prepare_llemma_34b.sh:5; .../scripts_finetune/finetune_rm.sh:5; eval/rebase/inference_scaling/scripts/run_reward.sh:6; eval/rebase/inference_scaling/exp_results/rebase_16/results.txt | The PRM is Llemma, derived from Code Llama. The fine-tuning script uses llemma_7b, while the 34B appears only in a prepare script. Aggregation is weighted majority vote. See M-20. |
| C-112 | INCONCLUSIVE | none | A result. |
| C-113 | INCONCLUSIVE | eval/rebase/run.sh:1; eval/rebase/inference_scaling/hype-parameters/rebase16.yaml:10; H/tasks/aime/aime_2024_rebase.yaml:4 | 16 parallel trajectories are verified. Only PROMPTSTEP=64 is in run.sh, and the 32, 256 and 512 step runs are absent. |
| C-114 | INCONCLUSIVE | none | A result. |
| C-115 | INCONCLUSIVE | none | A motivation. |
| C-116 | VERIFIED | cards/s1K-1.1.md:44 (tag curator), :122 (Ryan Marten); data/bulk_inference.sh:6, 21 (account marlowe-m000027) | |
| C-117 | NOT VERIFIED | cards/s1K-1.1.md:74, 117; README.md:15, 209; train/sft.sh:17 | The same 1,000 questions with r1 traces is verified. The training procedure changed: block_size is 20,000 for s1.1 against 32,768 for s1. "Seven days" cannot be checked (README.md:15 gives only 2025-02). See M-10. |
| C-118 | INCONCLUSIVE | README.md:15; cards/s1K-1.1.md:74 | The authors assert it in the repo too. No numbers are in the repo. |
| C-119 | INCONCLUSIVE | none | |
| C-120 | INCONCLUSIVE | H/tasks/aime/aime25_nofigures.yaml:4 | s1's own AIME 2025 eval uses TIGER-Lab/AIME25. Other models' sources cannot be checked. |
| C-121 | INCONCLUSIVE | eval/commands.sh:17 | The config exists. The scores do not. |
| C-122 | INCONCLUSIVE | eval/commands.sh:15, 19 | The 1x Wait command for s1.1 runs only aime25_nofigures, yet Table 5 reports 1x on all four benchmarks. See M-21. |
| C-123 | INCONCLUSIVE | eval/commands.sh:22 | The s1 no-forcing command has no aime25_nofigures. See M-21. |
| C-124 | INCONCLUSIVE | eval/commands.sh:32-34 | The s1 1x, 2x and 4x Wait commands have no AIME 2025. See M-21. |
| C-125 | INCONCLUSIVE | none | External model. |
| C-126 | INCONCLUSIVE | none | External model. |
| C-127 | INCONCLUSIVE | none | External models. See D-04. |
| C-128 | VERIFIED | eval/commands.sh:11-92 (`--model vllm`); H/models/vllm_causallms.py | vLLM is used. "Fastest" is the authors' judgment. |
| C-129 | INCONCLUSIVE | H/models/vllm_causallms.py:58, 94 | The seed is fixed at 1234. Run-to-run variance is not shown. The gpt-4o-mini grader runs at temperature 0.5 (H/tasks/aime/utils.py:146), another source of variance. |
| C-130 | INCONCLUSIVE | none | An observation. |
| C-131 | VERIFIED | eval/commands.sh:11, 15-92 (`dtype=float32`) | |
| C-132 | INCONCLUSIVE | data/featurization.py:165 | The Qwen2.5 tokenizer is verified. No code for Claude-written keywords is in the repo. |
| C-133 | INCONCLUSIVE | cards/s1K.md:4-20 | The card has no domain field. |
| C-134 | INCONCLUSIVE | cards/s1K.md:4-20 | The card has no domain field. See D-01. |
| C-135 | INCONCLUSIVE | cards/s1K.md:24; data/filter.ipynb#out19 | 1,000 is verified. The pool has 51 domains (#out19), which fits "(51)". 4.7M tokens cannot be checked. |
| C-136 | VERIFIED | data/featurization.py:163-170 | Qwen/Qwen2.5-32B-Instruct tokenizer on the Gemini trace. |
| C-137 | NOT VERIFIED | data/add_aime.py:8; data/collect_data.py:446 | 2022 stays in the pool (`year <= 2022`). Only 2023 is excluded. AIMO-AIME (2022-2024) is used as a decontamination set for the other sources, but the AIME rows are added after that step. See M-06. |
| C-138 | INCONCLUSIVE | data/collect_data.py:405-438 | All nine sources are present. The counts cannot be checked, and several code comments and caps differ. See M-18. GPQA is extended minus Diamond (collect_data.py:244-253). |
| C-139 | NOT VERIFIED | data/add_aime.py:8 | The range 1983-2021 is contradicted, because 2022 is included. 890 and 4.7K cannot be checked. |
| C-140 | INCONCLUSIVE | data/filter.ipynb#out1 | 59,029 is verified. The 3.6K average cannot be checked. |
| C-141 | VERIFIED | data/featurization.py:69; data/grading.ipynb#c3:4, #c6:44, #c9:6 | Claude 3.5 Sonnet (20241022) grades for selection, and Claude 3.7 Sonnet (20250219) for the final 1,000. |
| C-142 | VERIFIED | data/grading.txt:1-18; data/grading.ipynb#c5 | |
| C-143 | VERIFIED | data/filter.ipynb#c14:4-9 | The logic and the 5,600 threshold match. It selects MATH (train split), not MATH500, and the source match string `qfq/openaimath` does not match the `simplescaling/openaimath/` string that collect_data.py:120 emits as released. See M-16 and D-08. |
| C-144 | NOT VERIFIED | data/filter.ipynb#c21:2-24, #c17 | The 2^-rank weights (longest gets rank 0) and dropping empty domains match. The domain choice is uniform only below 700 selected, then weighted toward the benchmark domains. See M-04. |
| C-145 | INCONCLUSIVE | data/collect_data.py:244-249, 445-459 | GPQA extended is filtered against Diamond, and other sources are 8-gram decontaminated. Overlap cannot be checked without the data. The AIME rows skip decontamination (data/add_aime.py). |
| C-146 | VERIFIED | data/collect_data.py:387-397, 459; data/decontaminate_util.py:6-17, 41-57 | Word-level 8-grams on lowercased, whitespace-normalized text. One shared 8-gram is enough to drop a question. See D-10 and M-08. |
| C-147 | INCONCLUSIVE | none | A claim about Qwen benchmarks. |
| C-148 | VERIFIED | data/tokenization.py:27-33; H/models/vllm_causallms.py:239-240 | The trace is wrapped as think-delimiter + newline + trace + newline + answer-delimiter + newline. The chat template supplies the newline before the think delimiter. Undisclosed detail: "Answer: " is prepended to the attempt if missing (tokenization.py:26). |
| C-149 | VERIFIED | train/sft.sh:7, 9; train/sft_slurm.sh:5-6, 35; train/launch.sh:6, 10 | 5 epochs. Batch 16 = 1 per device x 16 GPUs. 315 = ceil(1000/16) x 5 = 63 x 5. The sft.sh:2 reference run implies batch 8. See M-09. |
| C-150 | VERIFIED | train/sft.sh:5, 24, 27, 31-32 | bf16, lr 1e-5, warmup_ratio 0.05 (ceil(0.05 x 315) = 16 steps in HF), cosine to 0. `min_lr=0` (sft.sh:6) is unused. |
| C-151 | VERIFIED | train/sft.sh:8, 33-35; requirements.txt:5 | Betas 0.9 and 0.95, wd 1e-4. The optimizer is the HF Trainer default (adamw_torch in transformers 4.46.1), never set explicitly. |
| C-152 | VERIFIED | train/sft.py:52-66 | DataCollatorForCompletionOnlyLM masks everything before the assistant response template, including the system prompt and the question. |
| C-153 | INCONCLUSIVE | train/sft.sh:17; train/sft.py:15, 68 | block_size is 32,768. Whether any s1K sample is longer cannot be checked. s1.1 used 20,000 (README.md:209). |
| C-154 | INCONCLUSIVE | none | Figure content. |
| C-155 | INCONCLUSIVE | none | No 4,096-length config or length statistics are in the repo. |
| C-156 | INCONCLUSIVE | none | A result. |
| C-157 | INCONCLUSIVE | none | A result. |
| C-158 | INCONCLUSIVE | none | A hypothesis. |
| C-159 | VERIFIED | train/sft.sh:17; train/sft_multinode.sh:25; train/sft_slurm.sh:49 | Every script uses 32,768. The reason given is the authors'. |
| C-160 | VERIFIED | data/gemini.py:24-27, 39 | Gemini receives only the question text as the prompt. That the samples come from those three sources cannot be checked. |
| C-161 | VERIFIED | H/tasks/aime/utils.py:11-14; H/tasks/gpqa/openai/utils.py:19-22; eval/compute_sample_stats.py:64; train/sft.py:58-66 | "Think for up to N tokens/steps." is appended to the question, and the step format uses " steps left" lines. The conditional-model training data is not in the repo. |
| C-162 | INCONCLUSIVE | eval/commands.sh:51-60 | The eval caps are powers of two. The training-data construction is not in the repo. |
| C-163 | INCONCLUSIVE | eval/commands.sh:51-54 | No 1,024 run is listed. See M-14. |
| C-164 | INCONCLUSIVE | eval/commands.sh:57-60 | No 1,024 forcing run is listed. See M-14. |
| C-165 | INCONCLUSIVE | eval/commands.sh:51-60 | 4 runs per mode, not 5. See M-14. |
| C-166 | INCONCLUSIVE | none | A citation. |
| C-167 | INCONCLUSIVE | eval/commands.sh:63-67 | The eval step caps are powers of two. The training split rule is not in the repo. |
| C-168 | VERIFIED | eval/commands.sh:70-74; H/models/vllm_causallms.py:246, 281-282, 410-412 | Generation stops on the "0 steps left" delimiter and the answer delimiter is appended. Counting into negative steps cannot be checked. |
| C-169 | INCONCLUSIVE | none | A result. |
| C-170 | INCONCLUSIVE | none | A result. |
| C-171 | INCONCLUSIVE | none | Not computed. Running the tokenizer was out of scope. |
| C-172 | INCONCLUSIVE | eval/compute_sample_stats.py:63-66 | The stats script counts steps against the instructed steps, not a 100-tokens-per-step proxy. |
| C-173 | VERIFIED | README.md:236; eval/rebase/inference_scaling/scripts/run_policy_our.sh:7; H/tasks/aime/aime_2024_rebase.yaml:4 | step-conditional-control-old on an older dataset, evaluated with the older Maxwell-Jia/AIME_2024 setup. |
| C-174 | INCONCLUSIVE | none | A claim about the OpenAI API. |
| C-175 | INCONCLUSIVE | H/tasks/aime/utils.py:17-18; eval/commands.sh:88 | The prompt text is verified. The scores are not in the repo. |
| C-176 | INCONCLUSIVE | H/tasks/aime/utils.py:15-16; eval/commands.sh:87 | The prompt text is verified. The scores are not in the repo. |
| C-177 | INCONCLUSIVE | eval/commands.sh:31 | A result. |
| C-178 | INCONCLUSIVE | none | A result. |
| C-179 | INCONCLUSIVE | none | A result. |
| C-180 | INCONCLUSIVE | H/models/vllm_causallms.py:289-330 | The code logs batch iterations, and finished slots are refilled with copies of pending requests (322-327), so per-question tries are not logged directly. See D-12. |
| C-181 | INCONCLUSIVE | none | A result. |
| C-182 | INCONCLUSIVE | README.md:12-16 | The README dates (s1.1 in 2025-02) fit the claim but do not prove it. |

Verdict counts: 42 VERIFIED, 11 NOT VERIFIED, 129 INCONCLUSIVE (182 claims).

## Mismatches between the paper and the code

Each entry gives the paper's value, then the code's value.

| # | Claims | Paper | Code |
|---|---|---|---|
| M-01 | C-31 | 51,581 after the format filter | 51,607 (data/filter.ipynb#out7) |
| M-02 | C-32, D-09 | 384 benchmark-selected samples | 393 (data/filter.ipynb#out15) |
| M-03 | C-35, Alg. 1 input | 24,496 after the Qwen filter | 24,517 (data/filter.ipynb#out9, #out10) |
| M-04 | C-38, C-144 | The domain is chosen uniformly at random every iteration | Uniform only while fewer than 700 are selected. After that, domains are drawn from the GPQA+AIME domain distribution, with GPQA rescaled to half the size of AIME (data/filter.ipynb#c17:1-12, #c21:4-7). The code comment says "first sample 300 uniformly" (#c21:3), which contradicts its own `< 700` condition. |
| M-05 | C-38, D-01 | s1K spans 50 domains | The selection pool has 51 domains (data/filter.ipynb#out19, "51/51") |
| M-06 | C-22, C-137, C-139 | Historical AIME 1983-2021, with 2022-2023 held out | `year <= 2022` keeps 2022 (data/add_aime.py:8) |
| M-07 | C-29, C-145 | All samples decontaminated against MATH500, GPQA Diamond and AIME24 | Test sets are AI-MO/aimo-validation-aime (AIME 2022-2024), GPQA Diamond, openaimath test and LiveCodeBench release_v4 (data/collect_data.py:445-450). Each source is also checked against earlier sources (:475). AIME rows are appended afterwards by data/add_aime.py and never decontaminated. |
| M-08 | C-146, D-10 | "More than an 8-gram overlap" | Any single shared word 8-gram, after lowercasing and whitespace normalization (data/decontaminate_util.py:6-17, 46-48). The helper's default is 13-grams (:27), and collect_data.py:459 overrides it to 8. |
| M-09 | C-11, C-53, C-149 | 26 min on 16 H100s, batch 16, 315 steps | The only recorded run (train/sft.sh:2) has train_runtime 5,268.8 s (about 88 min), 0.119 steps/s (about 627 steps) and 0.949 samples/s (5,000 samples), so the batch was 8. sft.sh sets batch = GPUs on one node (:9, :12). |
| M-10 | C-117 | s1.1 training procedure unchanged | s1.1 used block_size 20,000 (README.md:209). s1 used 32,768 (train/sft.sh:17). |
| M-11 | C-79 | Table 2 forces a cap of about 30,000 thinking tokens | `max_tokens_thinking=auto` is 32,768 minus the longest prompt minus the delimiter tokens minus 100 (H/models/vllm_causallms.py:262-265), about 32.5K for short prompts. No Table 2 command is in eval/commands.sh. |
| M-12 | C-42 | "Final Answer:" is optional at the cap | The harness always appends "\nFinal Answer:" when the cap is hit (H/models/vllm_causallms.py:254, 404-409). It is optional only in the README snippet (README.md:146). |
| M-13 | C-100, D-02 | Five caps: 3,500, 4,000, 5,000, 8,000, 16,000 | Six caps: 3,500, 4,000, 5,000, 6,000, 8,000, 16,000 (eval/commands.sh:43-48) |
| M-14 | C-163, C-164, C-165, C-89 | Five token caps including 1,024, so Control is out of 5 | Four caps, 2,048 to 16,384, with and without forcing (eval/commands.sh:51-60) |
| M-15 | C-60 | Accuracy (pass@1) with greedy decoding. No grader model is mentioned (main.tex:269, :729-736). | Answers that are not plain integers go to gpt-4o-mini at temperature 0.5 to match against options (H/tasks/aime/utils.py:142-147, 237-238, 266-284; H/tasks/openai_math/utils.py:141-143, 255-256; H/tasks/gpqa/openai/utils.py:170-173, 196-197). GPQA answers that cannot be parsed default to "A" (H/tasks/gpqa/openai/utils.py:201-203). Every command sets `PROCESSOR=gpt-4o-mini` (eval/commands.sh). |
| M-16 | C-143, D-08 | "Select correct MATH500 solutions with long chains" | Matches `'qfq/openaimath' in source_type` (data/filter.ipynb#c14:7), which is the MATH training pool (data/collect_data.py:118-120, split "train"), not MATH500. As released, collect_data.py emits `simplescaling/openaimath/<subject>`, which the `qfq/` substring never matches. README.md:240 explains the org rename. |
| M-17 | C-25 | AGIEval covers English, law and logic | Also sat_math, aqua_rat and math_agieval level 5, all math (data/collect_data.py:216-231) |
| M-18 | C-21, C-23, C-138 | NuminaMath 30,660; OlympicArena 4,250; MATH 11,999; TheoremQA 747; OlympiadBench 896; JEEBench 515; USACO 519; SciEval 227; xword 999 | Code comments and caps: NuminaMath "take 500" (:414), but the code keeps all aops_forum plus a 500-question subset (:132-144); OlympicArena "(3922)" (:410); MATH "(12K)" (:408); TheoremQA "(720)" (:412); OlympiadBench "(626)" (:421); JEEBench "(483)" (:423); USACO "(520)" (:433); SciEval selection n=250 (:420); XWord n=1000 (:432). Low confidence: the comments may predate decontamination and dedup. |
| M-19 | C-30 | Only API-error questions are removed (59,029 to 54,116) | The step drops every question with any None feature (data/filter.ipynb#c4:6-8). That includes questions without a reference solution, whose grades are set to None (data/featurization.py:56-63), such as USACO and LiveCodeBench (data/collect_data.py:270, 288). The count still matches. |
| M-20 | C-111 | REBASE PRM from LLaMA-34B; outputs combined by majority vote | Llemma (EleutherAI/llemma_34b in prepare_llemma_34b.sh:5, but the RM fine-tune script uses llemma_7b, finetune_rm.sh:5; served PRM tkitsers/Llemma-reward-model, run_reward.sh:6). Aggregation is `majority_vote weighted: True` (exp_results/rebase_16/results.txt). |
| M-21 | C-122, C-123, C-124 | Table 5 gives s1 AIME 2025 scores and s1.1 1x-Wait scores on all four benchmarks | No s1 command includes aime25_nofigures (eval/commands.sh:22-35). The s1.1 1x-Wait command runs only aime25_nofigures (:15). |
| M-22 | C-44 | Figure 3 shows budget forcing "with s1-32B" (main.tex:223) | The exact raspberry sample came from `qfq/1k_qr_bt_dm_po_steps`, "an earlier version of s1", with the prompt "How many r in raspberry?" (eval/generate.py:21-23) |

22 mismatches.

Other problems in the code that the paper does not mention:

- With `thinking_n_ignore`, the per-round thinking budget does not shrink between rounds
  (H/models/vllm_causallms.py:338-343 reuse the same `sampling_params`). The total is cut afterwards, but
  only `token_ids` is truncated, not `text` (:381-384). The logged and graded output text can therefore
  hold more thinking than the model was conditioned on. A truncated sample also keeps
  `finish_reason="stop"`, so it gets the plain answer delimiter without "Final Answer:" (:401-412). The
  README snippet does shrink the budget (README.md:131). The two implementations differ.
- The rejection-sampling loop refills finished slots with copies of pending requests (:320-327), so a
  hard question gets several draws per iteration. "Average tries per sample" is not what the code logs.
  It logs batch iterations (:330).

## D-items

| D | Resolution | Evidence |
|---|---|---|
| D-01 | Resolved in part. The selection pool has 51 domains, so Table 6's "(51)" matches the code and §2.2's "50" does not. Table 6's 23 named plus 27 remaining rows sum to 50, so one row label (probably "remaining 27") is off by one. The s1K card has no domain field, so the final set's domain count cannot be checked directly. | data/filter.ipynb#out19; cards/s1K.md:4-20 |
| D-02 | Resolved. The code runs six caps: 3,500, 4,000, 5,000, 6,000, 8,000 and 16,000. The caption drops 6,000. Matched one to one, the tries are 655 at 3,500, 97 at 4,000, 8 at 5,000, 3 at 6,000, 2 at 8,000 and 1 at 16,000. | eval/commands.sh:43-48 |
| D-03 | Not resolvable from the code. Results are not in the repo. The arithmetic and context support a typo. | none |
| D-04 | Not resolvable from the code. Both are external model numbers. | none |
| D-05 | Not resolvable. Runs exist for 1x, 2x, 4x and 6x "Wait" (eval/commands.sh:32-35), but the repo does not say which run fills Table 1's s1-32B row. | eval/commands.sh:32-35 |
| D-06 | The arithmetic holds: 56.7 / 44.6 = 1.271 relative, 12.1 points absolute. The code cannot settle which the abstract means. | none |
| D-07 | The arithmetic holds: (13.3 + 23.3 + 16.7) / 3 = 17.8 points, 35.5% relative to 50.0. The code has no ablation results. | none |
| D-08 | Resolved. The code tests MATH (the openaimath training pool), not MATH500, so the comment is wrong. The released match string `qfq/openaimath` would also never fire against the `simplescaling/` source_type. See M-16. | data/filter.ipynb#c14:7-9; data/collect_data.py:118-120 |
| D-09 | Resolved as a mismatch. The saved notebook run selects 393 samples in this stage, not 384. | data/filter.ipynb#out15 |
| D-10 | Resolved. One shared word 8-gram drops a question. "GPTQA" is a typo, and the code uses Idavidrein/gpqa gpqa_diamond. The eval sets are also wider than the three named (M-07). | data/decontaminate_util.py:46-48; data/collect_data.py:111, 445-450 |
| D-11 | Not a code question. It is a writing issue only. | none |
| D-12 | Not fully resolvable. Under D-02's mapping, Figure 6 needs 97 tries at 4,000 against Table 15's 199 for one question on an earlier model. The code logs batch iterations with slot refilling, not per-question tries, so the two numbers measure different things. | H/models/vllm_causallms.py:289-330; eval/commands.sh:44 |
