# r1: DeepSeek-R1 (arXiv 2501.12948)

Source read: `research/refs/r1/raw/2501.12948.pdf`. It is v2, dated 4 Jan 2026, the Nature-style version with a long supplement. s1 cites the 2025 version. Page numbers below are v2's printed page numbers. Sections A to J are the supplementary appendices.

## What it is

DeepSeek-R1 is a 671B-parameter mixture-of-experts reasoning model built from DeepSeek-V3-Base. Its training runs GRPO reinforcement learning, cold-start SFT, a second SFT round on about 800K samples, and a second RL stage. The paper also releases six "R1-Distill" models: Qwen and Llama bases fine-tuned with SFT only on the same 800K samples. R1 matters to s1 in three ways. It wrote the s1K-1.1 traces. It is a comparison row in Tables 1 and 5. Its small distilled models are candidate bases or baselines for an under-8B run.

## Facts Tier 1 needs

### Data (the 800K SFT set that the distilled models were trained on)
- About 600K reasoning samples, made by rejection sampling from the first-stage RL checkpoint. Only correct responses were kept. CoTs with mixed languages, long paragraphs or code blocks were removed. DeepSeek-V3 judged some answers against the reference in place of rule-based checks (p. 26, §B.3.3).
- About 200K non-reasoning samples, covering writing, factual QA, translation and software engineering (p. 26, §B.3.3).
- Totals: 804,745 samples with a mean of 5,355 tokens. Math has 395,285 samples at a mean of 6,094 tokens. Code has 211,129 samples at 7,436 tokens (p. 27, Table 5).
- Math SFT data and RL prompts come only from pre-2023 competitions. They were 10-gram decontaminated against eval questions and reference solutions (p. 40, §D.1).
- Trace format: the thinking sits inside `<think> ... </think>`, followed by a clean written solution that ends in `\boxed{}` (p. 28, Listing 5). R1-Zero used a plain-text template with `<think>` and `<answer>` tags (p. 3, Table 1).
- The paper says the SFT and RL data are "released at xxx" and were attached for review only (p. 66, §I). No public link is given.

### Distilled models (Table 6, p. 35, §B.4.3)
| Distilled model | Base | Initial LR |
|---|---|---|
| R1-Distill-Qwen-1.5B | Qwen2.5-Math-1.5B | 1e-4 |
| R1-Distill-Qwen-7B | Qwen2.5-Math-7B | 8e-5 |
| R1-Distill-Qwen-14B | Qwen2.5-14B | 7e-5 |
| R1-Distill-Qwen-32B | Qwen2.5-32B | 6e-5 |
| R1-Distill-Llama-8B | Llama-3.1-8B | 5e-5 |
| R1-Distill-Llama-70B | Llama-3.3-70B-Instruct | 2e-5 |

- Training runs 2 to 3 epochs. A cosine schedule decays the LR to one tenth of its initial value. Maximum context is 32,768 tokens and batch size is 64 (p. 35, §B.4.3).
- The distilled models get SFT only, with no RL stage (p. 60, §F).
- The paper does not give the distilled models' tokenizer or chat template. They inherit both from their Qwen and Llama bases.

### Teacher model (R1)
- MoE with 671B total and 37B active parameters (p. 41, Table 8; p. 13, §A.1).
- Output is capped at 32,768 tokens per benchmark (p. 40, §D.1).
- On 2024 math competition problems, R1 averages 8,793 thinking tokens. Easy problems use fewer than 7,000 and the hardest more than 18,000 (p. 59, §E.4, Fig. 18).

### Evaluation protocol (p. 40-41, §D.1)
- Sampling uses temperature 0.6 and top-p 0.95, with a maximum generation length of 32,768 tokens.
- pass@1 is the mean correctness over k samples per question. k is 64 for AIME and GPQA, 16 for MATH and Codeforces, and 8 for LiveCodeBench. AIME 2024 also reports cons@64 (majority vote).
- The paper's reason is that greedy decoding on long-output reasoning models causes more repetition and more variation between checkpoints.
- The math prompt is the question followed by "Please reason step by step, and put your final answer within \boxed{}." The grader parses `\boxed{}`, applies a rule-based check, and uses SymPy for expressions. The same format covers AIME, MATH and CNMO (p. 78, Table 32).
- GPQA uses a zero-shot multiple-choice prompt whose last line must be "ANSWER: $LETTER". The grader parses that letter (p. 76, Table 29).
- Few-shot prompting hurts R1, and the paper recommends zero-shot (p. 11, §6).

### Reported scores used by s1
- R1 scores AIME 2024 79.8, MATH-500 97.3 and GPQA Diamond 71.5 (p. 41, Table 8).
- Distilled models, as AIME24 / MATH-500 / GPQA (p. 61, Table 15):
  - Qwen-1.5B: 28.9 / 83.9 / 33.8
  - Qwen-7B: 55.5 / 92.8 / 49.1
  - Llama-8B: 50.4 / 89.1 / 49.0
  - Qwen-14B: 69.7 / 93.9 / 59.1
  - Qwen-32B: 72.6 / 94.3 / 62.1
  - Llama-70B: 70.0 / 94.5 / 65.2
- On AIME 2024, R1 scores 90.0 at pass@64, and majority voting lifts it from 79.8 to 86.7 (p. 60, §E.4).

### License
- The R1 model is under the MIT License (p. 43, §D.2).
- The paper does not state licenses for the distilled models. Their Qwen2.5 and Llama 3.x bases have their own terms.
- The arXiv PDF has the arXiv non-exclusive license (catalog.tsv), so it stays gitignored.

## Conflicts with s1

1. Distilled-model AIME 2024 scores in s1 Table 5. s1 (main.tex L707-709, C-127) gives 57.1 for r1-distill-Llama-70B, 61.7 for r1-distill-Qwen-14B and 58.3 for r1-distill-Qwen-32B. The caption (L690) says these come from "the respective reports", with only AIME 2025 taken from elsewhere. R1 Table 15 (p. 61) gives 70.0, 69.7 and 72.6. s1's own Table 1 (L295) uses 72.6 for r1-distill. The MATH500 and GPQA cells in those rows match R1. The AIME 2024 numbers in s1 Table 5 for the distilled models do not come from the R1 report.
2. s1 Table 5 gives r1's MATH500 as "07.3" (main.tex L706). R1 reports 97.3 (p. 41, Table 8). This is a typo, already logged as D-03.
3. "800 times more reasoning samples" (C-76, main.tex L354). The 800K set holds about 600K reasoning samples and about 200K non-reasoning samples (p. 26, §B.3.3; p. 27, Table 5). Against s1's 1K, that is about 600x for reasoning samples and 800x for all samples.
4. Minor, consistent: "r1-distill 800K" and "r1 ≫800K" (C-70, L294-295) match. The distilled models train on the 800K set (p. 35), and R1 adds cold-start data and two RL stages (p. 6, Fig. 2).
5. Minor simplification: s1 calls R1 an RL model (C-102 L631, L170). R1's pipeline also has two SFT stages (p. 6, §3). Only R1-Zero uses RL alone.

Version note: the Table 8 and Table 15 scores in v2 are the same ones s1 Table 1 uses, so the version difference does not explain conflict 1.

## Caveats for a local, under-8B, 8 GB replication

- s1 Table 1 compares models scored under different protocols. The r1 rows average 64 samples at temperature 0.6 with 32K-token outputs (p. 40). The s1 rows use greedy decoding (C-60), partly graded by a gpt-4o-mini judge (M-15). R1 reports that greedy decoding causes repetition on long outputs (p. 40), which is the same looping s1 reports when "Wait" is forced too often (C-73).
- R1's math grader is rule-based: it parses `\boxed{}` and checks expressions with SymPy (p. 78). It runs locally, so it fits the first tier of the grading plan (#11), unlike s1's gpt-4o-mini grader.
- R1-Distill-Qwen-1.5B and -7B are the only R1 models under 8B. Llama-8B is at the limit. The two Qwen distills sit on Qwen2.5-Math bases, not the Instruct bases that s1 uses (p. 35, Table 6).
- Fine-tuning an R1-Distill model on s1K-1.1 is not a 1K-sample experiment, because the model has already seen about 800K R1 traces. To test s1's sample-efficiency claim, start from a plain Qwen2.5-Instruct model of the same size. Use R1-Distill-Qwen-7B (55.5 / 92.8 / 49.1, p. 61) as an upper reference point.
- R1 traces are long. R1 averages about 8.8K thinking tokens on hard 2024 problems (p. 59), and math SFT samples average 6.1K tokens (p. 27). s1.1 trained with block_size 20,000 (verification C-117). At that length, a full 7B fine-tune will not fit in 8 GB. Expect to need LoRA or QLoRA, gradient checkpointing and probably a shorter block size. s1 reports that a shorter training length makes the model think longer at test time (C-158), so cutting the block size changes the behavior being measured.
- R1's protocol, 64 samples of up to 32K tokens per AIME question, is too expensive for one GPU. Any local number quoted next to an R1 number should state its own k, temperature and token cap.
- The R1 SFT data is not public (p. 66). A local run can use the distilled models but cannot rebuild them.
- R1 traces use `<think>` tags, while s1 trains with Qwen `<|im_start|>think` and `<|im_start|>answer` delimiters (C-148). Check how s1's code wraps `deepseek_thinking_trajectory`, so that the end-of-thinking delimiter used by budget forcing stays consistent.
