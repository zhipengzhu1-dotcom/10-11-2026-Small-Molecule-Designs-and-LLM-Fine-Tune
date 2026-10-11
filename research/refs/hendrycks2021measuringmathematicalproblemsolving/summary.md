# MATH (Hendrycks et al., 2021)

Source: arXiv 2103.03874v2, NeurIPS 2021 Datasets and Benchmarks track. Read from
`research/refs/hendrycks2021measuringmathematicalproblemsolving/raw/2103.03874.pdf` (22 pages).
Page numbers below are the PDF's printed page numbers.

## What it is

MATH is a set of 12,500 competition math problems, each with a LaTeX step-by-step solution and a
final answer inside `\boxed{}`. The paper also releases AMPS, a 23 GB math pretraining corpus. s1 uses
MATH twice. The 500-problem MATH500 test subset is one of its three benchmarks, and MATH problems are
one source of the 59K question pool (Table 7).

## Facts Tier 1 needs

### Data format, splits and sizes

- 12,500 problems: 7,500 train and 5,000 test (p. 4, §3.1).
- Sources are competitions such as AMC 10, AMC 12 and AIME, many collected from AoPS (p. 4, §3.1).
- Seven subjects: Prealgebra, Algebra, Number Theory, Counting and Probability, Geometry,
  Intermediate Algebra, Precalculus (p. 4, §3.1).
- Difficulty levels 1 to 5, following AoPS. Early AMC 8 problems are often level 1 and AIME problems
  are level 5 (p. 4, §3.1).
- Problems and solutions are LaTeX. Figures are Asymptote code, not images (p. 4, §3.1; App. A.3,
  Figure 7, p. 14). A text-only model can therefore read every problem.
- Each problem has a full step-by-step solution and a final boxed answer (p. 4, §3.1; Figure 1, p. 2).
- The paper does not list JSON field names. s1's loader reads `problem`, `solution`, `answer` and
  `subject` from `simplescaling/openaimath` (`eval/.../openai_math/utils.py:202-217`,
  `data/collect_data.py:119-120`). That copy has a separate `answer` field that the original paper
  does not describe.

### Answer format and how answers are checked

- The model's answer is the content of the last `\boxed{}` in its output. The grader parses what is
  inside the box and compares it with the ground-truth answer (p. 5, §3.1, "Automatically Assessing
  Generated Answers").
- The comparison is exact match after normalization, and accuracy is the primary metric
  (p. 5, §3.1).
- Ground-truth answers follow fixed formatting rules so that exact match works (p. 5, §3.1):
  - probabilities are simplified fractions;
  - matrix-entry fractions are `x/y`, all other fractions are `\frac{x}{y}`;
  - coefficients have no multiplication sign (`5x`, not `5*x`);
  - multi-variable expressions are in alphabetical order, polynomials in decreasing degree.
- The checker treats these as equal (p. 5, §3.1):
  - `\frac`, `\dfrac` and `x/y`;
  - `\left(` and `(`;
  - answers with or without units;
  - strings that differ only in spaces;
  - common equivalent numbers such as 0.5 and 1/2, or 0.1 and .1;
  - the factors of a factorized polynomial in any order.
- The paper says these rules cover "nearly all" real equivalences (p. 5). They are string rules,
  not symbolic equivalence, and no model judge is involved.

### Evaluation protocol in the paper (baselines, not s1's setup)

- GPT-2 models use HuggingFace default generation with beam search, beam 20 for the final answer
  only and beam 10 for full solutions. The default prompt is `P Final Answer:` (p. 6, §4.1).
- GPT-3 few-shot uses 8 solved examples (answers only), temperature 0 and up to 20 answer tokens
  (p. 7, §4.1).
- Fine-tuning mixes `P Final Answer: <Answer>` and `P Full Solution: <Solution>` sequences equally
  (p. 6, §4.1).
- Reported accuracies are 3.0% to 6.9% for GPT-2 and GPT-3 (p. 2; Table 2, p. 5). GPT-2 1.5B gets
  about 15% at level 1 and about 4% at level 5 (p. 8, §4.2).
- In a human check on 20 random test problems (1 hour, no calculator), scores ranged from 40% to
  90%, the top score from a three-time IMO gold medalist (p. 5, §3.1; App. A.6, p. 15).
- The paper defines no pass@k or sampling-based metric. All results are single-answer accuracy.

### Model details

Not applicable. The paper's models are GPT-2 (0.1B to 1.5B), GPT-3 (13B, 175B) and BART-Large
(p. 6, §4.1; App. A.5, p. 14-15). None is s1's base model.

### License

- The MATH data, AMPS data and code are under an MIT license (App. B, "Author Statement and
  License", p. 22).
- The problems come from the MAA. The authors argue that research reuse is fair use (App. B,
  p. 17, 22).
- The PDF itself is arXiv nonexclusive-distrib 1.0, so it stays gitignored (catalog row 23).
- The paper gives the dataset link as `github.com/hendrycks/apps` (App. B, p. 22). That is the
  URL of the authors' code-generation benchmark (APPS), so the link looks wrong. Do not take the
  data location from this sentence.

## Conflicts with s1

1. Table 7 MATH count. s1 lists MATH with 11,999 questions and cites this paper (`main.tex` L803,
   C-138). This paper's train split has 7,500 problems (p. 4, §3.1), and the full set has 12,500.
   The 11,999 count matches the 12,000-problem training set from Lightman et al. (7,500 train plus
   4,500 test problems; `lightman2023letsverifystepstep` App. C, p. 18). s1's code loads the
   `simplescaling/openaimath` train split (`data/collect_data.py:119`). The likely reading, not yet
   confirmed from the dataset card, is that s1's MATH pool is the PRM800K 12K split, which includes
   4,500 original MATH test problems. The Hendrycks citation describes a different split.
2. How answers are checked. This paper scores MATH by extracting the boxed answer and applying
   rule-based exact match (p. 5, §3.1). s1 says only that it measures accuracy (`main.tex` L269,
   C-60). Its code takes the last `\boxed{}` or an `Answer:` line, then sends every non-integer
   answer to `gpt-4o-mini` at temperature 0.5 to pick a matching option. It raises an error if no
   `PROCESSOR` is set (`openai_math/utils.py:255-259, 276-300`; verification M-15). s1's MATH500
   numbers therefore come from a model judge, not from the MATH paper's checker.
3. Benchmark naming. s1 calls MATH500 "a benchmark of competition math problems of varying
   difficulty" and cites this paper for it (`main.tex` L269, C-56). This paper defines no
   500-problem subset. The subset comes from Lightman et al. (see that summary). s1 cites both
   papers in the same sentence, so this is a loose attribution rather than an error.

## Caveats for a local, under-8B, 8 GB replication

- Grade rule-based first. s1's MATH grader needs the OpenAI API and refuses to run without
  it. The rules on p. 5 are the reference definition. Implement them, or use a published
  implementation of them. Per the tiered plan (#11), only answers the rules cannot settle go to a local model and then to Claude as judge. Record which tier graded each answer, because scores
  from string rules and from a model judge are not comparable.
- A string-rule grader is stricter than s1's `gpt-4o-mini` judge. It marks some equivalent answers
  wrong, for example `\sqrt{8}` against `2\sqrt{2}`, or `1+x` against `x+1`. Expect lower MATH500 scores than a
  judge would give, and log the misses so grader errors can be found by hand.
- The model must put its final answer in `\boxed{}`. s1's prompt is the bare question with no
  boxing instruction (`openai_math/utils.py:11-21`), and s1's grader also accepts `Answer:` lines.
  A small model that skips the box loses points under the MATH checker.
- Contamination. MATH500 is a subset of this paper's 5,000-problem test split. If the fine-tuning
  pool uses the 12K split (7,500 train plus 4,500 test), it must still exclude the 500 MATH500
  problems. Matching problem IDs is safer than s1's 8-gram filter (C-29). Never train on the full
  5,000-problem test split.
- Every problem carries a level and a subject. Report MATH500 accuracy by level as well as overall,
  since a sub-8B model will score far lower on level 5 than on levels 1 to 3.
- Geometry problems with Asymptote code are long. They raise prompt length, which matters under an
  8 GB KV-cache budget.
