# Brief fixture: seven rows with no verdict, one passing row

| ID | parameter | paper value | paper location | verdict | planned value (<8B, 8 GB, local only) | assumption |
|---|---|---|---|---|---|---|
| P-01 | learning rate | 1e-5 | main.tex:412 | VERIFIED | 1e-5 | |
| P-02 | epochs | 5 | main.tex:413 | | 5 | |
| P-03 | batch size | 16 | main.tex:414 | | 16 | |
| P-04 | warmup | 5% | main.tex:415 | | 5% | |
| P-05 | weight decay | 1e-4 | main.tex:416 | | 1e-4 | |
| P-06 | max length | 32768 | main.tex:417 | | 4096 | |
| P-07 | optimizer | AdamW | main.tex:418 | | AdamW | |
| P-08 | precision | bf16 | main.tex:419 | | bf16 | |
