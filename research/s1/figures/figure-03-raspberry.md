# Figure 3. Budget forcing with s1-32B

Label: `fig:raspberry` (main.tex L222-L226, §3.1; image `figures/raspberry_single.pdf`)

An illustration, not a chart. It shows one trimmed generation in three stacked boxes.

1. Question: "How many r in raspberry?"
2. Reasoning trace: the model counts letter by letter and concludes "The number of 'r's in "raspberry" is
   2." At that point it tries to stop. Budget forcing suppresses the end-of-thinking delimiter and appends
   "Wait", shown in red. The model re-reads the word, spells it out, finds a third r and reaches "Count = 3".
3. Response: "My initial answer of 2 was incorrect due to a quick reading of the word." The final answer
   is a boxed 3.

Reading notes:

- Ellipses in the image mark trimmed text, so token counts cannot be read from it.
- §3.1 describes the full method (C-12, C-13).
- Claims: C-44.
