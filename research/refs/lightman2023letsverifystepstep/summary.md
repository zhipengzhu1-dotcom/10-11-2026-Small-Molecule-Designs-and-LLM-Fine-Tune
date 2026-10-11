# Let's Verify Step by Step (Lightman et al., 2023)

Source: arXiv 2305.20050v1 (OpenAI, 31 May 2023). Read from
`research/refs/lightman2023letsverifystepstep/raw/2305.20050.pdf` (29 pages). Page numbers below
are the PDF's printed page numbers.

## What it is

OpenAI compares outcome-supervised and process-supervised reward models (ORMs and PRMs) on MATH,
using GPT-4 as the generator and the reward-model base. It releases PRM800K, about 800K human
step-level labels. To get enough training problems it moved 4,500 MATH test problems into training
and held out 500. That held-out set is the MATH500 that s1 evaluates on.

## Facts Tier 1 needs

### How MATH500 is defined

- The authors expanded the training set from the 7,500 MATH training problems to include 4,500
  MATH test-split problems, to avoid overfitting while labelling several solutions per problem
  (App. C, p. 18; §2.4, p. 4-5).
- They evaluate only on the remaining 500 held-out test problems (App. C, p. 18; §2.4, p. 5).
- The 500 problems were "selected uniformly at random" from the MATH test split (App. C, p. 18).
- Figure 5 shows that the 500-problem subset has the same distribution of difficulty levels and
  subjects as the full MATH test set (App. C, p. 18). The paper gives the figure, not a table of
  counts.
- The exact list of 500 problems is published at `github.com/openai/prm800k` (App. C, p. 18). The
  paper itself does not print problem IDs, a random seed or the selection code.
- The paper never uses the name "MATH500". It says "a representative subset of the MATH test set"
  (abstract, p. 1; §1, p. 2).
- So the training side has 12,000 problems (7,500 + 4,500) and the test side has 500. PRM800K's
  "12K problems" (§2.4, p. 4) is this training side.

### How answers are checked

- Correctness is determined "solely by checking the final answer", and the authors note that this
  "occasionally leads to misgraded solutions" (§2.4, p. 5).
- For evaluation they pick the reward model's top-ranked solution per test problem, "automatically
  grade it based on its final answer", and report the fraction correct (§2.1, p. 3).
- MATH problems "have automatically checkable answers", which is why outcome supervision needs no
  humans (§2, p. 3).
- The paper does not describe the grader: no normalization rules, no symbolic check, no code. It
  defers to MATH (Hendrycks et al.) for the dataset, and the grader would have to be read from the
  PRM800K repository. That repository was not read for this summary.
- Final-answer grading has false positives: solutions that reach the right answer with wrong
  reasoning count as correct (§2.5, p. 5; §4, p. 8).

### Evaluation protocol and metrics

- Headline metric: best-of-N. The generator samples N solutions per problem, the reward model picks
  one, and the score is the percent of the 500 problems whose picked solution has the correct final
  answer (§2.1, p. 3; Figure 3, p. 7).
- At N = 1860, the PRM solves 78.2%, the ORM 72.4% and majority voting 69.6% (Figure 3, p. 7).
- A PRM's solution score is the product of per-step probabilities of "correct", with neutral steps
  counted as positive. The other three scoring choices give 77.4% to 77.8% (App. F.2, Table 4,
  p. 20).
- Generator samples for the ORM are drawn at temperature 1.0 (App. E, p. 19). The paper gives no
  greedy or pass@1 number for the generator on the 500 problems.
- Small-scale experiments use best-of-500 and best-of-N with up to 200 labelled samples per problem
  (§4.1, Figure 4, p. 8-9).
- The OOD check uses recent AP Calculus, AP Chemistry, AP Physics and AMC10/12 questions with
  best-of-100 (§5, Table 1, p. 10). The text says 224 questions, but Table 1's counts sum to 234.

### PRM800K data format and sizes

- Labellers mark each step positive, negative or neutral (§2.4, p. 4; App. D, p. 19).
- Solutions are newline-delimited, one step per line, because the generator was fine-tuned for one
  epoch on that format (§2.3, p. 4).
- Raw collection: 1,085,590 step labels over 101,599 solutions. After removing quality-control
  items and incomplete tasks: about 800,000 labels over 75,000 solutions to 12,000 problems
  (App. B, p. 17; §2.4, p. 4).
- Phase 1 (about 5%, about 40K labels) labelled alternative completions per step. Phase 2 labelled
  whole solutions and stopped at the first negative step, over 10 generations of active learning
  (App. B, p. 17; App. D, p. 19).
- The active learning surfaces "convincing wrong-answer" solutions, so most phase-2 solutions are
  wrong. Only 14.2% of all solutions end correct (App. B, Table 3, p. 17).
- Labellers saw the ground-truth final answer but not the reference solution (App. D, p. 19).

### Model details

Not applicable to s1's base model. Large-scale models are fine-tuned from base GPT-4 with no RLHF.
Small-scale models are similar in design with about 200 times less pretraining compute. All are
further trained on MathMix, about 1.5B math tokens (§2.2, p. 3-4; App. A, p. 16).

### License

- The paper does not state a license for PRM800K or the 500-problem list. Check the
  `openai/prm800k` repository before redistributing either.
- The PDF is arXiv nonexclusive-distrib 1.0, so it stays gitignored (catalog row 24).

## Conflicts with s1

1. s1's description of MATH500 matches this paper. s1 says it evaluates "on the same 500 samples
   selected by OpenAI" (`main.tex` L269, C-56), and App. C (p. 18) confirms 500 test problems
   selected by OpenAI. s1 does not say they were drawn uniformly at random, and this paper does not
   call them "MATH500". Neither point is a conflict.
2. The training pool. s1 counts 11,999 MATH questions in its pool (`main.tex` L803, C-138) and cites
   Hendrycks. That number matches this paper's 12,000-problem training side, which contains 4,500
   original MATH test problems (App. C, p. 18), not the 7,500-problem Hendrycks train split. The
   cause is likely that `simplescaling/openaimath` train mirrors this split (`data/collect_data.py:119`);
   this is unconfirmed until the dataset card is read. This is a citation conflict, not a leak, since
   MATH500 is disjoint from the 12K by construction.
3. Grading. This paper grades by final answer with an automatic checker and states that it
   sometimes misgrades (§2.4, p. 5). s1's code grades MATH500 with a `gpt-4o-mini` judge for any
   non-integer answer (`openai_math/utils.py:255-300`; verification M-15). The two grading methods
   differ, and s1's paper discloses neither.
4. Algorithm 1 in s1 labels its MATH branch "Select correct MATH500 solutions with long chains"
   (`main.tex` L891). By this paper's definition MATH500 is the test set, so selecting from it would
   be contamination. The code actually selects from the training pool, so the comment is wrong
   (verification D-08, M-16).
5. s1's related-work text says PRMs "assess individual reasoning steps" (`main.tex` L637). That
   matches §2.6 (p. 5-6). No conflict.

## Caveats for a local, under-8B, 8 GB replication

- Pin the MATH500 problem list to the file in `openai/prm800k` (or a mirror with the same 500
  unique IDs) and record its hash. A re-sampled 500 from the MATH test split would not be MATH500.
- Do not compare a local greedy pass@1 score with this paper's 78.2%. That number is best-of-1860
  with a GPT-4 PRM. s1's Table 1 MATH500 scores are pass@1 (greedy), which is a different metric.
- If the fine-tuning pool uses the 12K training side, it contains 4,500 original MATH test
  problems. That is fine for MATH500, which is disjoint, but any evaluation on the full 5,000-problem
  MATH test set would then be contaminated.
- PRM800K itself is not needed for Tier 1 budget forcing. A PRM would only matter for a
  REBASE-style search baseline, and an 8 GB budget leaves no room to run a separate reward model
  next to the policy model.
- The paper's own grader is not described. Use a local rule-based grader implementing the MATH
  rules (see the Hendrycks summary), and expect some misgrading in both directions, as §2.4 warns.
