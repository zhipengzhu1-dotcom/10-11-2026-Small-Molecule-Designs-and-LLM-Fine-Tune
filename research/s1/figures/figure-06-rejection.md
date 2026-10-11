# Figure 6. Rejection sampling on AIME24 with s1-32B

Label: `fig:rejection` (main.tex L618-L622, §5.2; image `figures/rejection_stretched.pdf`)

A line plot of AIME24 accuracy under rejection sampling. The model samples at temperature 1 until a
generation fits under a thinking-token cap. Each point is one cap.

- x axis: average thinking time in tokens, log scale, ticks 3072, 4096 and 5120.
- y axis: accuracy (%), ticks 22 to 42.
- Trend: accuracy falls as average thinking time rises. This is the inverse scaling the text describes
  (L624, C-99).

Values read off the image, accuracies within about 1 point and token counts within about 5%.

| Point (left to right) | Thinking tokens (≈) | Accuracy % (≈) |
|---|---:|---:|
| 1 | 2970 | 39.4 |
| 2 | 3700 | 36.1 |
| 3 | 4350 | 32.9 |
| 4 | 4740 | 29.5 |
| 5 | 5200 | 26.1 |
| 6 | 5300 | 22.8 |

Reading notes:

- The plot has six points. The caption lists five caps (3,500, 4,000, 5,000, 8,000 and 16,000 tokens) and six
  try counts (655, 97, 8, 3, 2 and 1 tries per sample), so points cannot be matched to caps (D-02).
- The read accuracies are not multiples of 3.33, so each point is probably an average over several runs.
  Table 3 lists 5 runs for RS. This is an inference. The paper does not say.
- Table 3 gives RS a Scaling of -35 and a Performance of 40.0, close to the first point here.
- The text's explanation: short generations tend to be ones where the model was on the right track from the
  start, while long ones backtrack after mistakes (L624). Table 15 shows one such pair.
- Claims: C-99, C-100.
