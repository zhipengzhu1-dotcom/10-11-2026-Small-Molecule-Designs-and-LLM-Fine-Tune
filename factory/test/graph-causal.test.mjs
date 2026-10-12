// The graph module's causal-order overlay through its interface (spec #52, stories 31, 32, 38):
// happens-before from two numbers per event, hand-backs nobody acted on, and lifecycle replay.
// Fixtures follow the cases the order-integrity research found on spec #1's logs
// (research/order-integrity:research/orchestration/order-integrity.md, section 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../graph.mjs';

const ev = (s, run, agent, type, fields = {}) => ({ ts: `2026-10-12T09:${String(s).padStart(2, '0')}:00Z`, run, agent, type, ...fields });
const row = (line, decision, evidence = 'e', ts = `2026-10-12T09:${String(line).padStart(2, '0')}:30Z`) =>
  ({ ts, run: null, agent: 'orchestrator', type: 'decision', phase: 'project/x', decision, why: 'w', evidence, result: 'adopted', line });
const dispatch = (s, run, to, ticket, fields = {}) => ev(s, run, 'orchestrator', 'dispatch', { to, role: 'implementer', ticket, description: `implementer #${ticket} work`, ...fields });
const start = (s, run, agent) => ev(s, run, agent, 'agent.start', { role: 'general-purpose', parent: 'orchestrator' });
const stop = (s, run, agent, status, report = `${status}: done`) => ev(s, run, agent, 'agent.stop', { role: 'general-purpose', status, report });
const ids = (list) => list.map((h) => h.id);

test('a hand-back no later decision or dispatch acted on is listed, ISSUES and BLOCKED before the rest', () => {
  const g = buildGraph([
    dispatch(1, 'r1', 'a1', 63),
    dispatch(2, 'r1', 'a2', 64),
    dispatch(3, 'r1', 'a3', 65),
    start(4, 'r1', 'a2'),
    start(5, 'r1', 'a1'),
    start(6, 'r1', 'a3'),
    stop(7, 'r1', 'a2', 'PASS'),
    stop(8, 'r1', 'a3', 'PASS'),
    stop(9, 'r1', 'a1', 'ISSUES', 'ISSUES: the merge test fails on Windows'),
    row(2, 'merged #65', 'file:factory/agents/r1/a3.jsonl'),
  ]);
  const unacted = g.unacted();
  assert.deepEqual(ids(unacted), ['event:r1/a1:2', 'event:r1/a2:2']);
  assert.deepEqual(unacted[0], { id: 'event:r1/a1:2', agent: 'a1', status: 'ISSUES', role: 'implementer', ticket: 63, report: 'ISSUES: the merge test fails on Windows' });
});

test('a later row or dispatch acts on a hand-back by citing it: its event, agent, branch or log, a file it wrote, a commit it checked, or a resume', () => {
  const worker = (n, extra = []) => [dispatch(n, 'r1', `a${n}`, 70 + n), start(n, 'r1', `a${n}`), ...extra, stop(n, 'r1', `a${n}`, 'PASS')];
  const g = buildGraph([
    ...worker(1),
    ...worker(2),
    ...worker(3),
    ...worker(4, [ev(4, 'r1', 'a4', 'artifact', { path: 'research/notes/a4.md', kind: 'notes' })]),
    ...worker(5, [ev(5, 'r1', 'a5', 'check', { name: 'npm-test', result: 'pass', evidence: 'commit:abcdef1234 452 pass' })]),
    ...worker(6),
    ...worker(7),
    // spec #1's rows predate the pointer grammar: a bare path and a bare sha
    ...worker(10, [ev(10, 'r1', 'a10', 'artifact', { path: 'research/tools/scout.md', kind: 'notes' })]),
    ...worker(11, [ev(11, 'r1', 'a11', 'check', { name: 'npm-test', result: 'pass', evidence: '58 pass at d4b3bae' })]),
    ...worker(12, [ev(12, 'r1', 'a12', 'artifact', { path: 'research/s1/tables/', kind: 'table' })]),
    row(6, 'merged #8', 'research/tools/scout.md; d4b3bae; research/s1/tables/table1.md'),
    row(1,'accepted the hand-back', 'event:r1/a1:2; agent:a8'), // a8 is not dispatched yet: evidence, not a cause
    row(2, 'merged its branch', 'worktree-agent-a2'),
    row(3, 'read its log', 'file:factory/agents/r1/a3.jsonl'),
    row(4, 'read its notes', 'file:research/notes/a4.md:3-9'),
    row(5, 'merged at its commit', 'commit:abcdef1'),
    ev(40, 'r1', 'orchestrator', 'dispatch', { to: 'a6', role: 'implementer', ticket: 76, resume: true }),
    ev(41, 'r1', 'orchestrator', 'dispatch', { to: 'a9', role: 'merger', ticket: 77, description: 'merger #77 merge', cause: 'event:r1/a7:2' }),
    ...worker(8),
    ev(50, 'r1', 'orchestrator', 'message', { to: 'a9', cause: 'event:r1/a8:2' }), // a message is no decision or dispatch
  ]);
  assert.deepEqual(ids(g.unacted()), ['event:r1/a8:2']);
});

test('an agent resumed across two runs, with 6 starts and 6 stops, replays clean', () => {
  // Like a5e405d7def3be73d on spec #1: one span in its first run, five in the next, the last
  // resume landing before the previous stop was logged.
  const resume = (s, run) => dispatch(s, run, 'a1', 66, { resume: true });
  const g = buildGraph([
    dispatch(0, 'r1', 'a1', 66), start(1, 'r1', 'a1'), stop(2, 'r1', 'a1', 'ISSUES'),
    resume(10, 'r2'), start(11, 'r2', 'a1'), stop(12, 'r2', 'a1', 'ISSUES'),
    resume(13, 'r2'), start(14, 'r2', 'a1'), stop(15, 'r2', 'a1', 'ISSUES'),
    resume(16, 'r2'), start(17, 'r2', 'a1'), stop(18, 'r2', 'a1', 'ISSUES'),
    resume(19, 'r2'), start(20, 'r2', 'a1'),
    resume(21, 'r2'), start(22, 'r2', 'a1'), stop(23, 'r2', 'a1', 'ISSUES'), stop(24, 'r2', 'a1', 'PASS'),
  ]);
  assert.deepEqual(g.lifecycle(), []);
  assert.deepEqual(ids(g.unacted()), ['event:r2/a1:9', 'event:r2/a1:10'], 'each resume acted on the stops before it');
  assert.deepEqual(g.clock('event:r2/a1:10'), { agent: 'a1', o: 6, own: 12 }); // the 6th stop: its count runs across both runs
});

test('happens-before comes from dispatches and citations, never from ts: inverted timestamps order correctly', () => {
  // Each agent's events in its own order; across agents the array order and every ts are wrong:
  // a1 ran "before" it was dispatched, and the row that read its hand-back is the oldest event.
  const events = [
    start(1, 'r1', 'a1'),
    ev(2, 'r1', 'a1', 'artifact', { path: 'notes/a1.md', kind: 'notes' }),
    stop(3, 'r1', 'a1', 'PASS'),
    start(4, 'r1', 'a2'),
    dispatch(59, 'r1', 'a1', 66), // O:1
    ev(58, 'r1', 'orchestrator', 'check', { name: 'trail', result: 'pass', evidence: 'x' }), // O:2
    row(2, 'accepted a1', 'agent:a1', '2026-10-12T08:00:00Z'), // O:3
    dispatch(57, 'r1', 'a2', 67), // O:4
  ];
  const g = buildGraph(events);
  const hb = (a, b) => g.happensBefore(a, b);
  const [d1, check, accepted, d2] = ['event:r1/orchestrator:1', 'event:r1/orchestrator:2', 'row:2', 'event:r1/orchestrator:3'];
  const [s1, made, back, s2] = ['event:r1/a1:1', 'event:r1/a1:2', 'event:r1/a1:3', 'event:r1/a2:1'];
  assert.deepEqual(g.clock(made), { agent: 'a1', o: 1, own: 2 });
  assert.deepEqual(g.clock(accepted), { agent: 'orchestrator', o: 3, own: 3 });
  assert.ok(hb(d1, s1) && !hb(s1, d1), 'a dispatch happens before the start it caused');
  assert.ok(hb(back, accepted) && !hb(accepted, back), 'a hand-back happens before the row that cites it');
  assert.ok(hb(made, s2), 'through O, a1\'s artifact happens before a2, dispatched after O read a1');
  assert.ok(!hb(check, back) && !hb(back, check), 'O\'s check, between the dispatch and the citing row, is concurrent with a1\'s stop');
  assert.ok(!hb(s2, back) && !hb(s1, s1));

  const all = events.map((e) => g.nodes.find((n) => n.event === e).id);
  const again = buildGraph(events.map((e, i) => ({ ...e, ts: events.at(-1 - i).ts }))); // every ts swapped
  for (const a of all) for (const b of all) assert.equal(again.happensBefore(a, b), hb(a, b), `${a} -> ${b}`);
});

test('for a spec, both lists keep to agents with an event in a run that logged its ticket graph, wherever the agent ran before', () => {
  const g = buildGraph([
    stop(1, 'old', 'a1', 'ISSUES'), // an orphan from spec #1's run
    start(2, 'old', 'a2'),
    stop(3, 'old', 'a2', 'PASS'),
    ev(4, 'new', 'orchestrator', 'ticket.graph', { spec: 52, tickets: [] }),
    ev(5, 'new', 'orchestrator', 'dispatch', { to: 'a2', role: 'implementer', ticket: 66, resume: true }),
    start(6, 'new', 'a2'),
    stop(7, 'new', 'a2', 'BLOCKED'),
    stop(8, 'new', 'a2', 'BLOCKED'),
  ]);
  assert.deepEqual(ids(g.unacted(52)), ['event:new/a2:2', 'event:new/a2:3']);
  assert.deepEqual(ids(g.unacted()), ['event:old/a1:1', 'event:new/a2:2', 'event:new/a2:3']);
  assert.deepEqual(ids(g.lifecycle(52)), ['event:new/a2:3']);
  assert.deepEqual(ids(g.lifecycle(1)), []);
});

test('an orphaned stop and a doubled stop are reported, and nothing else', () => {
  const g = buildGraph([
    stop(1, 'r1', 'a1', 'PASS'), // no start on record
    start(2, 'r1', 'a2'),
    stop(3, 'r1', 'a2', 'PASS'),
    stop(4, 'r1', 'a2', 'PASS'), // a second stop with no second start
    start(5, 'r1', 'a3'), // still running
  ]);
  assert.deepEqual(g.lifecycle(), [
    { id: 'event:r1/a1:1', agent: 'a1', kind: 'orphaned stop' },
    { id: 'event:r1/a2:3', agent: 'a2', kind: 'doubled stop' },
  ]);
});
