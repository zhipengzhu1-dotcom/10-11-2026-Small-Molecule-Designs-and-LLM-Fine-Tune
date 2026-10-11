# Table 7. Composition of the full 59K questions

Label: `tab:ds` (main.tex L795-L824, appendix C.2)

The sources of the 59K question pool, with sample counts and average thinking length in tokens. The
Qwen2.5-32B-Instruct tokenizer measures the lengths. AIME24 is excluded, and so are the 90 AIME questions
from 2022 and 2023, which the authors used during development.

| Source | Description | #Samples | Avg. thinking length |
|---|---|---:|---:|
| NuminaMATH | Math problems from online websites | 30660 | 4.1K |
| MATH | Math problems from competitions | 11999 | 2.9K |
| OlympicArena | Astronomy, Biology, Chemistry, Computer Science, Geography, Math, and Physics olympiad questions | 4250 | 3.2K |
| OmniMath | Math problems from competitions | 4238 | 4.4K |
| AGIEval | English, Law, Logic and Math problems from the SAT, LSAT and other exams | 2385 | 1.2K |
| xword | Crossword puzzles | 999 | 0.7K |
| OlympiadBench | Math and Physics olympiad questions | 896 | 3.9K |
| AIME (1983-2021) | American Invitational Mathematics Examination | 890 | 4.7K |
| TheoremQA | Computer Science, Finance, Math, and Physics university-level questions relating to theorems | 747 | 2.1K |
| USACO | Code problems from the USA Computing Olympiad | 519 | 3.6K |
| JEEBench | Chemistry, Math, and Physics problems used in the university entrance examination of the Indian Institute of Technology | 515 | 2.9K |
| GPQA | PhD-Level Science Questions | 348 | 2.9K |
| SciEval | Biology, Chemistry, and Physics problems from various sources | 227 | 0.7K |
| s1-prob | Stanford statistics qualifying exams | 182 | 4.0K |
| LiveCodeBench | Code problems from coding websites (LeetCode, AtCoder, and CodeForces) | 151 | 3.5K |
| s1-teasers | Math brain-teasers crawled from the Internet | 23 | 4.1K |
| **All 59K questions** | Composite of the above datasets with reasoning traces and solutions | 59029 | 3.6K |

Reading notes:

- The sample counts sum to 59,029, the total row.
- The citation keys behind each source are in the source table, for example `numina_math_datasets` for
  NuminaMATH. AGIEval cites six papers. xword, AIME, s1-prob and s1-teasers have no citation.
- The tabular declares five columns but every row uses four.
- Claims: C-136 to C-140.
