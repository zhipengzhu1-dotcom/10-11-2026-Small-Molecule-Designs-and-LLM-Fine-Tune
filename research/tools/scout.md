# Tool scout report

Issue #8, spec #1. Written 2026-10-11.

The question is which GitHub repos and agent skills that read papers or run research are worth adopting for this project. Each repo row cites the page I opened. Stars, license and last push come from the GitHub REST API (`https://api.github.com/repos/<owner>/<repo>`), read on 2026-10-11.

## What this machine already has

These are already installed, so the report does not recommend them again.

- `~/.claude/skills/research` (mattpocock) runs a background agent that checks a question against primary sources and writes one Markdown file. It has no paper-specific steps.
- pstack has `swarm`, `interrogate`, `show-me-your-work`, `figure-it-out` and `unslop`. They cover fan-out, adversarial review, the decision log and plain writing. None of them fetches LaTeX source or walks a reference list.
- The `pdf-viewer` MCP server is connected (`claude mcp list`). It opens and annotates PDFs. It does not parse tables or references.
- `uv` 0.12.12, Python 3.14 and Docker Desktop are on the PATH. The Python candidates below install with `uv`, and GROBID runs as a Docker image.

The gap is tooling that reads a paper the way intake needs it. That means LaTeX sections for tables (#3, #4), a parsed reference list with links (#5), and a check of claims against code and data (#9).

## Candidates

### 1. blazickjp/arxiv-mcp-server

- **Link:** https://github.com/blazickjp/arxiv-mcp-server
- **What it does:** An MCP server with 19 tools, including `search_papers`, `download_paper`, `read_paper`, `get_paper_latex`, `list_paper_latex_sections`, `get_paper_latex_section` and `citation_graph`.
- **How it reads papers:** `download_paper` converts arXiv HTML to Markdown and falls back to the PDF with the `[pdf]` extra. The LaTeX tools read the author's source archive, "validated, size-limited, and cached locally", one section at a time by outline ID or title. `citation_graph` gets references and citing papers from the Semantic Scholar API with one call per paper and a disk cache. Unauthenticated requests work until the quota runs out. The README does not say how it handles `\input` across files or tables inside sections.
- **License and activity:** Apache-2.0. Last push 2026-10-08, 3,211 stars.
- **Fit with Claude Code:** It installs in one line, `claude mcp add --transport stdio --scope user arxiv -- uvx arxiv-mcp-server`, or as a plugin. The README shows only user scope. Papers go to `~/.arxiv-mcp-server/papers` unless you pass `--storage-path`. It gives the section reader and the cataloger section-sized reads instead of whole files, which keeps worker context small (spec, story 35).

### 2. wanshuiyin/Auto-claude-code-research-in-sleep (ARIS)

- **Link:** https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep
- **What it does:** Markdown-only skills for autonomous ML research. An executor model drives and a model from another family reviews, Codex MCP by default (README).
- **How it reads papers:** [`research-lit`](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/research-lit/SKILL.md) reads the first 3 pages of local PDFs and arXiv metadata, and checks papers against arXiv, CrossRef and Semantic Scholar with `verify_papers.py`. It does not extract tables, figures or reference lists. Two audit skills are closer to this project. [`paper-claim-audit`](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/paper-claim-audit/SKILL.md) compares every number in a paper's `.tex` with raw result and config files. Per-claim verdicts include `exact_match`, `rounding_ok`, `config_mismatch`, `aggregation_mismatch` and `scope_overclaim`. It allows "Only standard rounding to displayed precision." [`citation-audit`](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/citation-audit/SKILL.md) checks each cited key for existence, metadata and context. Context verdicts are SUPPORTS, WEAK and WRONG.
- **License and activity:** MIT. Last push 2026-10-07, 17,267 stars.
- **Fit with Claude Code:** It installs as a plugin (`claude plugin marketplace add wanshuiyin/Auto-claude-code-research-in-sleep`, then `claude plugin install aris@aris`). Both audit skills require `mcp__codex__codex` and return ERROR when the reviewer call fails. This project's cross-family reviewer is local `qwen3.5:9b`, not Codex. The README changelog lists Ollama among alternative reviewers, but I did not confirm that the audit skills accept it.

### 3. hummat/paperpipe

- **Link:** https://github.com/hummat/paperpipe
- **What it does:** A CLI (`papi`) that keeps a local paper database of PDF, LaTeX source, `equations.md` with variable definitions, a summary and a TL;DR. It ships Claude Code skills `/papi`, `/verify-with-paper`, `/ground-with-paper`, `/compare-papers` and `/curate-paper-note`.
- **How it reads papers:** It pulls LaTeX from arXiv into `source.tex` and extracts key equations "for code verification". Figures come from LaTeX or PDF with the `[figures]` extra. The README does not describe tables or reference-list parsing.
- **License and activity:** MIT. Last push 2026-10-07, 37 stars, so a small project.
- **Fit with Claude Code:** `papi install skill --claude` and `papi install mcp --claude`. Summaries can go through `claude -p` with `PAPERPIPE_LLM_MODEL=claude-cli/sonnet` and no API key. `papi ask` and embeddings still need another backend. `/verify-with-paper` fits piece B, where training code has to match s1's equations and hyperparameters.

### 4. collaborative-deep-research/agent-papers-cli

- **Link:** https://github.com/collaborative-deep-research/agent-papers-cli
- **What it does:** Two CLIs. `paper` outlines, skims, reads and searches PDFs. `paper-search` queries Google, Google Scholar, Semantic Scholar and PubMed. It ships `/research-coordinator`, `/deep-research`, `/literature-review` and `/fact-check` skills.
- **How it reads papers:** It reads PDFs only, with PyMuPDF. Headings come from the PDF outline or a font-size heuristic, which the README calls fragile. The `[layout]` extra detects tables, figures and equations with DocLayout-YOLO. Cell-level table extraction is listed under future plans. `[ref=c5]` markers resolve bibliography entries, and `paper bibtex` enriches entries from arXiv, Semantic Scholar and Crossref.
- **License and activity:** Apache-2.0. Last push 2026-03-22, 50 stars.
- **Fit with Claude Code:** `pip install agent-papers-cli`, skills via `npx skills add collaborative-deep-research/agent-papers-cli`. It is useful for references that exist only as PDFs. It does not extract table cells, so it cannot feed the tables check.

### 5. Future-House/paper-qa (PaperQA2)

- **Link:** https://github.com/Future-House/paper-qa
- **What it does:** RAG over PDFs, text, Office files and source code, aimed at scientific papers. It returns answers with in-text citations.
- **How it reads papers:** The default parser is pypdf, with Docling and Nvidia nemotron-parse as options. The README says "All PDF readers now can parse images and tables", and an enrichment LLM writes captions for images and tables. Metadata comes from Semantic Scholar, Crossref, Unpaywall and OpenAlex, with a retraction check.
- **License and activity:** Apache-2.0. Last push 2026-09-25, 9,346 stars.
- **Fit with Claude Code:** No skill or MCP server in the README. It is a Python library and `pqa` CLI on Python 3.11+, calling models through LiteLLM with `gpt-4o-2024-11-20` as the default. Claude needs `ANTHROPIC_API_KEY`. Ollama works, but the README warns that 7B models perform poorly. It is built for questions across many papers. This intake reads one paper and 5 to 10 references.

### 6. karpathy/nanochat `read-arxiv-paper` skill

- **Link:** https://github.com/karpathy/nanochat/blob/master/.claude/skills/read-arxiv-paper/SKILL.md
- **What it does:** A single Claude Code skill. It turns an arXiv URL into the source URL, downloads and unpacks the archive to `~/.cache/nanochat/knowledge/`, finds the main `.tex` file, reads it and the files it includes, and writes `./knowledge/summary_{tag}.md` that ties the paper to nanochat.
- **How it reads papers:** It reads TeX source only ("not the PDF!"). It says nothing about tables, figures or references.
- **License and activity:** MIT (the nanochat repo). Last push 2026-09-07, 58,563 stars.
- **Fit with Claude Code:** You copy the folder into `.claude/skills/`. The intake layout already fetches the LaTeX source to `research/s1/raw/arxiv/latex/`, so the skill adds nothing beyond confirming that approach.

### 7. Orchestra-Research/AI-Research-SKILLs

- **Link:** https://github.com/Orchestra-Research/AI-Research-SKILLs
- **What it does:** 98 skills in 23 categories that cover the ML research cycle. The relevant ones are PEFT ("LoRA, QLoRA, DoRA, 25+ methods"), Unsloth ("2x faster QLoRA fine-tuning"), TRL in Post-Training, and lm-evaluation-harness in Evaluation. An `autoresearch` skill runs survey through writing.
- **How it reads papers:** The README lists no paper-reading skill. Literature survey appears only inside `autoresearch`.
- **License and activity:** MIT. Last push 2026-10-11, 13,447 stars.
- **Fit with Claude Code:** `/plugin marketplace add orchestra-research/AI-research-SKILLs`, then one category at a time, for example `/plugin install fine-tuning@ai-research-skills`. It has nothing for intake. The fine-tuning and evaluation categories match piece B, a QLoRA run on a model under 8B within 8 GB.

### 8. K-Dense-AI/scientific-agent-skills

- **Link:** https://github.com/K-Dense-AI/scientific-agent-skills (the old name `claude-scientific-skills` redirects there)
- **What it does:** 177 skills for biology, chemistry, medicine, physics, engineering and data analysis.
- **How it reads papers:** Paper Lookup searches arXiv, OpenAlex, Crossref, Semantic Scholar, Unpaywall and others. Paperclip returns "citations pinned to line numbers" and offers "figure vision analysis". LiteParse parses PDFs with bounding boxes and OCR. The README does not describe table extraction.
- **License and activity:** MIT for the repo, with a separate license per skill in each `SKILL.md`. Last push 2026-10-05, 48,394 stars.
- **Fit with Claude Code:** `npx skills add K-Dense-AI/scientific-agent-skills` or `gh skill install ... --agent claude-code`. It needs Python 3.13+ and `uv`, and the README lists "macOS, Linux, or Windows with WSL2", not native Windows. Most skills target life sciences, not LLM fine-tuning.

### 9. grobidOrg/grobid

- **Link:** https://github.com/grobidOrg/grobid (`kermitt2/grobid` redirects there)
- **What it does:** It parses scholarly PDFs into TEI XML, covering the header, the reference list with DOI and PMID, citation contexts linked to their references, and full text with sections, figures and tables.
- **How it reads papers:** It reads PDFs with CRF models by default and optional deep-learning models on an NVIDIA GPU. The README does not mention formulas.
- **License and activity:** Apache-2.0. Last push 2026-10-11, 5,168 stars.
- **Fit with Claude Code:** It is a REST service with Docker images and Python, Java and Node clients, but no skill. The README says "We cannot ensure currently support for Windows", so it would run in Docker Desktop here. It would let the cataloger parse the reference lists of Tier 1 references that ship only as PDFs.

## Ranked recommendation

1. **arxiv-mcp-server: install it now.** It is the only candidate whose tools line up with the intake workers. LaTeX by section serves the section reader and the tables worker. `citation_graph` gives the cataloger s1's references from Semantic Scholar. Adopting it changes two things in this project. Workers call MCP tools instead of reading whole LaTeX files from `research/s1/raw/`. The cataloger gets a second reference list to compare against the bibliography keys. The references check still works from s1's `.bib`, because Semantic Scholar's list can miss entries.
   **Next step:** run `claude mcp add --transport stdio --scope user arxiv -- uvx arxiv-mcp-server --storage-path "<scratchpad>/arxiv"`. Then call `list_paper_latex_sections` and `citation_graph` on `2501.19393` and compare the results with `research/s1/raw/arxiv/latex/` and the bibliography keys. Keep it if the section text matches the source and the references cover the `.bib`.
2. **ARIS audit skills: borrow the rules, don't install the plugin.** The verdict codes and the seven failure modes in `paper-claim-audit` map onto #9's VERIFIED / NOT VERIFIED / INCONCLUSIVE check. Examples are a config mismatch between paper and code, or a table caption that disagrees with its table. `citation-audit`'s SUPPORTS / WEAK / WRONG context verdict fits the "why s1 cites this" column in #5. Both skills hard-require Codex, so this project would copy the checklists into its own verifier brief and keep `qwen3.5:9b` as the second-family reviewer. Next step: add the failure-mode list to the #9 verifier brief.
3. **Orchestra AI-Research-SKILLs, fine-tuning and evaluation categories: defer to piece B.** It does nothing for intake. When piece B is specced, install `fine-tuning` and `evaluation` only, not all 98 skills, and check them against the 8 GB cap.
4. **paperpipe `/verify-with-paper`: try in piece B.** Its equation extraction would check training code against s1. It has 37 stars and one maintainer, so try it before relying on it.
5. **GROBID: keep as a fallback.** Use it only if Tier 1 references arrive as PDFs without LaTeX and the cataloger needs their reference lists. Run it in Docker.

Not adopted: PaperQA2, because it is cross-paper RAG that needs an API key and this project reads one paper. agent-papers-cli, because it has no cell-level tables yet and arxiv-mcp-server covers its reading tools. The nanochat skill, because the layout already does what it does. K-Dense, because it targets life sciences and needs WSL2.

## Decisions

| decision | why | evidence |
|---|---|---|
| Top pick is arxiv-mcp-server | Its section-level LaTeX tools and Semantic Scholar citation graph match the section reader, tables and cataloger workers. It installs with `uvx`, which is on this machine | https://github.com/blazickjp/arxiv-mcp-server ; `uv --version` gives 0.12.12 |
| Copy ARIS audit checklists instead of installing ARIS | Both audit skills require `mcp__codex__codex`, but this project's second-family reviewer is `qwen3.5:9b` | [paper-claim-audit](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/paper-claim-audit/SKILL.md), [citation-audit](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/citation-audit/SKILL.md) |
| Defer Orchestra and paperpipe to piece B | Their useful parts (QLoRA, lm-eval, equation checks) apply to training, which intake leaves out of scope | https://github.com/Orchestra-Research/AI-Research-SKILLs ; https://github.com/hummat/paperpipe ; spec #1 Out of Scope |
| GROBID only as a Docker fallback | No native Windows support, and Docker Desktop is installed | https://github.com/grobidOrg/grobid |
| Drop PaperQA2, agent-papers-cli, nanochat skill, K-Dense | Cross-paper RAG with an API key; no cell-level tables; duplicates the layout's LaTeX fetch; life sciences and WSL2 only | the README links in candidates 4, 5, 6 and 8 |
