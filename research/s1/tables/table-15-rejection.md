# Table 15. Answers from an earlier s1-32B under rejection sampling on AIME24

Label: `tab:rejection` (main.tex L2621-L3581, appendix E.2, a `longtable`)

Two generations for the same AIME24 question from an earlier version of s1-32B, sampled at temperature 1.
It is text, not data. The question places O, A and B in the plane and asks about a point C on segment AB
that lies on no other unit segment from a family of segments in the first quadrant. The reference answer
is 23.

| Generation | Length cap | Thinking tokens | Answer tokens | Boxed answer | Correct |
|---|---:|---:|---:|---:|---|
| First | 4000 | 3981 | 1055 | 23 | yes |
| Second | 8000 | 5923 | 754 | 5 | no |

The caption says reaching 4,000 thinking tokens or fewer took 199 tries on average, and 8,000 or fewer
took 1 try.

Reading notes:

- The source has no `tabular` here, so the tables check only confirms this note exists. The values above
  come from the bold headers at L2634 and L3053, the boxed answers at L3049 and L3576, and the caption.
- The shorter trace is correct and the longer one is wrong. This matches the inverse scaling of rejection
  sampling in Figure 6.
- 199 tries for the 4,000-token cap does not match the tries in Figure 6's caption (D-12). This table uses
  an earlier model version.
- Claims: C-179 to C-181.
