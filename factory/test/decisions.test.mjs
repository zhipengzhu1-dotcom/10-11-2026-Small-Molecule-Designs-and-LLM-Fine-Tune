import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { REPO, tempRoot, write } from './helpers.mjs';

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
    evidence: 'research/s1/source/', result: 'done',
  });
  assert.equal(events[2].evidence, "'=SUM(A1)");
});

test('a decision row with the wrong number of cells is reported with its line number', () => {
  const root = tempRoot();
  mkdirSync(join(root, 'factory'), { recursive: true });
  writeFileSync(join(root, 'factory', 'decisions.tsv'),
    row('ts', 'phase', 'decision', 'why', 'evidence', 'result') + '\n' + row('2026-10-11T10:00:00Z', 'a/b', 'only three') + '\n');
  assert.throws(() => readStream(root), /decisions\.tsv:2: expected 6 cells, got 3/);
});

// The 2026-10-11 decisions the ticket (#2) says the log must start with.
const SEEDED = [
  'project/paper/drop-first',
  'project/paper/choose-s1',
  'project/hardware/8gb-cap',
  'project/plan/research-first',
  'project/intake/reference-depth',
  'project/intake/fetch-fallback',
  'project/intake/subagents',
  'project/spec/rewrite',
  'project/spec/tickets',
];

test('the merged stream includes the seeded 2026-10-11 decisions, and their phases form one tree', () => {
  const decisions = readStream(REPO).filter((e) => e.type === 'decision');
  // The log is append-only and keeps growing, so the seeded rows must be present, not the only ones.
  const seeded = decisions.filter((e) => SEEDED.includes(e.phase));
  assert.deepEqual([...new Set(seeded.map((e) => e.phase))].sort(), [...SEEDED].sort());

  for (const e of seeded) {
    assert.ok(e.ts.startsWith('2026-10-11T'), `${e.phase} ts ${e.ts}`);
    for (const k of ['decision', 'why', 'evidence', 'result']) assert.ok(e[k].trim(), `${e.phase} has empty ${k}`);
  }

  // A tree: every phase is a clean slash path, and all hang off one root.
  // `start` rows mark where a run's rows begin (show-me-your-work) and sit outside the tree.
  const tree = {};
  for (const e of decisions.filter((d) => d.phase !== 'start')) {
    const parts = e.phase.split('/');
    for (const p of parts) assert.match(p, /^[a-z0-9][a-z0-9-]*$/, `bad segment in ${e.phase}`);
    let node = tree;
    for (const p of parts) node = node[p] ??= {};
  }
  assert.deepEqual(Object.keys(tree), ['project']);
  for (const branch of ['hardware', 'intake', 'paper', 'plan', 'spec']) assert.ok(tree.project[branch], `no project/${branch}`);
});
