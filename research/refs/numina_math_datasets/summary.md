# NuminaMath (numina_math_datasets)

Li, Beeching, Tunstall et al., "NuminaMath: The largest public dataset in AI4Maths with 860k pairs of
competition math problems and solutions", technical report dated July 22, 2024 (16 pages, `raw/paper.pdf`).
It describes the NuminaMath-CoT and NuminaMath-TIR datasets and the models that won the 1st AIMO Progress
Prize. s1 draws its largest pool source from NuminaMath-CoT (main.tex L198, L803; C-21).

Page numbers below are the PDF's printed page numbers.

## Facts Tier 1 needs

### Data format, sources and sizes

- NuminaMath-CoT has 860K problem-solution pairs, about 400K of them competition level (p. 4, Table 1).
  The abstract says 860,000 (p. 1). The introduction says "nearly one million" (p. 2, §1).
- Every solution has one format: English, chain of thought, and a final answer in `\boxed{}` or a
  closing black square for proofs (p. 6, §3.2).
- There are nine sources. Figure 3 (p. 6) gives approximate counts, read off the bar chart:
  cn_k12 about 276K, synthetic_math about 167K, orca_math about 153K, olympiads about 150K,
  synthetic_amc about 62K, aops_forum about 30K, and math, gsm8k and amc_aime under 10K each.
  The text gives 152K for World Olympiads (p. 5, §3.1) and about 4,300 for AMC/AIME after
  decontamination, down from 6,500 (p. 5, §3.1).
- The aops_forum rows come from a crawl of the AoPS "Contest Collection" pages. The forum has no reference
  solution, so the authors keep replies with `\boxed{}` or a black square, pick the one with the most LaTeX
  symbols, and have GPT-4o rewrite it into CoT (p. 5, §3.1).
- GPT-4o reformats nearly all solutions: translation to English, CoT realignment, and boxing the answer,
  through the batch API (p. 7, §3.2). Olympiad PDFs go through the Mathpix OCR API and regex or manual
  segmentation (p. 7, §3.2).
- The synthetic sources use GPT-4 at temperature 0.8 and keep the first-stage solution without a
  verification pass. The authors say these are hard to validate (p. 5, §3.1; p. 12, §5).
- About 40% of the dataset is proof problems (p. 12, §5). Proofs have no single checkable answer.
- The dataset contains canary strings to detect training contamination (p. 12, §5).
- NuminaMath-TIR: about 100K CoT problems with a value answer, sampled with GPT-4o at temperature 0.8.
  Wrong samples are dropped, using exact match for integers and GPT-4o as judge for other expressions,
  and the remaining negatives are resampled (p. 7, §3.3).
- The report does not list field names or splits. The s1 code loads the `train` split of the Hugging Face
  dataset `AI-MO/NuminaMath-CoT` and reads `source`, `problem` and `solution`
  (`data/collect_data.py:133-142`). An s1K row's metadata also shows a `messages` list of role/content
  turns (`research/s1/raw/datasets/s1K.md:85`). These field names come from s1's files, not the report.

### Decontamination

- Two steps (p. 8, §3.4). First, 10-gram exact-match removal on all sources except synthetic and MATH train.
  Second, Mistral embeddings for every problem except MATH train and synthetic, removing anything within
  embedding distance 0.15 of an evaluation problem. The threshold was set empirically.
- Evaluation sets decontaminated against: MATH, GSM8K, AIME 2024 and AMC12 2023 (p. 8, §3.4).

### Evaluation protocol and metrics (NuminaMath models, for context)

- Benchmarks: GSM8K and MATH (accuracy, 0-shot), AMC 2023 (out of 40) and AIME 2024 (out of 30), both
  at 0-shot and maj@64 (p. 11, Tables 3 and 4).
- Answers are read from `\boxed{}` by a response parser that strips units and formatting. For AIMO the
  valid answers are integers 0 to 999, and -1 marks a failure (p. 9, §4.2).
- maj@n is self-consistency: sample n answers, drop ill-formed ones, take the majority (p. 10, §4.2.1,
  Algorithm 2). TIR runs up to k rounds of generate, execute Python, append output (p. 10, Algorithm 1).
- Reported 7B results: NuminaMath-7B CoT scores 55.8% on MATH and 0/30 on AIME 2024 (0-shot), 1/30
  at maj@64. The TIR variant scores 68.1% on MATH and 5/30 and 10/30 on AIME 2024 (p. 11, Table 3).

### Model details

- Not the s1 base model. NuminaMath-7B is DeepSeekMath-Base 7B and NuminaMath-72B is Qwen2-72B (p. 9, §4.1).
- Training: two stages (CoT, then TIR), global batch 32, learning rate 2e-5, cosine schedule, 8 to 32
  H100s, under 24 hours for both stages (p. 9, §4.1).
- Table 2 (p. 9): 7B CoT uses block size 2048, 3 epochs, warmup 0. 7B TIR uses 1024, 4 epochs, warmup 0.1.
  72B CoT uses 2048, 1 epoch (the text says 2), warmup 0.1. 72B TIR uses 2048, 3 epochs, warmup 0.1.
- The report gives no tokenizer or chat template.

### License

- The report states no license for the dataset or the report. The catalog records Apache-2.0 for the
  GitHub repo that hosts the PDF (`research/refs/catalog.tsv`). The Hugging Face dataset card for
  `AI-MO/NuminaMath-CoT` was not read here, so the dataset's own license is unconfirmed.

## Conflicts with s1

1. **Size and scope.** s1 calls NuminaMATH "30,660 mathematical problems from online websites"
   (main.tex L198, L803; C-21). The report describes 860K pairs from nine sources, most of them not
   websites: Chinese K-12 exam PDFs, GPT-4 synthetic problems, Orca-Math and olympiad PDFs (p. 4, Table 1;
   p. 6, Figure 3). s1 used a subset and does not say so. The s1 code keeps every aops_forum row plus
   non-aops rows that appear in `simplescaling/numinamath_500` or a hand-kept list (`collect_data.py:132-144`).
   The aops_forum bar in Figure 3 is about 30K, close to 30,660, so "online websites" fits the AoPS forum
   subset only. That 30,660 is aops_forum plus the 500-question subset after s1's own decontamination
   and deduplication is an inference. Neither the report nor s1 states it.
2. **Code comment vs report.** The s1 comment calls the dataset "Pretty big (434,778)" (`collect_data.py:414`).
   The report says 860K. The comment may count a filtered version (an older commented-out loader keeps
   cn_k12, aops_forum and olympiads, `:125-130`). This does not appear in s1's paper text.
3. **Internal inconsistency in the reference.** 860K (p. 1, p. 4) vs "nearly one million" (p. 2), and
   72B CoT trained 1 epoch (Table 2) vs 2 epochs (p. 9 text). Neither affects s1's numbers.

## Caveats for a local, under-8B, 8 GB replication

- The aops_forum solutions are GPT-4o rewrites of one forum reply chosen by LaTeX-symbol count (p. 5).
  s1 grades difficulty by comparing Qwen attempts to this reference solution with Claude 3.5 Sonnet (C-33).
  With only local models, a local judge must compare free-form answers against these noisy references.
  Expect more grading errors than s1 had, especially on proofs (about 40% of the dataset, p. 12).
- For a small pool, prefer rows whose answer has a boxed value. Proof rows end with a black square (p. 6)
  and cannot be checked by exact match. A local pipeline can filter on the presence of `\boxed{}`.
- The Numina authors already decontaminated against AIME 2024 and AMC12 2023 (p. 8). s1 adds its own
  8-gram pass against AIME 2022-2024, MATH500 and GPQA (C-29, M-07). Keep both. Numina did not
  decontaminate against GPQA, and its embedding step excluded synthetic and MATH-train rows.
- The amc_aime source (about 4,300 rows, p. 5) overlaps s1's separately added AIME 1983-2021 problems
  (C-22). s1's code drops most non-aops rows, so the overlap is small, but deduplicate if you widen the pull.
- Loading the whole `train` split (860K rows) to filter `source == "aops_forum"` needs disk and RAM, not
  GPU. Use streaming or a filtered download to keep it fast on one machine.
- NuminaMath-7B CoT reached only 0/30 on AIME 2024 (p. 11, Table 3). A model under 8B trained on this
  data alone should not be expected to score well on AIME24. s1's gains come from distilled reasoning
  traces, not from Numina's own solutions.
- Confirm the dataset license on the Hugging Face card before redistributing any subset.

Figure 3's counts are read off a bar chart, so they are approximate.
