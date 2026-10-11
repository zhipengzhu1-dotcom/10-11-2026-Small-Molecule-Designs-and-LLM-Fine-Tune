# Table 3. Ablations on methods to scale test-time compute on AIME24

Label: `tab:scalingabl` (main.tex L571-L591, §5.2)

Compares ways to control test-time compute on AIME24 using the metrics from §3.2 (C-47 to C-49). Control is the share of
runs that stay within the compute limit. Scaling is the average slope of accuracy against thinking tokens.
Performance is the best AIME24 accuracy (%). The last column, |A| in the paper, is the number of evaluation
runs behind each row.

| Method | Control | Scaling | Performance | Runs (\|A\|) |
|---|---:|---:|---:|---:|
| **BF** | **100%** | 15 | **56.7** | 5 |
| TCC | 40% | -24 | 40.0 | 5 |
| TCC + BF | **100%** | 13 | 40.0 | 5 |
| SCC | 60% | 3 | 36.7 | 5 |
| SCC + BF | **100%** | 6 | 36.7 | 5 |
| CCC | 50% | **25** | 36.7 | 2 |
| RS | **100%** | -35 | 40.0 | 5 |

Abbreviations: BF is budget forcing. TCC, SCC and CCC are token-, step- and class-conditional control. RS is
rejection sampling. Bold marks the chosen method and the best value in each column.

Reading notes:

- Appendix E explains how Control was computed for the conditional methods. For TCC, 2 of 5 runs stayed
  under the limit without intervention and 5 of 5 with budget forcing (L2610). For SCC, a proxy limit of
  100 tokens per step gave 3 of 5 and 5 of 5 (L2612).
- CCC has the best Scaling (25) but rests on 2 runs.
- RS has negative Scaling (-35): longer allowed lengths gave lower accuracy (Figure 6).
- Claims: C-88 to C-92.
