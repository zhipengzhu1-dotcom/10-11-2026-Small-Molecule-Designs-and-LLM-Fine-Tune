# Table 1. s1-32B is a strong open reasoning model

Label: `tab:perf` (main.tex L273-L309, §4.1)

Accuracy (%) on three benchmarks for API models, open-weight models, and models with open weights and open
data. "# ex." is the number of examples used for reasoning fine-tuning. BF means budget forcing. The caption
says numbers for models other than s1, Qwen and Gemini come from those models' own reports (C-63).

| Model | # ex. | AIME 2024 | MATH 500 | GPQA Diamond |
|---|---:|---:|---:|---:|
| API only | | | | |
| o1-preview | N.A. | 44.6 | 85.5 | 73.3 |
| o1-mini | N.A. | 70.0 | 90.0 | 60.0 |
| o1 | N.A. | **74.4** | **94.8** | **77.3** |
| Gemini 2.0 Flash Think. | N.A. | 60.0 | N.A. | N.A. |
| Open Weights | | | | |
| Qwen2.5-32B-Instruct | N.A. | 26.7 | 84.0 | 49.0 |
| QwQ-32B | N.A. | 50.0 | 90.6 | 54.5 |
| r1 | ≫800K | **79.8** | **97.3** | **71.5** |
| r1-distill | 800K | 72.6 | 94.3 | 62.1 |
| Open Weights and Open Data | | | | |
| Sky-T1 | 17K | 43.3 | 82.4 | 56.8 |
| Bespoke-32B | 17K | **63.3** | 93.0 | 58.1 |
| s1 w/o BF | **1K** | 50.0 | 92.6 | 56.6 |
| **s1-32B** | **1K** | 56.7 | **93.0** | **59.6** |

Bold follows the source. It marks the best score in each group and column, plus the 1K example count of
the s1 rows. One tie is not bold: Bespoke-32B's 93.0 on MATH 500 equals s1-32B's bold 93.0.

Reading notes:

- The source splits "Gemini 2.0 Flash Think." and "Qwen2.5-32B-Instruct" over two lines with `\multirow`.
  Each is one row here.
- Three rows are commented out in the source and do not render: r1-lite-preview (N.A., 52.5, 91.6, 58.5),
  s1.1 w/o BF (1K, 56.7, 94.4, 60.6) and s1.1-32B (1K, 56.7, 95.4, 63.6). Table 5 prints the s1.1 numbers.
- The s1-32B row (56.7, 93.0, 59.6) matches no single budget-forcing setting in Table 5 (D-05 in
  `notes/sections.md`).
- Claims: C-64 to C-71.
