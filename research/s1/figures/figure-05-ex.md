# Figure 5. Example model outputs

Label: `fig:ex` (main.tex L356-L537, §4.2)

A full page of text in three columns, built with a `tabular`. Each column shows one question that s1-32B
answers correctly, with its prompt (black), reasoning trace (light blue) and answer (blue). Gray "[...]"
marks text trimmed to fit the page.

| Column | Benchmark | Question | Final answer |
|---|---|---|---|
| Left | AIME24 | Alice and Bob take turns removing 1 or 4 tokens from a stack of n, and whoever removes the last token wins. Count the n up to 2024 for which Bob has a winning strategy. | boxed 809 (404 + 405 losing positions) |
| Middle | MATH500 | Find the projection of a onto b = (2, 6, 3) given a · b = 8. | boxed (16/49, 48/49, 24/49) |
| Right | GPQA | Find the energy spectrum of a particle in the 2D potential V(r, θ) = ½kr² + (3/2)kr²cos²θ. | E = ħ√(k/m)(2n_x + n_y + 3/2) |

Reading notes:

- The figure shows outputs only. It reports no lengths, scores or timings.
- The tables check finds this figure's `tabular` and confirms it holds no numeric cells.
- Claims: C-78.
