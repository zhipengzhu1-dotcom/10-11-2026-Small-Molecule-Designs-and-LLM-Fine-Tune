# Table 14. Scaling thinking time via class-conditional control

Label: `tab:prompt` (main.tex L2593-L2608, appendix E.1)

s1-32B with a generic prompt appended to the question after two newlines. Cells read "accuracy / average
thinking tokens per sample". Higher accuracy and fewer thinking tokens are better.

| Prompt appended to the question after two newlines | AIME24 | MATH500 | GPQA |
|---|---:|---:|---:|
| *Answer after a short amount of thinking. Do not spend excessive time double-checking your work.* | 30.0% / 8033 | 90.4% / 2537 | 56.6% / 4177 |
| *Answer after a long amount of thinking. If you feel like you are finished early, spend the extra time trying to double-check your work until you are absolutely sure that you have the correct answer.* | 36.7% / 9651 | 91.4% / 3875 | 51.0% / 4827 |
| Without generic prompt appending | 50.0% / 6109 | 93.0% / 3298 | 57.6% / 3510 |

Reading notes:

- Both prompts score lower than no prompt on every benchmark.
- The short prompt uses more thinking tokens than no prompt on AIME24 (8,033 against 6,109) and GPQA
  (4,177 against 3,510). Only on MATH500 does it use fewer (2,537 against 3,298).
- Table 3 records 50% Control for CCC. The paper explains that figure at L2614 (C-178).
- The long prompt uses more tokens than the short one on all three benchmarks.
- Claims: C-175 to C-178.
