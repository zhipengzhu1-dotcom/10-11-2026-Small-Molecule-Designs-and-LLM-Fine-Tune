# Brief fixture: unverified rows with no assumption

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-01 | learning rate | 1e-5 | main.tex:412 | VERIFIED | 1e-5 | |
| P-02 | epochs | 5 | Table 7 | NOT VERIFIED | 5 | |
| P-03 | batch size | 16 | C-12 | INCONCLUSIVE | 16 | |
| P-04 | warmup | 5% | C-13 | INCONCLUSIVE | 5% | We assume linear warmup. |
