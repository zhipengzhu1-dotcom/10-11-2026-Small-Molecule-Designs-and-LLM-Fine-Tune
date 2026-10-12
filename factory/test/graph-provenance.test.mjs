// The provenance queries of the graph module (spec #52, story 36; issue #69), through its
// interface: build from fixture events, then ask which files two agents wrote and which checks ran
// before their file's last write. The real case behind the first: two refs summaries written by
// reader ae5fa48fe and again by the orchestrator three minutes later
// (research/provenance:research/orchestration/provenance.md, "OPM account rule on the real stream").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../graph.mjs';

const T0 = Date.parse('2026-10-12T09:00:00Z');
const ev = (s, agent, type, fields = {}) => ({ ts: new Date(T0 + s * 1000).toISOString(), run: 'r1', agent, type, ...fields });
const wrote = (s, agent, path) => ev(s, agent, 'artifact', { path, kind: 'code' });
const checked = (s, agent, name, evidence, result = 'pass') => ev(s, agent, 'check', { name, result, evidence });

test('a file written by two agents is reported with both writes; one agent rewriting its own file is not', () => {
  const graph = buildGraph([
    wrote(1, 'reader', 'research/refs/a/summary.md'),
    wrote(2, 'reader', 'research/refs/b/summary.md'),
    wrote(3, 'reader', 'research/refs/b/summary.md'),
    wrote(4, 'orchestrator', 'research/refs/a/summary.md'),
  ]);
  assert.deepEqual(graph.writtenTwice(), [{
    path: 'research/refs/a/summary.md',
    agents: ['reader', 'orchestrator'],
    writes: ['event:r1/reader:1', 'event:r1/orchestrator:1'],
  }]);
});

test('a check older than its artifact\'s last write is stale; a check re-run after the write is not', () => {
  const graph = buildGraph([
    wrote(1, 'impl', 'factory/x.mjs'),
    checked(2, 'orchestrator', 'tests', 'file:factory/x.mjs: 3/3 pass'),
    wrote(3, 'impl', 'factory/y.mjs'),
    checked(4, 'merger', 'lint', 'factory/y.mjs:12 clean'),
    wrote(5, 'impl', 'factory/x.mjs'),
    wrote(6, 'impl', 'factory/y.mjs'),
    checked(7, 'merger', 'lint', 'factory/y.mjs clean again'),
  ]);
  assert.deepEqual(graph.staleChecks(), [{
    check: 'event:r1/orchestrator:1',
    name: 'tests',
    result: 'pass',
    path: 'factory/x.mjs',
    write: 'event:r1/impl:3',
  }]);
});

test('a check naming no written file, or a file only as part of a longer path, is never stale', () => {
  const graph = buildGraph([
    checked(1, 'orchestrator', 'tests', 'commit:58e6b65 463/463 pass'),
    checked(2, 'orchestrator', 'notes', 'docs/factory/x.mjs and factory/x.mjsx'),
    wrote(3, 'impl', 'factory/x.mjs'),
  ]);
  assert.deepEqual(graph.staleChecks(), []);
});

test('both queries narrow to the given paths, which match an artifact logged by its absolute path too', () => {
  const graph = buildGraph([
    wrote(1, 'a', 'C:/repo/factory/x.mjs'),
    wrote(2, 'b', 'factory/x.mjs'),
    checked(3, 'orchestrator', 'tests', 'factory/z.mjs ok'),
    wrote(4, 'a', 'factory/z.mjs'),
    wrote(5, 'a', 'factory/w.mjs'),
    wrote(6, 'b', 'factory/w.mjs'),
  ]);
  assert.deepEqual(graph.writtenTwice(['factory/x.mjs']).map((w) => [w.path, w.agents]), [['factory/x.mjs', ['a', 'b']]]);
  assert.deepEqual(graph.writtenTwice(['factory/z.mjs']), []);
  assert.deepEqual(graph.staleChecks(['factory/z.mjs']).map((s) => s.name), ['tests']);
  assert.deepEqual(graph.staleChecks(['factory/x.mjs']), []);
});
