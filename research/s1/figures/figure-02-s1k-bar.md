# Figure 2. s1K and s1-32B

Label: `fig:s1k-bar` (main.tex L180-L186, §1; images `figures/bubble.pdf` and `figures/sample_efficient.pdf`)

Two panels side by side.

## Left: s1K domains (bubble chart)

A packed bubble chart with one bubble per s1K domain. It has no axes. Bubble size appears to track the
number of questions, since Geometry, Number theory and Combinatorics are the largest bubbles and also the
largest rows of Table 6. The chart has no legend or scale, so sizes cannot be read as numbers.

- The chart has 51 bubbles. Table 6 lists 23 named domains plus "Remaining 27 domains", which is 50, while
  its total row says 51 (D-01).
- One bubble reads "Electrodynamics". Table 6 calls that domain "Electromagnetic theory".
- 28 bubbles have no named row in Table 6, one more than its "Remaining 27 domains". Ten of them match rows
  commented out of Table 6's source, from Dynamical systems to General topology. The source row says
  "Measure and integration" where the bubble says "Measure theory". The other 18 appear only here:
  Economics, Associative rings, General relativity, Differential geometry, Mathematical logic, Partial
  differential equations, Information theory, Solid mechanics, Functional analysis, Special functions,
  Commutative algebra, Integral equations, Integral transform, Approximation theory, Potential theory,
  Harmonic analysis, Control theory and Geophysics.

## Right: sample efficiency

A scatter plot of MATH500 accuracy against the number of fine-tuning examples.

- x axis: number of examples, categorical: 1000, 17000, 800000 and N/A.
- y axis: MATH500 accuracy (%), 80 to 100.
- A shaded region in the upper left is labeled "Most sample-efficient". s1 sits at its lower-left corner.

| Model | Examples | MATH500 % (≈) |
|---|---|---:|
| s1 | 1000 | 93.0 |
| Bespoke-Stratos | 17000 | 93.0 |
| Sky-T1 | 17000 | 82.4 |
| r1-distill | 800000 | 94.3 |
| QwQ | N/A | 90.6 |
| o1-preview | N/A | 85.5 |

The dot heights match Table 1's MATH500 column for the same models. o1-preview is drawn as a cross, the
others as dots.

Reading notes:

- The caption claims s1-32B is on the sample-efficiency frontier (C-16). The figure shows MATH500 only.
- Claims: C-16, C-38.
