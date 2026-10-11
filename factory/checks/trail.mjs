#!/usr/bin/env node
// Trail check (issue #12). Records the result of the decision-log audit and the cross-family
// review of the trail. Writes one check event and exits 0 on pass, 1 on fail.
//
//   node factory/checks/trail.mjs [--root <repo>] [--run <id>] [--agent <id>] [--transcripts <dir>]
//
// Run and agent default to FACTORY_RUN and FACTORY_AGENT, else run "manual" and agent
// "orchestrator". --transcripts defaults to this project's Claude Code transcripts folder.
//
// An audit is factory/audit/<run>.tsv, written by the run that audited the log (pstack
// show-me-your-work), with columns line, ts, verdict, superseded_by, pointers, note:
//   line, ts       the decision row's line in factory/decisions.tsv (header is line 1) and its ts
//   verdict        ok (true, and its pointers prove it) or superseded (wrong; a later row replaces it)
//   superseded_by  for superseded, the line of the row that replaces it
//   pointers       for ok, what the auditor checked, "; "-separated: file:<path>[:<line>[-<line>]]
//                  (repo-relative, or ~/ for the home dir), commit:<sha>,
//                  transcript:<session-id>@<ISO time prefix>, issue:<n>, url:<url>
// Beside it, <run>.review.md holds the cross-family review, with a "reviewed by <model>" line.
//
// It fails when:
//   - a committed version of the log is not a prefix of the working copy (append-only)
//   - a decision row has no verdict, or a verdict names no row or the wrong ts
//   - an ok verdict has no pointers, or a file, commit or transcript pointer does not resolve
//     (issue: and url: need the network and are taken as given)
//   - a superseded verdict names no later row
//   - there is no audit, an audit has no review, or the reviewer is a Claude model
//   - a row has an empty cell, or a phase other than `start` that is not a lowercase slash path
//     under the log's one root (the first segment of its first such phase), so the phases form
//     one tree
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRoot, writeEvent } from '../log.mjs';

function parseArgs(argv, env = process.env) {
  const opts = { root: defaultRoot(env), run: env.FACTORY_RUN || 'manual', agent: env.FACTORY_AGENT || 'orchestrator' };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, '');
    if (!['root', 'run', 'agent', 'transcripts'].includes(name) || i + 1 >= argv.length) {
      throw new Error(`unknown or incomplete argument: ${argv[i]}`);
    }
    opts[name] = argv[++i];
  }
  return opts;
}

const tsvLines = (text) => text.split(/\r?\n/).slice(1).filter((l) => l !== '').map((l) => l.split('\t'));

// Decision rows as { line, ts, cells }, numbered by their line in the file (the header is line 1).
function readLog(text) {
  return text.split(/\r?\n/)
    .map((line, i) => ({ line: i + 1, ts: line.split('\t')[0], cells: line.split('\t'), text: line }))
    .filter((r) => r.line > 1 && r.text !== '');
}

const git = (root, ...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });

// Claude Code keeps a project's transcripts under ~/.claude/projects/<project path, every
// character other than a letter or digit turned into "-">.
const defaultTranscripts = (root) => join(homedir(), '.claude', 'projects', resolve(root).replace(/[^A-Za-z0-9]/g, '-'));

// Transcripts run to megabytes and many pointers name the same one, so each is read once.
const transcripts = new Map();
function transcript(file) {
  if (!transcripts.has(file)) transcripts.set(file, readFileSync(file, 'utf8'));
  return transcripts.get(file);
}

// Why one audit pointer does not resolve, or null when it does. issue: and url: need the network,
// so they are taken as given.
function pointerProblem(p, opts) {
  const colon = p.indexOf(':');
  const kind = p.slice(0, colon);
  const value = p.slice(colon + 1);
  if (kind === 'file') {
    const [, path, from, to] = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(value);
    const full = path.startsWith('~/') ? join(homedir(), path.slice(2)) : join(opts.root, path);
    if (!existsSync(full)) return `${p} does not exist`;
    if (!from) return null;
    const lines = readFileSync(full, 'utf8').replace(/\r?\n$/, '').split(/\r?\n/).length;
    return Number(to ?? from) > lines ? `${p} is past the end of the file (${lines} lines)` : null;
  }
  if (kind === 'commit') {
    return /^[0-9a-f]{7,40}$/.test(value) && git(opts.root, 'cat-file', '-e', `${value}^{commit}`).status === 0
      ? null : `${p} is not a commit`;
  }
  if (kind === 'transcript') {
    const [session, at] = value.split('@');
    const file = join(opts.transcripts, `${session}.jsonl`);
    if (!existsSync(file)) return `${p} does not exist`;
    return at && !transcript(file).includes(`"timestamp":"${at}`) ? `${p} has no line at that time` : null;
  }
  if (kind === 'issue' || kind === 'url') return null;
  return `unknown pointer ${p}`;
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

// What is wrong with one audit verdict on decision row `row`. An ok row needs pointers that
// resolve; a superseded row needs a later row in the log that replaces it.
function verdictProblems(v, row, log, opts) {
  const problems = [];
  if (v.ts !== row.ts) problems.push(`audit ts ${v.ts} does not match`);
  if (v.verdict === 'ok') {
    if (!v.pointers.length) problems.push('ok with no pointers');
    for (const p of v.pointers) problems.push(pointerProblem(p, opts));
  } else if (v.verdict === 'superseded') {
    if (!(v.by > row.line && log.some((r) => r.line === v.by))) problems.push('superseded with no later row replacing it');
  } else problems.push(`invalid verdict "${v.verdict}"`);
  return problems.filter(Boolean);
}

const COLUMNS = ['ts', 'phase', 'decision', 'why', 'evidence', 'result'];
const PHASE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

// What is wrong with a row's own cells. `start` rows mark where a run's rows begin
// (show-me-your-work) and sit outside the tree.
function rowProblems(row, treeRoot) {
  const problems = COLUMNS.filter((c, i) => !row.cells[i]?.trim()).map((c) => `empty ${c}`);
  const phase = row.cells[1] ?? '';
  if (!phase || phase === 'start') return problems;
  if (!PHASE.test(phase)) problems.push(`phase "${phase}" is not a lowercase slash path`);
  else if (phase.split('/')[0] !== treeRoot) problems.push(`phase "${phase}" is not under ${treeRoot}/`);
  return problems;
}

export function runCheck(opts) {
  opts = { transcripts: defaultTranscripts(opts.root), ...opts };
  const auditDir = join(opts.root, 'factory', 'audit');
  const text = readFileSync(join(opts.root, 'factory', 'decisions.tsv'), 'utf8');
  const log = readLog(text);
  const history = historyCheck(opts, text);
  const audits = existsSync(auditDir) ? readdirSync(auditDir).filter((f) => f.endsWith('.tsv')) : [];
  const verdicts = audits.flatMap((f) => tsvLines(readFileSync(join(auditDir, f), 'utf8'))
    .map(([line, ts, verdict, by, pointers = '']) => ({
      line: Number(line), ts, verdict, by: Number(by),
      pointers: pointers.split(';').map((p) => p.trim()).filter(Boolean),
    })));
  const reviews = audits.map((f) => reviewOf(auditDir, f));

  const problems = history.problem ? [history.problem] : [];
  if (!audits.length) problems.push('no audit file in factory/audit/');
  problems.push(...reviews.map((r) => r.problem).filter(Boolean));
  for (const v of verdicts) {
    if (!log.some((r) => r.line === v.line)) problems.push(`audit line ${v.line}: no such decision row`);
  }
  const treeRoot = log.map((r) => r.cells[1]).find((p) => p && p !== 'start')?.split('/')[0];
  let ok = 0;
  let superseded = 0;
  for (const r of log) {
    const mine = verdicts.filter((v) => v.line === r.line);
    const at = `line ${r.line} (${r.ts})`;
    problems.push(...rowProblems(r, treeRoot).map((p) => `${at}: ${p}`));
    if (!mine.length) problems.push(`${at}: no audit verdict`);
    else if (mine.some((v) => v.verdict === 'superseded')) superseded++;
    else ok++;
    for (const v of mine) problems.push(...verdictProblems(v, r, log, opts).map((p) => `${at}: ${p}`));
  }

  const result = problems.length ? 'fail' : 'pass';
  const where = `factory/decisions.tsv: append-only across ${history.commits} commits; ${log.length} decision rows audited (${ok} ok, ${superseded} superseded); reviewed by ${reviews.map((r) => r.reviewer).filter(Boolean).join(', ') || 'no one'}`;
  const evidence = problems.length ? `${where}; ${problems.join('; ')}` : where;
  writeEvent({ root: opts.root, run: opts.run, agent: opts.agent, type: 'check', fields: { name: 'trail', result, evidence } });
  return { result, evidence };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { result, evidence } = runCheck(parseArgs(process.argv.slice(2)));
    process.stdout.write(`trail: ${result}: ${evidence}\n`);
    process.exit(result === 'pass' ? 0 : 1);
  } catch (err) {
    process.stderr.write(`trail.mjs: ${err.message}\n`);
    process.exit(2);
  }
}
