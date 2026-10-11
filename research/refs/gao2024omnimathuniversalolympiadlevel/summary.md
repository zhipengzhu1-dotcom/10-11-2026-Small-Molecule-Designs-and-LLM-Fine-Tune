# Omni-MATH (gao2024omnimathuniversalolympiadlevel)

Source read: `raw/2410.07985.pdf`, arXiv 2410.07985v3 (24 Dec 2024), 30 pages. Page numbers below are the PDF's printed page numbers. A few facts come from the dataset and model cards, fetched 2026-10-11, and are marked "card" or "repo".

## What it is

Omni-MATH is a text-only benchmark of 4,428 olympiad-level math problems with human-checked final answers. Each problem carries a difficulty score from 1 to 10 and up to three domain labels. The paper grades answers with GPT-4o and also releases Omni-Judge, an 8B open judge model, and Omni-MATH-Rule, a 2,821-problem subset that a rule-based checker can grade.

s1 uses it only as a source of training questions for the 59K pool (main.tex L198, L806). s1 does not evaluate on it.

## Data format, splits and sizes

- Size is 4,428 problems (abstract p. 1; §1 p. 2; App. C.2 p. 16). It is a single split. The HF dataset `KbsdJames/Omni-MATH` has one `test` split with 4,428 rows (card).
- The fields are `domain` (list of strings), `difficulty` (float), `problem`, `solution`, `answer` and `source` (card). App. L (pp. 29-30, Figs. 18-19) shows the same fields.
- `domain` is a chain such as `Mathematics -> Algebra -> Abstract Algebra -> Group Theory` (App. L p. 29). GPT-4o assigned up to three chains per problem (App. E.5, Fig. 14 p. 20). The tree has 33+ sub-domains (Fig. 12 p. 19).
- `difficulty` runs from 0 to 10 in steps as fine as 0.25. Problems from competitions on the AoPS ratings page get that page's rating. GPT-4o rated the rest, using the AoPS page as in-context reference (§2.2 p. 5; App. E.4 p. 17). The paper's four tiers are T1 1-3, T2 3-5, T3 5-7 and T4 7-10 (§3.1 p. 7).
- Provenance is Contest Page 3,242, AoPS Wiki 298 and AoPS Forum 888, totalling 4,428 after human filtering (Table 2 p. 4). The 3,242 is 3,295 minus 53 removed in a final pass (App. C.2 p. 16). Per-contest counts are in Table 5 (p. 17). HMMT February (1,385) and HMMT November (896) together make up 52% of the set.
- Proof-only and multi-part problems were discarded, so every problem has a checkable final answer (App. C.1 p. 15).
- GPT-4 rewrote AoPS Forum solutions into "solution + \boxed{answer}" form (App. D p. 16). Forum answers were kept only if at least three scraped answers agreed (§2.1 p. 4). Annotators cross-checked them, with 92.7% agreement before resolution and 97.3% on a 150-item spot check (App. C.2 p. 16).
- In a 200-problem sample the answer formats are Number 95, LaTeX 51, Tuple 2, Multi-LaTeX 8, Function 9, Multi-Function 1 and Text 34 (Table 7 p. 24). Number, LaTeX and Tuple cover 74%.

## Evaluation protocol and metrics

- The metric is accuracy: the fraction of problems whose final answer the judge marks equivalent to the reference `answer`. The paper reports it overall, per first-level domain and per difficulty tier (§3.1 p. 7; Table 3 p. 7), and per integer difficulty bucket D1-D10 (App. G, Table 6 p. 22).
- The official leaderboard judge is GPT-4o (§2.4 p. 6; repo). The judge gets the problem, the reference answer and the model's full solution. It extracts the `\boxed{}` content, outputs TRUE or FALSE, and gives a justification ending in "=== report over ===". Near-misses count as FALSE (Fig. 15 p. 23). The full few-shot prompt is not in the paper. The repo has it at `GPT_eval/gpt_evaluation_template.txt`.
- On a 100-item human-labelled meta-evaluation set, GPT-4o agrees with humans 98% of the time and Omni-Judge 86% (§4.2 p. 8; App. C.3 p. 16).
- Omni-Judge is Llama-3.1-8B-Instruct fine-tuned on GPT-4o judgments, with a 17,618 / 2,200 / 2,200 train/val/test split and no shared questions (§2.4 p. 6). It agrees with GPT-4o 91.26% overall, with 99.94% of outputs parsing (Table 9 p. 26), and ranks the tested models the same way GPT-4o does (App. J pp. 26-27). On the card it decodes greedily with `max_new_tokens=300`. Its output parses into `answer`, `judgement` and `justification`, and a parse failure counts as wrong (card).
- Omni-MATH-Rule is a rule-based checker built on the Qwen2.5-Math evaluation code with SymPy. It extracts the last `\boxed{}` (App. K p. 27). It is valid only on a 2,821-problem subset, with 1,607 marked untestable (App. K p. 28). On that subset its accuracies track GPT-4o's on the full set within about 1.6 points. For example, Qwen2.5-MATH-7B-Instruct scores 32.3% by rule and 33.22% by GPT-4o (Table 11 p. 28).
- Rules fail on the full set. On o1-mini outputs, rules and GPT-4o disagree on 611 of 4,428 problems (Table 10 p. 27). In 545 of those, GPT-4o marked the answer correct and the rules rejected it.
- Generation settings for tested models were temperature 0, top-p 1 and at most 2,048 new tokens. The o1 models got 4,096. Open models ran on vLLM. Chat models with no math prompt got the system prompt "You are an experienced educator in the field of MATHEMATICS." (App. F.2 p. 20).
- There are some pass@k numbers. Best-of-N with Qwen2.5-Math-RM-72B gives no consistent gain from RM@8 to RM@256 (§3.2 p. 7; Table 3). On a 500-problem subset, Qwen2.5-MATH-Instruct scores pass@1 40.8%, pass@8 57.6%, pass@16 63% and pass@32 67.2% (Table 8 p. 25). The paper does not give that model's size.
- Contamination was checked by 5-gram prediction accuracy at K random positions in problem plus solution (§4.1 p. 8). The contamination rate is at most 0.70% per model (Table 4 p. 8).

## Model details

Omni-MATH has no base model of its own. The relevant model is the Omni-Judge verifier. It is Llama-3.1-8B-Instruct (§2.4 p. 6; App. J p. 26; card) loaded in bf16 (card). It uses the Llama 3.1 chat template through custom `get_context` and `parse_response` methods, which need `trust_remote_code=True` (card). The paper also trained judges on Llama-2-7B-Chat and Llama-3-8B-Instruct and found them worse (Table 9 p. 26).

## License

- The paper PDF states no license for the data. The catalog lists the arXiv paper as CC0 1.0.
- The HF dataset card says `apache-2.0` (card). The Omni-Judge card says Apache-2.0 (card), but the model is a fine-tune of Llama 3.1, so the Llama 3.1 Community License also applies.
- The problems are copied from contest sites and AoPS (§2.1 p. 4). The upstream rights are not discussed.

## Conflicts with s1

1. Problem count. s1 says OmniMath "adds 4,238 competition-level mathematics problems" (main.tex L198, C-24) and lists 4238 samples in Table 7 (main.tex L806). Omni-MATH has 4,428 problems (abstract p. 1; App. C.2 p. 16; HF test split 4,428 rows). The gap is 190. It could be a digit transposition or a count taken after s1's 8-gram decontamination (`collect_data.py:418, 456`). The code comment says 3,329 (`collect_data.py:416`), which matches neither. verification.md already marks C-24 INCONCLUSIVE. Only rerunning the decontamination can settle it.

There is a related protocol difference that is not a conflict with s1's text. s1 grades each attempt "against the reference solution" (C-33, C-142). s1's loader maps Omni-MATH's full `solution` field into s1's `solution` column and leaves the short `answer` field inside the `metadata` string (`collect_data.py:108-114`). Omni-MATH's own judges compare against `answer` (§2.4 p. 6; Fig. 15 p. 23). For AoPS Forum items, `solution` is GPT-4-rewritten forum text (App. D p. 16).

## Caveats for a local, under-8B, 8 GB replication

- Grade without API models by using the `answer` field, not `solution`. On the 2,821 Omni-MATH-Rule problems, a SymPy last-`\boxed{}` checker matches GPT-4o accuracy within about 1.6 points (Table 11 p. 28) and needs no GPU. On the other 1,607, rules miss many correct answers (545 false negatives on o1-mini outputs, Table 10 p. 27), so those need Omni-Judge, Claude as judge, or should be dropped. The repo says the rule data and code shipped on 2024-12-22, but its README does not name the file. Find it before relying on it.
- Omni-Judge is 8.03B parameters. In bf16 it needs about 16 GB, so it does not fit in 8 GB. A 4-bit quantized copy (about 5-6 GB) fits, but it cannot share the GPU with the policy model during generation, so run judging as a separate pass. Quantization may move the reported 91.26% agreement with GPT-4o (Table 9 p. 26) and 86% agreement with humans (§4.2 p. 8). Re-measure it on a few hundred items checked by the rule grader before trusting it.
- The reference's numbers for Omni-Judge disagree with each other. The paper and the model card give Llama-3.1-8B-Instruct, 17,618 training examples and about 91% agreement (the paper's test split is 2,200, the card's 2,220). The GitHub README gives Llama-3-8B-Instruct, 21,451 examples and about 95% on 2,690 items. Cite the paper's numbers.
- Omni-Judge was trained on judgments of outputs at most 2,048 tokens long (App. F.2 p. 20), and its card caps generation at 300 new tokens. s1-style traces run to thousands of tokens. Pass only the answer section after the thinking delimiter, or the final `\boxed{}` line, to keep the judge input in-distribution and short.
- For difficulty filtering in s1's style, `difficulty` (T1 to T4) and `domain` are already in each row. A local replication could use them as free difficulty and diversity signals in place of s1's Claude domain labels (C-37). That would be a deviation and needs a note in the spec.
- For a small-model baseline, Qwen2.5-MATH-7B-Instruct scores 33.22% with GPT-4o judging (Table 3 p. 7) and 32.3% on the rule subset (Table 11 p. 28). Expect a fine-tuned model under 8B to land near there unless test-time scaling helps a lot.
- s1's `BAD_OMNIMATH_SAMPLES` lists two broken items: a truncated functional equation and an HMMT estimation question scored by |X-Y|. The filter is a TODO, and the selection function is disabled (`collect_data.py:13-16, 303-304, 418`), so both stay in s1's pool. Drop them locally.
- Omni-MATH is public web data, and the paper found small 5-gram leakage in Qwen2.5-MATH models (Table 4 p. 8). Any Qwen-family base model may have seen some items.
