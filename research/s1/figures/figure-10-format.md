# Figure 10. Token and step instruction data formats

Label: `fig:format` (main.tex L2483-L2540, appendix E.1)

Two training-sample templates side by side, laid out with a `tabular`. It is text, not a chart. Both use
Qwen's chat tokens and the same toy question, "What is the answer to Life, the Universe and Everything?".

| Part | Token-conditional format (left) | Step-conditional format (right) |
|---|---|---|
| User turn | the question, then "Think for up to 2048 tokens." | the question, then "Think for up to 64 steps." |
| Thinking | opens with `<\|im_start\|>think` | each step opens with a countdown marker: `<\|im_start\|>64 steps left`, then `<\|im_start\|>63 steps left`, and so on |
| Answer | opens with `<\|im_start\|>answer` | opens with `<\|im_start\|>answer` |

Reading notes:

- The model trains only on the reasoning trace (light blue) and the answer (blue), not on the user turn
  (caption).
- In the step format, the step markers replace the `think` delimiter.
- The countdown direction is deliberate. Counting down ends every trace at 1, which the authors expect to
  help the model stop (L2612).
- The step delimiters cost about 6 tokens each (C-171).
- The tables check finds this figure's `tabular` and confirms it holds no numeric cells.
- Claims: C-161, C-167, C-171.
