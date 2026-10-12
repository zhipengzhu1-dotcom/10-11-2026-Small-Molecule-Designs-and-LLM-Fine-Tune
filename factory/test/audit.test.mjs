import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FACTORY, tempRoot } from './helpers.mjs';

const AUDIT = join(FACTORY, 'audit.mjs');

// Pointer checks read git history, so these tests need git (the Docker CI image has it).
const hasGit = spawnSync('git', ['--version']).status === 0;
const t = (name, fn) => test(name, { skip: !hasGit && 'git is not installed' }, fn);

const row = (...cells) => cells.join('\t') + '\n';
const LOG = row('ts', 'phase', 'decision', 'why', 'evidence', 'result')
  + row('2026-10-11T10:05:00Z', 'project/a', 'picked 3 epochs', 'the paper says 5',
    '~/.claude/projects/x/sess-1.jsonl @10:04:58Z; notes/source.md:2', 'adopted');

const entry = (timestamp, type, content) => JSON.stringify({ type, timestamp, message: { content } }) + '\n';

function put(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

function git(root, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', root, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

// A repo with a committed one-row decision log, and the transcript of the session that logged it.
function fixture() {
  const root = tempRoot();
  git(root, 'init', '-q');
  put(root, 'notes/source.md', 'line one\nline two\n');
  put(root, 'factory/decisions.tsv', LOG);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'log');
  const transcripts = join(root, 'transcripts');
  put(root, 'transcripts/sess-1.jsonl', [
    entry('2026-10-11T09:40:00.000Z', 'user', 'an old message'),
    entry('2026-10-11T09:55:12.345Z', 'user', 'use 3 epochs, not 5'),
    entry('2026-10-11T10:00:01.000Z', 'assistant', [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }]),
    entry('2026-10-11T10:06:00.000Z', 'user', 'a later message'),
  ].join(''));
  return { root, transcripts };
}

function audit({ root, transcripts }, ...args) {
  return spawnSync(process.execPath, [AUDIT, ...args, '--root', root, '--transcripts', transcripts], { encoding: 'utf8' });
}

t('show prints the row and the 15 minutes of its session before it, each line with its pointer', () => {
  const r = audit(fixture(), 'show', '2');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /picked 3 epochs/);
  assert.match(r.stdout, /transcript:sess-1@2026-10-11T09:55:12 user: use 3 epochs, not 5/);
  assert.match(r.stdout, /transcript:sess-1@2026-10-11T10:00:01 tool Bash: npm test/);
  assert.doesNotMatch(r.stdout, /an old message|a later message/);
});
