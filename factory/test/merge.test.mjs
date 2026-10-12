import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FACTORY, marker, merge, tempRoot, write } from './helpers.mjs';

// The merge script drives git, so its tests need git (the Docker CI image has it).
const hasGit = spawnSync('git', ['--version']).status === 0;
const cleanEnv = () => {
  const e = { ...process.env };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'FACTORY_AGENT', 'CLAUDE_PROJECT_DIR']) delete e[k];
  return e;
};
const t = (name, fn) => test(name, { skip: !hasGit && 'git is not installed' }, fn);

function git(root, ...args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function put(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

// A main checkout on its integration branch with a committed decision log, and a ticket branch
// with one commit. The run marker names run-1 and the integration branch.
function fixture() {
  const root = tempRoot();
  git(root, 'init', '-q', '-b', 'integ');
  git(root, 'config', 'user.name', 't');
  git(root, 'config', 'user.email', 't@t');
  put(root, 'factory/decisions.tsv', 'ts\tphase\n');
  put(root, '.gitignore', 'factory/run.json\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  git(root, 'checkout', '-q', '-b', 'ticket');
  put(root, 'src/feature.txt', 'feature\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feature');
  git(root, 'checkout', '-q', 'integ');
  const m = marker(['start', '--root', root, '--run', 'run-1', '--branch', 'integ']);
  assert.equal(m.status, 0, m.stderr);
  return root;
}

// What the hooks and the orchestrator leave in the main checkout during a run.
function hookWrites(root, run = 'run-1') {
  put(root, `factory/agents/${run}/a1.jsonl`, '{"type":"agent.stop"}\n');
  appendFileSync(join(root, 'factory/decisions.tsv'), '2026-10-12T00:00:00Z\tstart\n');
}

const status = (root) => git(root, 'status', '--porcelain', '--untracked-files=all');
const isAncestor = (root, a, b) => spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', a, b]).status === 0;

t('a merge commits the run\'s activity files and decision log, then merges, leaving the checkout clean', () => {
  const root = fixture();
  hookWrites(root);

  const r = merge(['ticket', '--root', root, '-m', 'Merge #17: ticket']);
  assert.equal(r.status, 0, r.stderr);

  assert.equal(status(root), '');
  assert.ok(isAncestor(root, 'ticket', 'integ'), 'ticket is merged into the integration branch');
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'Merge #17: ticket');
  assert.equal(git(root, 'show', 'HEAD:factory/agents/run-1/a1.jsonl'), '{"type":"agent.stop"}');
  assert.match(git(root, 'show', 'HEAD:factory/decisions.tsv'), /2026-10-12T00:00:00Z\tstart/);
  // The factory commit comes before the merge, on the integration branch's first-parent line.
  assert.match(git(root, 'log', '-1', '--format=%s', 'HEAD^1'), /factory/i);
});

t('events written with no run during the run, by the writer or a check, are committed by the merge too', () => {
  const root = fixture();
  const w = write(['--root', root, '--agent', 'merger', 'check', 'name=x', 'result=pass', 'evidence=y']);
  assert.equal(w.status, 0, w.stderr);
  const c = spawnSync(process.execPath, [join(FACTORY, 'checks', 'brief.mjs'), '--root', root,
    '--brief', join(FACTORY, 'test', 'fixtures', 'brief', 'good.md')], { encoding: 'utf8', env: cleanEnv() });
  assert.equal(c.status, 0, c.stderr + c.stdout);

  const r = merge(['ticket', '--root', root]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(status(root), '');
  assert.equal(git(root, 'ls-files', 'factory/agents'), 'factory/agents/run-1/merger.jsonl\nfactory/agents/run-1/orchestrator.jsonl');
});

t('a merge commits activity left by earlier runs and unmarked writes too, leaving no factory path uncommitted', () => {
  const root = fixture();
  hookWrites(root);
  put(root, 'factory/agents/old-run/orchestrator.jsonl', '{"type":"agent.start"}\n');
  put(root, 'factory/agents/manual/ci.jsonl', '{"type":"check"}\n');

  const r = merge(['ticket', '--root', root]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(status(root), '');
  assert.equal(git(root, 'ls-files', 'factory/agents'),
    'factory/agents/manual/ci.jsonl\nfactory/agents/old-run/orchestrator.jsonl\nfactory/agents/run-1/a1.jsonl');
});

t('only the factory paths go in the factory commit: other changes in the checkout stay as they were', () => {
  const root = fixture();
  hookWrites(root);
  put(root, 'notes.md', 'work in progress\n');
  git(root, 'add', 'notes.md');

  const r = merge(['--factory-only', '--root', root]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(status(root), 'A  notes.md');
  assert.equal(git(root, 'show', '--name-only', '--format=', 'HEAD'), 'factory/agents/run-1/a1.jsonl\nfactory/decisions.tsv');
});

t('close-out commits the factory paths without merging, and with nothing new it commits nothing', () => {
  const root = fixture();
  hookWrites(root);
  const before = git(root, 'rev-parse', 'HEAD');

  const r = merge(['--factory-only', '--root', root]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(status(root), '');
  assert.equal(git(root, 'rev-parse', 'HEAD^'), before);
  assert.ok(!isAncestor(root, 'ticket', 'integ'));

  const head = git(root, 'rev-parse', 'HEAD');
  const again = merge(['--factory-only', '--root', root]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
});

t('a merge with no run marked fails and commits nothing', () => {
  const root = fixture();
  marker(['stop', '--root', root]);
  hookWrites(root);
  const before = git(root, 'rev-parse', 'HEAD');

  const r = merge(['ticket', '--root', root]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no orchestrated run is marked/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), before);
});

t('a merge from a checkout not on the marker\'s integration branch fails and commits nothing', () => {
  const root = fixture();
  git(root, 'checkout', '-q', 'ticket');
  hookWrites(root);
  const before = git(root, 'rev-parse', 'HEAD');

  const r = merge(['integ', '--root', root]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /on ticket, not the integration branch integ/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), before);
});

t('a conflicting merge fails with the factory paths already committed, for the merger to resolve', () => {
  const root = fixture();
  put(root, 'src/feature.txt', 'other\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'conflicting');
  hookWrites(root);

  const r = merge(['ticket', '--root', root]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /CONFLICT/);
  assert.equal(git(root, 'status', '--porcelain', '--', 'factory'), '');
  assert.equal(git(root, 'show', 'HEAD:factory/agents/run-1/a1.jsonl'), '{"type":"agent.stop"}');
});

const MESSAGE = 'Merge #17: ticket\n\nBody line one.\nBody line two.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
const body = (root, rev) => git(root, 'log', '-1', '--format=%B', rev);

t('a multi-line -m keeps its lines, and the factory commit carries its Co-Authored-By trailer', () => {
  const root = fixture();
  hookWrites(root);

  const r = merge(['ticket', '--root', root, '-m', MESSAGE]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(body(root, 'HEAD'), MESSAGE);
  assert.equal(body(root, 'HEAD^1'),
    'Record factory activity for run run-1\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>');
});

t('-F reads the merge message from a file', () => {
  const root = fixture();
  hookWrites(root);
  const file = join(tempRoot(), 'msg.txt');
  writeFileSync(file, `${MESSAGE}\n`);

  const r = merge(['ticket', '--root', root, '-F', file]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(body(root, 'HEAD'), MESSAGE);
  assert.match(body(root, 'HEAD^1'), /\n\nCo-Authored-By: Claude Opus 5\.5 <noreply@anthropic\.com>$/);
});

t('close-out takes -m or -F too, and its factory commit carries the trailer', () => {
  const root = fixture();
  hookWrites(root);
  const r = merge(['--factory-only', '--root', root, '-m', MESSAGE]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(body(root, 'HEAD'),
    'Record factory activity for run run-1\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>');

  hookWrites(root, 'run-1');
  appendFileSync(join(root, 'factory/agents/run-1/a1.jsonl'), '{"type":"check"}\n');
  const file = join(tempRoot(), 'msg.txt');
  writeFileSync(file, 'x\n\nCo-Authored-By: A <a@a>\nCo-Authored-By: B <b@b>\n');
  const f = merge(['--factory-only', '--root', root, '-F', file]);
  assert.equal(f.status, 0, f.stderr);
  assert.equal(body(root, 'HEAD'), 'Record factory activity for run run-1\n\nCo-Authored-By: A <a@a>\nCo-Authored-By: B <b@b>');
});

t('-m and -F together are refused', () => {
  const root = fixture();
  const file = join(tempRoot(), 'msg.txt');
  writeFileSync(file, 'x\n');
  const r = merge(['ticket', '--root', root, '-m', 'x', '-F', file]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /-m or -F, not both/);
});
