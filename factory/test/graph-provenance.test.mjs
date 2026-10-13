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
const dispatch = (s, to, fields = {}) => ev(s, 'orchestrator', 'dispatch', { to, role: 'implementer', ticket: 69, description: 'implementer #69 x', ...fields });
const started = (s, agent) => ev(s, agent, 'agent.start', { role: 'general-purpose', parent: 'orchestrator' });

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

test('a check that provably ran before its artifact\'s last write is stale; a check re-run after the write is not', () => {
  const graph = buildGraph([
    dispatch(1, 'impl'),
    started(2, 'impl'),
    wrote(3, 'impl', 'factory/x.mjs'),
    wrote(4, 'impl', 'factory/y.mjs'),
    checked(5, 'orchestrator', 'tests', 'file:factory/x.mjs: 3/3 pass'), // O read impl's x.mjs
    checked(6, 'orchestrator', 'lint', 'factory/y.mjs:12 clean'),
    dispatch(7, 'impl', { resume: true }), // so impl's next writes come after both checks
    started(8, 'impl'),
    wrote(9, 'impl', 'factory/x.mjs'),
    wrote(10, 'impl', 'factory/y.mjs'),
    checked(11, 'orchestrator', 'lint', 'factory/y.mjs clean again'),
  ]);
  assert.deepEqual(graph.staleChecks(), [{
    check: 'event:r1/orchestrator:2',
    name: 'tests',
    result: 'pass',
    path: 'factory/x.mjs',
    write: 'event:r1/impl:5',
  }]);
});

test('a check concurrent with a write is not stale, whatever their ts: only happens-before counts', () => {
  // impl was dispatched before the check and wrote after it by the clock, but nothing orders the two.
  const events = [
    dispatch(1, 'impl'),
    checked(2, 'orchestrator', 'tests', 'file:factory/x.mjs: 3/3 pass'),
    started(3, 'impl'),
    wrote(4, 'impl', 'factory/x.mjs'),
  ];
  assert.deepEqual(buildGraph(events).staleChecks(), []);
  const resumed = buildGraph([...events, dispatch(5, 'impl', { resume: true }), started(6, 'impl'), wrote(7, 'impl', 'factory/x.mjs')]);
  assert.deepEqual(resumed.staleChecks().map((s) => [s.check, s.write]), [['event:r1/orchestrator:2', 'event:r1/impl:4']]);
});

test('a check naming no written file, or a file only as part of a longer path, is never stale', () => {
  const graph = buildGraph([
    checked(1, 'orchestrator', 'tests', 'commit:58e6b65 463/463 pass'),
    checked(2, 'orchestrator', 'notes', 'docs/factory/x.mjs and factory/x.mjsx'),
    dispatch(3, 'impl'),
    started(4, 'impl'),
    wrote(5, 'impl', 'factory/x.mjs'),
  ]);
  assert.deepEqual(graph.staleChecks(), []);
});

test('both queries narrow to the given paths, which match an artifact logged by its absolute path too', () => {
  const graph = buildGraph([
    checked(1, 'orchestrator', 'tests', 'factory/z.mjs ok'),
    dispatch(2, 'a'),
    started(3, 'a'),
    wrote(4, 'a', 'C:/repo/factory/x.mjs'),
    wrote(5, 'b', 'factory/x.mjs'),
    wrote(6, 'a', 'factory/z.mjs'),
    wrote(7, 'a', 'factory/w.mjs'),
    wrote(8, 'b', 'factory/w.mjs'),
  ]);
  assert.deepEqual(graph.writtenTwice(['factory/x.mjs']).map((w) => [w.path, w.agents]), [['factory/x.mjs', ['a', 'b']]]);
  assert.deepEqual(graph.writtenTwice(['factory/z.mjs']), []);
  assert.deepEqual(graph.staleChecks(['factory/z.mjs']).map((s) => s.name), ['tests']);
  assert.deepEqual(graph.staleChecks(['factory/x.mjs']), []);
});
