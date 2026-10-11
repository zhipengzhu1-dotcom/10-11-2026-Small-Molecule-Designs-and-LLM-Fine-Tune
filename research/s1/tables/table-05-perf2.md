# Table 5. s1-32B is an open and sample-efficient reasoning model (appendix A, with s1.1)

Label: `tab:perf2` (main.tex L688-L724, appendix A)

Accuracy (%) on four benchmarks, including AIME 2025 and the s1.1 models. "# Examples" is the number of
reasoning fine-tuning examples. BF means budget forcing. The caption says other models' numbers come from
their reports, and AIME 2025 numbers come from a separate AIME 2025 preview (`ye2025aimepreview`).

| Model | # Examples | MATH500 | GPQA | AIME 2024 | AIME 2025 |
|---|---:|---:|---:|---:|---:|
| API only | | | | | |
| o3-mini-low | N/A | 95.8 | 70.6 | 56.3 | 42.1 |
| o3-mini-medium | N/A | 97.3 | 76.8 | 75.8 | 70.4 |
| o3-mini-high | N/A | 97.9 | **79.7** | **83.8** | 80.9 |
| Open Weights | | | | | |
| QwQ-32B | N.A. | 90.6 | 54.5 | 46.7 | 32.7 |
| r1 | ≫800K | 07.3 | **71.5** | **79.8** | 70.0 |
| r1-distill-Llama-70B | 800K | 94.5 | 65.2 | 57.1 | 56.3 |
| r1-distill-Qwen-14B | 800K | 93.9 | 59.1 | 61.7 | 48.0 |
| r1-distill-Qwen-32B | 800K | 94.3 | 62.1 | 58.3 | 49.6 |
| Open Weights and Open Data | | | | | |
| LIMO | 817 | 94.8 | **66.7** | 56.3 | 44.6 |
| s1 w/o BF | 1K | 92.6 | 56.6 | 50.0 | 26.7 |
| s1 with Budget Forcing "Wait" 1x | 1K | 92.8 | 59.6 | 53.3 | 30.0 |
| s1 with Budget Forcing "Wait" 2x | 1K | 93.0 | 59.6 | 53.3 | 33.3 |
| s1 with Budget Forcing "Wait" 4x | 1K | 92.2 | 58.6 | **56.7** | 36.7 |
| s1.1 w/o BF | 1K | 94.4 | 60.6 | **56.7** | **50.0** |
| s1.1 with Budget Forcing "Wait" 1x | 1K | **95.4** | 62.6 | **56.7** | **50.0** |
| s1.1 with Budget Forcing "Wait" 2x | 1K | **95.4** | 63.6 | **56.7** | **50.0** |

Values are copied exactly, typos included. Bold follows the source.

Reading notes:

- r1's MATH500 score prints as "07.3". Table 1 gives 97.3 for r1, so this is a typo (D-03).
- The column order differs from Table 1: MATH500 comes first and AIME 2024 fourth.
- The source writes "N/A" for the o3-mini rows and "N.A." for QwQ-32B.
- QwQ-32B's AIME 2024 score is 46.7 here and 50.0 in Table 1. r1-distill-Qwen-32B is 58.3 here, and Table 1's
  r1-distill row gives 72.6 (D-04).
- Bold is uneven. In the open-data group it marks the best score in every column. In the API and
  open-weights groups only the GPQA and AIME 2024 columns have bold.
- Two o1 rows are commented out in the source and do not render.
- The tabular declares nine columns but every row uses six.
- Claims: C-117 to C-127.
