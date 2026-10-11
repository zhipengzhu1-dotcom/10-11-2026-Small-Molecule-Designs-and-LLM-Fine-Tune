import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CHECK = join(FACTORY, 'checks', 'tables.mjs');
const FIXTURE = join(FACTORY, 'test', 'fixtures', 'tables');

// Copies the hand-made fixture set (paper.tex + notes/) into a temp dir. Each edit is
// [file, from, to], a literal replacement that must hit, so a broken set is broken on purpose.
function sample(edits = []) {
  const dir = tempRoot();
  cpSync(FIXTURE, dir, { recursive: true });
  for (const [file, from, to] of edits) {
    const p = join(dir, file);
    const text = readFileSync(p, 'utf8');
    assert.ok(text.includes(from), `fixture edit: ${from} not in ${file}`);
    writeFileSync(p, text.replace(from, to));
  }
  return dir;
}

// Runs the check the way an agent does, logging into a separate temp factory root.
function check(dir) {
  const root = tempRoot();
  const env = { ...process.env };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'FACTORY_AGENT', 'CLAUDE_PROJECT_DIR']) delete env[k];
  const r = spawnSync(
    process.execPath,
    [CHECK, '--tex', join(dir, 'paper.tex'), '--notes', join(dir, 'notes'), '--root', root, '--run', 'run-1', '--agent', 'checker'],
    { env, encoding: 'utf8' },
  );
  const events = readStream(root).filter((e) => e.type === 'check');
  return { ...r, events };
}

test('a matching set of notes passes and records a pass check event', () => {
  const r = check(sample());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.events.length, 1);
  const [e] = r.events;
  assert.equal(e.name, 'tables');
  assert.equal(e.result, 'pass');
  assert.equal(e.agent, 'checker');
  assert.equal(e.run, 'run-1');
});

test('one wrong cell fails, and the evidence names the table, row and column', () => {
  const r = check(sample([['notes/tables/toy.md', '| 41.5 |', '| 14.5 |']]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const [e] = r.events;
  assert.equal(e.result, 'fail');
  assert.match(e.evidence, /tab:toy/);
  assert.match(e.evidence, /Beta-2/); // row label from the source
  assert.match(e.evidence, /col 2/);
  assert.match(e.evidence, /source 41\.5/);
  assert.match(e.evidence, /notes 14\.5/);
  assert.doesNotMatch(e.evidence, /tab:budget/);
});
