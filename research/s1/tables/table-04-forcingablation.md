# Table 4. Budget forcing extrapolation ablations

Label: `tab:forcingablation` (main.tex L598-L614, §5.2)

Accuracy (%) when the model's end-of-thinking delimiter is ignored twice and a string, or nothing, is
appended each time. "No extrapolation" lets the model stop when it wants.

| Model | AIME 2024 | MATH 500 | GPQA Diamond |
|---|---:|---:|---:|
| No extrapolation | 50.0 | **93.0** | 57.6 |
| 2x without string | 50.0 | 90.2 | 55.1 |
| 2x "Alternatively" | 50.0 | 92.2 | **59.6** |
| 2x "Hmm" | 50.0 | **93.0** | **59.6** |
| 2x "Wait" | **53.3** | **93.0** | **59.6** |

Bold follows the source and marks the best score in each column.

Reading notes:

- "Wait" is the only string that raises AIME24 (50.0 to 53.3), and it ties for best on MATH500 and GPQA.
  §5.2 says "Wait" generally performs best (L594), and budget forcing in §3.1 appends "Wait".
- Ignoring the delimiter without appending a string lowers MATH500 and GPQA below no extrapolation.
- The "No extrapolation" row equals the s1K row of Table 2 (50.0, 93.0, 57.6).
- Claims: C-94, C-95.
