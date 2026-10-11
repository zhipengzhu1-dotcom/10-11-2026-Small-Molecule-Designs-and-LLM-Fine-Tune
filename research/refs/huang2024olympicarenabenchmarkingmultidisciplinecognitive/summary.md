# OlympicArena (huang2024olympicarenabenchmarkingmultidisciplinecognitive)

Huang et al., NeurIPS 2024 Datasets and Benchmarks. Source: arXiv 2406.12753v2 (6 Mar 2025), read from the PDF. Page numbers are PDF pages, which match the printed numbers. Facts marked "HF card" come from https://huggingface.co/datasets/GAIR/OlympicArena, fetched 2026-10-11, not from the paper.

## What it is

A benchmark of 11,163 olympiad-level problems from 62 competitions in seven subjects (math, physics, chemistry, biology, geography, astronomy, computer science), in English and Chinese, text-only and interleaved text-image. s1 uses it only as a source of training questions for the 59K pool (s1 §2.1 L198, Table 7 L805), not as an evaluation benchmark.

## Facts Tier 1 needs

### Data format, splits and sizes

1. Size and makeup: 11,163 problems, 62 competitions, 7 subjects with 34 subfields, 13 answer types, 7,571 problems with solutions, 7,054 English and 4,109 Chinese, 4,960 problems with images (p. 5, Table 2; Table 6 confirms the language and modality totals).
2. Splits: 548 problems form OlympicArena-ot (answer type "others", graded by a model), 638 form OlympicArena-val with step-by-step solutions, and the rest form OlympicArena-test, "the official test set with unreleased answers" (p. 6, §3.4).
3. English text-only problems per subject, over the whole benchmark: math 2,215, physics 632, chemistry 782, biology 352, geography 211, astronomy 219, CS 90, for 4,501 in total (p. 17, Table 6).
4. Competition list with per-competition counts (p. 16, Table 4). Some math problems (IMO, RMM, ARML, EMC, EGMO) are partly taken from OlympiadBench, and some CS problems from MMCode. CS includes 48 USACO, 48 AtCoder and 138 Codeforces problems.
5. Collection: competition PDFs were converted to markdown with Mathpix, about 30 students extracted the problems, and duplicates within each competition were removed by embedding similarity (p. 5, §3.2 and §3.3). Each problem is stored as JSON, with images as URLs and units in a separate field (p. 19, App. B.1).
6. 13 answer types: SC, MC, TF, NV, SET, IN, EX, EQ, TUP, MPV, MA, CODE, OT (p. 18, Table 7).
7. Average problem length is 244.8 tokens and average solution length is 417.1 tokens (p. 5, Table 2; the paper does not name the tokenizer).
8. HF release (HF card): 7 configs, one per subject (Math, Physics, Chemistry, Biology, Geography, Astronomy, CS), each with `test` and `val` splits, 10,615 rows in total. That is 11,163 minus the 548 ot problems, so the ot split appears not to be released. Columns: id, problem, prompt, figure_urls, answer, solution, answer_type, unit, answer_sequence, type_sequence, test_cases, subject, language, modality. The card says the test split does not disclose answers, and test rows show null answers.
9. s1's loader (`data/collect_data.py:146-155`) loads all 7 configs, concatenates `test` and `val`, keeps rows with `language == "EN"` and `modality == "text-only"`, maps `problem` to question and `solution` to solution, and sets cot_type to math (Math), coding (CS) or science (the rest).

### Evaluation protocol and metrics

10. Zero-shot prompts per answer type ask the model to reason step by step and end with "The final answer is \boxed{ANSWER}" (p. 6, §4.1; p. 24, Figure 15; p. 29, Table 10).
11. Decoding: max 2,048 output tokens, temperature 0.0; temperature 0.2 for code generation (p. 25, App. C.4).
12. The rule-based check reads the `\boxed{}` content (p. 25, App. C.5). Numerical values ignore units. For estimates, both numbers go to scientific notation and, if the exponents match, the mantissas may differ by up to 0.1. EX and EQ use SymPy equivalence. MPV follows the prompted order. IN compares endpoints and open or closed ends exactly. SET and TUP need exact matches.
13. Code: unbiased pass@k with k = 1 and n = 5 over all test cases (p. 25, Eq. 1). For overall accuracy, a code problem counts as correct if any sample passes every test (p. 7, Table 3 caption).
14. Model-based grading: GPT-4V judges OT answers given the problem, reference answer and optional solution (p. 26, Figure 16). It agreed with humans on about 80% of 100 sampled problems. OT is about 5% of the benchmark (p. 25, App. C.5).
15. Process-level score: GPT-4 reformats gold and model solutions into steps, GPT-4V scores each step 0 or 1, and the score is the mean (p. 6, §4.2; p. 26, App. C.6). This ran on 96 sampled problems.
16. Headline result: GPT-4o reaches 39.97% overall, with 28.67% on math and 29.71% on physics. Open models stay below 20% (p. 2, Abstract; p. 7, Table 3).
17. Leakage check: n-gram prediction accuracy (5-grams from k start points, counted as correct on exact match or on edit distance or ROUGE-L above 75%) finds few leaked items, for example 43 for Qwen1.5-32B-Chat (p. 9, §4.5; p. 27, App. E).

### Model details

18. Not applicable. The paper evaluates existing models (GPT-4o, GPT-4V, Claude 3 Sonnet, Qwen, Yi, InternLM2 and others; p. 23-24, App. C.2) and trains none.

### License

19. The paper states no data license. It says only that collection respected copyright and licensing (p. 5, §3.2). The HF card lists CC BY-NC-SA 4.0. The catalog records the PDF as arXiv nonexclusive-distrib 1.0.

## Conflicts with s1

1. Grading against a reference that does not exist. s1 says Claude 3.5 Sonnet grades each Qwen attempt "against the reference solution" (C-33, L211), and the grading prompt includes the correct answer (C-142, L836). s1's loader takes OlympicArena's `test` split as well as `val` (`collect_data.py:150`), and the reference says test answers are unreleased (p. 6, §3.4; HF card: test answers are null). Only 638 problems (val) have released answers. So most OlympicArena questions in the 59K pool had no reference answer to grade against. Whether the `solution` field is also null on test rows is INCONCLUSIVE from these inputs.
2. Unstated filter and an uncheckable count. s1 says "4,250 questions" from OlympicArena (C-23, L198; Table 7 L805) and mentions no filter. The code keeps English text-only rows of test and val (`collect_data.py:151-152`), and its comment says 3,922 (`:410`, M-18). The reference gives 4,501 English text-only problems across the whole benchmark, including the unreleased ot split (p. 17, Table 6). None of the three numbers can be reconciled without the HF rows.
3. "From various Olympiads" (L198). The reference's 62 competitions include events that are not olympiads: Putnam, HMMT, SMT, PUMaC, Physics Bowl, AtCoder and Codeforces (p. 16, Table 4). This is a minor wording difference.

## Caveats for a local, under-8B, 8 GB replication

- License. The HF card gives CC BY-NC-SA 4.0, which is non-commercial and share-alike. Any s1K row taken from OlympicArena carries those terms. s1's own inspect output lists 5 OlympicArena questions in s1K: 2 astronomy, 2 chemistry and 1 math (`data/filter.ipynb`, cell 24 output).
- Grading without answers. If you re-run s1's difficulty filter with a local judge, OlympicArena test rows give the judge nothing to compare with. Either restrict to the 638 val rows or drop OlympicArena from the difficulty filter.
- OT grading and process-level scoring both use GPT-4V. A local replication can use only the rule-based checks (fact 12) and pass@k for code. OT answers need a local judge model (or Claude as judge) or must be dropped.
- The reference grades code problems (CS, cot_type "coding") by test cases, not by text match. A local judge that matches text will grade them poorly.
- Overlap with other s1 sources. Some OlympicArena math comes from OlympiadBench, and its USACO problems can repeat s1's USACO source (p. 16, Table 4). Check that s1's dedup (C-29) removes these before counting sources.
- Tokens. Average solutions are 417 tokens (fact 7), but s1 reports 3.2K average thinking tokens for these questions with the Qwen2.5 tokenizer (Table 7 L805). Training on such traces at 8 GB needs a sequence length budget well above the problem length.
- `trust_remote_code=True` in s1's loader runs code from the HF repo. Pin a revision or load the parquet files directly.
