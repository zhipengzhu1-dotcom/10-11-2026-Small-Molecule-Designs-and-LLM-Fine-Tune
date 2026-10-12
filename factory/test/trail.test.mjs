import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CHECK = join(FACTORY, 'checks', 'trail.mjs');
const AUDIT_RUN = 'audit-run';

// The trail check reads git history, so its tests need git (the Docker CI image has it).
const hasGit = spawnSync('git', ['--version']).status === 0;
const t = (name, fn) => test(name, { skip: !hasGit && 'git is not installed' }, fn);

const row = (...cells) => cells.join('\t') + '\n';
const HEADER = row('ts', 'phase', 'decision', 'why', 'evidence', 'result');
const ROWS = [
  row('2026-10-11T10:00:00Z', 'project/a', 'fetched the source', 'tables need it', 'notes/source.md', 'done'),
  row('2026-10-11T10:05:00Z', 'project/b', 'picked 3 epochs', 'the paper says 5', 'notes/source.md:2', 'adopted'),
];
const AUDIT_HEADER = row('line', 'ts', 'verdict', 'superseded_by', 'pointers', 'note');
const GOOD_AUDIT = [
  row('2', '2026-10-11T10:00:00Z', 'ok', '', 'file:notes/source.md; transcript:sess-1@2026-10-11T10:00:00', 'matches'),
  row('3', '2026-10-11T10:05:00Z', 'ok', '', 'file:notes/source.md:2; issue:4', 'matches'),
];
const GOOD_REVIEW = '# Trail review\n\nreviewed by qwen3.5:9b\n\n- No flags.\n';

function git(root, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', root, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function put(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

// A repo whose decision log is committed, with a transcripts dir beside it. `history` is the list
// of decisions.tsv versions to commit in order; the last one stays in the working tree.
function fixture({ history = [HEADER + ROWS.join('')], audit = AUDIT_HEADER + GOOD_AUDIT.join(''), review = GOOD_REVIEW } = {}) {
  const root = tempRoot();
  git(root, 'init', '-q');
  put(root, 'notes/source.md', 'line one\nline two\n');
  for (const version of history) {
    put(root, 'factory/decisions.tsv', version);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'log');
  }
  if (audit !== null) put(root, `factory/audit/${AUDIT_RUN}.tsv`, audit);
  if (review !== null) put(root, `factory/audit/${AUDIT_RUN}.review.md`, review);
  const transcripts = join(root, 'transcripts');
  put(root, 'transcripts/sess-1.jsonl', '{"type":"user","timestamp":"2026-10-11T10:00:00.123Z"}\n');
  return { root, transcripts };
}

// Runs the check CLI the way an agent does and returns its exit status plus the check events it wrote.
function check({ root, transcripts }) {
  const r = spawnSync(process.execPath, [CHECK, '--root', root, '--run', 'run-1', '--agent', 'auditor',
    '--transcripts', transcripts], { encoding: 'utf8' });
  const events = readStream(root).filter((e) => e.type === 'check');
  return { ...r, events };
}

t('a fully audited, append-only trail with a named reviewer passes and logs a pass check event', () => {
  const r = check(fixture());
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].name, 'trail');
  assert.equal(r.events[0].result, 'pass');
  assert.match(r.events[0].evidence, /2 decision rows audited \(2 ok, 0 superseded\)/);
  assert.match(r.events[0].evidence, /reviewed by qwen3\.5:9b/);
});

t('with no --run and no FACTORY_RUN, the check files its event under run "manual"', () => {
  const f = fixture();
  const env = { ...process.env };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'FACTORY_AGENT', 'CLAUDE_PROJECT_DIR']) delete env[k];
  const r = spawnSync(process.execPath, [CHECK, '--root', f.root, '--transcripts', f.transcripts], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const checks = readStream(f.root).filter((e) => e.type === 'check');
  assert.deepEqual(checks.map((e) => [e.run, e.agent, e.result]), [['manual', 'orchestrator', 'pass']]);
});

t('a decision row with no audit verdict fails and the evidence names its line', () => {
  const r = check(fixture({ audit: AUDIT_HEADER + GOOD_AUDIT[0] }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /line 3 \(2026-10-11T10:05:00Z\): no audit verdict/);
  assert.doesNotMatch(r.events[0].evidence, /line 2 /);
});

t('an ok verdict whose pointers do not resolve fails and the evidence names the line and pointer', () => {
  const r = check(fixture({ audit: AUDIT_HEADER
    + row('2', '2026-10-11T10:00:00Z', 'ok', '', 'file:notes/gone.md; commit:abcdef1; transcript:sess-1@2026-10-11T09:59:59', 'x')
    + row('3', '2026-10-11T10:05:00Z', 'ok', '', 'file:notes/source.md:3; transcript:sess-2@2026-10-11T10:00:00; doc:whatever', 'x') }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  const ev = r.events[0].evidence;
  assert.equal(r.events[0].result, 'fail');
  assert.match(ev, /line 2 \(2026-10-11T10:00:00Z\): file:notes\/gone\.md does not exist/);
  assert.match(ev, /line 2 \(2026-10-11T10:00:00Z\): commit:abcdef1 is not a commit/);
  assert.match(ev, /line 2 \(2026-10-11T10:00:00Z\): transcript:sess-1@2026-10-11T09:59:59 has no line at that time/);
  assert.match(ev, /line 3 \(2026-10-11T10:05:00Z\): file:notes\/source\.md:3 is past the end of the file \(2 lines\)/);
  assert.match(ev, /line 3 \(2026-10-11T10:05:00Z\): transcript:sess-2@2026-10-11T10:00:00 does not exist/);
  assert.match(ev, /line 3 \(2026-10-11T10:05:00Z\): unknown pointer doc:whatever/);
});

t('a file pointer to a gitignored path fails even though the file exists, since only one checkout has it', () => {
  const f = fixture();
  put(f.root, '.gitignore', 'notes/raw/\n');
  put(f.root, 'notes/raw/page.md', 'downloaded\n');
  put(f.root, `factory/audit/${AUDIT_RUN}.tsv`, AUDIT_HEADER
    + row('2', '2026-10-11T10:00:00Z', 'ok', '', 'file:notes/raw/page.md; file:notes/source.md', 'x')
    + GOOD_AUDIT[1]);
  const r = check(f);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /line 2 \(2026-10-11T10:00:00Z\): file:notes\/raw\/page\.md is gitignored; cite a tracked file, commit or transcript instead/);
  assert.doesNotMatch(r.events[0].evidence, /source\.md is gitignored/);
});

t('run from a git worktree with no --transcripts, the check reads the main checkout\'s transcripts folder', () => {
  const f = fixture();
  put(f.root, `factory/audit/${AUDIT_RUN}.review.md`, GOOD_REVIEW);
  git(f.root, 'add', '-A');
  git(f.root, 'commit', '-q', '-m', 'audit');
  const tree = join(tempRoot(), 'wt');
  git(f.root, 'worktree', 'add', '-q', '--detach', tree);
  // Claude Code names a project's transcripts folder after the main checkout's path.
  const home = tempRoot();
  const slug = git(f.root, 'rev-parse', '--show-toplevel').replace(/[^A-Za-z0-9]/g, '-');
  put(home, `.claude/projects/${slug}/sess-1.jsonl`, '{"type":"user","timestamp":"2026-10-11T10:00:00.123Z"}\n');
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'FACTORY_AGENT', 'CLAUDE_PROJECT_DIR']) delete env[k];
  const r = spawnSync(process.execPath, [CHECK, '--root', tree], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

t('pointers to a real commit and a line range resolve; an ok verdict with no pointers fails', () => {
  const f = fixture();
  const sha = git(f.root, 'rev-parse', '--short', 'HEAD');
  put(f.root, `factory/audit/${AUDIT_RUN}.tsv`, AUDIT_HEADER
    + row('2', '2026-10-11T10:00:00Z', 'ok', '', `commit:${sha}; file:notes/source.md:1-2; url:https://example.org`, 'x')
    + row('3', '2026-10-11T10:05:00Z', 'ok', '', '', 'x'));
  const r = check(f);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /line 3 \(2026-10-11T10:05:00Z\): ok with no pointers/);
  assert.doesNotMatch(r.events[0].evidence, /line 2 /);
});

// A fixture whose audit cites notes/old.md, committed together, after which old.md is deleted.
// Returns the short sha of the commit that added the audit.
function deletedSource(audit) {
  const f = fixture({ audit });
  put(f.root, 'notes/old.md', 'old one\nold two\n');
  git(f.root, 'add', '-A');
  git(f.root, 'commit', '-q', '-m', 'audit');
  const sha = git(f.root, 'rev-parse', '--short', 'HEAD');
  git(f.root, 'rm', '-q', 'notes/old.md');
  git(f.root, 'commit', '-q', '-m', 'delete old.md');
  return { ...f, sha };
}

t('a file pointer deleted after its audit row was committed resolves at that commit, and the evidence says so', () => {
  const f = deletedSource(AUDIT_HEADER + GOOD_AUDIT[0]
    + row('3', '2026-10-11T10:05:00Z', 'ok', '', 'file:notes/old.md:2; issue:4', 'matches'));
  const r = check(f);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'pass');
  assert.match(r.events[0].evidence, new RegExp(
    `line 3 \\(2026-10-11T10:05:00Z\\): file:notes/old\\.md:2 resolved at ${f.sha}, the commit that added its audit row`));
  assert.doesNotMatch(r.events[0].evidence, /line 2 /);
});

t('a deleted file pointer fails when it did not resolve at the commit that added its audit row either', () => {
  // Row 2 cites a line old.md never had; row 3 was committed only after old.md was deleted.
  const f = deletedSource(AUDIT_HEADER
    + row('2', '2026-10-11T10:00:00Z', 'ok', '', 'file:notes/old.md:3', 'x'));
  put(f.root, `factory/audit/${AUDIT_RUN}.tsv`, AUDIT_HEADER
    + row('2', '2026-10-11T10:00:00Z', 'ok', '', 'file:notes/old.md:3', 'x')
    + row('3', '2026-10-11T10:05:00Z', 'ok', '', 'file:notes/old.md:1', 'x'));
  git(f.root, 'add', '-A');
  git(f.root, 'commit', '-q', '-m', 'audit row 3');
  const r = check(f);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  const ev = r.events[0].evidence;
  assert.match(ev, /line 2 \(2026-10-11T10:00:00Z\): file:notes\/old\.md:3 does not exist/);
  assert.match(ev, /line 3 \(2026-10-11T10:05:00Z\): file:notes\/old\.md:1 does not exist/);
  assert.doesNotMatch(ev, /resolved at/);
});

const FIX = row('2026-10-11T11:00:00Z', 'project/b', 'supersedes line 3: picked 5 epochs', 'the paper says 5', 'notes/source.md:2', 'adopted');

t('a superseded row replaced by a later row passes and is counted as superseded', () => {
  const r = check(fixture({
    history: [HEADER + ROWS.join('') + FIX],
    audit: AUDIT_HEADER + GOOD_AUDIT[0]
      + row('3', '2026-10-11T10:05:00Z', 'superseded', '4', '', 'wrong epoch count')
      + row('4', '2026-10-11T11:00:00Z', 'ok', '', 'file:notes/source.md:2', 'matches'),
  }));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /3 decision rows audited \(2 ok, 1 superseded\)/);
});

t('a bad verdict fails: no later replacement, an unknown verdict, a ts that does not match its line', () => {
  const r = check(fixture({
    history: [HEADER + ROWS.join('') + FIX],
    audit: AUDIT_HEADER
      + row('2', '2026-10-11T10:00:00Z', 'superseded', '', '', 'x')
      + row('3', '2026-10-11T10:05:00Z', 'superseded', '2', '', 'x')
      + row('4', '2026-10-11T10:59:00Z', 'maybe', '', 'file:notes/source.md', 'x')
      + row('9', '2026-10-11T12:00:00Z', 'ok', '', 'file:notes/source.md', 'x'),
  }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  const ev = r.events[0].evidence;
  assert.match(ev, /line 2 \(2026-10-11T10:00:00Z\): superseded with no later row replacing it/);
  assert.match(ev, /line 3 \(2026-10-11T10:05:00Z\): superseded with no later row replacing it/);
  assert.match(ev, /line 4 \(2026-10-11T11:00:00Z\): audit ts 2026-10-11T10:59:00Z does not match/);
  assert.match(ev, /line 4 \(2026-10-11T11:00:00Z\): invalid verdict "maybe"/);
  assert.match(ev, /audit line 9: no such decision row/);
});

t('no audit at all fails rather than passing empty', () => {
  const r = check(fixture({ audit: null, review: null }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /no audit file in factory\/audit\//);
  assert.match(r.events[0].evidence, /line 2 \(2026-10-11T10:00:00Z\): no audit verdict/);
});

t('an audit with no review, or a review that names no reviewer, fails', () => {
  const missing = check(fixture({ review: null }));
  assert.equal(missing.status, 1, missing.stderr + missing.stdout);
  assert.match(missing.events[0].evidence, new RegExp(`factory/audit/${AUDIT_RUN}\\.review\\.md: no cross-family review`));

  const unnamed = check(fixture({ review: '# Trail review\n\n- No flags.\n' }));
  assert.equal(unnamed.status, 1, unnamed.stderr + unnamed.stdout);
  assert.match(unnamed.events[0].evidence, new RegExp(`factory/audit/${AUDIT_RUN}\\.review\\.md: no "reviewed by <model>" line`));
});

t('a review by a Claude model fails because it is not cross-family', () => {
  const r = check(fixture({ review: 'reviewed by claude-opus-5-5\n\n- No flags.\n' }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /reviewed by claude-opus-5-5, the same family as the orchestrator/);
});

t('a row whose phase is not a clean slash path on the log\'s one tree, or that has an empty cell, fails', () => {
  const bad = [
    row('2026-10-11T10:10:00Z', 'Project/Big step', 'x', 'y', 'notes/source.md', 'done'),
    row('2026-10-11T10:11:00Z', 'other/b', 'x', 'y', 'notes/source.md', 'done'),
    row('2026-10-11T10:12:00Z', 'project/b', 'x', '', 'notes/source.md', 'done'),
    row('2026-10-11T10:13:00Z', 'start', 'run 2 starts', 'marks its rows', 'session 2', 'open'),
  ];
  const audit = AUDIT_HEADER + GOOD_AUDIT.join('')
    + bad.map((r, i) => row(String(i + 4), r.split('\t')[0], 'ok', '', 'file:notes/source.md', 'x')).join('');
  const r = check(fixture({ history: [HEADER + ROWS.join('') + bad.join('')], audit }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  const ev = r.events[0].evidence;
  assert.match(ev, /line 4 \(2026-10-11T10:10:00Z\): phase "Project\/Big step" is not a lowercase slash path/);
  assert.match(ev, /line 5 \(2026-10-11T10:11:00Z\): phase "other\/b" is not under project\//);
  assert.match(ev, /line 6 \(2026-10-11T10:12:00Z\): empty why/);
  assert.doesNotMatch(ev, /line 7 /);
});

t('a push or PR row fails, since its commit always lands after the push it records; rows from before the rule stay', () => {
  const rows = [
    row('2026-10-11T23:08:09Z', 'project/implement/push', 'pushed', 'asked', 'commit abc', 'pushed'),
    row('2026-10-12T05:00:00Z', 'project/implement/push', 'pushed', 'asked', 'commit abc', 'pushed'),
    row('2026-10-12T05:01:00Z', 'project/implement/pr', 'opened PR #9', 'asked', 'PR #9', 'open'),
    row('2026-10-12T05:02:00Z', 'project/implement/pushback', 'kept 3 epochs', 'paper', 'notes/source.md', 'kept'),
  ];
  const audit = AUDIT_HEADER + GOOD_AUDIT.join('')
    + rows.map((r, i) => row(String(i + 4), r.split('\t')[0], 'ok', '', 'file:notes/source.md', 'x')).join('');
  const r = check(fixture({ history: [HEADER + ROWS.join('') + rows.join('')], audit }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  const ev = r.events[0].evidence;
  assert.match(ev, /line 5 \(2026-10-12T05:00:00Z\): phase "project\/implement\/push" records a push or PR; git and GitHub hold that record, so log no decision row for it/);
  assert.match(ev, /line 6 \(2026-10-12T05:01:00Z\): phase "project\/implement\/pr" records a push or PR/);
  assert.doesNotMatch(ev, /line 4 /);
  assert.doesNotMatch(ev, /line 7 /);
});

t('a log that only grew across its commits passes and says how many versions it compared', () => {
  const r = check(fixture({ history: [HEADER + ROWS[0], HEADER + ROWS.join('')] }));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /append-only across 2 commits/);
});

t('a log whose committed row was edited or removed fails and the evidence names the line and commit', () => {
  const f = fixture({ history: [HEADER + ROWS.join(''), HEADER + ROWS[0]] });
  const first = git(f.root, 'rev-list', '--max-parents=0', '--abbrev-commit', 'HEAD');
  put(f.root, 'factory/decisions.tsv', HEADER + ROWS[0].replace('fetched', 'downloaded') + ROWS[1]);
  const r = check(f);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  const ev = r.events[0].evidence;
  assert.match(ev, new RegExp(`not append-only: line 2 differs from commit ${first}`));
  assert.doesNotMatch(ev, /line 3 /);
});

t('a log whose last committed row was dropped fails', () => {
  const f = fixture();
  put(f.root, 'factory/decisions.tsv', HEADER + ROWS[0]);
  const r = check({ ...f });
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /not append-only: line 3 is missing \(committed in [0-9a-f]{7}/);
});
