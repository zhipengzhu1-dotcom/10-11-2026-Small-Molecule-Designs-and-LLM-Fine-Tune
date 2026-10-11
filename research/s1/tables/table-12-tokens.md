# Table 12. Scaling thinking time via token-conditional control

Label: `tab:tokens` (main.tex L2543-L2564, appendix E.1)

A model trained with token instructions ("Think for up to N tokens", Figure 10 left) on AIME24. Every number
is an average over the 30 questions. The top half lets the model stop on its own. The bottom half forces the
end of thinking once the token budget is reached.

| Tokens instructed (→) | 1024 | 2048 | 4096 | 8192 | 16384 |
|---|---:|---:|---:|---:|---:|
| No intervention at test-time | | | | | |
| Thinking tokens | 7939 | 7158 | 8263 | 7108 | 7500 |
| Answer tokens | 689 | 669 | 659 | 722 | 724 |
| AIME24 | 26.7 | 30.0 | 33.3 | 33.3 | 40.0 |
| Forcing end of thinking when token budget is reached | | | | | |
| Thinking tokens | 1024 | 2048 | 4031 | 5664 | 6330 |
| Answer tokens | 15 | 15 | 142 | 722 | 691 |
| AIME24 | 3.3 | 30.0 | 33.3 | 33.3 | 40.0 |

Reading notes:

- Without intervention the model ignores the instruction. It thinks for 7,108 to 8,263 tokens whatever the
  budget. Only 2 of 5 runs stay under the budget, which gives Table 3's 40% Control for TCC.
- With forcing, thinking tokens never exceed the budget, so Control is 100% (TCC + BF in Table 3).
- Under the 1,024 and 2,048 budgets the forced model writes only 15 answer tokens.
- Claims: C-162 to C-166.
