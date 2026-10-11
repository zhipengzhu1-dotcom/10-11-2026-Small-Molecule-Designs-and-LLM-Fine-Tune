# Table 13. Scaling thinking time via step-conditional control

Label: `tab:steps` (main.tex L2566-L2591, appendix E.1)

A model trained with step instructions ("Think for up to N steps", Figure 10 right) on AIME24. Every number
is an average over the 30 questions. Token counts leave out the thinking and step delimiters. The top half
lets the model stop on its own. The bottom half forces the end of thinking when the count reaches 0 steps.

| Steps instructed (→) | 16 | 32 | 64 | 128 | 256 |
|---|---:|---:|---:|---:|---:|
| No intervention at test-time | | | | | |
| Steps used | 123 | 90 | 80 | 82 | 136 |
| Tokens per step | 60 | 70 | 69 | 66 | 56 |
| Thinking tokens | 7252 | 6277 | 5396 | 5552 | 7551 |
| Answer tokens | 665 | 653 | 735 | 777 | 754 |
| AIME24 | 33.3 | 23.3 | 33.3 | 36.7 | 33.3 |
| Forcing end of thinking when 0 steps are reached | | | | | |
| Steps used | 16 | 32 | 59 | 78 | 136 |
| Tokens per step | 96 | 94 | 80 | 70 | 56 |
| Thinking tokens | 1517 | 2963 | 4636 | 5409 | 7551 |
| Answer tokens | 1111 | 788 | 799 | 794 | 754 |
| AIME24 | 23.3 | 23.3 | 33.3 | 36.7 | 33.3 |

Reading notes:

- Without intervention the step count barely tracks the instruction (123 steps used for a cap of 16).
- With forcing, fewer steps come with longer steps: 96 tokens per step at a cap of 16 against 56 at 256.
- At a cap of 256 the model uses 136 steps, so forcing has nothing to cut and the column is identical in
  both halves.
- Control for SCC in Table 3 uses a proxy cap of 100 tokens per instructed step (1,600 tokens for 16 steps).
  3 of 5 runs fit without forcing and 5 of 5 with forcing.
- Claims: C-167 to C-172.
