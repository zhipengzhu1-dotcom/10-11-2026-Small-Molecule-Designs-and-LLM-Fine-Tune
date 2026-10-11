# Table 2. s1K data ablations

Label: `tab:datablation` (main.tex L545-L564, §5.1)

Accuracy (%) of models fine-tuned on different 1K selections and on the full 59K pool. Every score uses
budget forcing with a cap of about 30,000 thinking tokens. Under each score row, the bracketed row gives the
95% paired bootstrap confidence interval of the difference from s1K, using 10,000 bootstrap samples.

| Model | AIME 2024 | MATH 500 | GPQA Diamond |
|---|---:|---:|---:|
| 1K-random | 36.7 | 90.6 | 52.0 |
| 1K-random, 95% CI | [-26.7%, -3.3%] | [-4.8%, 0.0%] | [-12.6%, 2.5%] |
| 1K-diverse | 26.7 | 91.2 | 54.6 |
| 1K-diverse, 95% CI | [-40.0%, -10.0%] | [-4.0%, 0.2%] | [-10.1%, 5.1%] |
| 1K-longest | 33.3 | 90.4 | 59.6 |
| 1K-longest, 95% CI | [-36.7%, 0.0%] | [-5.0%, -0.2%] | [-5.1%, 10.1%] |
| 59K-full | 53.3 | 92.8 | 58.1 |
| 59K-full, 95% CI | [-13.3%, 20.0%] | [-2.6%, 2.2%] | [-6.6%, 8.6%] |
| s1K | 50.0 | 93.0 | 57.6 |

Reading notes:

- 1K-random selects on quality only, 1K-diverse on diversity only, and 1K-longest on difficulty only
  (longest traces). 59K-full trains on the whole pool (§5.1, L566).
- An interval that is entirely negative means the selection is worse than s1K with 95% confidence. That holds
  for AIME24 with 1K-random and 1K-diverse, and for MATH500 with 1K-longest. 1K-longest's AIME24 interval
  ends at exactly 0.0%.
- The s1K row (50.0, 93.0, 57.6) uses the 30,000-token cap. The caption compares it with Table 1's
  "s1 w/o BF" row (50.0, 92.6, 56.6), not with the s1-32B row (56.7, 93.0, 59.6).
- Claims: C-79 to C-85.
