# s1 section notes

Paper: Muennighoff et al., "s1: Simple test-time scaling", arXiv 2501.19393v3. These notes summarize each
section in order and point to the claims in `claims.md`. Section numbers match the rendered paper.
Line numbers (`L123`) point into `research/s1/raw/arxiv/latex/main.tex`.

## Abstract and title block

The paper asks for the simplest recipe that gives both test-time scaling and strong reasoning. The recipe
has two parts. s1K is a set of 1,000 questions with distilled reasoning traces. Budget forcing is a decoding
rule that cuts thinking short or extends it by appending "Wait". Fine-tuning Qwen2.5-32B-Instruct on s1K gives
s1-32B. Claims C-01 to C-07.

## 1 Introduction

The authors frame o1 as the model that showed test-time scaling without publishing its method, and say no
open replication had shown a clear scaling curve. They summarize the recipe (traces distilled from Gemini,
26 minutes on 16 H100s, budget forcing) and preview the ablations. Each single-criterion data selection
loses about 30% on AIME24, and the 59K pool adds little over s1K. Figures 1 and 2 show the scaling curve and
the sample-efficiency plot. Claims C-08 to C-17.

## 2 Reasoning data curation to create s1K

### 2.1 Initial collection of 59K samples

The pool has 59,029 questions from 16 sources, chosen for quality, difficulty and diversity. NuminaMATH is
over half of it. The authors added two datasets of their own, s1-prob (Stanford statistics qualifying exams)
and s1-teasers (quant interview puzzles). Gemini Flash Thinking wrote a trace and solution for every
question. The pool was decontaminated against the three evaluation sets with 8-grams and deduplicated.
Claims C-18 to C-29.

### 2.2 Final selection of 1K samples

Three filters cut the pool to 1,000. Quality filtering removes API errors (54,116 left) and formatting
problems (51,581 left), and keeps 384 samples from trusted datasets as they are. Difficulty filtering drops
any question that Qwen2.5-7B-Instruct or Qwen2.5-32B-Instruct solves, as judged by Claude 3.5 Sonnet
(24,496 left), and uses trace length as a second signal. Diversity sampling picks a random MSC domain, then a
long-trace question within it, until it has 1,000 questions across 50 domains. Incorrect traces stay in.
The grader rates 53.6% of s1K and 63.0% of s1K-1.1 correct. Claims C-30 to C-40.

## 3 Test-time scaling

### 3.1 Method

The paper splits test-time scaling into sequential and parallel methods and studies sequential ones.
Budget forcing caps thinking by appending the end-of-thinking delimiter (optionally with "Final Answer:"),
and extends it by suppressing that delimiter and appending "Wait". Figure 3 shows "Wait" fixing a wrong
answer. The baselines are three prompt-based length controls (token, step and class) and rejection
sampling. Claims C-41 to C-46.

### 3.2 Metrics

Three metrics compare methods across a set of runs at different compute levels. Control is the share of
runs inside the compute bounds. Scaling is the mean pairwise slope of accuracy against thinking tokens.
Performance is the best accuracy. Figure 4 compares budget forcing on s1-32B (sequential) with majority
voting on the base model (parallel). Claims C-47 to C-52.

## 4 Results

### 4.1 Setup

s1-32B is Qwen2.5-32B-Instruct fine-tuned on s1K with PyTorch FSDP. Evaluation uses AIME24 (30 questions,
figures given as Asymptote code), MATH500 (OpenAI's 500-problem subset) and GPQA Diamond (198 questions),
built on lm-evaluation-harness with greedy decoding. The authors ran Gemini 2.0 Flash Thinking on AIME24
only, by hand in the web interface. Table 1 puts s1-32B at 56.7 / 93.0 / 59.6 and s1 without budget forcing
at 50.0 / 92.6 / 56.6 on AIME24 / MATH500 / GPQA. Other models' scores come from their reports.
Claims C-53 to C-71.

### 4.2 Performance

Budget forcing improves AIME24 until about six suppressions, after which the model loops. Majority voting on
the base model does not catch up. The authors call s1-32B the most sample-efficient open-data reasoning
model. r1-distill is stronger but uses 800 times more data, and s1-32B nearly matches its teacher, Gemini,
on AIME24. Figure 5 shows sample outputs. Claims C-72 to C-78.

## 5 Ablations

### 5.1 Data quantity, diversity, and difficulty

Table 2 compares s1K with three single-criterion 1K sets and with the full 59K pool, all budget-forced at
about 30,000 thinking tokens. Every 1K variant scores lower on AIME24, and 1K-diverse is worst at 26.7. The
59K model scores 53.3 against s1K's 50.0, inside a confidence interval that crosses zero, at 394 GPU hours
instead of 7. Claims C-79 to C-87.

### 5.2 Test-time scaling methods

Table 3 scores each method on AIME24. Budget forcing is the only method with 100% Control, positive Scaling
and the top Performance (56.7). Token-conditional control alone has negative scaling. Class-conditional
control has the best Scaling (25) but only two runs. Rejection sampling scales inversely (Figure 6), which the
authors explain by long samples being the ones where the model went wrong and backtracked. Table 4 shows
"Wait" is the best string to append. Claims C-88 to C-101.

## 6 Discussion and related work

### 6.1 Sample-efficient reasoning

The authors place s1 against RL-trained models (r1, k1.5) and SFT models trained on tens of thousands of
examples. They claim the first open reproduction of OpenAI's scaling curves, and explain the small-data
result with a hypothesis like LIMA's, that pretraining supplies the reasoning ability and SFT activates it. A
related-work paragraph lists benchmarks, training methods and prompting methods for reasoning.
Claims C-102 to C-105.

### 6.2 Test-time scaling

This part reviews parallel, sequential and tree-search methods and reward models. Budget forcing flattens
out and is bounded by the context window. Figure 7 tests parallel methods on top of a step-conditional
model. REBASE with a LLaMA-34B process reward model scales best, and at 512 steps 12 of 30 answers overflow
the context window. Claims C-106 to C-114.

## Impact statement and acknowledgements

The authors justify full openness by the opacity of o1 and r1. Ryan Marten generated the r1 traces for
s1.1. Claims C-115 and C-116.

## Appendix A: s1.1

s1.1 retrains on the same 1,000 questions with traces from DeepSeek r1 (s1K-1.1). Table 5 adds AIME 2025
and newer models. s1.1 without budget forcing scores 94.4 / 60.6 / 56.7 / 50.0 on MATH500 / GPQA / AIME24 /
AIME25, against 92.6 / 56.6 / 50.0 / 26.7 for s1. Claude 3.7 traces did worse than r1 traces.
Claims C-117 to C-127.

## Appendix B: Evaluation determinism

vLLM results change across runs with the same seed and greedy decoding, because of batch size, continued
generation and tensor-parallel settings. Long traces magnify one-token differences. Final evaluations run
in full precision. Claims C-128 to C-131.

## Appendix C: s1K details

C.1 (Table 6) breaks s1K down by domain. Geometry, number theory and combinatorics are the largest, and the
set has 4.7M tokens. C.2 (Table 7) lists all 16 sources of the 59K pool and notes that AIME 2022-2023 were held out
for development. C.3 gives the Claude grading prompt and says Claude 3.7 graded the final 1,000. C.4 gives
Algorithm 1, which first takes Gemini-correct AIME, GPQA and long MATH questions, then samples by domain with
weights of 2 to the minus rank by trace length. C.5 states the 8-gram decontamination rule.
Claims C-132 to C-146.

## Appendix D: Training details

This appendix has the hyperparameters a replication needs: 5 epochs, batch size 16, 315 steps, bfloat16,
learning rate 1e-5 with 16 warmup steps and cosine decay, AdamW (0.9, 0.95) with weight decay 1e-4, loss on
traces and answers only, and `<|im_start|>think` / `<|im_start|>answer` delimiters. D.1 (Table 8) shows that
training at 4,096 tokens truncates 74% of samples, lengthens test-time traces and lowers AIME24 from 50.0 to
30.0. D.2 shows three training samples. Claims C-147 to C-160.

## Appendix E: Test-time scaling details

E.1 gives the prompt formats and full results for the three conditional baselines (Tables 12 to 14) and
shows how each Control number in Table 3 was computed. The model cannot keep to token or step budgets
without forcing, and stretches each step when given fewer steps. E.2 (Table 15) shows one AIME24 question
that an earlier s1 model gets right under a 4,000-token cap and wrong under an 8,000-token cap.
Claims C-161 to C-181.

## Appendix F: Version control

v2 added citations. v3 added Appendix A and the share of correct samples. Claim C-182.

## Inconsistencies in the source

Found while reading. Each one names the claims it touches. Issue #9 should resolve them against the code
and data.

- D-01. §2.2 says s1K spans 50 domains (C-38). Table 6 labels its total row "All domains (51)" but lists 23
  named domains plus 27 others, which is 50 (C-134, C-135). The row counts do sum to 1,000.
- D-02. The Figure 6 caption gives five length caps and six try counts (C-100), so the counts cannot be
  matched to caps one to one.
- D-03. Table 5 prints r1's MATH500 score as "07.3" (L706). Table 1 gives 97.3 (C-70), so this is a typo.
- D-04. Table 5 and Table 1 disagree on the same models' AIME24 scores: QwQ-32B is 46.7 against 50.0, and
  r1-distill-Qwen-32B is 58.3 against 72.6 (C-69, C-70, C-127). Neither caption explains the difference.
- D-05. Table 1's s1-32B row (56.7 / 93.0 / 59.6, C-64) matches no single budget-forcing setting in Table 5.
  The AIME24 score matches "Wait" 4x, and the MATH500 and GPQA scores match "Wait" 2x (C-124). This is an
  inference from the two tables; the paper does not say how the row was built.
- D-06. The abstract's "up to 27%" over o1-preview (C-05) matches the relative AIME24 gain, 56.7 / 44.6 =
  1.27. The absolute gain is 12.1 points. This is my arithmetic, not a statement in the paper.
- D-07. §1 says single-criterion selections lose "around 30%" on AIME24 on average (C-14). Table 2's drops are
  13.3, 23.3 and 16.7 points, a mean of 17.8 points, or 36% relative to s1K's 50.0 (C-82 to C-84).
- D-08. Algorithm 1's comment says it keeps "correct MATH500 solutions" (L891), but its condition tests for
  MATH questions, and MATH500 is an evaluation set the pool was decontaminated against (C-29, C-143).
- D-09. §2.2 says 384 samples come straight from trusted datasets (C-32). Algorithm 1 describes the rule
  but the paper never ties it to 384, so the number cannot be checked from the paper alone.
- D-10. The decontamination section spells GPQA as "GPTQA" (L925). "More than an 8-gram overlap" does not
  say whether one shared 8-gram is enough to drop a question (C-146).
- D-11. In §5.2 the bold lead-in "Class-conditional control" (L596) introduces findings about all three
  conditional methods, not only the class-conditional one.
- D-12. The rejection-sampling example in Table 15 needed 199 tries for the 4,000-token cap (C-180), while
  Figure 6 gives 97 or 655 tries near that cap (C-100). Table 15 uses an earlier model version, which may
  explain it.

Two numbers check out by arithmetic. Training 26 minutes on 16 GPUs is 6.9 GPU hours, which matches the 7
H100 hours in §5.1 (C-11, C-86). 1,000 samples at batch size 16 is 63 steps per epoch, and 5 epochs is 315
steps (C-149).
