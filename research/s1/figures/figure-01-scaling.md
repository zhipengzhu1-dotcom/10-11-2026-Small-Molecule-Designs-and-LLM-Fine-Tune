# Figure 1. Test-time scaling with s1-32B

Label: `fig:scaling` (main.tex L163-L168, §1; image `figures/scaling_compressed.pdf`)

Three scatter plots of s1-32B accuracy against test-time compute, one per benchmark. Each dot is one
budget-forcing setting (§4.2, L352).

- x axis: average thinking time in tokens, log scale (base 2). Ticks are 512 and 2048 for MATH500, 512, 2048
  and 8192 for AIME24, and 1024 and 4096 for GPQA.
- y axis: accuracy (%). Ranges are about 63 to 95 for MATH500, 0 to 60 for AIME24 and 37 to 60 for GPQA.
- Trend: accuracy rises with thinking tokens on all three benchmarks. No panel shows a drop.

Values read off the image. Token counts are rough (within about 10%), accuracies within about 1 point.
AIME24 accuracies are snapped to multiples of 3.33, the only values 30 questions allow.

| Panel | Point | Thinking tokens (≈) | Accuracy % (≈) |
|---|---|---:|---:|
| MATH500 | 1 | 510 | 64 |
| MATH500 | 2 | 910 | 80 |
| MATH500 | 3 | 1560 | 85.6 |
| MATH500 | 4 | 2300 | 90.6 |
| MATH500 | 5 | 2600 | 93.0 |
| AIME24 | 1 | 510 | 0 |
| AIME24 | 2 | 1020 | 13.3 |
| AIME24 | 3 | 2050 | 30.0 |
| AIME24 | 4 | 4100 | 43.3 |
| AIME24 | 5 | 5700 | 50.0 |
| AIME24 | 6 | 7200 | 53.3 |
| AIME24 | 7 | 7300 to 8200 | 56.7 |
| GPQA Diamond | 1 | 540 | 38 |
| GPQA Diamond | 2 | 1020 | 49.5 |
| GPQA Diamond | 3 | 1800 | 51 |
| GPQA Diamond | 4 | 3300 | 57.6 |
| GPQA Diamond | 5 | 4400 | 59.6 |

Reading notes:

- §3.2 gives the rightmost AIME24 dot exactly: 57% at 7,320 thinking tokens (L239, C-50). My reading of the
  x position is less precise than that.
- The top dots match Table 1's s1-32B row (93.0, 56.7, 59.6), but the figure does not say which settings it
  plots.
- Figure 4a expands the AIME24 panel.
- Claims: C-17, C-50.
