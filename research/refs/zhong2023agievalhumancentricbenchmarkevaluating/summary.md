# AGIEval (zhong2023agievalhumancentricbenchmarkevaluating)

Zhong et al., "AGIEval: A Human-Centric Benchmark for Evaluating Foundation Models", arXiv 2304.06364v2
(18 Sep 2023). Read from `research/refs/zhong2023agievalhumancentricbenchmarkevaluating/raw/2304.06364.pdf`.
Page numbers are the printed page numbers of that PDF.

## What it is

A bilingual (English and Chinese) benchmark of 8,062 objective questions from admission and qualification
exams: Gaokao, SAT, LSAT, LogiQA, JEC-QA, AQuA-RAT and MATH. The authors test GPT-4, ChatGPT,
Text-Davinci-003 and Vicuna-13B on it. s1 does not evaluate on AGIEval. It takes 2,385 AGIEval
questions into its 59K training-question pool (main.tex L198, Table 7 L807).

## Facts Tier 1 needs

### Data format, splits and sizes

- The benchmark has 20 tasks and 8,062 questions (p. 6, §3.3.1; Table 1, p. 7).
- It keeps only objective questions, multiple-choice and fill-in-the-blank, and drops all subjective
  ones (p. 6, §3.3.1).
- English tasks and test sizes (Table 1, p. 7): SAT-En 206, SAT-Math 220, LSAT-AR 230, LSAT-LR 510,
  LSAT-RC 260, LogiQA-en 651, AQuA-RAT 254, MATH 1,000. Their sum without MATH is 2,331.
- Chinese tasks (Table 1, p. 7): nine Gaokao tasks (1,880 questions in total), JEC-QA-KD 1,000, JEC-QA-CA 1,000
  and LogiQA-zh 651. LogiQA-en is a translation of the Chinese original (p. 6, §3.3.1).
- Average question length is 40 to 935 tokens per task. SAT-En is 656 and LSAT-RC is 581 because they
  carry a reading passage. MATH is 40 (Table 1, p. 7). The paper does not name the tokenizer.
- Sources (p. 6, §3.3.1). The authors collected Gaokao and SAT questions online with their solutions.
  LSAT comes from Wang et al. 2022 and Zhong et al. 2022 and covers exams from 1991 to 2016. LogiQA covers
  the Chinese civil service exam. AQuA-RAT supplies the GRE and GMAT questions. MATH supplies AMC and AIME.
- The authors down-sampled JEC-QA and MATH to 1,000 questions each (p. 6, §3.3.1). The paper does not
  say how it sampled MATH or whether it kept difficulty levels.
- Few-shot examples (p. 9, §4.2.4). For AQuA-RAT, LogiQA and LSAT the authors sampled 5 medium-length
  examples from the training set. For Gaokao and SAT they sampled 5 and removed them from the test set.
  For JEC-QA the first 1,000 training rows form the test set. MATH uses the Lewkowycz et al. 2022 examples.
- CoT demonstration sources (p. 9, §4.2.4). AQuA-RAT and MATH rationales come from the original datasets.
  Experts annotated the Gaokao and SAT explanations. ChatGPT wrote the LogiQA, JEC-QA and LSAT explanations.
- The release (footnote 2, p. 1) is github.com/ruixiangcui/AGIEval. Its `data/v1_1/*.jsonl` rows have
  `passage`, `question`, `options`, `label` and `other.solution` (checked by `gh api`, sat-math.jsonl).
  This record format is from the repo, not the paper.

### Evaluation protocol and metrics

- Multiple-choice tasks use accuracy. Fill-in-the-blank tasks use exact match (EM), and §3.3.2 also lists
  F1 (p. 6, §3.3.2; p. 9, §4.2.3).
- There are four settings: zero-shot, few-shot (5 examples), zero-shot CoT and few-shot CoT (p. 8, §4.2.1;
  Fig. 2).
- Zero-shot CoT takes two calls. The first prompt is "[question] Let's think step by step:" and the
  second is "[question] Explanation is: [explanation]. The answer is:". Few-shot CoT writes the
  explanation and answer in one pass (p. 8 to 9, §4.2.2).
- Decoding is greedy (temperature 0), with at most 2,048 new tokens, top_p 1 and frequency penalty 0.
  ChatGPT and GPT-4 run through the Azure chat-completion API. Few-shot ChatGPT and Text-Davinci-003
  run through the completion API (p. 9, §4.2.4).
- The paper gives no answer-extraction rule or parser. The released repo holds the parsing code.
- Each human baseline is the average (50th percentile) or top (1%) test-taker's score, rescaled to 100.
  MATH, LogiQA and JEC-QA baselines come from their original papers (p. 6, §3.3.3).
- Headline results, GPT-4 zero-shot CoT (Table 2, p. 10): SAT-Math 95.0, MATH 47.7, AQuA-RAT 73.2,
  LSAT-AR 34.4, average 58.4. Vicuna-13B zero-shot reaches MATH 6.8 and SAT-Math 24.6 (Table 4, p. 10).
- Contamination (App. B, p. 20 to 22; Table 5). GPT-4 drops on Gaokao questions from after 2022, most
  sharply in math. Gaokao-MathQA falls from 47% to 29.8% and Gaokao-mathcloze from 16.1% to 4%.

### Model details

- Not applicable. AGIEval is a benchmark and has no base model. The evaluated models are API models plus
  Vicuna-13B (p. 7, §4.1).

### License

- The paper states no license. The catalog records arXiv nonexclusive-distrib 1.0 for the PDF.
- The repo's code is MIT. `data/v1_1/LICENSE` gives a license per source. Gaokao, SAT, LSAT and MATH are
  MIT. AQuA-RAT is Apache-2.0. LogiQA is CC BY-NC-SA 4.0. JEC-QA is for academic research only, with
  commercial use prohibited (checked by `gh api`, not in the paper).

## Conflicts with s1

1. **Subject coverage (C-25, main.tex L198).** s1 says its AGIEval questions cover "English, Law, and
   Logic". AGIEval's English tasks also include SAT-Math, AQuA-RAT and MATH (Table 1, p. 7). s1's
   loader takes `sat_math`, `aqua_rat` and `math_agieval` level 5 (`data/collect_data.py:215-236`).
   s1's own Table 7 (L807) adds "Math", so §2.1 contradicts Table 7. This repeats M-17.
2. **Count of 2,385 (C-25, L198, L807).** The seven English non-MATH tasks have 2,331 test questions
   (Table 1, p. 7). s1's loader also concatenates each config's `few_shot` split (5 per task by
   §4.2.4, so 35 rows) and MATH level 5 rows. That leaves 19 rows for MATH level 5 if nothing was
   dropped. A 1,000-question MATH sample would usually have more level-5 questions than 19, so s1 likely
   dropped rows in dedup or filtering, or the `baber/agieval` mirror's splits differ from the paper.
   INCONCLUSIVE. The HF dataset viewer cannot read `baber/agieval` because it needs `trust_remote_code`.
3. **Citation of JEC-QA (Table 7, L807).** s1 cites JEC-QA (zhong2019jecqa) for its AGIEval rows.
   JEC-QA is a Chinese-language AGIEval task (Table 1, p. 7). s1's loader takes no JEC-QA, Gaokao or
   LogiQA-zh config. Only the English tasks enter the pool.
4. **How s1 describes AGIEval (main.tex L633, C-105).** s1 lists AGIEval among "Olympiad-level science
   competitions". AGIEval consists of admission and qualification exams such as Gaokao, SAT, LSAT,
   bar and civil-service exams. Only its MATH task (AMC and AIME) is competition material (p. 5, §3.2).
5. **Domain labels (`collect_data.py:216`).** s1 tags `logiqa` as "math" and the three LSAT tasks as
   "english". AGIEval files LogiQA under Logic and LSAT under Law (Table 1, p. 7). This matters only if
   the `cot_type` label feeds a later step.

AGIEval also contradicts itself in two places. §3.3.1 (p. 6) says JEC-QA is the civil-service source,
while Table 1 puts JEC-QA under the lawyer qualification test and LogiQA under civil service. §3.3.2
lists F1 for cloze questions, but §4.2.3 and Tables 2 and 3 report one score per task.

## Caveats for a local, under-8B, 8 GB replication

- AGIEval is a training-pool source in s1, not an evaluation set. A Tier 1 run that fine-tunes on the
  released s1K or s1K-1.1 needs no AGIEval download. It matters only when rebuilding the 59K pool.
- Rebuilding the pool needs a reasoning trace per question. s1 used the Gemini Flash Thinking API
  (main.tex L202). The local-only rule rules that out, so a local open model would write the traces.
  The trace quality would then differ from s1's.
- `baber/agieval` loads through a dataset script and needs `trust_remote_code=True`, which runs remote
  code. Prefer the official `data/v1_1/*.jsonl` files and treat them as untrusted data.
- Training rows from LogiQA carry CC BY-NC-SA 4.0. Any derived dataset or model inherits the
  non-commercial and share-alike terms.
- AGIEval questions are short. SAT-En is the longest English task at 656 tokens (Table 1, p. 7), and
  s1 measured 1.2K tokens of average thinking per AGIEval question (Table 7, L807). These rows fit
  within a small context and cost little memory compared to the 4K-token math traces.
- Answers are mostly A to E letters (`label`). The `other.solution` field exists only for some
  sources, such as SAT. Check which field s1's `solution` column holds before using it as a target.
- Under 8B, expect low AGIEval math scores. Vicuna-13B scored 6.8 on MATH (Table 4, p. 10). This
  matters only if AGIEval is added as an extra evaluation.
- The data has been public since 2023, so a recent small base model may have seen it in pretraining.
  This matters only for evaluation, not for training on it.
