// The graph module's causal-order overlay through its interface (spec #52, stories 31, 32, 38):
// happens-before from two numbers per event, hand-backs nobody acted on, and lifecycle replay.
// Fixtures follow the cases the order-integrity research found on spec #1's logs
// (research/order-integrity:research/orchestration/order-integrity.md, section 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGraph } from '../graph.mjs';
import { readStream } from '../read.mjs';
import { tempRoot } from './helpers.mjs';

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
    row(2, 'merged #65', 'agent:a3'),
  ]);
  const unacted = g.unacted();
  assert.deepEqual(ids(unacted), ['event:r1/a1:2', 'event:r1/a2:2']);
  assert.deepEqual(unacted[0], { id: 'event:r1/a1:2', agent: 'a1', status: 'ISSUES', role: 'implementer', ticket: 63, report: 'ISSUES: the merge test fails on Windows' });
});

test('a hand-back is acted on by a row citing its event or agent, a dispatch whose Cause names it, a resume, or its ticket\'s Merge commit', () => {
  const worker = (n, extra = []) => [dispatch(n, 'r1', `a${n}`, 70 + n), start(n, 'r1', `a${n}`), ...extra, stop(n, 'r1', `a${n}`, 'PASS')];
  const events = [
    ...worker(1),
    ...worker(2),
    ...worker(3),
    ...worker(4),
    ...worker(5),
    ...worker(6),
    ...worker(7),
    row(1, 'accepted the hand-back', 'event:r1/a1:2; agent:a8'), // a8 is not dispatched yet: evidence, not a cause
    { ...row(2, 'took the report as read'), why: 'agent:a2 found nothing to fix' },
    ev(40, 'r1', 'orchestrator', 'dispatch', { to: 'a3', role: 'implementer', ticket: 73, resume: true }),
    ev(41, 'r1', 'orchestrator', 'dispatch', { to: 'a9', role: 'merger', ticket: 74, description: 'merger #74 merge', cause: 'event:r1/a4:2' }),
    ...worker(8),
    ev(50, 'r1', 'orchestrator', 'message', { to: 'a9', cause: 'event:r1/a8:2' }), // a message is no decision or dispatch
  ];
  const merges = [{ ticket: 75, ts: '2026-10-12T10:00:00Z', commit: 'c0ffee5' }]; // a5 served #75
  assert.deepEqual(ids(buildGraph(events, { merges }).unacted()), ['event:r1/a6:2', 'event:r1/a7:2', 'event:r1/a8:2']);
});

test('only those count: an orchestrator check or challenge citing a hand-back, or a row naming its branch, log, file or commit, does not act on it', () => {
  const worker = (n, extra = []) => [dispatch(n, 'r1', `a${n}`, 70 + n), start(n, 'r1', `a${n}`), ...extra, stop(n, 'r1', `a${n}`, 'PASS')];
  const g = buildGraph([
    ...worker(1),
    ...worker(2),
    ...worker(3, [ev(3, 'r1', 'a3', 'artifact', { path: 'research/notes/a3.md', kind: 'notes' })]),
    ...worker(4, [ev(4, 'r1', 'a4', 'check', { name: 'npm-test', result: 'pass', evidence: 'commit:abcdef1234 452 pass' })]),
    ...worker(5),
    ...worker(6),
    ev(30, 'r1', 'orchestrator', 'check', { name: 'trail', result: 'pass', evidence: 'event:r1/a1:2 read' }),
    ev(31, 'r1', 'orchestrator', 'challenge', { id: 'c1', target: 'event:r1/a2:2', kind: 'undermine', why: 'thin report' }),
    row(3, 'read its notes', 'file:research/notes/a3.md:3-9'),
    row(4, 'merged at its commit', 'commit:abcdef1'),
    row(5, 'merged its branch', 'worktree-agent-a5'),
    row(6, 'read its log', 'file:factory/agents/r1/a6.jsonl'),
    row(7, 'went on'), // a decision after them all
  ]);
  assert.deepEqual(ids(g.unacted()), ['event:r1/a1:2', 'event:r1/a2:2', 'event:r1/a3:3', 'event:r1/a4:3', 'event:r1/a5:2', 'event:r1/a6:2']);
  // They still order: the row that names a3's notes comes after a3's stop.
  assert.ok(g.happensBefore('event:r1/a3:3', 'row:3'));
});

test('an agent: or event: citation of a name with a dot still counts, as the pointer grammar allows', () => {
  const g = buildGraph([dispatch(1, 'r1', 'a.1', 70), start(2, 'r1', 'a.1'), stop(3, 'r1', 'a.1', 'ISSUES'), row(4, 'acted on it', 'agent:a.1.')]);
  assert.deepEqual(ids(g.unacted()), []);
  assert.ok(g.happensBefore('event:r1/a.1:2', 'row:4'));
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

test('through readStream, happens-before ignores ts across agents: each file keeps its own order, and only the orchestrator\'s activity file and decision log interleave by ts', () => {
  // The workers' clocks are wrong: a1 logged its events with ts running backwards, all before the
  // dispatch that started it, and a2 started "first of all".
  const root = tempRoot();
  const file = (run, agent, events) => {
    mkdirSync(join(root, 'factory', 'agents', run), { recursive: true });
    writeFileSync(join(root, 'factory', 'agents', run, `${agent}.jsonl`), events.map((e) => JSON.stringify(e) + '\n').join(''));
  };
  file('r1', 'a1', [start(9, 'r1', 'a1'), ev(8, 'r1', 'a1', 'artifact', { path: 'notes/a1.md', kind: 'notes' }), stop(7, 'r1', 'a1', 'PASS')]);
  file('r1', 'a2', [start(0, 'r1', 'a2')]);
  file('r1', 'orchestrator', [dispatch(20, 'r1', 'a1', 66), dispatch(40, 'r1', 'a2', 67)]);
  writeFileSync(join(root, 'factory', 'decisions.tsv'),
    'ts\tphase\tdecision\twhy\tevidence\tresult\n2026-10-12T09:30:00Z\tproject/x\taccepted a1\tw\tagent:a1\tadopted\n');
  const events = readStream(root);
  assert.deepEqual(events.filter((e) => e.agent === 'a1').map((e) => e.type), ['agent.start', 'artifact', 'agent.stop'], 'a file keeps its order');
  assert.deepEqual(events.filter((e) => e.agent === 'orchestrator').map((e) => e.type), ['dispatch', 'decision', 'dispatch'], 'O interleaves by ts');
  const g = buildGraph(events);
  const hb = (a, b) => g.happensBefore(a, b);
  assert.equal(g.node('event:r1/a1:3').type, 'agent.stop');
  assert.deepEqual(g.clock('row:2'), { agent: 'orchestrator', o: 2, own: 2 });
  assert.ok(hb('event:r1/orchestrator:1', 'event:r1/a1:1'), 'the dispatch happens before the start it caused');
  assert.ok(hb('event:r1/a1:3', 'row:2') && !hb('row:2', 'event:r1/a1:3'), 'the hand-back happens before the row citing it');
  assert.ok(hb('event:r1/a1:2', 'event:r1/a2:1'), 'a1\'s artifact happens before a2, dispatched after O read a1');
  assert.ok(!hb('event:r1/a2:1', 'event:r1/a1:1'), 'a2\'s early ts puts it before nothing');
  assert.deepEqual(g.lifecycle(), []);
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
