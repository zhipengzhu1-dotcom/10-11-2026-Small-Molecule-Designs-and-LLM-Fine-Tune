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
  return { home, root };
}

function decide({ home, root }, args, extraEnv = {}) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, ...extraEnv };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'CLAUDE_PROJECT_DIR']) if (!(k in extraEnv)) delete env[k];
  return spawnSync(process.execPath, [DECIDE, '--root', root, ...args], { env, encoding: 'utf8' });
}

const ROW = ['project/frontier/next', 'took #44 next', 'it blocks #14', 'issue:44', 'started'];

test('decide calls the installed pstack log.sh on the decision log, with the session transcript pointer first in the evidence', () => {
  const s = setup();
  const r = decide(s, ['--run', SESSION, ...ROW]);
  assert.equal(r.status, 0, r.stderr);
  const args = readFileSync(join(s.root, 'factory', 'log.sh.args'), 'utf8').trimEnd().split('\n');
  assert.equal(args[0].replace(/\\/g, '/'), join(s.root, 'factory', 'decisions.tsv').replace(/\\/g, '/'));
  assert.deepEqual(args.slice(1), [
    'project/frontier/next', 'took #44 next', 'it blocks #14',
    `~/.claude/projects/${transcriptsDir(s.root, s.home).split(/[\\/]/).pop()}/${SESSION}.jsonl @04:40:09Z; issue:44`,
    'started',
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
  assert.match(args(), new RegExp(`/${SESSION}\\.jsonl @04:40:09Z; issue:44$`));
  assert.equal(decide(s, ROW, { FACTORY_RUN: 'env' }).status, 0);
  assert.match(args(), /\/env\.jsonl @06:00:00Z; issue:44$/);
  assert.equal(decide(s, ROW).status, 0);
  assert.match(args(), /\/marked\.jsonl @07:00:00Z; issue:44$/);
});

// A concurrent session's transcript can be the newest one, so the newest is never a guess for the run.
test('decide with no --run, FACTORY_RUN or run marker refuses, and asks for --run instead of taking the newest transcript', () => {
  const s = setup();
  const r = decide(s, ROW);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /pass --run <session-id>/);
  assert.throws(() => readFileSync(join(s.root, 'factory', 'log.sh.args')), /ENOENT/);
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
