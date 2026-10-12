# Notes on spec #1's story map

Ticket #61. The map is `factory/stories/1.tsv`: all 47 user stories of issue #1, 89 rows. 28 stories name a check or test, and 19 are `none` rows. `npm run check:stories` passes on it.

It started from the hand mapping the assurance-case research built (`research/orchestration/assurance-case.md` on branch `research/assurance-case`, section 4, and its scratchpad `stories.tsv`). That mapping cited event timestamps and decision rows. A story map can only name `check:*` scripts and declared test names, so each story was mapped again against today's tree.

## Stories with no evidence

A `none` row means no check script and no named test stands behind the story. Some of these stories have an artifact or a decision row behind them, but a map can't name those, so they're listed here with what does exist.

**The research's three (N): still none.**

- **18**, stop and ask at a login or captcha. It's agent behaviour in a browser session. Nothing logs it and no test can drive it.
- **44**, the final reply ends with an Attention section. The reply exists only in the session transcript, and no check reads replies.
- **46**, plain language with no AI filler. It's a judgement about prose. No local check scores it.

**Artifact only in the research (A): still none.** The output exists, but nothing judges it.

- **2**, section summary.
- **3**, claim IDs with section references. The brief check reads only the brief's `ID` tables, not the notes' claim IDs.
- **7**, why s1 cites each reference. The catalog's `why` column has no check.
- **9**, key references read and summarised.
- **10**, every claim checked with a verdict. The brief check validates the verdicts of the brief's parameter rows only. Nothing confirms that every claim in `research/s1/verification.md` has one.
- **12**, two independent reviewers.
- **14**, tool scout report.
- **17**, blocked downloads retried in Chrome.

**Judgement only in the research (J): still none.** Only decision rows stand behind these.

- **8**, Tier 1 references flagged.
- **15**, open-access copies looked up through arXiv, OpenAlex and Semantic Scholar first. `scripts/catalog-refs.mjs` implements that order, but its tests use fake arXiv and web hosts with one-word titles, so no OpenAlex or Semantic Scholar lookup is ever tested.
- **16**, closed references left alone. `catalog-refs.mjs` makes no attempt on a closed reference, but no test covers that.
- **22**, downloads never executed. The fetch-page tests reduce a dropped file's name to a plain name inside the raw folder, and `fetch:s1` refuses a file whose SHA-256 differs. Both treat inputs as untrusted, but neither tests that a download is never run.
- **35**, raw PDFs and LaTeX kept out of the orchestrator's context.
- **45**, lessons turned into skill edits. Those edits live in `~/.claude/skills/orchestrator-lessons`, outside the repo.
- **47**, commit locally and ask before any push. The pre-push hook tests the pushed commit, but nothing records the asking.

## What the research mapping got wrong

- **26, the seeded decisions, was marked check-backed. It is none.** The research cited `npm-test` at 21:19:22Z, which ran the test "the merged stream includes the seeded 2026-10-11 decisions, and their phases form one tree" (`decisions.test.mjs` at `d4b3bae`). That test read the live decision log. Commit `271c5ba` (#12) removed it under the fixtures rule, before the research's HEAD `af3bdea`, so the research cited evidence that was already gone. A data check could restore it, for example a trail-check rule that the seeded phases are present.
- **33, the stable event schema, had an open defeater (#21). #21 has since closed** (`83dda25`, `d960f6c`, #62), and tests now pin the contract: every event carries `ts`, `run`, `agent` and `type`, with a null `run` only on decision events. The map names those tests.
- **Check-backed stories cited ad hoc check names.** `npm-test`, `npm test`, `npm-test-after-merge-6` and `fetch-page-browser` aren't `check:*` scripts, so a map can't name them. Each such story now names the tests inside those runs: stories 1, 11, 19 to 21, 28 to 32, 34 and 38.
- **5, figures described with axes, trend and key values, is only partly covered by the tables check.** `check:tables` compares numbers in tabulars inside figure floats too. Nothing checks a figure's described axes or trend.
- **6, the reference catalog, is only partly covered.** `check:references` checks keys and statuses, not titles, years or links.
- **36, stop near 150k tokens, moves from judgement to one test.** The context meter, built since the research, puts the token count in front of the orchestrator. The test covers that count. The stop, the status note and the split into issues are still judgement.

## Limits of the check that shaped the map

- **Wrapped tests can't be named.** `trail.test.mjs`, `audit.test.mjs`, `licenses.test.mjs` and `merge.test.mjs` declare their tests through `const t = (name, fn) => test(name, ...)`, which the check's declaration grammar doesn't read. Stories 24, 25, 27, 42 and 43 therefore name `check trail` instead of tests such as "a log whose committed row was edited or removed fails and the evidence names the line and commit" (27) or "a review by a Claude model fails because it is not cross-family" (43). Extending the grammar to `t(` would let the map name them. That's a change to #60's check, so it's left for a follow-up. (Done in spec #52's code-review fix pass: the check now reads a wrapper a test file defines around `test()`, and stories 24, 25, 27, 42 and 43 name those tests beside `check trail`.)
- **Generated test names can't be named.** The writer's missing-field tests (story 30) and the hooks test for a stop from an agent that never started (story 31's exception) build their names from a template. The map names their neighbours instead.
