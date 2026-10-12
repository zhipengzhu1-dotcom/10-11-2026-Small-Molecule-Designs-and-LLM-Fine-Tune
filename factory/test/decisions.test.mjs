import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { marker, tempRoot, write } from './helpers.mjs';

const TAB = '\t';
const row = (...cells) => cells.join(TAB);

test('decision log rows join the stream as orchestrator decision events, merged by ts', () => {
  const root = tempRoot();
  mkdirSync(join(root, 'factory'), { recursive: true });
  writeFileSync(join(root, 'factory', 'decisions.tsv'), [
    row('ts', 'phase', 'decision', 'why', 'evidence', 'result'),
    row('2026-10-11T10:00:00Z', 'intake/fetch', 'fetched the arXiv source', 'tables need LaTeX', 'research/s1/source/', 'done'),
    row('2099-01-01T00:00:00Z', 'intake/brief', 'wrote the brief', 'last step', "'=SUM(A1)", 'open'),
    '',
  ].join('\r\n'));
  const w = write(['--root', root, '--run', 'run-1', '--agent', 'worker-a', 'artifact', 'path=p', 'kind=k']);
  assert.equal(w.status, 0, w.stderr);

  const events = readStream(root);
  assert.deepEqual(events.map((e) => e.type), ['decision', 'artifact', 'decision']);
  assert.deepEqual(events[0], {
    ts: '2026-10-11T10:00:00Z', run: null, agent: 'orchestrator', type: 'decision',
    phase: 'intake/fetch', decision: 'fetched the arXiv source', why: 'tables need LaTeX',
    evidence: 'research/s1/source/', result: 'done', line: 2,
  });
  assert.equal(events[2].evidence, "'=SUM(A1)");
  assert.equal(events[2].line, 3);
});

// Every event carries ts, run, agent and type (issue #1). The decision log has no run column, so
// a decision's run is null, even while a run marker names the current run: the marker is local
// state that the next run overwrites, so it can't place rows written before it (issue #21).
test('every event carries ts, run, agent and type, and only decision events have a null run', () => {
  const root = tempRoot();
  const m = marker(['start', '--root', root, '--run', 'run-1', '--branch', 'spec1/leftovers']);
  assert.equal(m.status, 0, m.stderr);
  mkdirSync(join(root, 'factory'), { recursive: true });
  writeFileSync(join(root, 'factory', 'decisions.tsv'), [
    row('ts', 'phase', 'decision', 'why', 'evidence', 'result'),
    row('2026-10-11T10:00:00Z', 'intake/fetch', 'fetched the arXiv source', 'tables need LaTeX', 'research/s1/source/', 'done'),
    '',
  ].join('\n'));
  const w = write(['--root', root, '--run', 'run-1', '--agent', 'orchestrator', 'check', 'name=trail', 'result=pass', 'evidence=e']);
  assert.equal(w.status, 0, w.stderr);

  const events = readStream(root);
  for (const e of events) for (const k of ['ts', 'run', 'agent', 'type']) assert.ok(k in e, `${e.type} has no ${k}`);
  assert.deepEqual(events.map((e) => [e.type, e.agent, e.run]), [
    ['decision', 'orchestrator', null],
    ['check', 'orchestrator', 'run-1'],
  ]);
});

test('a decision row with the wrong number of cells is reported with its line number', () => {
  const root = tempRoot();
  mkdirSync(join(root, 'factory'), { recursive: true });
  writeFileSync(join(root, 'factory', 'decisions.tsv'),
    row('ts', 'phase', 'decision', 'why', 'evidence', 'result') + '\n' + row('2026-10-11T10:00:00Z', 'a/b', 'only three') + '\n');
  assert.throws(() => readStream(root), /decisions\.tsv:2: expected 6 cells, got 3/);
});
