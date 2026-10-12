// The assurance-case overlay through the graph module's interface (spec #52, story 37): the spec's
// user stories are goals, the story map's checks and tests their evidence, challenges their doubts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../graph.mjs';

const at = (s) => `2026-10-12T09:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}Z`;
const ev = (s, run, agent, type, fields = {}) => ({ ts: at(s), run, agent, type, ...fields });
const row = (line, decision, result = 'adopted') =>
  ({ ts: at(line), run: null, agent: 'orchestrator', type: 'decision', phase: 'project/x', decision, why: 'w', evidence: 'e', result, line });
const snap = (s, fields = {}) => ev(s, 'r1', 'orchestrator', 'ticket.graph', { spec: 52, tickets: [{ number: 70, state: 'OPEN', status: 'ready', blockers: [] }], stories: [1, 2, 3], ...fields });
const check = (s, agent, name, result, fields = {}) => ev(s, 'r1', agent, 'check', { name, result, evidence: 'e', ...fields });
const map = (...rows) => rows.map(([story, kind, name]) => ({ story, kind, name }));
const graphOf = (events, extra = {}) => buildGraph(events, { ...events.find((e) => e.type === 'ticket.graph'), ...extra });
const goal = (g, n) => g.goals().find((s) => s.story === n);

test('a story with no story-map row is undeveloped, and a story whose only check failed shows an open doubt', () => {
  const events = [snap(0), check(1, 'a1', 'trail', 'fail'), check(2, 'a1', 'stories', 'pass')];
  const g = graphOf(events, { map: map([1, 'check', 'trail'], [2, 'check', 'stories']) });
  assert.deepEqual(g.goals().map((s) => [s.story, s.status, s.doubts]), [
    [1, 'failing', ['event:r1/a1:1']],
    [2, 'supported', []],
    [3, 'undeveloped', ['story:3']],
  ]);
  assert.deepEqual(goal(g, 1).evidence, [{ kind: 'check', name: 'trail', result: 'fail', at: 'event:r1/a1:1' }]);
  const open = g.challenges(52).filter((c) => c.open);
  assert.deepEqual(open.map((c) => [c.id, c.source, c.kind]), [['event:r1/a1:1', 'check', 'rebut']]);
});

test('a later pass eliminates an earlier fail\'s doubt, for a check and for a test in the results', () => {
  const results = { 'factory/agents/r1/tests/a1-1.tsv': [{ name: 'labels', result: 'fail' }], 'factory/agents/r1/tests/a1-2.tsv': [{ name: 'labels', result: 'pass' }] };
  const artifact = (s, n) => ev(s, 'r1', 'a1', 'artifact', { path: `factory/agents/r1/tests/a1-${n}.tsv`, kind: 'test-results' });
  const events = [snap(0, { stories: [1, 2] }), check(1, 'a1', 'trail', 'fail'), artifact(2, 1), check(3, 'a2', 'trail', 'pass'), artifact(4, 2)];
  const g = graphOf(events, { map: map([1, 'check', 'trail'], [2, 'test', 'labels']), results });
  assert.deepEqual(g.goals().map((s) => [s.story, s.status, s.doubts]), [[1, 'supported', []], [2, 'supported', []]]);
  assert.deepEqual(g.challenges(52).map((c) => [c.id, c.open]), [['event:r1/a1:1', false]]);
  // Before the passes, each story has its open doubt: the failed check, and the failed test.
  const before = graphOf(events.slice(0, 3), { map: map([1, 'check', 'trail'], [2, 'test', 'labels']), results });
  assert.deepEqual(before.goals().map((s) => [s.story, s.status, s.doubts]), [[1, 'failing', ['event:r1/a1:1']], [2, 'failing', ['event:r1/a1:2#labels']]]);
});

test('a logged challenge on a row puts the row out until a row closes it, and withdrawing the closing row brings the doubt back', () => {
  const challenge = ev(1, 'r1', 'orchestrator', 'challenge', { id: 'c1', target: 'row:2', kind: 'rebut', why: 'the cap is 8 GB, not 9' });
  const rows = [row(2, 'plan the 9 GB judge'), row(3, 'closes challenge c1: the judge is qwen3.5:4b, 3.4 GiB')];
  const label = (g) => [g.decision(2).label, g.challenges().map((c) => [c.id, c.label])];
  assert.deepEqual(label(graphOf([snap(0), row(2, 'plan the 9 GB judge'), challenge])), ['out', [['c1', 'in']]]);
  const closed = graphOf([snap(0), challenge, ...rows]);
  assert.deepEqual(label(closed), ['in', [['c1', 'out']]]);
  assert.ok(closed.edges.some((e) => e.from === 'row:3' && e.rel === 'closes' && e.to === 'event:r1/orchestrator:2'));
  assert.ok(closed.edges.some((e) => e.from === 'event:r1/orchestrator:2' && e.rel === 'challenges' && e.to === 'row:2'));
  assert.deepEqual(label(graphOf([snap(0), challenge, ...rows, row(4, 'withdraws line 3: 3.4 GiB was Ollama\'s figure')])), ['out', [['c1', 'in']]]);
  const eliminated = ev(2, 'r1', 'orchestrator', 'challenge.eliminated', { of: 'c1', by: 'commit:abc1234' });
  assert.deepEqual(label(graphOf([snap(0), row(2, 'plan the 9 GB judge'), challenge, eliminated])), ['in', [['c1', 'out']]]);
});

test('ISSUES, BLOCKED and unknown stops and fetch.failed are doubts until a later PASS for the ticket, a fetched ref or a row citing them', () => {
  const dispatch = (s, to, ticket, role = 'implementer') => ev(s, 'r1', 'orchestrator', 'dispatch', { to, role, ticket, description: `${role} #${ticket} x`, tool_use_id: `t${s}` });
  const stop = (s, agent, status) => ev(s, 'r1', agent, 'agent.stop', { role: 'general-purpose', status, report: `${status}: work` });
  const events = [
    snap(0), dispatch(1, 'a1', 70), dispatch(2, 'a2', 71), dispatch(3, 'a3', 70, 'merger'), dispatch(4, 'a4', 70),
    stop(5, 'a1', 'ISSUES'), stop(6, 'a2', 'BLOCKED'), stop(7, 'a3', 'unknown'),
    ev(8, 'r1', 'a2', 'fetch.failed', { ref: 'gsn-v3', url: 'https://scsc.uk/r141C:1', reason: 'no file' }),
    ev(9, 'r1', 'a2', 'fetch.failed', { ref: 'kelly2004gsn', url: 'https://example.org/k.pdf', reason: '404' }),
    stop(10, 'a4', 'PASS'),
    ev(11, 'r1', 'fetch-page', 'artifact', { path: 'research/refs/gsn-v3/raw/gsn.pdf', kind: 'ref', ref: 'gsn-v3' }),
  ];
  const open = (g) => g.challenges(52).filter((c) => c.open).map((c) => [c.id, c.source, c.kind, c.target]);
  // a4 is #70's implementer too, so its PASS settles a1's ISSUES; the merger's unknown stop stays.
  assert.deepEqual(open(graphOf(events)), [
    ['event:r1/a2:1', 'stop', 'rebut', 'issue:71'],
    ['event:r1/a3:1', 'stop', 'undermine', 'issue:70'],
    ['event:r1/a2:3', 'fetch.failed', 'undermine', null],
  ]);
  const citing = { ...row(5, 'withdrew #71: the GSN v3 text is not needed'), evidence: 'event:r1/a2:1 event:r1/a2:3' };
  assert.deepEqual(open(graphOf([...events, citing])), [['event:r1/a3:1', 'stop', 'undermine', 'issue:70']]);
});

test('a check that ran before its file\'s last write is an open undercut doubt on its story, until the check runs again', () => {
  const write = (s, agent) => ev(s, 'r1', agent, 'artifact', { path: 'research/s1/brief.md', kind: 'notes' });
  const events = [snap(0, { stories: [1] }), write(1, 'a1'), check(2, 'a1', 'brief', 'pass', { evidence: 'file:research/s1/brief.md: 67 rows' }), write(3, 'a2')];
  const g = graphOf(events, { map: map([1, 'check', 'brief']), merges: [] });
  const stale = 'stale:event:r1/a1:2:file:research/s1/brief.md';
  assert.deepEqual(g.challenges(52).filter((c) => c.open).map((c) => [c.id, c.source, c.kind, c.target]), [[stale, 'stale', 'undercut', 'file:research/s1/brief.md']]);
  assert.deepEqual(g.goals().map((s) => [s.story, s.status, s.doubts]), [[1, 'failing', [stale]]]);
  assert.equal(g.done(52).residual, 1);
  const rerun = graphOf([...events, check(4, 'a1', 'brief', 'pass', { evidence: 'research/s1/brief.md' })], { map: map([1, 'check', 'brief']), merges: [] });
  assert.deepEqual(rerun.challenges(52), []);
  assert.deepEqual(rerun.goals().map((s) => [s.story, s.status]), [[1, 'supported']]);
});

test('done counts residual doubt once per doubt: stories without passing evidence, failing evidence and open challenges, never multiplied', () => {
  const events = [
    snap(0, { stories: [1, 2, 3, 4] }), check(1, 'orchestrator', 'trail', 'fail'), check(2, 'orchestrator', 'stories', 'pass'),
    ev(3, 'r1', 'orchestrator', 'challenge', { id: 'c1', target: 'file:factory/graph.mjs', kind: 'undercut', why: 'run before the last merge' }),
    row(2, 'withdraws line 3: x'), row(3, 'withdraws line 2: y'),
    ev(4, 'r2', 'orchestrator', 'check', { name: 'licenses', result: 'fail', evidence: 'another spec' }),
  ];
  const g = graphOf(events, { map: map([1, 'check', 'trail'], [2, 'check', 'stories'], [3, 'none', '-'], [5, 'test', 'never run']), merges: [] });
  const d = g.done(52);
  assert.deepEqual(d.goals.map((s) => [s.story, s.status]), [[1, 'failing'], [3, 'none'], [4, 'undeveloped'], [5, 'unrun']]);
  // The failed trail check is story 1's doubt and an open challenge: counted once. Run r2 is not the spec's.
  assert.deepEqual(d.challenges.map((c) => c.id), ['event:r1/orchestrator:2', 'c1']);
  assert.deepEqual(d.undec.map((r) => r.line), [2, 3]);
  assert.equal(d.residual, 5);
  assert.equal(d.listed, true);
  assert.deepEqual(d.completion, { proper: false, sink: false, unmerged: [70], gates: [] });
});
