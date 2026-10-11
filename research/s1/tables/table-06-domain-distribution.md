# Table 6. Summary of the s1K dataset

Label: `tab:domain_distribution` (main.tex L745-L791, appendix C.1)

Questions and tokens per domain in s1K. The Qwen-2.5 tokenizer counts the tokens. Claude wrote each
domain's keywords from sample questions.

| Domain | #questions | Total token count | Keywords |
|---|---:|---:|---|
| Geometry | 109 | 560.2K | Area, Triangle, Distance |
| Number theory | 98 | 522.5K | Sequences, Divisibility |
| Combinatorics | 75 | 384.7K | Permutations, Counting |
| Real functions | 43 | 234.8K | Trigonometry, Calculus |
| Biology | 41 | 120.9K | Organic reactions |
| Complex functions | 32 | 170.2K | Complex roots |
| Quantum theory | 32 | 127.9K | Particles, Wave functions |
| Field theory | 28 | 150.1K | Polynomials, Roots |
| Calculus of variations | 28 | 155.5K | Optimization, Control |
| Difference equations | 24 | 132.5K | Recurrence, Recursion |
| Electromagnetic theory | 23 | 95.8K | Optics, Waves, Diffraction |
| Group theory | 22 | 100.0K | Groups, Automorphisms |
| Linear algebra | 22 | 128.3K | Matrices, Determinants |
| Probability theory | 20 | 114.6K | Random walk, Expectation |
| Algebraic systems | 19 | 109.9K | Functional equations |
| Mechanics | 19 | 103.6K | Forces, Motion, Energy |
| Thermodynamics | 19 | 74.2K | Heat engines, Entropy |
| Differential equations | 18 | 89.6K | Substitution, Existence |
| Computer science | 18 | 34.2K | Complexity theory, Algorithms |
| Numerical analysis | 18 | 76.5K | Error analysis, Stability |
| Calculus | 17 | 96.3K | Convergence, Summation |
| Algebraic structures | 17 | 90.4K | Inequalities, Sets |
| Astronomy | 16 | 37.7K | Stellar populations, Orbits |
| Remaining 27 domains | 242 | 982.2K | Domains with ≤ 16 questions |
| All domains (51) | 1000 | 4.7M | s1K |

Reading notes:

- The 23 named domains plus 27 remaining make 50, but the total row says 51 (D-01). The bubble chart in
  Figure 2 draws 51 domains.
- Figure 2 calls one domain "Electrodynamics". This table calls it "Electromagnetic theory".
- The named rows plus "Remaining" sum to 1,000 questions.
- Ten more domain rows are commented out in the source, from "Dynamical systems" (16 questions, 77.7K) to
  "General topology" (11, 42.7K). Each has 16 or fewer questions, so they presumably count toward
  "Remaining 27 domains". The paper does not say.
- The tabular declares six columns but every row uses four.
- Claims: C-132 to C-135.
