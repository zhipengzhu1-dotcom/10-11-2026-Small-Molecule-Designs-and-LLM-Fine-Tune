import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { transcriptsDir } from '../transcript.mjs';
import { FACTORY, marker, tempRoot } from './helpers.mjs';

const DECIDE = join(FACTORY, 'decide.mjs');
const SESSION = '5e55f0c1-0000-4000-8000-000000000001';

// A home folder holding an installed pstack whose log.sh records the arguments it got, one per
// line, and a project transcripts folder holding the fixture session.
function setup({ plugins } = {}) {
  const home = tempRoot();
  const root = tempRoot();
  mkdirSync(join(root, 'factory'));
  const install = join(home, '.claude', 'plugins', 'cache', 'pstack-marketplace', 'pstack', 'v2');
  const scripts = join(install, 'skills', 'show-me-your-work', 'scripts');
  mkdirSync(scripts, { recursive: true });
  writeFileSync(join(scripts, 'log.sh'), 'printf "%s\\n" "$@" > "$(dirname "$1")/log.sh.args"\n');
  writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2,
    plugins: plugins ?? { 'pstack@pstack-marketplace': [{ scope: 'user', installPath: install, version: 'v2' }] },
  }));
  const transcripts = transcriptsDir(root, home);
  mkdirSync(transcripts, { recursive: true });
  copyFileSync(join(FACTORY, 'test', 'fixtures', 'transcript-session.jsonl'), join(transcripts, `${SESSION}.jsonl`));
  writeFileSync(join(root, 'factory', 'decisions.tsv'), LOG);
  return { home, root };
}

// A decision log whose last row is line 4 (the header is line 1).
const LOG = ['ts\tphase\tdecision\twhy\tevidence\tresult',
  '2026-10-12T01:00:00Z\tproject/a\tpicked 3 epochs\tthe paper says 3\tissue:4\tadopted',
  '2026-10-12T01:01:00Z\tproject/a\tchose qwen3.5:4b as judge\tit fits 8 GB\tissue:4\topen',
  '2026-10-12T01:02:00Z\tproject/b\tfetched the source\ttables need it\tissue:4\tadopted',
].join('\n') + '\n';

// The cells log.sh got, after the log path.
const cellsOf = (s) => readFileSync(join(s.root, 'factory', 'log.sh.args'), 'utf8').trimEnd().split('\n').slice(1);

function decide({ home, root }, args, extraEnv = {}) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, ...extraEnv };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'CLAUDE_PROJECT_DIR']) if (!(k in extraEnv)) delete env[k];
  return spawnSync(process.execPath, [DECIDE, '--root', root, ...args], { env, encoding: 'utf8' });
}

const ROW = ['project/frontier/next', 'took #44 next', 'it blocks #14', 'issue:44', 'open: started'];

test('each relation flag puts "<relation> line N: " at the start of the decision cell, with " (part)" for a partial one', () => {
  for (const [flag, value, prefix] of [
    ['--supersedes', '2', 'supersedes line 2: '],
    ['--withdraws', '3', 'withdraws line 3: '],
    ['--corrects', '4', 'corrects line 4: '],
    ['--closes', '3', 'closes line 3: '],
    ['--supersedes', '2 (part)', 'supersedes line 2 (part): '],
    ['--withdraws', '3(part)', 'withdraws line 3 (part): '],
  ]) {
    const s = setup();
    const r = decide(s, ['--run', SESSION, flag, value, ...ROW]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(cellsOf(s)[1], `${prefix}took #44 next`, `${flag} ${value}`);
  }
});

test('several relation flags join in one prefix, separated by ", ", in the order supersedes, withdraws, corrects, closes', () => {
  const s = setup();
  const r = decide(s, ['--run', SESSION, '--closes', '3', '--withdraws', '4', '--supersedes', '2 (part)', '--withdraws', '3', ...ROW]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(cellsOf(s)[1], 'supersedes line 2 (part), withdraws line 4, withdraws line 3, closes line 3: took #44 next');
});

test('a relation pointing past the last row, at the header, or written as malformed text is refused with exit 2 before anything is written', () => {
  const s = setup();
  for (const [args, message] of [
    [['--supersedes', '5'], /--supersedes 5: line 5 is past the last row \(4\)/],
    [['--withdraws', '1'], /--withdraws 1: line 1 is the header, not a decision row/],
    [['--corrects', 'two'], /--corrects two: write a line number, optionally followed by \(part\)/],
    [['--closes', '3 (half)'], /--closes 3 \(half\): write a line number, optionally followed by \(part\)/],
  ]) {
    const r = decide(s, ['--run', SESSION, ...args, ...ROW]);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, message);
  }
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);
});

// The flags exist so the relation phrase can't be misspelled, so a hand-written one is refused.
test('a decision that already starts with a relation word is refused, pointing at the flag', () => {
  const s = setup();
  const r = decide(s, ['--run', SESSION, ROW[0], 'supersedes line 2: took #44 next', ROW[2], ROW[3], ROW[4]]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /decision starts with "supersedes"; pass --supersedes <line> instead of writing the phrase/);
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);
});

test('--state puts the claim state first in result, as "<state>: <result>", or alone when result is left out', () => {
  const s = setup();
  assert.equal(decide(s, ['--run', SESSION, '--state', 'adopted', ROW[0], ROW[1], ROW[2], ROW[3], 'merged in 1945810']).status, 0);
  assert.equal(cellsOf(s)[4], 'adopted: merged in 1945810');
  for (const state of ['open', 'assumed', 'given', 'cited']) {
    const r = decide(s, ['--run', SESSION, '--state', state, ...ROW.slice(0, 4)]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(cellsOf(s)[4], state);
  }
});

test('an unknown --state word, a check result or "defeated" is refused with exit 2 before anything is written', () => {
  const s = setup();
  for (const [state, message] of [
    ['merged', /unknown claim state "merged"; one of adopted, open, assumed, given, cited/],
    ['pass', /"pass" is a check result, not a claim state; one of adopted, open, assumed, given, cited/],
    ['defeated', /"defeated" is derived from later rows, never written; one of adopted, open, assumed, given, cited/],
  ]) {
    const r = decide(s, ['--run', SESSION, '--state', state, ...ROW]);
    assert.equal(r.status, 2, state);
    assert.match(r.stderr, message);
  }
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);
});

test('with no --state, result must already start with a claim state, else the row is refused', () => {
  const s = setup();
  const r = decide(s, ['--run', SESSION, ...ROW.slice(0, 4), 'merged in 1945810']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown claim state "merged"; one of adopted, open, assumed, given, cited; pass --state <state>/);
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);
  assert.equal(decide(s, ['--run', SESSION, ...ROW]).status, 0);
  assert.equal(cellsOf(s)[4], 'open: started');
});

test('decide calls the installed pstack log.sh on the decision log, with a transcript:<session>@<iso> pointer to the session first in the evidence', () => {
  const s = setup();
  const r = decide(s, ['--run', SESSION, ...ROW]);
  assert.equal(r.status, 0, r.stderr);
  const args = readFileSync(join(s.root, 'factory', 'log.sh.args'), 'utf8').trimEnd().split('\n');
  assert.equal(args[0].replace(/\\/g, '/'), join(s.root, 'factory', 'decisions.tsv').replace(/\\/g, '/'));
  assert.deepEqual(args.slice(1), [
    'project/frontier/next', 'took #44 next', 'it blocks #14',
    `transcript:${SESSION}@2026-10-12T04:40:09; issue:44`,
    'open: started',
  ]);
});

test('decide takes the session from --run, then FACTORY_RUN, then the run marker', () => {
  const s = setup();
  const dir = transcriptsDir(s.root, s.home);
  writeFileSync(join(dir, 'env.jsonl'), '{"type":"user","timestamp":"2026-10-12T06:00:00.000Z"}\n');
  writeFileSync(join(dir, 'marked.jsonl'), '{"type":"user","timestamp":"2026-10-12T07:00:00.000Z"}\n');
  writeFileSync(join(s.root, 'factory', 'run.json'), '{"run":"marked","branch":"spec1/leftovers"}\n');
  const args = () => readFileSync(join(s.root, 'factory', 'log.sh.args'), 'utf8').split('\n')[4];

  assert.equal(decide(s, ['--run', SESSION, ...ROW], { FACTORY_RUN: 'env' }).status, 0);
  assert.equal(args(), `transcript:${SESSION}@2026-10-12T04:40:09; issue:44`);
  assert.equal(decide(s, ROW, { FACTORY_RUN: 'env' }).status, 0);
  assert.equal(args(), 'transcript:env@2026-10-12T06:00:00; issue:44');
  assert.equal(decide(s, ROW).status, 0);
  assert.equal(args(), 'transcript:marked@2026-10-12T07:00:00; issue:44');
});

// A concurrent session's transcript can be the newest one, so the newest is never a guess for the run.
test('decide with no --run, FACTORY_RUN or run marker refuses, and asks for --run instead of taking the newest transcript', () => {
  const s = setup();
  const r = decide(s, ROW);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /pass --run <session-id>/);
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);
});

// The log is append-only, so a bad pointer that got in could never be fixed in place.
test('decide refuses with exit 2, and writes nothing, when a file: pointer in the evidence does not resolve', () => {
  const s = setup();
  writeFileSync(join(s.root, 'notes.md'), 'one\ntwo\n');
  const evidence = (e) => [ROW[0], ROW[1], ROW[2], e, ROW[4]];

  const missing = decide(s, ['--run', SESSION, ...evidence('issue:44; file:gone.md')]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /file:gone\.md does not exist/);
  const short = decide(s, ['--run', SESSION, ...evidence('file:notes.md:3')]);
  assert.equal(short.status, 2);
  assert.match(short.stderr, /file:notes\.md:3 is past the end of the file \(2 lines\)/);
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);

  assert.equal(decide(s, ['--run', SESSION, ...evidence('file:notes.md:1-2; merge 1945810')]).status, 0);
});

test('decide refuses an evidence item of an unknown pointer kind, or a malformed transcript: pointer, and writes nothing', () => {
  const s = setup();
  const r = decide(s, ['--run', SESSION, ROW[0], ROW[1], ROW[2], 'https://example.org; transcript:sess-1', ROW[4]]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown pointer https:\/\/example\.org; write url:https:\/\/example\.org/);
  assert.match(r.stderr, /transcript:sess-1 has no @<ISO time>/);
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);
});

const hasGit = spawnSync('git', ['--version']).status === 0;
test('decide refuses with exit 2, and writes nothing, when a commit: pointer names no commit of the repo', { skip: !hasGit && 'git is not installed' }, () => {
  const s = setup();
  const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', s.root, ...a], { encoding: 'utf8' }).stdout.trim();
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'first');
  const sha = git('rev-parse', '--short', 'HEAD');
  const evidence = (e) => [ROW[0], ROW[1], ROW[2], e, ROW[4]];

  const r = decide(s, ['--run', SESSION, ...evidence(`commit:${sha}; commit:abcdef1; commit:xyz`)]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /commit:abcdef1 is not a commit/);
  assert.match(r.stderr, /commit:xyz is not a commit \(7 to 40 hex digits\)/);
  assert.doesNotMatch(r.stderr, new RegExp(`commit:${sha}`));
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);

  assert.equal(decide(s, ['--run', SESSION, ...evidence(`commit:${sha}`)]).status, 0);
});

test('decide refuses with exit 2, and writes nothing, when pstack is not installed or a cell is missing', () => {
  const none = setup({ plugins: {} });
  const r = decide(none, ROW);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /installed_plugins\.json has no pstack@pstack-marketplace entry/);

  const s = setup();
  const short = decide(s, ROW.slice(0, 4));
  assert.equal(short.status, 2);
  assert.match(short.stderr, /expected 5 cells/);
  assert.equal(decide(s, ['--run', 'no-such-session', ...ROW]).status, 2);
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);
});
