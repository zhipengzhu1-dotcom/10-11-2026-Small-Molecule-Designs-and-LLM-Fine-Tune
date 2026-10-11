# Brief fixture

Some prose. A table that is not a parameter table:

| benchmark | size |
|---|---|
| AIME24 | 30 |

## Training

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-01 | learning rate | 1e-5 | main.tex:412 | VERIFIED | 1e-5 | |
| P-02 | epochs | 5 | Table 7 | NOT VERIFIED | 5 | Code default differs; we keep the paper's value. |
| P-03 | batch size | 16 | C-12 | INCONCLUSIVE | 16 via accumulation | Unclear if per device or global; we assume global. |

## Evaluation

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|----|-----------|-------------|----------------|---------|----------------------------------------|------------|
| P-04 | answer format | `a \| b` | research/refs/aime/summary.md | VERIFIED | same | |
