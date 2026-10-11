# aime: AoPS Wiki, AIME Problems and Solutions

## What it is

The saved reference (`raw/aime-problems-and-solutions.md`) is the AoPS Wiki index of every AIME exam, one wiki page per exam. It holds no problems, answers or rules. s1 cites it for AIME24 (main.tex L269), its main math benchmark, and its pool also draws on earlier AIMEs through the `qq8933/AIME_1983_2024` dataset. Facts the index cannot give come from the s1 code at `research/s1/raw/code/s1/` (paths below are relative to it, with `H/` for `eval/lm-evaluation-harness/lm_eval/`) and from public descriptions of the exam.

## Facts Tier 1 needs

### Exam structure and sizes

- One exam a year from 1983 to 1999 (17 exams), two exams (I and II) a year from 2000 to 2026, and a single `2027_AIME` page (index table rows 1983 to 2027).
- Each exam has 15 problems and lasts 3 hours, with no partial credit (Wikipedia "American Invitational Mathematics Examination", section "Rules and scoring"). The AoPS pages for 2024 I and II returned HTTP 403 to the reader, so the per-exam count is not confirmed from AoPS itself.
- AIME24 is 2024 I plus 2024 II, 2 x 15 = 30 problems, which matches s1's count (C-54).
- 2024 AIME I took place on Thursday, Feb 1, 2024. 2024 AIME II took place on Wednesday, Feb 7, 2024. Source: the MAA 2024 AIME teacher's manual (maa.org/sites/default/files/Programs/2024%20AIME%20TM.pdf), as quoted in search results. The PDF itself returned 403.
- Derived from the index: AIME 1983 to 2021 has 17 x 15 + 22 x 2 x 15 = 915 problems. 2022 to 2023 has 60, and 2022 to 2024 has 90.

### Answer format and checking

- Every answer is an integer from 000 to 999 (Wikipedia, "Rules and scoring"). s1 says the same (main.tex L269), and the harness repeats it in comments (`H/tasks/aime/utils.py:22-23, 263`).
- The prompt is the bare problem text. The default `QUERY_TEMPLATE` is `'{Question}'`, and the "integer between 000 and 999" hint is commented out (`H/tasks/aime/utils.py:20-23`). No instruction to use `\boxed{}`.
- The harness takes the text after `<|im_start|>answer\n`, then the last `\boxed{}`, else the last `Answer:` match (`utils.py:247-261`).
- When both strings are digits, it compares `int()` values, so "023" equals "23" (`utils.py:243-244, 264-265`).
- Any non-digit extraction goes to a `gpt-4o-mini` judge at temperature 0.5, which picks a matching option index (`utils.py:142-147, 237-238, 266-284`). Without `PROCESSOR=gpt-4o-mini`, it compares raw strings, so `$23$` or `23.` scores wrong (`utils.py:239-241`).
- The metric is `exact_match` on the first sample (`utils.py:292-293`). Main runs use greedy decoding with `temperature: 0` and `max_gen_toks: 32768` (`H/tasks/aime/aime24_nofigures.yaml:12-16`).
- The `_agg64` variant draws 64 samples at temperature 1 and reports cov@k and maj@k for k = 2 to 64 (`aime24_nofigures_agg64.yaml:15-62`, `utils.py:229, 298-300`).

### Eval datasets s1 uses

- `aime24_nofigures`, from HF `simplescaling/aime24_nofigures`, split `train` (`aime24_nofigures.yaml:3-8`). The README says s1 always reports this variant for AIME24, and that it keeps a figure only where the problem needs it (README.md:228).
- `aime24_figures`, from `simplescaling/aime24_figures`, has more than 30 rows. It scores only the last 30 as AIME24 (`aime24_figures.yaml:21-22`, `H/api/metrics.py:23-28`).
- AIME 2025 for s1.1 comes from `TIGER-Lab/AIME25` (`aime25_nofigures.yaml:4`).
- The REBASE runs use `Maxwell-Jia/AIME_2024` (`aime_2024_rebase.yaml:4`, README.md:236). That YAML and `aime_2024_agg8.yaml` call `utils.process_docs_aime_2024` and `utils.doc_to_text_aime_2024`, but neither function exists in `utils.py`, so both tasks fail to load as shipped.
- Fields: the harness reads `problem` (or `question`), `solution` and `answer`, with fallbacks to `orig_*` (`utils.py:205-216`).

### Which AIME problems s1 trains on

- The source is HF `qq8933/AIME_1983_2024`, with fields `ID` (year first, split on `-`), `Question` and `Answer` (`data/add_aime.py:6-12`).
- The code keeps rows with `year <= 2022`, so 1983 to 2022 enters the pool. AIME 2023 and 2024 stay out (`add_aime.py:7-8`).
- The AIME rows are appended after the 8-gram decontamination step and skip it (`add_aime.py:25-35` vs `data/collect_data.py:456-459`).
- The decontamination test set is `AI-MO/aimo-validation-aime`, the 90 AIME problems from 2022 to 2024 (`collect_data.py:446`).
- Questions with `[asy]` figure code are dropped from every source except AIME (`data/filter.ipynb` cell 7).
- Every Gemini-correct AIME question goes straight into s1K (filter.ipynb cell 14; main.tex L886). After 700 picks, later domains are drawn from an AIME+GPQA domain mix (cells 17, 21).
- The saved output of filter.ipynb cell 24 lists 305 of the 1,000 selected rows as `qq8933/AIME_1983_2024`. That run pushed to `qfq/s1k_v1` (cell 26), so the released `simplescaling/s1K` may differ.
- `add_aime.py:26, 35` reads and writes `simplescaling/s1K`, while README.md:241 calls it a pool-collection step. The hub path in the script looks stale.

### Model details

- Not applicable. This reference is a benchmark source.

### License

- The saved index states no license. AIME problems are MAA competition material. The licenses of the HF copies (`simplescaling/aime24_nofigures`, `qq8933/AIME_1983_2024`, `TIGER-Lab/AIME25`) were not checked here.

## Conflicts with s1

1. **Exam dates.** s1 says the 2024 AIME was held January 31 to February 1, 2024 (C-54, main.tex L269). The MAA dates are Feb 1 for AIME I and Feb 7 for AIME II. The window s1 gives leaves out AIME II, which supplies half of AIME24. This rests on search-result quotes of the MAA manual, since the PDF returned 403.
2. **Dev-set size.** s1 says AIME 2022 to 2023 is "90 questions" (C-137, main.tex L798). Four exams of 15 make 60. 90 is the size of 2022 to 2024, which is the `aimo-validation-aime` set (`collect_data.py:446`).
3. **AIME pool count.** s1 lists AIME 1983 to 2021 with 890 questions (C-139, main.tex L810). Those exams hold 915 problems. The code also keeps 2022 (`add_aime.py:8`, M-06), which would make 945. The 25 to 55 missing rows are unexplained. They may be gaps in `qq8933/AIME_1983_2024` or rows lost before Table 7 was counted.
4. **Year range.** s1 says 1983 to 2021 and holds out 2022 to 2023 (C-22, C-137, main.tex L198, L798). The code includes 2022 (`add_aime.py:8`), already logged as M-06. AIME 2022 is in both the training pool and the decontamination test set.
5. **Decontamination.** s1 says it decontaminated all samples against AIME24 (C-29, C-146, main.tex L202, L925). The AIME rows skip that step (M-07). The year filter still keeps AIME24 out, so this does not leak AIME24 into training.
6. **Grading.** s1 describes greedy pass@1 and names no grader (C-60, main.tex L269). The harness sends non-integer extractions to `gpt-4o-mini` (M-15). For AIME this fires only when the extracted string is not pure digits.
7. **Figures.** s1 says figure problems reach the model as Asymptote code (C-55, main.tex L269). The README says the reported `nofigures` variant keeps a figure only "if important" (README.md:228). The eval rows are not local, so this cannot be checked.

## Caveats for a local, under-8B, 8 GB replication

- **Replace the API judge.** It is not allowed for this replication. AIME answers are integers, so a rule-based normalizer is enough. Strip `$`, `\text{}`, commas, spaces and a trailing period, then compare `int()` values. Report how many extractions fail to parse; per the grading plan (#11), those go to the local judge and then to Claude, never to an API model.
- **Add a format instruction.** Either append the commented-out "integer between 000 and 999" line or train with a fixed `\boxed{}` habit. Small models often skip `\boxed{}`, and the bare-question prompt then depends on the `Answer:` regex. Record whichever prompt is used, since it departs from s1.
- **Base-model contamination.** AIME 2024 problems and answers were public from February 2024 on AoPS and many mirrors. Any base model trained on later web data (for example Qwen2.5 under 8B, released September 2024) may have seen them. AIME24 scores for such a model can be inflated. s1's decontamination covers the fine-tuning data only, not pretraining.
- **Cleaner held-out sets.** Pick a set held after the base model's data cutoff. AIME 2025 (`TIGER-Lab/AIME25`, s1's own s1.1 eval) works for 2024-era models. The index already lists 2026 I and II, which is newer than most current small models. AIME 2023 is outside s1's training pool, but the authors used it for development.
- **30 problems is a noisy test.** One problem is 3.3 points. A small model scoring 0 to 4 correct cannot separate s1K from its ablations under greedy decoding. Report sampled accuracy over several seeds (for example 8 to 16 samples at temperature 1, the `agg64` setup scaled down), with a confidence interval. Consider also reporting AIME 2025 or 2026.
- **Length vs memory.** AIME traces are long. Table 7 gives a 4.7K-token average thinking length for the AIME pool (main.tex L810), and the harness allows 32,768 new tokens. Under 8 GB, the KV cache for 32K tokens limits batch size and may force a smaller cap. Any cap below s1's changes the no-intervention baseline.
- **Training-set AIME share.** About 30% of s1K was AIME 1983 to 2022 in the saved selection run. A small model fine-tuned on it learns AIME style, so AIME24 gains partly measure in-distribution transfer. Keep the same year cut (no 2023 or 2024 rows) if the pool is rebuilt.
- **Broken tasks.** Do not rely on `aime_2024_agg8` or `aime_2024_rebase` without adding the missing `utils` functions.

Sources outside the repo: [Wikipedia AIME](https://en.wikipedia.org/wiki/American_Invitational_Mathematics_Examination), [MAA 2024 AIME TM (search result only, 403)](https://maa.org:443/sites/default/files/Programs/2024%20AIME%20TM.pdf).
