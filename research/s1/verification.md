# s1 claim verification: merged verdict

Issue #9 (spec #1). This file merges two independent reviews of every claim in
`research/s1/notes/claims.md` (C-01 to C-182) and the inconsistencies in `research/s1/notes/sections.md`
(D-01 to D-12, plus D-13 and D-14 from Reviewer B). The source reviews are
`research/s1/verification/review-a.md` and `research/s1/verification/review-b.md`. The lead reviewer
reopened the cited code for every disagreement and for each finding only one reviewer raised.

## Intent

> Check each claim the s1 paper makes against the released `simplescaling/s1` code (commit `77272c6`) and
> the s1K and s1K-1.1 dataset cards. The goal is to know which paper numbers and settings to trust before
> replicating s1 at small scale. Each claim gets VERIFIED, NOT VERIFIED or INCONCLUSIVE, with evidence in
> code lines or dataset fields. INCONCLUSIVE never counts as a pass.

## Reviewers

- Reviewer A: parent model (Opus 5.5), claims in ID order. 42 VERIFIED, 11 NOT VERIFIED, 129 INCONCLUSIVE.
  22 paper-vs-code mismatches and 2 code problems.
- Reviewer B: parent model (Opus 5.5), claims in reverse order. 37 VERIFIED, 10 NOT VERIFIED, 135
  INCONCLUSIVE. 21 mismatches, 8 code problems (R-1 to R-8) and 2 new D-items (D-13, D-14).
- Both reviewer runs are in the event stream: `artifact` events for `review-a.md` (agent
  `aa77b1f85ed1233ca`) and `review-b.md` (agent `aef9eae54254671a5`) in run
  `14c93a90-c178-4f4b-b20f-235aebe7f882`, each followed by `agent.stop` with status ISSUES.

## Notation and verdict rule

- Code paths are relative to `research/s1/raw/code/s1/` in the main checkout, read only. `H/` is
  `eval/lm-evaluation-harness/lm_eval/`. `cards/s1K.md` and `cards/s1K-1.1.md` are in
  `research/s1/raw/datasets/`.
- Notebook references come in two forms. Reviewer A writes `data/filter.ipynb#c21:4` (cell 21, source line
  4, cells counted from 0) and `#out15` (saved output of cell 15). Reviewer B writes `filter.ipynb:435`, a
  line in the raw notebook JSON under `data/`.
- `main.tex:L` is the paper. It shows the paper's value and is never evidence.
- A claim is VERIFIED when the code or a card shows every factual element and nothing contradicts any of
  them. It is NOT VERIFIED when the code or data contradicts at least one element. It is INCONCLUSIVE when an
  element (a result number, an external fact, an empirical reason) is beyond what the code and cards show.
  Both reviewers stated this rule. A stated motive or hedge ("to reduce variance", "may suit") is not a
  factual element. A stated reason that is itself an empirical claim ("the fastest option they tried",
  "scores better") is.
- Every count read from a notebook output carries a caveat. The saved outputs of `data/filter.ipynb` come
  from an earlier version of the notebook than the released source (R-01).

## Final verdict counts

**37 VERIFIED, 12 NOT VERIFIED, 133 INCONCLUSIVE** (182 claims). The reviewers agreed on 173 claims and
disagreed on 9. The lead sided with A on 3 (C-19, C-28, C-29) and with B on 6 (C-36, C-45, C-128, C-159,
C-160, C-168). The lead also overrode one agreed verdict: C-30 moves from VERIFIED to NOT VERIFIED.

## Disagreements and how they were settled

| ID | A | B | Final | Why |
|---|---|---|---|---|
| C-19 | VERIFIED | INCONCLUSIVE | VERIFIED | The saved output of `data/filter.ipynb` cell 1 iterates `59029/59029` over the featurized pool. `data/collect_data.py:405-438` lists 15 sources, and the pool carries `qq8933/AIME_1983_2024` rows from `data/add_aime.py:12` (cell 17 filters on that source), which makes 16. B's "no code computes 59,029" misses the saved output. |
| C-28 | VERIFIED | INCONCLUSIVE | VERIFIED | `data/gemini.py:24-29` takes the trace from part 0 and the answer from part 1 of one call per question. Cell 4's output iterates 58,986 Gemini rows, which is 59K rounded. 43 questions have no Gemini row, and the next filter removes them. |
| C-29 | NOT VERIFIED | VERIFIED | NOT VERIFIED | `data/add_aime.py:25-35` appends the AIME rows outside the decontamination loop in `data/collect_data.py:456-459`, and those rows reach the selection pool. "Decontaminated all samples" is therefore false. B's own R-4 records the same fact. The wider list of test sets alone would not have failed the claim. |
| C-36 | INCONCLUSIVE | VERIFIED | VERIFIED | `data/bulk_inference.sh:28` and `train/sft.py:14` both name `Qwen/Qwen2.5-32B-Instruct`. "May suit their setup" is a hedge with nothing to check, so the claim's one fact holds. |
| C-45 | VERIFIED | INCONCLUSIVE | INCONCLUSIVE | `H/tasks/aime/utils.py:11-18` has all four baselines. Nothing in the repo sets or measures "about 100 tokens per step", and A's own note says so. |
| C-128 | VERIFIED | INCONCLUSIVE | INCONCLUSIVE | vLLM use is verified (`--model vllm` on every line of `eval/commands.sh`). "The fastest option they tried" is an empirical claim about other engines, and the repo cannot show it. |
| C-159 | VERIFIED | INCONCLUSIVE | INCONCLUSIVE | `train/sft.sh:17` sets `block_size=32768`. The stated reason, better scores and shorter traces, is a result (C-156, C-157) with no data in the repo. |
| C-160 | VERIFIED | INCONCLUSIVE | INCONCLUSIVE | `data/gemini.py:24-27, 39` sends Gemini only the question. Whether the Table 9 to 11 samples are in s1K and come from s1-prob, s1-teasers and OlympicArena astronomy needs the dataset rows, which are not in the inputs. A's own note says this part cannot be checked. |
| C-168 | VERIFIED | INCONCLUSIVE | INCONCLUSIVE | The stop at "0 steps left" and the appended answer delimiter are verified (`eval/commands.sh:70`; `H/models/vllm_causallms.py:246, 280-282, 410-412`). No released output shows the model counting into negative steps. |
| C-30 | VERIFIED | VERIFIED | NOT VERIFIED | Lead override. The count 54,116 matches (cell 5 output). The stated cause does not. Cell 4 drops every question with any None feature, and `data/featurization.py:56-63` sets the grade to None for every question without a reference solution. That covers all USACO and LiveCodeBench rows (`data/collect_data.py:270, 288` set `solution: None`). Both reviewers logged this as a mismatch (A M-19, B M-06) but kept VERIFIED, which their own rule does not allow. The number is trustworthy. The description is not. |

## Claim verdicts

Evidence is Reviewer A's citation, or B's where A cited none or B's verdict won. The note is the lead's
ruling on a disagreement, otherwise A's note (B's where A left none). "See M-nn" points to the mismatch table
below, which keeps A's numbering.

| ID | final | A | B | evidence | note |
|---|---|---|---|---|---|
| C-01 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | README.md:262 | The citation lists the authors but no affiliations or equal-contribution marks. |
| C-02 | VERIFIED | VERIFIED | VERIFIED | cards/s1K.md:24; data/filter.ipynb#c7, #c9, #c19-21 | 1,000 examples. The notebook filters on quality (format strings), difficulty (Qwen correctness, trace length) and diversity (domain sampling). |
| C-03 | VERIFIED | VERIFIED | VERIFIED | H/models/vllm_causallms.py:331-384, 401-409 | Ignores the stop delimiter and appends a string N times. When the thinking cap is hit, it appends the answer delimiter. |
| C-04 | VERIFIED | VERIFIED | VERIFIED | train/sft.py:14; train/sft.sh:4, 22 | Base model Qwen/Qwen2.5-32B-Instruct, trained on simplescaling/s1K_tokenized. |
| C-05 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:22-35 | Run configs exist. The scores are not in the repo. |
| C-06 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:22, 32-35 | The no-forcing and Wait-ignore runs exist. The 50% and 57% are not in the repo. |
| C-07 | VERIFIED | VERIFIED | VERIFIED | README.md:35-42 | Model, data and code links are listed. |
| C-08 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A statement about OpenAI. Code cannot speak to it. |
| C-09 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A literature claim. |
| C-10 | VERIFIED | VERIFIED | VERIFIED | data/gemini.py:25-29; cards/s1K.md:60, 101-102 | The model is `gemini-2.0-flash-thinking-exp`. The trace is `parts[0]` and the answer `parts[1]`. |
| C-11 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | train/sft.sh:2, 9-12; train/launch.sh:6, 10; README.md:209 | 16 H100s is recommended, and launch.sh asks for 2 nodes of 8 GPUs. The only recorded run (sft.sh:2) took 5,268.8 s, about 88 min, at about 627 steps, which points to batch 8 on 8 GPUs. 26 min appears nowhere. See M-09. |
| C-12 | VERIFIED | VERIFIED | VERIFIED | H/models/vllm_causallms.py:262-271, 401-409, 414 | When `finish_reason == "length"` it appends the answer delimiter, then generates the answer. |
| C-13 | VERIFIED | VERIFIED | VERIFIED | H/models/vllm_causallms.py:273-280, 361-368 | `min_tokens=1` with stop_token_ids. Strips the stop token and appends `thinking_n_ignore_str` ("Wait" in eval/commands.sh:32-35). |
| C-14 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | The ablation selection code and results (1K-random, diverse, longest) are not in the repo. |
| C-15 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | README.md:42 | The full 59K set is released. No 59K training config or result is in the repo. |
| C-16 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result and comparison claim. |
| C-17 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:25-35 | Budget-forcing sweep configs exist. The figure data does not. |
| C-18 | VERIFIED | VERIFIED | VERIFIED | data/collect_data.py:441-489; data/filter.ipynb#c4-c22 | Pool collection, then filtering and selection to 1,000. |
| C-19 | VERIFIED | VERIFIED | INCONCLUSIVE | data/filter.ipynb#out1 (59029/59029); data/collect_data.py:405-439; data/add_aime.py:27 | Lead, siding with A: cell 1's saved output iterates 59029/59029; 15 sources in `data/collect_data.py:405-438` plus AIME from `data/add_aime.py`. See Disagreements. |
| C-20 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/collect_data.py:408-438 | The source comments ("Very high-quality so take all") reflect the principle. A stated design principle cannot be verified. |
| C-21 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/collect_data.py:132-144, 414 | The code keeps every aops_forum row plus a 500-question subset (`numinamath_500`), although the comment says "take 500". 30,660 cannot be checked. See M-18. |
| C-22 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | data/add_aime.py:7-8 | The code keeps AIME rows with `year <= 2022`, so 2022 is in the pool. The paper says 1983-2021. See M-06. |
| C-23 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/collect_data.py:146-155, 410 | The seven subjects match (Math, Physics, Chemistry, Biology, Geography, Astronomy, CS), filtered to English and text-only. 4,250 cannot be checked, and the code comment says 3,922. |
| C-24 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/collect_data.py:418 | Omni-MATH test split, all rows. 4,238 cannot be checked. |
| C-25 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/collect_data.py:215-236 | The subsets also include sat_math, aqua_rat and math_agieval level 5, which are math, not only English, law and logic. 2,385 cannot be checked. See M-17. |
| C-26 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/collect_data.py:238-242, 427 | Loads simplescaling/s1-prob, and the comment says "(182)". The Stanford source and handwritten solutions cannot be checked. |
| C-27 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/collect_data.py:275-279 | Loads simplescaling/s1-teasers. The count of 23 and the "Hard" filter are not in the code. |
| C-28 | VERIFIED | VERIFIED | INCONCLUSIVE | data/gemini.py:17-34, 39-44, 70-86; data/filter.ipynb#out4 | Lead, siding with A: cell 4's output iterates 58,986 Gemini rows, which is 59K rounded. See Disagreements. |
| C-29 | NOT VERIFIED | NOT VERIFIED | VERIFIED | data/collect_data.py:387-403, 445-459, 475, 481-488; data/add_aime.py:25-35 | Lead, siding with A: the AIME rows skip decontamination, so not all samples were checked. See M-07 and Disagreements. |
| C-30 | NOT VERIFIED | VERIFIED | VERIFIED | data/filter.ipynb#out5 (54116) | Lead override of an agreed VERIFIED: 54,116 matches, but the step removes every question with a None feature, including all no-solution questions, not only API errors. See M-19 and Disagreements. |
| C-31 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | data/filter.ipynb#c7, #out7 (51607) | The code gives 51,607 against the paper's 51,581. The patterns are `[asy]` (kept for AIME), `![Image]`, `p{i}.` numbering, and bold numbers. See M-01. |
| C-32 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | data/filter.ipynb#c14, #out15 (393) | The code gives 393 against the paper's 384. See M-02 and D-09. |
| C-33 | VERIFIED | VERIFIED | VERIFIED | data/bulk_inference.sh:13, 28; data/featurization.py:65-74, 189-194; data/grading.txt:1-18 | Qwen 7B and 32B attempts, graded by `claude-3-5-sonnet-20241022` against the reference solution. Qwen sampled at temperature 0.05 (data/bulk_inference.py:32). |
| C-34 | VERIFIED | VERIFIED | VERIFIED | data/featurization.py:163-184; data/filter.ipynb#c21:11 | `gemini_length` is the length of the Gemini trace under the Qwen2.5-32B-Instruct tokenizer, and selection uses it. |
| C-35 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | data/filter.ipynb#c9:5, #out9 (24517) | The rule matches (drop a question if either model is correct). The count is 24,517 against the paper's 24,496. See M-03. |
| C-36 | VERIFIED | INCONCLUSIVE | VERIFIED | `data/bulk_inference.sh:28`; `train/sft.py:14` | Lead, siding with B: the same model filters and is fine-tuned. "May suit" is a hedge. See Disagreements. |
| C-37 | VERIFIED | VERIFIED | VERIFIED | data/featurization.py:15-48, 142-161; data/msc.json | Claude 3.5 Sonnet classifies into MSC codes. msc.json has 61 subjects, including 92 Biology, 81 Quantum theory and 91 Game theory/economics. |
| C-38 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | data/filter.ipynb#c17, #c21:2-7, #out19 | Domains are uniform only while fewer than 700 are selected. After that they are drawn from a GPQA+AIME domain distribution. The pool has 51 domains, not 50. See M-04 and M-05. |
| C-39 | VERIFIED | VERIFIED | VERIFIED | data/filter.ipynb#c9, #c21 (no Gemini-correct check in sampling); cards/s1K.md:88; data/grading.ipynb#out8 | Only the benchmark stage (#c14) requires Gemini to be correct. The card's own example attempt ends with a wrong conclusion. |
| C-40 | VERIFIED | VERIFIED | VERIFIED | data/grading.ipynb#out8 (Yes 536 / No 464), #out11 (Yes 630 / No 370) | 53.6% and 63.0%. |
| C-41 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A conceptual framing. |
| C-42 | VERIFIED | VERIFIED | VERIFIED | H/models/vllm_causallms.py:254, 401-409 | The answer delimiter is appended at the cap. The harness always appends "\nFinal Answer:" there. It is optional only in the README example (README.md:146). See M-12. |
| C-43 | VERIFIED | VERIFIED | VERIFIED | H/models/vllm_causallms.py:242-245, 273-280, 361-368 | The string is optional: with `thinking_n_ignore` set and no string, nothing is appended (eval/commands.sh:38). |
| C-44 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/generate.py:21-23; README.md:92, 159 | The repo says the exact raspberry sample came from `qfq/1k_qr_bt_dm_po_steps`, "an earlier version of s1". The caption credits s1-32B (main.tex:223). See M-22. |
| C-45 | INCONCLUSIVE | VERIFIED | INCONCLUSIVE | H/tasks/aime/utils.py:11-18; eval/commands.sh:43-88 | Lead, siding with B: all four baselines exist, but "about 100 tokens per step" is nowhere in the repo. See Disagreements. |
| C-46 | VERIFIED | VERIFIED | VERIFIED | H/models/vllm_causallms.py:268-269, 286-330 | Resamples until the thinking length is at or under the cap. "Oracle" is the authors' description. |
| C-47 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/compute_sample_stats.py:63-66, 110-111 | No code computes run-level Control. The stats script counts samples over the limit within one run. |
| C-48 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | No code computes the Scaling metric. |
| C-49 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | No code computes the Performance metric. |
| C-50 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-51 | VERIFIED | VERIFIED | VERIFIED | eval/commands.sh:32-35 | Wait-ignore runs exist for 1, 2, 4 and 6. The 2, 4 and 6 runs are the largest. The mapping to figure points is the authors'. |
| C-52 | VERIFIED | VERIFIED | VERIFIED | eval/commands.sh:91; H/tasks/aime/aime24_nofigures_agg64.yaml:15, 17, 45-62; H/tasks/aime/utils.py:229, 298-300 | Qwen2.5-32B-Instruct, temperature 1, 64 repeats, maj@2 through maj@64. |
| C-53 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | train/sft.sh:25-26; train/fsdp_config_qwen.json:1; train/launch.sh:6, 10 | FSDP full_shard and 2x8 GPUs are verified. The H100 type is in README.md:209 only. 26 min is contradicted by the sft.sh:2 reference run. See M-09. |
| C-54 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/tasks/aime/utils.py:22-23, 263; H/tasks/aime/aime24_figures.yaml:21-22; H/api/metrics.py:23-28 | The 000-999 integer answer format appears in comments. The figures dataset scores its last 30 items as AIME24. The exam dates are not in the code. |
| C-55 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | README.md:228; data/filter.ipynb#c7:10-12 | The README says aime24_nofigures keeps figures only where they matter. The eval datasets are not in the inputs, so the Asymptote form cannot be confirmed. |
| C-56 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/tasks/openai_math/openai_math.yaml:4, 7; data/collect_data.py:448 | The eval uses simplescaling/openaimath test, which is also the decontamination target. The 500 count cannot be checked. |
| C-57 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/tasks/gpqa/openai/gpqa_diamond_openai.yaml:1-4; eval/commands.sh (all GPQA runs use gpqa_diamond_openai) | The Diamond subset is verified. The count of 198 and the domains cannot be checked. |
| C-58 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A citation. |
| C-59 | VERIFIED | VERIFIED | VERIFIED | README.md:222; H/ (the fork itself) | Forked from lm-evaluation-harness commit 4cec66e. |
| C-60 | VERIFIED | VERIFIED | VERIFIED | H/tasks/aime/aime24_nofigures.yaml:14-15; H/tasks/openai_math/openai_math.yaml:11-14; H/tasks/gpqa/openai/gpqa_diamond_openai.yaml:35-36; H/tasks/aime/utils.py:292-293 | Greedy decoding, scored as exact_match on the first sample. Grading uses gpt-4o-mini, and GPQA falls back to "A", neither of which the paper discloses. See M-15. |
| C-61 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:11-92 | Only Qwen, s1 and s1.1 runs are in the repo. |
| C-62 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/models/gemini.py:61-75 | The harness Gemini wrapper retries on `FinishReason.RECITATION`, which fits the claimed API problem. The web-interface scoring cannot be checked. |
| C-63 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | Score provenance. |
| C-64 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. See D-05. |
| C-65 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:22 | The config exists. The scores do not. |
| C-66 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:11 | The config exists. The scores do not. |
| C-67 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | External model scores. |
| C-68 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | External model score. |
| C-69 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | External model scores. See D-04. |
| C-70 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | External model scores. See D-03 and D-04. |
| C-71 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | External model scores. |
| C-72 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:35 | The 6-ignore config exists. The plateau is a result. |
| C-73 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A behavioral observation. |
| C-74 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:91 | The majority-voting config exists. The comparison is a result. |
| C-75 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A comparative claim. |
| C-76 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | External model facts. |
| C-77 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-78 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | Figure content. |
| C-79 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/models/vllm_causallms.py:261-265; eval/commands.sh:31 | The Table 2 ablation runs are not in commands.sh. The `auto` cap is 32,768 minus the prompt minus about 110 tokens, which comes to about 32.5K, not 30K. See M-11. |
| C-80 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | No bootstrap code is in the repo outside unrelated REBASE files. |
| C-81 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-82 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-83 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-84 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-85 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-86 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | `train/sft.sh:2` | No 59K training log is in the repo. |
| C-87 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | The authors' conclusion. |
| C-88 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:25-31 | Seven budget-forcing caps exist (500 to 16,000 and auto). Which 5 runs Table 3 used is unknown. |
| C-89 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:51-60 | Only 4 token-conditional runs are listed per mode. See M-14. |
| C-90 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:63-74 | 5 step-conditional runs per mode, which matches the run count. The scores are not in the repo. |
| C-91 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:87-88 | Exactly 2 class-conditional runs exist, which matches "2 runs". The scores are not in the repo. |
| C-92 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:43-48 | 6 rejection-sampling runs. The scores are not in the repo. |
| C-93 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | The authors' rationale. |
| C-94 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:33 | The config exists. The scores do not. |
| C-95 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:31, 38-40 | Configs exist for no-extrapolation (auto), 2 ignores with no string, Hmm and Alternatively. The scores do not. |
| C-96 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result and interpretation. |
| C-97 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-98 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-99 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:43-48 | Temperature 1 is verified. Inverse scaling is a result. |
| C-100 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | eval/commands.sh:43-48 | The code has six caps: 3,500, 4,000, 5,000, 6,000, 8,000 and 16,000. The caption lists five and omits 6,000. See M-13 and D-02. |
| C-101 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A hypothesis. |
| C-102 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A literature claim. |
| C-103 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A priority claim. |
| C-104 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A hypothesis. |
| C-105 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A literature claim. |
| C-106 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A literature claim. |
| C-107 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A literature claim. |
| C-108 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A literature claim. |
| C-109 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/models/vllm_causallms.py:264, 381-384 | Budget forcing is capped at max_tokens (32,768), which supports the context limit. The flattening is a result. |
| C-110 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | Future work. |
| C-111 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/rebase/inference_scaling/finetune/gpt-accelera/scripts_finetune/prepare_llemma_34b.sh:5; .../scripts_finetune/finetune_rm.sh:5; eval/rebase/inference_scaling/scripts/run_reward.sh:6; eval/rebase/inference_scaling/exp_results/rebase_16/results.txt | The PRM is Llemma, derived from Code Llama. The fine-tuning script uses llemma_7b, while the 34B appears only in a prepare script. Aggregation is weighted majority vote. See M-20. |
| C-112 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-113 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/rebase/run.sh:1; eval/rebase/inference_scaling/hype-parameters/rebase16.yaml:10; H/tasks/aime/aime_2024_rebase.yaml:4 | 16 parallel trajectories are verified. Only PROMPTSTEP=64 is in run.sh, and the 32, 256 and 512 step runs are absent. |
| C-114 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-115 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A motivation. |
| C-116 | VERIFIED | VERIFIED | VERIFIED | cards/s1K-1.1.md:44 (tag curator), :122 (Ryan Marten); data/bulk_inference.sh:6, 21 (account marlowe-m000027) |  |
| C-117 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | cards/s1K-1.1.md:74, 117; README.md:15, 209; train/sft.sh:17 | The same 1,000 questions with r1 traces is verified. The training procedure changed: block_size is 20,000 for s1.1 against 32,768 for s1. "Seven days" cannot be checked (README.md:15 gives only 2025-02). See M-10. |
| C-118 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | README.md:15; cards/s1K-1.1.md:74 | The authors assert it in the repo too. No numbers are in the repo. |
| C-119 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | No Claude 3.7 distillation code. |
| C-120 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/tasks/aime/aime25_nofigures.yaml:4 | s1's own AIME 2025 eval uses TIGER-Lab/AIME25. Other models' sources cannot be checked. |
| C-121 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:17 | The config exists. The scores do not. |
| C-122 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:15, 19 | The 1x Wait command for s1.1 runs only aime25_nofigures, yet Table 5 reports 1x on all four benchmarks. See M-21. |
| C-123 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:22 | The s1 no-forcing command has no aime25_nofigures. See M-21. |
| C-124 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:32-34 | The s1 1x, 2x and 4x Wait commands have no AIME 2025. See M-21. |
| C-125 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | External model. |
| C-126 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | External model. |
| C-127 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | External models. See D-04. |
| C-128 | INCONCLUSIVE | VERIFIED | INCONCLUSIVE | eval/commands.sh:11-92 (`--model vllm`); H/models/vllm_causallms.py | Lead, siding with B: vLLM use is verified; "fastest option they tried" is not checkable. See Disagreements. |
| C-129 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/models/vllm_causallms.py:58, 94 | The seed is fixed at 1234. Run-to-run variance is not shown. The gpt-4o-mini grader runs at temperature 0.5 (H/tasks/aime/utils.py:146), another source of variance. |
| C-130 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | An observation. |
| C-131 | VERIFIED | VERIFIED | VERIFIED | eval/commands.sh:11, 15-92 (`dtype=float32`) |  |
| C-132 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/featurization.py:165 | The Qwen2.5 tokenizer is verified. No code for Claude-written keywords is in the repo. |
| C-133 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | cards/s1K.md:4-20 | The card has no domain field. |
| C-134 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | cards/s1K.md:4-20 | The card has no domain field. See D-01. |
| C-135 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | cards/s1K.md:24; data/filter.ipynb#out19 | 1,000 is verified. The pool has 51 domains (#out19), which fits "(51)". 4.7M tokens cannot be checked. |
| C-136 | VERIFIED | VERIFIED | VERIFIED | data/featurization.py:163-170 | Qwen/Qwen2.5-32B-Instruct tokenizer on the Gemini trace. |
| C-137 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | data/add_aime.py:8; data/collect_data.py:446 | 2022 stays in the pool (`year <= 2022`). Only 2023 is excluded. AIMO-AIME (2022-2024) is used as a decontamination set for the other sources, but the AIME rows are added after that step. See M-06. |
| C-138 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/collect_data.py:405-438 | All nine sources are present. The counts cannot be checked, and several code comments and caps differ. See M-18. GPQA is extended minus Diamond (collect_data.py:244-253). |
| C-139 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | data/add_aime.py:8 | The range 1983-2021 is contradicted, because 2022 is included. 890 and 4.7K cannot be checked. |
| C-140 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/filter.ipynb#out1 | 59,029 is verified. The 3.6K average cannot be checked. |
| C-141 | VERIFIED | VERIFIED | VERIFIED | data/featurization.py:69; data/grading.ipynb#c3:4, #c6:44, #c9:6 | Claude 3.5 Sonnet (20241022) grades for selection, and Claude 3.7 Sonnet (20250219) for the final 1,000. |
| C-142 | VERIFIED | VERIFIED | VERIFIED | data/grading.txt:1-18; data/grading.ipynb#c5 |  |
| C-143 | VERIFIED | VERIFIED | VERIFIED | data/filter.ipynb#c14:4-9 | The logic and the 5,600 threshold match. It selects MATH (train split), not MATH500, and the source match string `qfq/openaimath` does not match the `simplescaling/openaimath/` string that collect_data.py:120 emits as released. See M-16 and D-08. |
| C-144 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | data/filter.ipynb#c21:2-24, #c17 | The 2^-rank weights (longest gets rank 0) and dropping empty domains match. The domain choice is uniform only below 700 selected, then weighted toward the benchmark domains. See M-04. |
| C-145 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | data/collect_data.py:244-249, 445-459 | GPQA extended is filtered against Diamond, and other sources are 8-gram decontaminated. Overlap cannot be checked without the data. The AIME rows skip decontamination (data/add_aime.py). |
| C-146 | VERIFIED | VERIFIED | VERIFIED | data/collect_data.py:387-397, 459; data/decontaminate_util.py:6-17, 41-57 | Word-level 8-grams on lowercased, whitespace-normalized text. One shared 8-gram is enough to drop a question. See D-10 and M-08. |
| C-147 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A claim about Qwen benchmarks. |
| C-148 | VERIFIED | VERIFIED | VERIFIED | data/tokenization.py:27-33; H/models/vllm_causallms.py:239-240 | The trace is wrapped as think-delimiter + newline + trace + newline + answer-delimiter + newline. The chat template supplies the newline before the think delimiter. Undisclosed detail: "Answer: " is prepended to the attempt if missing (tokenization.py:26). |
| C-149 | VERIFIED | VERIFIED | VERIFIED | train/sft.sh:7, 9; train/sft_slurm.sh:5-6, 35; train/launch.sh:6, 10 | 5 epochs. Batch 16 = 1 per device x 16 GPUs. 315 = ceil(1000/16) x 5 = 63 x 5. The sft.sh:2 reference run implies batch 8. See M-09. |
| C-150 | VERIFIED | VERIFIED | VERIFIED | train/sft.sh:5, 24, 27, 31-32 | bf16, lr 1e-5, warmup_ratio 0.05 (ceil(0.05 x 315) = 16 steps in HF), cosine to 0. `min_lr=0` (sft.sh:6) is unused. |
| C-151 | VERIFIED | VERIFIED | VERIFIED | train/sft.sh:8, 33-35; requirements.txt:5 | Betas 0.9 and 0.95, wd 1e-4. The optimizer is the HF Trainer default (adamw_torch in transformers 4.46.1), never set explicitly. |
| C-152 | VERIFIED | VERIFIED | VERIFIED | train/sft.py:52-66 | DataCollatorForCompletionOnlyLM masks everything before the assistant response template, including the system prompt and the question. |
| C-153 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | train/sft.sh:17; train/sft.py:15, 68 | block_size is 32,768. Whether any s1K sample is longer cannot be checked. s1.1 used 20,000 (README.md:209). |
| C-154 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | `README.md:209` | Figure content. |
| C-155 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | `train/sft.py:15` | No 4,096-length config or length statistics are in the repo. |
| C-156 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-157 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-158 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A hypothesis. |
| C-159 | INCONCLUSIVE | VERIFIED | INCONCLUSIVE | train/sft.sh:17; train/sft_multinode.sh:25; train/sft_slurm.sh:49 | Lead, siding with B: 32,768 is verified; the reason is a result with no data in the repo. See Disagreements. |
| C-160 | INCONCLUSIVE | VERIFIED | INCONCLUSIVE | data/gemini.py:24-27, 39 | Lead, siding with B: Gemini gets only the question; the table samples' sources need the dataset rows. See Disagreements. |
| C-161 | VERIFIED | VERIFIED | VERIFIED | H/tasks/aime/utils.py:11-14; H/tasks/gpqa/openai/utils.py:19-22; eval/compute_sample_stats.py:64; train/sft.py:58-66 | "Think for up to N tokens/steps." is appended to the question, and the step format uses " steps left" lines. The conditional-model training data is not in the repo. |
| C-162 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:51-60 | The eval caps are powers of two. The training-data construction is not in the repo. |
| C-163 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:51-54 | No 1,024 run is listed. See M-14. |
| C-164 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:57-60 | No 1,024 forcing run is listed. See M-14. |
| C-165 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:51-60 | 4 runs per mode, not 5. See M-14. |
| C-166 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A citation. |
| C-167 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:63-67 | The eval step caps are powers of two. The training split rule is not in the repo. |
| C-168 | INCONCLUSIVE | VERIFIED | INCONCLUSIVE | eval/commands.sh:70-74; H/models/vllm_causallms.py:246, 281-282, 410-412 | Lead, siding with B: forcing at 0 steps is verified; counting into negative steps is not shown. See Disagreements. |
| C-169 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | `eval/commands.sh:63-67` | A result. |
| C-170 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | `eval/commands.sh:70-74` | A result. |
| C-171 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | Not computed. Running the tokenizer was out of scope. |
| C-172 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/compute_sample_stats.py:63-66 | The stats script counts steps against the instructed steps, not a 100-tokens-per-step proxy. |
| C-173 | VERIFIED | VERIFIED | VERIFIED | README.md:236; eval/rebase/inference_scaling/scripts/run_policy_our.sh:7; H/tasks/aime/aime_2024_rebase.yaml:4 | step-conditional-control-old on an older dataset, evaluated with the older Maxwell-Jia/AIME_2024 setup. |
| C-174 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A claim about the OpenAI API. |
| C-175 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/tasks/aime/utils.py:17-18; eval/commands.sh:88 | The prompt text is verified. The scores are not in the repo. |
| C-176 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/tasks/aime/utils.py:15-16; eval/commands.sh:87 | The prompt text is verified. The scores are not in the repo. |
| C-177 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | eval/commands.sh:31 | A result. |
| C-178 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-179 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | `eval/commands.sh:44,47` | A result. |
| C-180 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | H/models/vllm_causallms.py:289-330 | The code logs batch iterations, and finished slots are refilled with copies of pending requests (322-327), so per-question tries are not logged directly. See D-12. |
| C-181 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | none (not in the code or the cards) | A result. |
| C-182 | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | README.md:12-16 | The README dates (s1.1 in 2025-02) fit the claim but do not prove it. |

## Mismatches between the paper and the code

M-01 to M-22 keep Reviewer A's numbers. M-23 to M-26 are additions. "Raised by" names who found each one,
with the other reviewer's ID where both did. The lead reopened the code for every single-reviewer entry.

| # | Claims | Paper | Code | Raised by |
|---|---|---|---|---|
| M-01 | C-31 | 51,581 after the format filter (main.tex:209) | 51,607 (`data/filter.ipynb#out7`) | A+B (B M-02) |
| M-02 | C-32, D-09 | 384 samples taken straight from trusted sources (main.tex:209) | 393 (`data/filter.ipynb#out15`) | A+B (B M-04) |
| M-03 | C-35 | 24,496 after the Qwen filter (main.tex:211, 881) | 24,517 (`data/filter.ipynb#out9`, `#out10`) | A+B (B M-03) |
| M-04 | C-38, C-144 | A domain is drawn uniformly at random on every iteration (main.tex:213; Algorithm 1) | Uniform only while fewer than 700 are selected. After that the domain is drawn from a GPQA+AIME domain mix, with GPQA scaled to half of AIME (`data/filter.ipynb#c17:1-12`, `#c21:4-7`). The comment "first sample 300 uniformly" (`#c21:3`) contradicts its own `< 700` test. | A+B (B M-05) |
| M-05 | C-38, D-01 | s1K spans 50 domains (§2.2) | The domain list at selection time, built from the 24,517-question filtered pool, has 51 domains (`data/filter.ipynb#c18`, `#out19` "51/51"). No output counts the domains in the final 1,000. Soft: this compares the pool with s1K. | A |
| M-06 | C-22, C-137, C-139 | AIME 1983-2021 in the pool, with 2022-2023 held out (main.tex:198, 810) | `year <= 2022` keeps 2022 (`data/add_aime.py:8`) | A+B (B M-01) |
| M-07 | C-29, C-145 | All samples decontaminated against MATH500, GPQA Diamond and AIME24 (main.tex:202, 925) | Test sets are `AI-MO/aimo-validation-aime` (AIME 2022-2024), GPQA Diamond, `simplescaling/openaimath` test and LiveCodeBench `release_v4` (`data/collect_data.py:445-450`). Each source is also checked against earlier sources (`:475`). The AIME rows are appended afterwards by `data/add_aime.py` and never decontaminated. | A+B (B M-20, R-4) |
| M-08 | C-146, D-10 | "More than an 8-gram overlap" | Any single shared word 8-gram after lowercasing and whitespace normalization (`data/decontaminate_util.py:6-17, 46-48`). The helper defaults to 13-grams (`:27`), and `data/collect_data.py:459` passes 8. | A+B (B in D-10) |
| M-09 | C-11, C-53, C-86, C-149 | 26 min on 16 H100s, 7 H100-hours, batch 16, 315 steps (main.tex:267, 566, 931) | The only recorded run (`train/sft.sh:2`) took 5,268.8 s (87.8 min) at 0.119 steps/s (about 627 steps) and 0.949 samples/s, so batch 8 on 8 GPUs, about 11.7 GPU-hours. `train/sft.sh:9-12` sets the global batch to the GPU count. The multi-node configs (`train/sft_slurm.sh:6, 35`; `train/launch.sh:6, 10`) do give batch 16 and 315 steps. | A+B (B M-11) |
| M-10 | C-117 | s1.1 training procedure unchanged (main.tex:686) | s1.1 used `block_size` 20,000 (`README.md:209`); s1 used 32,768 (`train/sft.sh:17`) | A+B (B M-08) |
| M-11 | C-79 | Table 2 caps thinking at about 30,000 tokens (main.tex:546) | `max_tokens_thinking=auto` is 32,768 minus the longest prompt minus the delimiter tokens minus 100 (`H/models/vllm_causallms.py:262-265`), about 32.5K. No Table 2 command is in `eval/commands.sh`. | A+B (B M-15) |
| M-12 | C-42 | "Final Answer:" is appended optionally at the cap (main.tex:232) | The harness always appends `"\nFinal Answer:"` when the cap is hit (`H/models/vllm_causallms.py:254, 404-409`). Only the README snippet makes it optional (`README.md:146`). | A+B (B M-16) |
| M-13 | C-100, D-02 | Five rejection-sampling caps: 3,500, 4,000, 5,000, 8,000, 16,000 (main.tex:620) | Six caps: 3,500, 4,000, 5,000, 6,000, 8,000, 16,000 (`eval/commands.sh:43-48`) | A+B (B M-07) |
| M-14 | C-89, C-163, C-164, C-165 | Five token caps including 1,024, so Control is out of 5 (main.tex:2548, 2610) | Four caps, 2,048 to 16,384, with and without forcing (`eval/commands.sh:51-60`) | A+B (B M-12) |
| M-15 | C-60, C-129 | Accuracy (pass@1) with greedy decoding. No grader model named (main.tex:269, 729-736). | Non-integer answers go to a `gpt-4o-mini` judge at temperature 0.5 (`H/tasks/aime/utils.py:142-147, 237-284`; `H/tasks/openai_math/utils.py:141-143, 255-259`; `H/tasks/gpqa/openai/utils.py:170-173`). An unparseable GPQA answer becomes "A" (`H/tasks/gpqa/openai/utils.py:201-203`). Every command sets `PROCESSOR=gpt-4o-mini`. | A+B (B M-10). Temperature and the "A" fallback: A. |
| M-16 | C-143, D-08 | Algorithm 1 keeps "correct MATH500 solutions" with long chains (main.tex:891) | The test matches `'qfq/openaimath' in source_type` (`data/filter.ipynb#c14:7`), which is the MATH train pool (`data/collect_data.py:118-120`), not MATH500. The released collector writes `simplescaling/openaimath/<subject>`, which the `qfq/` string never matches. | A+B (B D-08, R-1) |
| M-17 | C-25 | AGIEval covers English, law and logic (main.tex:198) | Also `sat_math`, `aqua_rat` and `math_agieval` level 5, and `logiqa` is tagged `math` (`data/collect_data.py:215-231`) | A+B (B M-19). The `logiqa` tag: B. |
| M-18 | C-21, C-23, C-24, C-138 | NuminaMath 30,660; OlympicArena 4,250; Omni-MATH 4,238; MATH 11,999; TheoremQA 747; OlympiadBench 896; JEEBench 515; USACO 519; SciEval 227; xword 999 | Code comments and caps: NuminaMath "take 500", but the code keeps every aops_forum row plus a 500-question subset (`:132-144, 414`); OlympicArena 3,922 (`:410`); Omni-MATH 3,329 (`:416`); MATH "12K" (`:408`); TheoremQA 720 (`:412`); OlympiadBench 626 (`:421`); JEEBench 483 (`:423`); USACO 520 (`:433`); SciEval n=250 (`:420`); XWord n=1000 (`:432`). Low confidence: the comments may predate decontamination and dedup. | A+B (B M-18). Omni-MATH comment: B. |
| M-19 | C-30 | Only questions with API errors are removed, leaving 54,116 (main.tex:209) | Any question with a None feature is removed (`data/filter.ipynb#c4:6-8`). That includes every question without a reference solution, whose grade is None (`data/featurization.py:56-63`), such as all USACO and LiveCodeBench rows (`data/collect_data.py:270, 288`). The count still matches. | A+B (B M-06) |
| M-20 | C-111 | REBASE reward model initialized from LLaMA-34B; outputs combined by majority vote (main.tex:649) | Llemma: `EleutherAI/llemma_34b` appears only in a prepare script (`eval/rebase/inference_scaling/finetune/gpt-accelera/scripts_finetune/prepare_llemma_34b.sh:5`); the reward-model fine-tune starts from `llemma_7b` (`.../finetune_rm.sh:5`); the served model is `tkitsers/Llemma-reward-model` (`.../scripts/run_reward.sh:6`). Aggregation is `majority_vote weighted: True` (`.../exp_results/rebase_16/results.txt:1`). | A+B (B M-17) |
| M-21 | C-122, C-123, C-124 | Table 5 gives s1 AIME 2025 scores, and s1.1 1x-Wait scores on all four benchmarks | No s1 command runs `aime25_nofigures` (`eval/commands.sh:22-35`). The s1.1 1x-Wait command runs only `aime25_nofigures` (`:15`). | A+B (B M-13) |
| M-22 | C-44, D-14 | Figure 3 shows budget forcing with s1-32B (main.tex:223-224) | The exact raspberry sample came from `qfq/1k_qr_bt_dm_po_steps`, "an earlier version of s1", with the prompt "How many r in raspberry?" (`eval/generate.py:21-23`) | A+B (B M-09, D-14) |
| M-23 | C-121 | s1.1 "w/o BF" row means no budget forcing (Table 5) | The only s1.1 no-Wait command sets `max_tokens_thinking=auto` (`eval/commands.sh:17`), a thinking cap that appends the end-of-thinking delimiter and "Final Answer:" when hit. The s1 no-forcing command (`:22`) sets no thinking cap. | B (M-14). Lead confirmed. |
| M-24 | C-137 | Left out "AIME questions from 2022-2023 ... these 90 questions" (main.tex:798) | Two AIME years are 60 questions, not 90. The code keeps 2022 (`data/add_aime.py:8`). The only three-year AIME set in the code is the decontamination set `AI-MO/aimo-validation-aime`, 2022-2024 (`data/collect_data.py:446`). Its row count is inference (3 x 30), since the dataset is not in the inputs. | B (D-13). Lead confirmed `main.tex:798`. |
| M-25 | C-148 | Training text format given without an answer prefix | `"Answer: "` is prepended to the attempt when missing (`data/tokenization.py:26`) | A+B (A in the C-148 note, B M-21) |
| M-26 | C-33 | Qwen sampling temperature not stated | Qwen attempts sample at temperature 0.05 (`data/bulk_inference.py:32`) | A+B (both in the C-33 note) |

## Problems inside the code that affect reproduction

These are not paper-vs-code mismatches, but they decide what a replication can rebuild.

| # | Problem | Evidence | Raised by |
|---|---|---|---|
| R-01 | The saved outputs of `data/filter.ipynb` come from an earlier notebook version. One output pushes to `qfq/s1k_v1` while the source pushes to `qfq/s1K`, and a cell calls `mathcot_sft` with `time_limit`, `model_type`, `rollout_path` and `step_format`, which the released `data/tokenization.py:36-37` does not accept. | `data/filter.ipynb#out26`, `#c26:1`, `#c27`; `filter.ipynb:10884-10887` | A+B (A caveat, B R-2) |
| R-02 | Stage-2 sampling draws from `np.random` with no seed, so a rerun cannot reproduce s1K. | `data/filter.ipynb#c17:12`, `#c18:3`, `#c21:15` | A+B (B R-3) |
| R-03 | The MATH branch of Algorithm 1 matches `qfq/openaimath`, which the released collector never emits, so a rerun selects no MATH rows there. | `data/filter.ipynb#c14:7`; `data/collect_data.py:120` | A+B (A M-16, B R-1) |
| R-04 | `data/add_aime.py` and `data/fix_gpqa.py` read from and push to a hard-coded `simplescaling/s1K`, outside the decontamination step. | `data/add_aime.py:26, 35`; `data/fix_gpqa.py:54, 59` | A+B (A M-07, B R-4) |
| R-05 | The Qwen bulk-inference loop runs shards 0-5 (its comment says 0 to 6), but the assembler reads shards 0-6. | `data/bulk_inference.sh:2-3, 17-18`; `data/bulk_inference.py:73` | B (R-5). Lead confirmed. |
| R-06 | With `thinking_n_ignore`, only `token_ids` are truncated to the budget, not `text`, so logged and graded thinking can be longer than what the model was conditioned on. A adds two details. The per-round budget does not shrink between rounds, and a truncated sample keeps `finish_reason="stop"`, so it gets the plain answer delimiter without "Final Answer:". The README snippet does shrink the budget (`README.md:131`). | `H/models/vllm_causallms.py:338-343, 381-384, 401-412` | A+B (B R-6). Budget and finish_reason: A. |
| R-07 | The step-conditional runs without forcing pass `max_tokens_thinking=auto` and keep the default stop string `<\|im_start\|>`. Each step in the step format opens with that same token, so thinking may end at the first step boundary. Not run. | `eval/commands.sh:63-67`; `H/models/vllm_causallms.py:239, 246, 282`; `eval/compute_sample_stats.py:69, 132` | B (R-7, suspected). Lead confirmed the stop string and the step delimiter by reading. |
| R-08 | Rejection sampling refills finished slots with copies of pending requests and logs batch iterations, not tries per sample. | `H/models/vllm_causallms.py:289-330` | A+B (B R-8) |
| R-09 | `train/sft.sh` uses micro-batch 1 and no gradient accumulation, so the global batch equals the GPU count. Run as written on one GPU, it trains at batch 1 for 5,000 steps. | `train/sft.sh:9-12` | A+B (A M-09, B M-11) |
| R-10 | The `gpt-4o-mini` judge samples at temperature 0.5, a source of run-to-run variance the paper does not mention. The vLLM seed is fixed at 1234. | `H/tasks/aime/utils.py:146`; `H/models/vllm_causallms.py:58, 94` | A |

## D-items

| D | Status | Resolution | Raised by |
|---|---|---|---|
| D-01 | Open, partly resolved | The domain list at selection time has 51 domains (`data/filter.ipynb#out19`), which fits Table 6's "(51)" and not §2.2's "50". Table 6's 23 named rows plus "remaining 27" make 50, so one row label is off by one. No output counts the domains in the final 1,000, and the card has no domain field (`cards/s1K.md:4-20`). B said the code cannot decide. The lead accepts A's pool count, and the final-set count stays open. | A (pool count); A+B (final count open) |
| D-02 | Resolved | The code runs six caps (`eval/commands.sh:43-48`), so the caption dropped 6,000. Paired one to one: 655 at 3,500, 97 at 4,000, 8 at 5,000, 3 at 6,000, 2 at 8,000, 1 at 16,000. The pairing is inference, and the counter is batch-level (R-08). | A+B |
| D-03 | Open, not code-checkable | No results in the repo. Comparing Table 5 with Table 1 makes "07.3" a typo for 97.3. | A+B |
| D-04 | Open, not code-checkable | Both scores are other models' published numbers. | A+B |
| D-05 | Open | Runs exist for s1 at 1x, 2x, 4x and 6x "Wait" (`eval/commands.sh:32-35`), but the repo has no per-run scores and does not say which run fills Table 1's row. | A+B |
| D-06 | Resolved by arithmetic | 56.7 / 44.6 = 1.271, a 27% relative gain, and 12.1 points absolute. The code cannot say which the abstract means. | A+B |
| D-07 | Resolved by arithmetic | The drops are 13.3, 23.3 and 16.7 points, mean 17.8 points, 35.5% relative to 50.0. "Around 30%" understates it. No ablation results are in the repo. | A+B |
| D-08 | Resolved | Algorithm 1 tests the MATH train pool, not MATH500, so its comment is wrong. The released match string also never fires (M-16, R-03). | A+B |
| D-09 | Resolved as a mismatch | The saved run selects 393 in this stage, not 384 (M-02). | A+B |
| D-10 | Resolved | One shared word 8-gram drops a question (M-08). "GPTQA" is a typo, and the code uses `Idavidrein/gpqa` `gpqa_diamond` (`data/collect_data.py:111, 447`). | A+B |
| D-11 | Open, not code-checkable | A presentation issue in §5.2. | A+B |
| D-12 | Open, partly resolved | The two numbers measure different things. The code counts batch iterations with slot refilling (R-08). Figure 6 ran on `simplescaling/s1-32B` (`eval/commands.sh:43-48`) and Table 15 on an earlier model, so they cannot be reconciled from the code. | A+B |
| D-13 | Resolved as a mismatch | The paper's "2022-2023 ... these 90 questions" is 60 questions by count, and the code keeps 2022 (M-24). | B |
| D-14 | Resolved as a mismatch | Same finding as M-22: the code credits the Figure 3 sample to an earlier model. Whether the authors later reran it on s1-32B is not in the repo. | B (A raised it as M-22) |

## Findings

### Act on

1. **Pin the training hyperparameters instead of running `train/sft.sh` as written.** The script sets the
   global batch to the GPU count (R-09), and the only recorded run used batch 8 for about 627 steps (M-09).
   The paper and the multi-node configs agree on batch 16, 5 epochs, 315 steps, lr 1e-5, 5% warmup, cosine
   to 0, AdamW (0.9, 0.95), weight decay 1e-4 (C-149 to C-151). On one capped GPU, reach batch 16 through
   gradient accumulation. Raised by A+B.
2. **Decide and record the grading rule before comparing any score.** Every paper number comes from a harness
   that sends non-integer answers to a `gpt-4o-mini` judge at temperature 0.5 and turns unparseable GPQA
   answers into "A" (M-15, R-10). The paper calls this greedy pass@1. A replication that uses exact match
   will not be comparable. Raised by A+B (temperature and fallback by A).
3. **Take the harness's budget forcing as the reference and record its quirks.** It always appends
   "Final Answer:" at the cap (M-12). After "Wait" rounds it truncates token IDs but not text, it does not
   shrink the per-round budget, and a truncated sample skips "Final Answer:" (R-06). The README snippet
   behaves differently. Any thinking-token count we report must say which text it measured. Raised by A+B.
4. **Train on the released s1K (or `simplescaling/s1K_tokenized`) and do not try to rebuild it.** The
   selection notebook's outputs come from an earlier version (R-01), sampling is unseeded (R-02), the MATH
   branch never fires as released (R-03), and the domain rule differs from the paper (M-04). Record that the
   released set contains AIME 2022 (M-06) and was not drawn by the uniform rule the paper describes. Raised
   by A+B.

### Consider

- **Choose which paper numbers to compare against.** Table 5 rows have no matching command (M-21), the s1.1
  "w/o BF" row ran with a thinking cap (M-23), and Table 1's s1-32B row mixes settings (D-05). Comparing
  against rows backed by a command in `eval/commands.sh` is safer. Raised by A+B (M-23 by B).
- **Match `data/tokenization.py` when re-tokenizing for a smaller Qwen.** The format adds `"Answer: "` to
  the attempt (M-25) and uses the exact think and answer delimiters (C-148). If the small model shares the
  Qwen2.5 tokenizer, `s1K_tokenized` may be reusable as is. The 32,768 block size (C-153, C-159) will not fit
  in 8 GB, so the truncation length becomes a recorded deviation. Raised by A+B.
- **Do not trust the step-conditional baseline commands without a test run.** The default stop string may
  end thinking at the first step (R-07). This matters only if we reproduce Table 3 or Table 13. Raised by B.
- **Avoid AIME 2022-2024 as an extra eval set.** The pool keeps AIME 2022, and the AIME rows were never
  decontaminated (M-06, M-07, M-24). AIME24 and AIME25 evals are unaffected. Raised by A+B (M-24 by B).

### Noted

- Small count drifts from the saved notebook run: 51,607, 393, 24,517 (M-01 to M-03). A+B.
- 51 domains in the selection pool against 50 in §2.2 (M-05, D-01). A.
- "More than an 8-gram" means one shared 8-gram (M-08). A+B.
- s1.1 trained with block size 20,000 (M-10). A+B.
- The `auto` cap is about 32.5K, not 30K (M-11). A+B.
- Six rejection-sampling caps, a batch-level try counter, and Figure 6 and Table 15 measuring different
  things (M-13, R-08, D-02, D-12). A+B.
- Four token-conditional caps, not five (M-14). A+B.
- AGIEval includes math subsets (M-17). A+B.
- Source sizes differ from code comments, low confidence (M-18). A+B.
- The 54,116 filter removes no-solution questions as well as API errors (M-19, C-30). A+B.
- REBASE uses a Llemma reward model and weighted voting (M-20). A+B.
- Figure 3's sample came from an earlier model (M-22, D-14). A+B.
- Qwen attempts sampled at temperature 0.05 (M-26). A+B.
- Shards 0-5 run against 0-6 read (R-05). B.
- A full AIME run from 1983 to 2021 has 915 questions (17 x 15 + 22 x 30), not 890 (C-139). B. This is
  calendar arithmetic, not code.
- Rejection sampling meets the budget by construction, so its Control is 100% (C-92). B.

### Dismissed

- **B's INCONCLUSIVE on C-19 and C-28.** The saved notebook outputs show 59,029 featurized questions and
  58,986 Gemini rows. B's "no code computes it" overlooked those outputs.
- **B's VERIFIED on C-29.** B's own R-4 shows the AIME rows skip decontamination, so "all samples" fails.
- **A's VERIFIED on C-45, C-128, C-159, C-160 and C-168.** Each passed the part the code shows and skipped an
  element A's own note called uncheckable.
- **A's INCONCLUSIVE on C-36.** The unchecked part is a hedge ("may suit"), not a fact.
- **Both reviewers' VERIFIED on C-30.** Both logged the contradiction as a mismatch and then passed the claim
  anyway. Overridden to NOT VERIFIED.
- **B's "the code cannot decide" on D-01.** The pool's 51 domains are in a saved output. Only the final-set
  count is still open.

## Agreement map

- **Verdicts.** The reviewers agreed on 173 of 182 claims (95%). Of the 9 disagreements, 7 had A more lenient
  (A VERIFIED, B INCONCLUSIVE), 1 had B more lenient (C-36), and 1 split VERIFIED against NOT VERIFIED
  (C-29). A tended to pass a claim once its checkable part held, and 5 of those 7 were overturned. B held to
  "every element", and lost twice by missing saved notebook outputs. Neither reviewer was consistently right,
  which is why both runs were needed.
- **Mismatches.** 21 of A's 22 mismatches have a B counterpart. Only M-05 (51 domains) is A's alone. B added
  M-23 (the s1.1 thinking cap) and M-24 (60 against 90 AIME questions), and both mentioned M-25 and M-26 in
  claim notes. Two reviewers finding the same 21 mismatches independently, in opposite claim order, makes
  that list the highest-confidence output of this review.
- **Code problems.** Both found R-01 to R-04, R-06, R-08 and R-09. B alone found R-05 and R-07, and A alone
  found R-10 and the budget and finish_reason parts of R-06.
- **D-items.** The reviewers agree on the status of D-02 to D-12. They split on D-01, where the lead took A's
  pool count and left the final count open. B's D-13 and D-14 are new, and D-14 restates A's M-22.
