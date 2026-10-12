// The shared check tail (factory/checks/check.mjs), driven through the brief check's CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CHECK = join(FACTORY, 'checks', 'brief.mjs');
const FIXTURES = join(FACTORY, 'test', 'fixtures', 'brief');

function check(brief, extra = []) {
  const root = tempRoot();
  const r = spawnSync(process.execPath, [CHECK, '--root', root, '--run', 'run-1', '--agent', 'briefer',
    '--brief', join(FIXTURES, brief), ...extra], { encoding: 'utf8' });
  const events = readStream(root).filter((e) => e.type === 'check');
  return { ...r, lines: r.stdout.replace(/\r?\n$/, '').split(/\r?\n/), events };
}

test('a failing check prints the failure count and the first 5 failures, one per line', () => {
  const r = check('seven-failures.md');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.deepEqual(r.lines, [
    'brief: fail: 7 failures',
    '  P-02 (line 6): no verdict',
    '  P-03 (line 7): no verdict',
    '  P-04 (line 8): no verdict',
    '  P-05 (line 9): no verdict',
    '  P-06 (line 10): no verdict',
    '  and 2 more; the check event\'s evidence lists all 7',
  ]);
});

test('the check event still records every failure', () => {
  const r = check('seven-failures.md');
  assert.equal(r.events.length, 1);
  assert.match(r.events[0].evidence, /P-07 \(line 11\): no verdict; P-08 \(line 12\): no verdict/);
});

test('with 5 failures or fewer, all are printed and nothing more is promised', () => {
  const r = check('missing-fields.md');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.deepEqual(r.lines, [
    'brief: fail: 2 failures',
    '  P-02 (line 6): no paper location',
    '  P-03 (line 7): no verdict',
  ]);
});

test('a single failure is counted in the singular', () => {
  const r = check('missing-column.md');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.lines[0], 'brief: fail: 1 failure');
});

test('a passing check still prints its evidence on one line', () => {
  const r = check('good.md');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(r.lines, [`brief: pass: ${r.events[0].evidence}`]);
});

test('a check run for a ticket records the ticket number on its event', () => {
  for (const ticket of ['59', '#59']) {
    const r = check('good.md', ['--ticket', ticket]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].ticket, 59);
  }
});

test('a check run with no ticket records none', () => {
  const r = check('good.md');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal('ticket' in r.events[0], false);
});

test('a ticket that is not an issue number is a usage error, and no event is written', () => {
  const r = check('good.md', ['--ticket', 'next']);
  assert.equal(r.status, 2, r.stderr + r.stdout);
  assert.match(r.stderr, /ticket/);
  assert.deepEqual(r.events, []);
});
