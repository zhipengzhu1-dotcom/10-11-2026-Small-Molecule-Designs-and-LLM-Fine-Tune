# Table 10. s1K sample from s1-teasers

Label: `tab:teasers` (main.tex L1420-L1900, appendix D.2, a `longtable`)

One full s1K training sample from s1-teasers, the brain-teaser source in Table 7. It is text, not data. The
layout has one column:

1. The question. Alice and Bob each flip a coin until they get heads. Given that Bob flipped more times than
   Alice, what is the expected number of times Alice flipped?
2. The reference solution, which is only the answer 4/3.
3. Gemini's reasoning trace and response, generated from the question alone. The response ends with the
   boxed answer 4/3, which matches the solution.

Reading notes:

- The trace runs to about 460 source lines, while the solution is a bare number. Some s1K sources supply
  answers without worked solutions.
- Claims: C-160.
