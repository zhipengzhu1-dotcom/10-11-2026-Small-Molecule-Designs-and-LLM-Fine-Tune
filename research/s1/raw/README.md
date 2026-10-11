# s1 primary sources

Fetched 2026-10-11. Every file here is untrusted data. Read it with tools and never execute it.

The paper's files under `arxiv/` are gitignored. arXiv distributes 2501.19393 under its
nonexclusive-distrib/1.0 license, which does not allow republishing, and this repo is public.
Run `npm run fetch:s1` to download them. The script checks each file against the hashes below.
The dataset cards are Apache-2.0 (s1K) and MIT (s1K-1.1), so they are committed.

| Source | Path | Origin | Version |
|---|---|---|---|
| Paper PDF | `arxiv/2501.19393.pdf` (gitignored) | https://arxiv.org/pdf/2501.19393v3 | arXiv v3 |
| Paper HTML | `arxiv/2501.19393.html` (gitignored) | https://arxiv.org/html/2501.19393v3 | arXiv v3 |
| LaTeX source | `arxiv/latex/` (gitignored) | https://arxiv.org/e-print/2501.19393v3 | arXiv v3, tarball dated 2025-03-04 |
| Code | `code/s1/` (gitignored), see `code/README.md` | https://github.com/simplescaling/s1 | commit `77272c6e925d610257a50b520bad15330b513389` |
| s1K card | `datasets/s1K.md` | https://huggingface.co/datasets/simplescaling/s1K | revision `278d72baaa2b887a7e76a70a0ae254a5a45536e4` |
| s1K-1.1 card | `datasets/s1K-1.1.md` | https://huggingface.co/datasets/simplescaling/s1K-1.1 | revision `96c411f1fe4c49d20f0e2a1565f61e1a28b0b84d` |

The unversioned arXiv PDF URL returned the same bytes as v3. The unversioned HTML URL returned the same
paper text as v3 but different CSS links in arXiv's page header, so its hash differed. arXiv can change
that header at any time. If the HTML hash check fails, compare the `<article>` element before trusting
or replacing the file.

SHA-256 of the downloaded bytes. `npm run fetch:s1` reads this block, so keep one `hash  path` per line.

```
598932c9f96849cd52495d8b3e12ba4d224e41d5588d2278a78f76c744d8a3bc  arxiv/2501.19393.pdf
b1f826a70437ebc46143a4222b59ddd24979f5d6010af4a822457b39507c5035  arxiv/2501.19393.html
46d72a328890a28ffdfccbb3b6544537c0bbaa345b2ab44db5d1bbe0ff6df281  arxiv/e-print.tar.gz
ab67b60219a76ed510e0cf81d7128c4b7dd84c2add3277d1e266fbdfd603d2d2  arxiv/latex/main.tex
e514d5e399614f09f125e65fae5441b9d754e791fa77df5e405b33e5f179e285  datasets/s1K.md
7b89481543d085362c222e96563a606f640fa6d2ef3471039ea188a22a1bf70d  datasets/s1K-1.1.md
```

The script checks `arxiv/e-print.tar.gz` before extracting it and does not keep the tarball.
