# Table 8. Training sequence length ablation

Label: `tab:seqabl` (main.tex L945-L961, appendix D.1)

Two models trained on s1K with different maximum sequence lengths. Benchmark cells read "accuracy / average
thinking tokens per sample". Higher accuracy and fewer thinking tokens are better.

| | Model A | Model B |
|---|---:|---:|
| Training sequence length | 4096 | 32768 |
| % training samples cutoff | 74% | 0% |
| AIME24 | 30.0% / 20721 | 50.0% / 6984 |
| MATH500 | 90.0% / 5324 | 91.0% / 3268 |
| GPQA | 52.5% / 6841 | 53.0% / 3568 |

Reading notes:

- At 4,096 tokens, 74% of training samples are cut off, which often removes the answer. That model thinks far
  longer at test time (20,721 against 6,984 tokens on AIME24) and scores lower on all three benchmarks.
- The paper picks the longest length (Model B) for s1-32B (L963).
- Claims: C-155 to C-159.
