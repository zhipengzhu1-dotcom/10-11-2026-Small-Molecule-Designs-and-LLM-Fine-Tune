#!/usr/bin/env node
// Trail check (issue #12). Records the result of the decision-log audit and the cross-family
// review of the trail. Writes one check event and exits 0 on pass, 1 on fail.
//
//   node factory/checks/trail.mjs [--root <repo>] [--run <id>] [--agent <id>] [--transcripts <dir>]
//
// Run and agent default as in check.mjs. --transcripts defaults to the main checkout's Claude Code
// transcripts folder, also when run from a git worktree.
//
// An audit is factory/audit/<run>.tsv, written by the run that audited the log (pstack
// show-me-your-work), with columns line, ts, verdict, superseded_by, pointers, note:
//   line, ts       the decision row's line in factory/decisions.tsv (header is line 1) and its ts
//   verdict        ok (true, and its pointers prove it) or superseded (wrong; a later row replaces it)
//   superseded_by  for superseded, the line of the row that replaces it
//   pointers       for ok, what the auditor checked, "; "-separated, in the one pointer grammar
//                  (factory/pointer.mjs, shared with npm run decide): file:<path>[:<line>[-<line>]]
//                  (repo-relative, or ~/ for the home dir), commit:<sha>,
//                  transcript:<session-id>@<ISO time prefix>, issue:<n>, url:<url>
// Beside it, <run>.review.md holds the cross-family review, with a "reviewed by <model>" line.
//
// It fails when:
//   - a committed version of the log is not a prefix of the working copy (append-only)
//   - a decision row has no verdict, or a verdict names no row or the wrong ts
//   - an ok verdict has no pointers, or a file, commit or transcript pointer does not resolve
//     (issue: and url: need the network and are taken as given). A repo file: pointer whose file
//     was deleted or shortened since resolves at the commit that added its audit row, and the
//     evidence names that commit
//   - a file pointer names a gitignored path, which only one checkout has
//   - a superseded verdict names no later row
//   - there is no audit, an audit has no review, or the reviewer is a Claude model
//   - a row has an empty cell, or a phase other than `start` that is not a lowercase slash path
//     under the log's one root (the first segment of its first such phase), so the phases form
//     one tree
//   - a row from 2026-10-12 on records a push or PR (phase ending /push or /pr): git and GitHub
//     hold that record, and the row would land in a commit after the push
//   - a row from CLAIM_RULES_FROM (factory/claim.mjs) on has a result that does not start with a
//     claim state, or a decision cell that starts with a relation word but is not a well-formed
//     relation prefix ("<relation> line N[ (part)]: ", "closes challenge <id>: "), or names a line
//     that is not an earlier decision row
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAIM_RULES_FROM, claimState, parseRelations } from '../claim.mjs';
import { gitRun as git } from '../git.mjs';
import { lineProblem, parsePointer, resolvePointer } from '../pointer.mjs';
import { projectTranscripts } from '../transcript.mjs';
import { checkCli } from './check.mjs';

const tsvLines = (text) => text.split(/\r?\n/).slice(1).filter((l) => l !== '').map((l) => l.split('\t'));

// Decision rows as { line, ts, cells }, numbered by their line in the file (the header is line 1).
export function readLog(text) {
  return text.split(/\r?\n/)
    .map((line, i) => ({ line: i + 1, ts: line.split('\t')[0], cells: line.split('\t'), text: line }))
    .filter((r) => r.line > 1 && r.text !== '');
}

// The commit that added audit verdict `v`: the oldest commit of its audit file holding its line.
// Null when the row was never committed.
function addedIn(opts, v) {
  const rel = `factory/audit/${v.audit}`;
  const log = git(opts.root, 'log', '--format=%h', '--reverse', '--', rel);
  if (log.status !== 0) return null;
  return log.stdout.split('\n').filter(Boolean).find((sha) => {
    const old = git(opts.root, 'show', `${sha}:${rel}`);
    return old.status === 0 && old.stdout.split(/\r?\n/).includes(v.text);
  }) ?? null;
}

// Whether one audit pointer of verdict `v` resolves: { problem } when it does not, { note } when it
// resolves only at the commit that added `v` (a cited file deleted or shortened since), else null.
// The pointers are parsed and resolved by the shared grammar (pointer.mjs); every item of the
// pointers cell must be a pointer, so prose there is an unknown pointer.
function pointerProblem(text, v, opts) {
  const p = parsePointer(text) ?? { text, problem: `unknown pointer ${text}` };
  const now = resolvePointer(p, opts);
  if (!now?.changed) return now;
  const sha = addedIn(opts, v);
  const old = sha && git(opts.root, 'show', `${sha}:${p.path}`);
  if (old?.status === 0 && !lineProblem(p, () => old.stdout)) {
    return { note: `${p.text} resolved at ${sha}, the commit that added its audit row` };
  }
  return { problem: now.problem };
}

// Append-only: every committed version of the log must be a prefix of the working copy. Reports
// the first difference against the oldest commit that breaks it, so one rewrite is one problem.
function historyCheck(opts, text) {
  const rel = 'factory/decisions.tsv';
  const log = git(opts.root, 'log', '--format=%h', '--', rel);
  if (log.status !== 0) return { commits: 0, problem: `cannot read git history of ${rel}: ${log.stderr.trim()}` };
  const shas = log.stdout.split('\n').filter(Boolean).reverse();
  const now = text.split(/\r?\n/);
  for (const sha of shas) {
    const old = git(opts.root, 'show', `${sha}:${rel}`);
    if (old.status !== 0) continue; // the commit deleted the file
    const lines = old.stdout.split(/\r?\n/).filter((l, i, all) => l !== '' || i < all.length - 1);
    const i = lines.findIndex((l, j) => l !== now[j]);
    if (i < 0) continue;
    const what = now[i] === undefined || now[i] === '' ? `line ${i + 1} is missing (committed in ${sha})` : `line ${i + 1} differs from commit ${sha}`;
    return { commits: shas.length, problem: `not append-only: ${what}` };
  }
  return { commits: shas.length };
}

// The orchestrator is a Claude model, so a cross-family reviewer is anything else.
const CLAUDE = /claude|opus|sonnet|haiku|fable/i;

// The reviewer named by the "reviewed by <model>" line of the review beside an audit file
// (<run>.tsv and <run>.review.md), or a problem.
function reviewOf(auditDir, file) {
  const shown = `factory/audit/${file.replace(/\.tsv$/, '.review.md')}`;
  const path = join(auditDir, file.replace(/\.tsv$/, '.review.md'));
  if (!existsSync(path)) return { problem: `${shown}: no cross-family review` };
  const m = /^reviewed by (\S.*)$/m.exec(readFileSync(path, 'utf8'));
  if (!m) return { problem: `${shown}: no "reviewed by <model>" line` };
  const reviewer = m[1].trim();
  return CLAUDE.test(reviewer) ? { reviewer, problem: `${shown}: reviewed by ${reviewer}, the same family as the orchestrator` } : { reviewer };
}

// What is wrong with one audit verdict on decision row `row`, plus notes on pointers that resolved
// only in history. An ok row needs pointers that resolve; a superseded row needs a later row in
// the log that replaces it.
export function verdictProblems(v, row, log, opts) {
  const problems = [];
  const notes = [];
  if (v.ts !== row.ts) problems.push(`audit ts ${v.ts} does not match`);
  if (v.verdict === 'ok') {
    if (!v.pointers.length) problems.push('ok with no pointers');
    for (const p of v.pointers) {
      const r = pointerProblem(p, v, opts);
      if (r?.problem) problems.push(r.problem);
      if (r?.note) notes.push(r.note);
    }
  } else if (v.verdict === 'superseded') {
    if (!(v.by > row.line && log.some((r) => r.line === v.by))) problems.push('superseded with no later row replacing it');
  } else problems.push(`invalid verdict "${v.verdict}"`);
  return { problems, notes };
}

const COLUMNS = ['ts', 'phase', 'decision', 'why', 'evidence', 'result'];
const PHASE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

// A row recording a push or PR is committed after the push, so it always misses it and strands
// a commit (e75baac needed its own PR, #39). Git and GitHub already hold that record. The rows
// logged before this rule (lines 21, 71, 75, 76 of the s1 log) stay, since the log is append-only.
const REMOTE = /\/(push|pr)$/;
const REMOTE_RULE_FROM = '2026-10-12';

// What is wrong with a row's own cells. `start` rows mark where a run's rows begin
// (show-me-your-work) and sit outside the tree.
function rowProblems(row, treeRoot) {
  const problems = COLUMNS.filter((c, i) => !row.cells[i]?.trim()).map((c) => `empty ${c}`);
  const phase = row.cells[1] ?? '';
  if (!phase || phase === 'start') return problems;
  if (!PHASE.test(phase)) problems.push(`phase "${phase}" is not a lowercase slash path`);
  else if (phase.split('/')[0] !== treeRoot) problems.push(`phase "${phase}" is not under ${treeRoot}/`);
  if (REMOTE.test(phase) && row.ts >= REMOTE_RULE_FROM) {
    problems.push(`phase "${phase}" records a push or PR; git and GitHub hold that record, so log no decision row for it`);
  }
  return [...problems, ...claimProblems(row)];
}

// From CLAIM_RULES_FROM on, result starts with a claim state and the decision's relations are
// well formed and name earlier rows (claim.mjs, the decision writer's grammar). Earlier rows,
// such as the "supersedes line N:" rows of the s1 log, stay valid as written.
function claimProblems(row) {
  if (row.ts < CLAIM_RULES_FROM) return [];
  const problems = [];
  const { problem } = claimState(row.cells[5]);
  if (problem) problems.push(`result: ${problem}`);
  const parsed = parseRelations(row.cells[2] ?? '');
  if (parsed.problem) problems.push(parsed.problem);
  for (const r of parsed.relations.filter((x) => x.kind !== 'closes')) {
    if (r.line < 2 || r.line >= row.line) problems.push(`${r.kind} line ${r.line} is not an earlier decision row`);
  }
  return problems;
}

function runCheck(opts) {
  opts = { transcripts: projectTranscripts(opts.root), ...opts };
  const auditDir = join(opts.root, 'factory', 'audit');
  const text = readFileSync(join(opts.root, 'factory', 'decisions.tsv'), 'utf8');
  const log = readLog(text);
  const history = historyCheck(opts, text);
  const audits = existsSync(auditDir) ? readdirSync(auditDir).filter((f) => f.endsWith('.tsv')) : [];
  const verdicts = audits.flatMap((f) => tsvLines(readFileSync(join(auditDir, f), 'utf8'))
    .map((cells) => {
      const [line, ts, verdict, by, pointers = ''] = cells;
      return {
        line: Number(line), ts, verdict, by: Number(by), audit: f, text: cells.join('\t'),
        pointers: pointers.split(';').map((p) => p.trim()).filter(Boolean),
      };
    }));
  const reviews = audits.map((f) => reviewOf(auditDir, f));

  const problems = history.problem ? [history.problem] : [];
  if (!audits.length) problems.push('no audit file in factory/audit/');
  problems.push(...reviews.map((r) => r.problem).filter(Boolean));
  for (const v of verdicts) {
    if (!log.some((r) => r.line === v.line)) problems.push(`audit line ${v.line}: no such decision row`);
  }
  const treeRoot = log.map((r) => r.cells[1]).find((p) => p && p !== 'start')?.split('/')[0];
  const notes = [];
  let ok = 0;
  let superseded = 0;
  for (const r of log) {
    const rowVerdicts = verdicts.filter((v) => v.line === r.line);
    const at = `line ${r.line} (${r.ts})`;
    problems.push(...rowProblems(r, treeRoot).map((p) => `${at}: ${p}`));
    if (!rowVerdicts.length) problems.push(`${at}: no audit verdict`);
    else if (rowVerdicts.some((v) => v.verdict === 'superseded')) superseded++;
    else ok++;
    for (const v of rowVerdicts) {
      const found = verdictProblems(v, r, log, opts);
      problems.push(...found.problems.map((p) => `${at}: ${p}`));
      notes.push(...found.notes.map((n) => `${at}: ${n}`));
    }
  }

  const where = `factory/decisions.tsv: append-only across ${history.commits} commits; ${log.length} decision rows audited (${ok} ok, ${superseded} superseded); reviewed by ${reviews.map((r) => r.reviewer).filter(Boolean).join(', ') || 'no one'}`;
  return { evidence: [where, ...notes, ...problems].join('; '), problems };
}

checkCli(import.meta.url, {
  name: 'trail',
  usage: 'node factory/checks/trail.mjs [--root <repo>] [--run <id>] [--agent <id>] [--transcripts <dir>]',
  options: { transcripts: 'string' },
}, runCheck);
