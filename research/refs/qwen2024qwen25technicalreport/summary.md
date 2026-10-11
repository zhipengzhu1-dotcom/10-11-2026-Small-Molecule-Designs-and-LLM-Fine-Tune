# Qwen2.5 Technical Report (qwen2024qwen25technicalreport)

Source: arXiv 2412.15115v2 (3 Jan 2025), read from `raw/2412.15115.pdf`. Page numbers are the printed
page numbers, which match the PDF page index.

## What it is

The Qwen Team's report on the Qwen2.5 family: dense open-weight models at 0.5B, 1.5B, 3B, 7B, 14B, 32B and
72B, each as a base and an Instruct model, plus two API-only MoE models (p. 1-2). s1 fine-tunes
Qwen2.5-32B-Instruct and uses Qwen2.5-7B-Instruct and 32B-Instruct as the difficulty filter (main.tex L211,
L931). The report gives architecture, pre-training and post-training recipes, and benchmark tables. It
releases no data.

## Facts Tier 1 needs

### Model details (p. 2-3, §2, Table 1)

| Model | Layers | Heads Q / KV | Tied embeddings | Context / generation | License |
|---|---:|---|---|---|---|
| 0.5B | 24 | 14 / 2 | Yes | 32K / 8K | Apache 2.0 |
| 1.5B | 28 | 12 / 2 | Yes | 32K / 8K | Apache 2.0 |
| 3B | 36 | 16 / 2 | Yes | 32K / 8K | Qwen Research |
| 7B | 28 | 28 / 4 | No | 128K / 8K | Apache 2.0 |
| 32B (s1's base) | 64 | 40 / 8 | No | 128K / 8K | Apache 2.0 |
| 72B | 80 | 64 / 8 | No | 128K / 8K | Qwen |

- All dense sizes share one architecture: decoder-only Transformer with GQA, SwiGLU, RoPE, QKV bias and
  pre-norm RMSNorm (p. 2-3, §2).
- Tokenizer: byte-level BPE with 151,643 regular tokens and 22 control tokens. The report says the
  vocabulary is the same across all Qwen2.5 models (p. 3, §2). So a Qwen2.5 model under 8B tokenizes text
  the same way as the 32B model s1 used for its length counts (main.tex L211, L798).
- Non-embedding parameters: 6.5B for 7B (p. 10, §5.1) and 2.8B for 3B (p. 12, Table 9). The report gives no
  exact totals for any size, and no hidden sizes.
- Context: pre-training runs at 4,096 tokens, then extends to 32,768 tokens in the last stage for all open
  models, with RoPE base raised from 10,000 to 1,000,000 (p. 4, §3.3). The 128K figure for 7B and up relies
  on YARN plus Dual Chunk Attention at inference (p. 4, §3.3). Tables 16 and 17 say YARN+DCA does not change
  behavior within 32K tokens (p. 17).
- Generation length: the Instruct models are trained to produce up to 8,192 output tokens (p. 2, §1; p. 5,
  §4.1(1)).
- Chat template: not described. The report never mentions ChatML or `<|im_start|>`. It only says the control
  token set grew from 3 to 22 (p. 3, §2).

### How the Instruct models were post-trained (p. 4-7, §4)

- SFT on over 1 million examples, including Qwen2.5-Math chain-of-thought data built by rejection sampling
  (p. 5, §4.1(2)). Two epochs at sequence length 32,768, learning rate decayed from 7e-6 to 7e-7, weight
  decay 0.1, gradient clip 1.0 (p. 6, §4.1).
- Offline RL: DPO on about 150,000 pairs drawn from math, coding, instruction-following and logic, one epoch
  at learning rate 7e-7 (p. 6, §4.2).
- Online RL: GRPO with 8 responses per query, global batch 2,048 (p. 7, §4.3).
- The models s1 starts from, and any under-8B Instruct substitute, have therefore already been through math
  CoT SFT and math-focused preference training.

### Evaluation protocol (p. 7-13, §5)

- Decontamination: a training sequence is dropped if its longest common subsequence with any test sequence
  is at least 13 tokens and at least 0.6 of the shorter sequence's length (p. 7, §5).
- Base models: MATH 4-shot, GSM8K 4-shot, GPQA 5-shot, TheoremQA 5-shot (p. 8, §5.1).
- Instruct models: evaluated on MMLU-Pro, MMLU-redux, LiveBench 0831, GPQA, GSM8K, MATH, HumanEval, MBPP,
  MultiPL-E, LiveCodeBench 2305-2409 and IFEval (strict-prompt) (p. 11, §5.2.1). The report states no shot
  count, decoding settings, answer extraction or GPQA subset for the Instruct evaluations.
- The report has no AIME, MATH500 or GPQA Diamond numbers. Its "MATH" is the MATH benchmark of Hendrycks
  et al., not the 500-problem subset s1 uses.

### Instruct models under 8B against 32B-Instruct (Tables 6-10, p. 11-13)

| Instruct model | MATH | GSM8K | GPQA | MMLU-Pro | LiveCodeBench | Source |
|---|---:|---:|---:|---:|---:|---|
| Qwen2.5-0.5B | 34.4 | 49.6 | 29.8 | 15.0 | 5.1 | Table 10 |
| Qwen2.5-1.5B | 55.2 | 73.2 | 29.8 | 32.4 | 14.8 | Table 10 |
| Qwen2.5-3B | 65.9 | 86.7 | 30.3 | 43.7 | 19.9 | Table 9 |
| Qwen2.5-7B | 75.5 | 91.6 | 36.4 | 56.3 | 28.7 | Table 8 |
| Qwen2.5-32B (s1's base) | 83.1 | 95.9 | 49.5 | 69.0 | 51.2 | Table 7 |
| Qwen2.5-72B | 83.1 | 95.8 | 49.0 | 71.1 | 55.5 | Table 6 |

In-house English Math score (Table 11, p. 13): 0.5B 26.29, 1.5B 40.99, 3B 49.38, 7B 56.93, 32B 60.97, 72B
59.73. In-house Chinese Math (Table 12, p. 14): 7B 61.06, 32B 67.86, 72B 68.39.

The gap that matters for s1: 7B-Instruct trails 32B-Instruct by 7.6 points on MATH and 13.1 on GPQA. Below
7B, GPQA sits at 29.8 to 30.3, close to the 25% a random guess gets on four options.

### License

- Weights: Apache 2.0 for 0.5B, 1.5B, 7B, 14B and 32B. The 3B model uses the "Qwen Research" license and the
  72B model the "Qwen" license (p. 3, Table 1).
- The report PDF is under the arXiv non-exclusive distribution license 1.0 (catalog.tsv), so the raw file is
  gitignored.

## Conflicts with s1

1. **Table 1 cites this report for numbers it does not contain.** s1's Table 1 caption (main.tex L275,
   C-63) lists `qwen2024qwen25technicalreport` among the "respective reports" for other models' numbers. The
   same caption says s1 evaluated Qwen itself. The Qwen2.5-32B-Instruct row is AIME24 26.7, MATH500 84.0,
   GPQA Diamond 49.0 (main.tex L291, C-66). The report has no AIME or MATH500 result. Its closest numbers
   are MATH 83.1 and GPQA 49.5 (Table 7, p. 11), on a different MATH set and an unstated GPQA subset. Treat
   s1's Qwen row as s1's own run, not as a number taken from this report.
2. **C-147 checks out with one exception.** s1 says Qwen2.5-32B-Instruct "generally matches or outperforms"
   72B-Instruct on math (main.tex L931, C-147, INCONCLUSIVE in verification.md). The report supports it.
   MATH ties at 83.1, GSM8K is 95.9 against 95.8, GPQA 49.5 against 49.0 (Tables 6-7), and in-house English
   Math 60.97 against 59.73 (Table 11). 72B leads only on in-house Chinese Math, 68.39 against 67.86 (Table
   12). This is agreement, not a conflict, and C-147 can move to VERIFIED against this source.
3. **The think and answer delimiters are s1's own.** s1 opens thinking with `<|im_start|>think` and the
   answer with `<|im_start|>answer` (main.tex L931, C-148). The report does not document the chat template
   or these tokens, so nothing in it confirms or contradicts them. `think` and `answer` are plain text after
   the `<|im_start|>` control token. The report lists no such control tokens.
4. **Context length.** s1 trains at 32,768 tokens so no sample is truncated (main.tex L931, C-153, C-157).
   This equals the report's final pre-training context and SFT sequence length (p. 4, §3.3; p. 6, §4.1). It
   is also four times the 8K generation length the Instruct models were trained for (Table 1), which s1 does
   not mention. Not a contradiction, but s1's traces (up to 4.7K average thinking tokens per source, s1
   Table 7) and budget-forced generations run past what the base model was post-trained to emit.

## Caveats for a local, under-8B, 8 GB replication

- **The leading candidate is not in this report.** The spec names Qwen3.5-4B. Every fact above is about
  Qwen2.5. If the run uses Qwen3.5, its tokenizer, chat template, context length and license need their own
  source. A Qwen2.5 model under 8B is the only choice this report covers directly.
- **Same tokenizer, so s1K token counts carry over.** All Qwen2.5 sizes share one vocabulary (§2), so s1's
  length filter (main.tex L211) and Table 7 lengths hold for a 0.5B-7B Qwen2.5 model. Whether
  `s1K_tokenized` can be reused as is depends on the chat template in the model's tokenizer config, which
  the report does not cover. Check it in the Hugging Face files before reuse.
- **Memory.** The 7B model's 6.5B non-embedding parameters alone take about 13 GB in bfloat16 (§5.1), so 7B
  does not fit in 8 GB for full fine-tuning or even plain bf16 inference. It needs 4-bit weights plus LoRA.
  The 3B model's 2.8B non-embedding parameters take about 5.6 GB in bf16 (Table 9), which leaves too little
  room for AdamW states, so it also needs LoRA or a quantized base. Only 0.5B and 1.5B might allow full
  fine-tuning in 8 GB, and the report gives no total parameter counts to confirm it.
- **Sequence length is the second memory limit.** s1 needs 32,768 tokens to avoid truncation (C-153). At
  8 GB the run will train shorter, which s1's own ablation says costs AIME24 accuracy (C-155 to C-158).
  Record the cut length as a deviation.
- **Smaller context window below 7B.** 0.5B, 1.5B and 3B have a 32K context with no YARN extension (Table 1),
  so budget forcing past 32K total tokens is not possible on them.
- **3B license.** Qwen2.5-3B is under "Qwen Research", not Apache 2.0 (Table 1). Read its terms before
  publishing a fine-tuned 3B checkpoint. 0.5B, 1.5B and 7B are Apache 2.0.
- **GPQA will be near the floor.** Below 7B the Instruct models score about 30 on GPQA (Tables 9-10). A
  1K-example SFT may not move it out of noise, and a few points on a small test set mean little.
- **The filter models are stronger than the student.** s1K keeps only questions that both 7B-Instruct and
  32B-Instruct fail (main.tex L211). For a 0.5B-3B student these questions are much harder relative to its
  ability than they were for 32B. Expect a smaller absolute gain than s1's.
- **Decontamination does not cover AIME.** The report's n-gram filter runs against its own eval suite (§5),
  which includes MATH and GPQA but not AIME. The report says nothing about AIME24 leakage either way.
- **No answer-checking rules here.** The report evaluates with its own suite and gives no answer extraction
  or grading rules. s1's grader (Claude 3.5 Sonnet, main.tex L211) is an API model, which this replication
  cannot use for the trained models. The local replacement belongs in the replication spec (see #11:
  rules, then a local model, then Claude as judge).

Table numbers were checked against `pdftotext -raw` row extracts of pages 3 and 9-14.
