# Figure 8. Grading prompt

Label: `fig:grade` (main.tex L833-L872, appendix C.3)

The system prompt the authors give Claude to grade whether an attempted answer is correct. It is text in a
one-column `tabular`, not a chart.

What the prompt does, in order:

1. It casts the grader as an assistant grading a science problem, given the question, a student's attempt
   and the correct answer.
2. It asks the grader to judge the attempt against the correct answer. If the expected solution ends in a
   number or a choice, there should be no ambiguity. If it is a full derivation, the grader judges the
   reasoning and uses the answer where helpful.
3. It fixes the input layout: a "# Problem" heading with `{problem}`, "## Attempt" with `{attempt}`, and
   "## Correct answer" with `{solution}`.
4. It asks for reasoning, then a final line with only "Yes" or "No".

Reading notes:

- Claude 3.5 grades the pool for s1K selection. Claude 3.7 graded correctness of the final 1,000 samples
  (L831, C-141).
- The exact wording is at L836 to L868 of `main.tex`. Issue #9 should compare it with the grading prompt in
  the `simplescaling/s1` code.
- The tables check finds this figure's `tabular` and confirms it holds no numeric cells.
- Claims: C-141, C-142.
