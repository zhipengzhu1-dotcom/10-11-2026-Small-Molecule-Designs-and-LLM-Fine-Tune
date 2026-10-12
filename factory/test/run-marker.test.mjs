import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readMarker } from '../run-marker.mjs';
import { marker, tempRoot } from './helpers.mjs';

// A merge script reads the active run and its integration branch from the marker.
test('the run marker gives the active run and its integration branch, and nothing once cleared', () => {
  const root = tempRoot();
  assert.equal(readMarker(root), null);

  const s = marker(['start', '--root', root, '--run', 'run-1', '--branch', 'spec1/leftovers']);
  assert.equal(s.status, 0, s.stderr);
  assert.deepEqual(readMarker(root), { run: 'run-1', branch: 'spec1/leftovers' });

  const t = marker(['stop', '--root', root]);
  assert.equal(t.status, 0, t.stderr);
  assert.equal(readMarker(root), null);
});

test('the run comes from FACTORY_RUN when --run is not passed', () => {
  const root = tempRoot();
  const s = marker(['start', '--root', root, '--branch', 'spec1/leftovers'], { FACTORY_RUN: 'run-env' });
  assert.equal(s.status, 0, s.stderr);
  assert.equal(readMarker(root).run, 'run-env');
});

test('starting a run without its integration branch fails and leaves no marker', () => {
  const root = tempRoot();
  const s = marker(['start', '--root', root, '--run', 'run-1']);
  assert.notEqual(s.status, 0);
  assert.match(s.stderr, /--branch/);
  assert.equal(readMarker(root), null);
});

// Mergers work in the main checkout, so an uncommitted tracked edit there collides with the first
// merge (run a52ce0ba: the classifier refused an agent's `git stash` of the user's lines).
const hasGit = spawnSync('git', ['--version']).status === 0;
const g = (name, fn) => test(name, { skip: !hasGit && 'git is not installed' }, fn);

function git(root, ...args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}

// A main checkout with a committed glossary and factory logs.
function checkout() {
  const root = tempRoot();
  git(root, 'init', '-q', '-b', 'integ');
  git(root, 'config', 'user.name', 't');
  git(root, 'config', 'user.email', 't@t');
  for (const [path, text] of [['CONTEXT.md', 'terms\n'], ['factory/decisions.tsv', 'ts\tphase\n'], ['factory/agents/run-0/orchestrator.jsonl', '{}\n']]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  writeFileSync(join(root, '.gitignore'), 'factory/run.json\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

g('a run does not start while a tracked file outside the factory logs has uncommitted changes', () => {
  const root = checkout();
  appendFileSync(join(root, 'CONTEXT.md'), 'four new lines\n');
  const s = marker(['start', '--root', root, '--run', 'run-1', '--branch', 'integ']);
  assert.notEqual(s.status, 0);
  assert.match(s.stderr, /CONTEXT\.md/);
  assert.equal(readMarker(root), null);
});

g('a run starts beside untracked files and uncommitted factory logs', () => {
  const root = checkout();
  writeFileSync(join(root, 'articles.txt'), 'notes\n');
  appendFileSync(join(root, 'factory/decisions.tsv'), 'row\n');
  appendFileSync(join(root, 'factory/agents/run-0/orchestrator.jsonl'), '{}\n');
  const s = marker(['start', '--root', root, '--run', 'run-1', '--branch', 'integ']);
  assert.equal(s.status, 0, s.stderr);
  assert.deepEqual(readMarker(root), { run: 'run-1', branch: 'integ' });
});
