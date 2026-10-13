import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { transcriptsDir } from '../transcript.mjs';
import { FACTORY, marker, tempRoot } from './helpers.mjs';

const DECIDE = join(FACTORY, 'decide.mjs');
const SESSION = '5e55f0c1-0000-4000-8000-000000000001';

// A fake Ollama in its own process (fixtures/fake-ollama.mjs), so decide's precedent judge gets an
// answer while the test waits on spawnSync. No test reaches a real Ollama or loads a model.
async function startJudge(args = []) {
  const p = spawn(process.execPath, [join(FACTORY, 'test', 'fixtures', 'fake-ollama.mjs'), ...args]);
  const host = await new Promise((resolve, reject) => {
    p.stdout.once('data', (d) => resolve(String(d).trim()));
    p.once('exit', (code) => reject(new Error(`fake-ollama exited ${code}`)));
  });
  return { host, stop: () => p.kill() };
}

let judge;
before(async () => (judge = await startJudge()));
after(() => judge.stop());

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
  const env = { ...process.env, HOME: home, USERPROFILE: home, FACTORY_JUDGE_HOST: judge.host, ...extraEnv };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'CLAUDE_PROJECT_DIR']) if (!(k in extraEnv)) delete env[k];
  return spawnSync(process.execPath, [DECIDE, '--root', root, ...args], { env, encoding: 'utf8' });
}

const ROW = ['project/frontier/next', 'took #44 next', 'it blocks #14', 'issue:44', 'open: started'];

// A challenge event (issue #58) in the fixture repo's stream, so --closes has an id to name.
function challenge(s, id) {
  const dir = join(s.root, 'factory', 'agents', 'run-1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'orchestrator.jsonl'), JSON.stringify({
    ts: '2026-10-12T02:00:00.000Z', run: 'run-1', agent: 'orchestrator', type: 'challenge', id, target: 'row:3', kind: 'rebut', why: 'the judge was never measured',
  }) + '\n');
}

test('each row relation flag puts "<relation> line N: " at the start of the decision cell, with " (part)" for a partial one', () => {
  for (const [flag, value, prefix] of [
    ['--supersedes', '2', 'supersedes line 2: '],
    ['--withdraws', '3', 'withdraws line 3: '],
    ['--corrects', '4', 'corrects line 4: '],
    ['--supersedes', '2 (part)', 'supersedes line 2 (part): '],
    ['--withdraws', '3(part)', 'withdraws line 3 (part): '],
  ]) {
    const s = setup();
    const r = decide(s, ['--run', SESSION, flag, value, ...ROW]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(cellsOf(s)[1], `${prefix}took #44 next`, `${flag} ${value}`);
  }
});

test('--closes <id> puts "closes challenge <id>: " at the start of the decision cell', () => {
  const s = setup();
  challenge(s, 'judge-vram');
  const r = decide(s, ['--run', SESSION, '--closes', 'judge-vram', ...ROW]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(cellsOf(s)[1], 'closes challenge judge-vram: took #44 next');
});

test('--closes refuses with exit 2, and writes nothing, an id with no challenge event in the stream', () => {
  const s = setup();
  challenge(s, 'judge-vram');
  for (const [id, message] of [
    ['judge-cpu', /--closes judge-cpu: no challenge event with id judge-cpu in the stream/],
    ['3', /--closes 3: no challenge event with id 3 in the stream/],
    ['bad id', /--closes bad id: a challenge id must be a plain name; bad id is not a plain name/],
  ]) {
    const r = decide(s, ['--run', SESSION, '--closes', id, ...ROW]);
    assert.equal(r.status, 2, id);
    assert.match(r.stderr, message);
  }
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);
});

test('several relation flags join in one prefix, separated by ", ", in the order supersedes, withdraws, corrects, closes', () => {
  const s = setup();
  challenge(s, 'c1');
  const r = decide(s, ['--run', SESSION, '--closes', 'c1', '--withdraws', '4', '--supersedes', '2 (part)', '--withdraws', '3', ...ROW]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(cellsOf(s)[1], 'supersedes line 2 (part), withdraws line 4, withdraws line 3, closes challenge c1: took #44 next');
});

test('a relation pointing past the last row, at the header, or written as malformed text is refused with exit 2 before anything is written', () => {
  const s = setup();
  for (const [args, message] of [
    [['--supersedes', '5'], /--supersedes 5: line 5 is past the last row \(4\)/],
    [['--withdraws', '1'], /--withdraws 1: line 1 is the header, not a decision row/],
    [['--corrects', 'two'], /--corrects two: write a line number, optionally followed by \(part\)/],
    [['--corrects', '3 (half)'], /--corrects 3 \(half\): write a line number, optionally followed by \(part\)/],
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
  assert.match(r.stderr, /decision starts with "supersedes"; pass --supersedes instead of writing the phrase/);
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

test('decide takes event: and agent: pointers in the evidence when the stream holds them, and refuses one it does not', () => {
  const s = setup();
  const dir = join(s.root, 'factory', 'agents', 'run-1');
  mkdirSync(dir, { recursive: true });
  const line = (agent, type, fields) => JSON.stringify({ ts: '2026-10-12T02:00:00.000Z', run: 'run-1', agent, type, ...fields }) + '\n';
  writeFileSync(join(dir, 'orchestrator.jsonl'), line('orchestrator', 'dispatch', { to: 'a7', role: 'implementer', ticket: 44, description: 'implementer #44 x' }));
  writeFileSync(join(dir, 'a1.b.jsonl'), line('a1.b', 'agent.start', { role: 'general-purpose', parent: 'orchestrator' }) + line('a1.b', 'agent.stop', { role: 'general-purpose', status: 'ISSUES' }));
  const evidence = (e) => [ROW[0], ROW[1], ROW[2], e, ROW[4]];

  const ok = decide(s, ['--run', SESSION, ...evidence('event:run-1/a1.b:2; agent:a1.b; agent:a7; issue:44')]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(cellsOf(s)[3].endsWith('event:run-1/a1.b:2; agent:a1.b; agent:a7; issue:44'), true);

  const bad = decide(s, ['--run', SESSION, ...evidence('event:run-1/a1.b:3; agent:nobody; event:run-1/a1.b')]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /event:run-1\/a1\.b:3 is not in the stream/);
  assert.match(bad.stderr, /agent:nobody is not in the stream/);
  assert.match(bad.stderr, /event:run-1\/a1\.b is not an event; write event:<run>\/<agent>:<line>/);
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

// A row much like line 3 of the fixture log ("chose qwen3.5:4b as judge").
const JUDGE_ROW = ['project/judge', 'chose gemma4:e4b as judge', 'it fits 8 GB and is a second family', 'issue:4', 'open'];

test('decide prints the precedent check before it writes the row, flagging a standing row the judge finds contradicted', async () => {
  const contra = await startJudge(['--contradicts', 'chose qwen3.5:4b as judge']);
  try {
    const s = setup();
    const r = decide(s, ['--run', SESSION, ...JUDGE_ROW], { FACTORY_JUDGE_HOST: contra.host });
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout.trimEnd().split('\n');
    assert.match(out[0], /^precedent: 1 of the \d nearest standing rows? may be replaced or reversed by this row; mark it with --supersedes/);
    assert.match(out[1], /^ {2}row:3 0\.\d\d contradicts: chose qwen3\.5:4b as judge$/);
    assert.equal(out[2], '    judge: fake judge: contradicts');
    assert.match(out.at(-1), /^decide: logged to /);
    assert.equal(cellsOf(s)[1], 'chose gemma4:e4b as judge');
  } finally {
    contra.stop();
  }
});

test('decide still writes the row when the judge is unreachable, and says so', async () => {
  const closed = createServer();
  await new Promise((r) => closed.listen(0, '127.0.0.1', r));
  const host = `http://127.0.0.1:${closed.address().port}`;
  await new Promise((r) => closed.close(r));

  const s = setup();
  const r = decide(s, ['--run', SESSION, ...JUDGE_ROW], { FACTORY_JUDGE_HOST: host });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`^precedent: judge unreachable \\(qwen3\\.5:4b at ${host.replace(/\./g, '\\.')}: [^\\n]+\\); the \\d nearest standing rows?, unjudged:\\n {2}row:3 `));
  assert.match(r.stdout, /\ndecide: logged to /);
  assert.equal(cellsOf(s)[1], 'chose gemma4:e4b as judge');
});

test('decide --dry-run prints the precedent check and writes nothing', () => {
  const s = setup();
  const r = decide(s, ['--run', SESSION, '--dry-run', ...JUDGE_ROW]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^precedent: no contradiction among the \d nearest standing rows? \(row:3 0\.\d\d.*; judged by qwen3\.5:4b\)\ndecide: dry run, nothing written\n$/);
  assert.ok(!existsSync(join(s.root, 'factory', 'log.sh.args')));
});
