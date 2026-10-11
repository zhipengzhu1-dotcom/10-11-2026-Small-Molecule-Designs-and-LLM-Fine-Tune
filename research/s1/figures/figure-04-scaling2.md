# Figure 4. Sequential and parallel test-time scaling

Labels: `fig:scaling2`, `fig:forcing`, `fig:majority` (main.tex L253-L259, §3.2 and §4.2; images
`figures/forcing.pdf` and `figures/majority.pdf`)

Two panels. Values below are read off the images. Accuracies are within about 1 point and token counts
within about 10%.

## (a) Sequential scaling via budget forcing, AIME24

A scatter plot of s1-32B on AIME24. The text says it expands the AIME24 panel of Figure 1 (L352).

- x axis: average thinking time in tokens, log scale, ticks 1024, 2048, 4096 and 8192.
- y axis: accuracy (%), ticks 20, 40 and 60.
- Trend: accuracy rises until about 7,100 tokens. The last two dots have the same accuracy.

| Point | Annotation in the image | Thinking tokens (≈) | Accuracy % (≈) |
|---|---|---:|---:|
| 1 | none | 1000 | 13.3 |
| 2 | forcing 2048 max thinking tokens | 2000 | 30.0 |
| 3 | forcing 4096 max thinking tokens | 3800 | 43.3 |
| 4 | none | 5200 | 50.0 |
| 5 | ignoring end-of-thinking 2x, appending "Wait" | 6500 | 53.3 |
| 6 | ignoring end-of-thinking 4x | 7100 | 56.7 |
| 7 | ignoring end-of-thinking 6x | 8200 | 56.7 |

## (b) Parallel scaling via majority voting, GPQA Diamond

A line plot comparing two methods on GPQA Diamond.

- x axis: output tokens summed over all questions, log scale, ticks 100,000 and 1 million.
- y axis: accuracy (%), ticks 46 to 62.
- Sequential scaling via budget forcing with s1-32B: three points rising steeply. The last is annotated "60%
  accuracy".
- Parallel scaling via majority voting with the base model, Qwen2.5-32B-Instruct: six points for 2, 4, 8, 16,
  32 and 64 votes (caption). It rises slowly and levels off near 51%.

| Series | Point | Output tokens (≈) | Accuracy % (≈) |
|---|---|---:|---:|
| s1-32B, budget forcing | 1 | 52000 | 51.0 |
| s1-32B, budget forcing | 2 | 96000 | 57.6 |
| s1-32B, budget forcing | 3 | 138000 | 59.6 |
| Qwen2.5-32B-Instruct, majority vote | 2 votes | 19000 | 45.5 |
| Qwen2.5-32B-Instruct, majority vote | 4 votes | 76000 | 48.5 |
| Qwen2.5-32B-Instruct, majority vote | 8 votes | 153000 | 50.5 |
| Qwen2.5-32B-Instruct, majority vote | 16 votes | 310000 | 50.0 |
| Qwen2.5-32B-Instruct, majority vote | 32 votes | 610000 | 51.5 |
| Qwen2.5-32B-Instruct, majority vote | 64 votes | 1240000 | 51.0 |

Reading notes:

- The majority-vote samples use temperature 1, with 64 samples per question (caption, C-52).
- Panel (a) is AIME24 and panel (b) is GPQA Diamond, so the two panels do not compare the same benchmark.
- Panel (a) leaves two dots unannotated. The one at 50.0 matches s1 without budget forcing in Table 1, but
  the figure does not say so. The 2x and 4x dots (53.3, 56.7) match the AIME 2024 scores of s1 with "Wait"
  2x and 4x in Table 5. Table 5 has no 6x row.
- The text says forcing flattens out at six suppressions and can push the model into repetitive loops
  (L352, C-72).
- Panel (b)'s top s1-32B value (59.6) matches Table 1's GPQA score. I found no budget-forcing table entry
  for its first point (51.0).
- The majority-vote series never reaches the s1-32B series, which the authors read as sequential scaling
  beating parallel scaling (C-74).
- Claims: C-51, C-52, C-72, C-74.
