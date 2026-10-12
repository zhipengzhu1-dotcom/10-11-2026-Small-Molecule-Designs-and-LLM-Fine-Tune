// The graph module through its interface: build from fixture events, then ask. The decision rows
// reproduce the cases the argumentation research found on spec #1's log
// (research/argumentation:research/orchestration/argumentation.md, section 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { buildGraph } from '../graph.mjs';
import { FACTORY } from './helpers.mjs';

const row = (line, decision, result = 'adopted', phase = 'project/x') =>
  ({ ts: `2026-10-11T10:00:${String(line % 60).padStart(2, '0')}Z`, run: null, agent: 'orchestrator', type: 'decision', phase, decision, why: 'w', evidence: 'e', result, line });
const labels = (g) => Object.fromEntries(g.decisions.map((d) => [d.line, d.label]));
const ev = (s, run, agent, type, fields = {}) => ({ ts: `2026-10-12T09:00:${String(s).padStart(2, '0')}Z`, run, agent, type, ...fields });
const edgesOf = (g, rel) => g.edges.filter((e) => e.rel === rel).map((e) => `${e.from} -> ${e.to}`);

test('the base is PROV-DM: agents, the events they ran as activities, rows, files and tickets as entities, named in the pointer grammar', () => {
  const g = buildGraph([
    ev(0, 'r1', 'orchestrator', 'dispatch', { to: 'a1', role: 'implementer', ticket: 63, description: 'implementer #63 graph', tool_use_id: 't1' }),
    ev(1, 'r1', 'a1', 'agent.start', { role: 'implementer', parent: 'orchestrator' }),
    ev(2, 'r1', 'a1', 'artifact', { path: 'factory/graph.mjs', kind: 'code' }),
    ev(3, 'r1', 'orchestrator', 'ticket.graph', { spec: 52, tickets: [{ number: 63, state: 'OPEN', status: 'blocked', blockers: [54] }, { number: 54, state: 'OPEN', status: 'ready', blockers: [] }] }),
    row(2, 'the base rule'),
    row(3, 'supersedes line 2: the new rule'),
  ]);
  const cls = (id) => [g.node(id)?.class, g.node(id)?.type];
  assert.deepEqual(cls('agent:orchestrator'), ['agent', 'agent']);
  assert.deepEqual(cls('agent:a1'), ['agent', 'agent']);
  assert.deepEqual(cls('event:r1/orchestrator:1'), ['activity', 'dispatch']);
  assert.deepEqual(cls('event:r1/a1:1'), ['activity', 'agent.start']);
  assert.deepEqual(cls('event:r1/a1:2'), ['activity', 'artifact']);
  assert.deepEqual(cls('file:factory/graph.mjs'), ['entity', 'file']);
  assert.deepEqual(cls('row:2'), ['entity', 'decision']);
  assert.deepEqual(cls('issue:63'), ['entity', 'ticket']);
  assert.deepEqual(edgesOf(g, 'wasAssociatedWith'), ['event:r1/orchestrator:1 -> agent:orchestrator', 'event:r1/a1:1 -> agent:a1', 'event:r1/a1:2 -> agent:a1', 'event:r1/orchestrator:2 -> agent:orchestrator']);
  assert.deepEqual(edgesOf(g, 'wasGeneratedBy'), ['file:factory/graph.mjs -> event:r1/a1:2']);
  assert.deepEqual(edgesOf(g, 'wasAttributedTo'), ['row:2 -> agent:orchestrator', 'row:3 -> agent:orchestrator']);
  assert.deepEqual(edgesOf(g, 'blockedBy'), ['issue:63 -> issue:54']);
  assert.deepEqual(edgesOf(g, 'supersedes'), ['row:3 -> row:2']);
});

test('a withdrawn row is out, and comes back in when its withdrawal is itself withdrawn', () => {
  const rows = [
    row(21, 'pushed intake/s1 to origin, and will push after each merge from now on', 'adopted'),
    row(71, 'withdraws line 21: pushed intake/s1 at 271c5ba as a one-off push; standing push-after-merge consent is withdrawn', 'adopted'),
  ];
  assert.deepEqual(labels(buildGraph(rows)), { 21: 'out', 71: 'in' });
  const again = buildGraph([...rows, row(80, 'withdraws line 71: the user restored push-after-merge consent')]);
  assert.deepEqual(labels(again), { 21: 'in', 71: 'out', 80: 'in' });
});

test('a superseded row stays out when its replacement is itself superseded: a supersede takes over its target\'s attacks', () => {
  const g = buildGraph([
    row(28, 'flagged 12 paper inconsistencies for the verifier', 'open: handed to #9'),
    row(57, 'supersedes line 28: flagged 12 paper inconsistencies D-01 to D-12 for the verifier', 'open: handed to #9'),
    row(75, 'supersedes line 57: the discrepancies were settled by the #9 verifier', 'adopted'),
  ]);
  assert.deepEqual(labels(g), { 28: 'out', 57: 'out', 75: 'in' });
});

test('a partial supersede puts only the replaced part out: the row stays in with that part out', () => {
  const g = buildGraph([
    row(41, 'the replication and its evaluation use only local open-source models; the brief must plan rule-based grading with a local model fallback'),
    row(43, 'supersedes line 41 (part): grade in tiers: rule-based first, then a local model, then Claude as judge'),
  ]);
  assert.deepEqual(labels(g), { 41: 'in', 43: 'in' });
  assert.deepEqual(g.decision(41).parts, [{ by: 43, label: 'out' }]);
  assert.deepEqual(g.decision(43).parts, []);
  const gone = buildGraph([...g.decisions, row(50, 'withdraws line 41: the replication may use hosted models')]);
  assert.deepEqual(gone.decision(41).parts, [{ by: 43, label: 'out' }]);
  assert.equal(gone.decision(41).label, 'out');
  const back = buildGraph([...g.decisions, row(50, 'withdraws line 43: the grading plan of line 41 is back')]);
  assert.deepEqual(back.decision(41).parts, [{ by: 43, label: 'in' }]);
});

test('two rows that withdraw each other are both undec, until standing rows withdraw them', () => {
  const g = buildGraph([
    row(2, 'withdraws line 3: option A'),
    row(3, 'withdraws line 2: option B'),
    row(4, 'withdraws line 3: drop option B'),
    row(5, 'withdraws line 2: drop option A'),
    row(6, 'the base rule'),
  ]);
  assert.deepEqual(labels(buildGraph(g.decisions.slice(0, 2))), { 2: 'undec', 3: 'undec' });
  assert.deepEqual(labels(g), { 2: 'out', 3: 'out', 4: 'in', 5: 'in', 6: 'in' });
});

test('the decisions that bind a ticket: standing given rows, and standing adopted rows on the ticket, its blockers or its spec', () => {
  const snapshot = (s, tickets) => ev(s, 'r1', 'orchestrator', 'ticket.graph', { spec: 52, tickets });
  const t = (number, blockers = []) => ({ number, state: 'OPEN', status: blockers.length ? 'blocked' : 'ready', blockers });
  const events = [
    snapshot(0, [t(53), t(54, [53]), t(63, [54]), t(70)]),
    snapshot(1, [t(54), t(63, [54]), t(70)]), // #53 merged: it no longer shows as a blocker
    snapshot(2, [t(63), t(70)]),
    row(3, 'tests run on fixtures, never the live log', 'given'),
    row(4, 'the pointer grammar has one parser', 'adopted', 'project/implement-spec/ticket-53'),
    row(5, 'decide --closes names a challenge id', 'adopted', 'project/implement-spec/ticket-54'),
    row(6, 'the graph is rebuilt on every read for #63', 'adopted: on the integration branch'),
    row(7, 'build spec #52 on spec52/node-model', 'adopted'),
    row(8, 'the done read counts residual doubt', 'adopted', 'project/implement-spec/ticket-70'),
    row(9, 'started #63 in its own worktree', 'open', 'project/implement-spec/ticket-63'),
    row(10, 'merged and closed #63', 'closed', 'project/implement-spec/ticket-63'),
    row(11, 'push after each merge', 'given'),
    row(12, 'withdraws line 11: no standing push consent', 'adopted', 'project/implement/push'),
    row(13, 'the graph module reads fixture events only; it returns labels for #63', 'adopted', 'project/implement-spec/ticket-63'),
    row(14, 'supersedes line 13 (part): the graph module also takes a ticket-graph snapshot', 'adopted', 'project/implement-spec/ticket-63'),
  ];
  const g = buildGraph(events);
  const bind = (n) => g.binding(n).map((b) => [b.row.line, b.because]);
  assert.deepEqual(bind(63), [[3, 'given'], [4, 'blocker #53'], [5, 'blocker #54'], [6, '#63'], [7, 'spec #52'], [13, '#63'], [14, '#63']]);
  assert.deepEqual(g.binding(63).find((b) => b.row.line === 13).row.parts, [{ by: 14, label: 'out' }]);
  assert.deepEqual(bind(70), [[3, 'given'], [7, 'spec #52'], [8, '#70']]);
  assert.deepEqual(bind(99), [[3, 'given']]);
});

test('the graph module is pure: it, the pointer grammar and every module they import import no built-in or package, so no file, network or model code', () => {
  const imports = (file) => [...readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]);
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of imports(file)) {
      assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${relative(FACTORY, file)} imports ${spec}`);
      walk(join(dirname(file), spec));
    }
  };
  walk(join(FACTORY, 'graph.mjs'));
  walk(join(FACTORY, 'pointer-grammar.mjs')); // the pointer parsers the graph may use
  assert.ok(seen.size >= 3, 'graph.mjs imports the claim grammar');
});

test('a corrects row leaves the row it corrects in, and superseding the correction changes nothing for that row', () => {
  const g = buildGraph([
    row(35, 'reverted a catalog re-run; moved the changed page out of the repo', 'adopted'),
    row(58, 'corrects line 35: the changed page moved to the scratchpad, not research/', 'adopted'),
  ]);
  assert.deepEqual(labels(g), { 35: 'in', 58: 'in' });
  const later = buildGraph([...g.decisions, row(90, 'supersedes line 58: the changed page was deleted')]);
  assert.deepEqual(labels(later), { 35: 'in', 58: 'out', 90: 'in' });
});

// The workflow net: a ticket-graph snapshot of spec 52, and the integration branch's `Merge #<n>`
// commits, which the digest reads from git and hands in as the snapshot's `merges`.
const tk = (number, blockers = [], state = 'OPEN') => ({ number, state, status: blockers.length ? 'blocked' : 'ready', blockers });
const snap = (s, tickets) => ev(s, 'r1', 'orchestrator', 'ticket.graph', { spec: 52, tickets });
const start = (s, ticket) => ev(s, 'r1', 'orchestrator', 'dispatch', { to: `a${ticket}`, role: 'implementer', ticket, description: `implementer #${ticket} x`, tool_use_id: `t${s}` });
const merged = (s, ticket) => ({ ticket, ts: `2026-10-12T09:00:${String(s).padStart(2, '0')}Z`, commit: `c0ffee${ticket}` });

test('a ticket started before its blocker merged, with no decision row explaining it, is an early start; a standing row naming both explains it', () => {
  const events = [
    snap(0, [tk(63), tk(59), tk(67, [63, 59])]),
    start(1, 63),
    start(2, 59),
    start(5, 67), // #59 merged at 4, #63 only at 10
    row(20, 'merged #59', 'adopted', 'project/implement-spec/ticket-59'),
  ];
  const at = (evs, merges) => buildGraph(evs, { ...events[0], merges }).earlyStarts();
  const merges = [merged(4, 59), merged(10, 63)];
  assert.deepEqual(at(events, merges), [
    { ticket: 67, blocker: 63, start: 'event:r1/orchestrator:4', merged: '2026-10-12T09:00:10Z', explainedBy: [] },
  ]);
  const explained = [...events, row(21, 'started #67 before #63 merged: its interface is fixed', 'adopted', 'project/implement-spec/ticket-67')];
  assert.deepEqual(at(explained, merges).map((e) => [e.ticket, e.blocker, e.explainedBy]), [[67, 63, [21]]]);
  const withdrawn = [...explained, row(22, 'withdraws line 21: the interface changed')];
  assert.deepEqual(at(withdrawn, merges).map((e) => e.explainedBy), [[]]);
  assert.deepEqual(at(events, [merged(4, 59)]).map((e) => [e.ticket, e.blocker, e.merged]), [[67, 63, null]]);
  assert.deepEqual(at(events, [merged(4, 59), merged(5, 63)]), []);
});

test('zero-slack tickets are the unmerged tickets on a longest chain, each ticket one step', () => {
  // 2 waits on 1, 3 on 2, 4 on 1, 5 on 3 and 4; 6 stands alone. By hand, earliest/latest start:
  // 1 0/0, 2 1/1, 3 2/2, 4 1/2, 5 3/3, 6 0/3, so the critical path is 1-2-3-5 (4 steps).
  const tickets = [tk(1), tk(2, [1]), tk(3, [2]), tk(4, [1]), tk(5, [3, 4]), tk(6)];
  const slack = (merges = []) => buildGraph([snap(0, tickets)], { ...snap(0, tickets), merges }).slack().map((s) => [s.ticket, s.earliest, s.latest, s.slack]);
  assert.deepEqual(slack(), [[1, 0, 0, 0], [2, 1, 1, 0], [3, 2, 2, 0], [4, 1, 2, 1], [5, 3, 3, 0], [6, 0, 3, 3]]);
  // Once #1 merges it leaves the plan: 2-3-5 is critical, 4 has one step of slack, 6 two.
  assert.deepEqual(slack([merged(1, 1)]), [[2, 0, 0, 0], [3, 1, 1, 0], [4, 0, 1, 1], [5, 2, 2, 0], [6, 0, 2, 2]]);
  // A spec, and a ticket closed on GitHub without a merge, are not in the plan.
  const more = [...tickets, { number: 7, state: 'OPEN', status: 'spec', blockers: [] }, tk(8, [6], 'CLOSED')];
  assert.deepEqual(buildGraph([snap(0, more)]).slack().map((s) => s.ticket), [1, 2, 3, 4, 5, 6]);
});

test('proper completion: the sink is reached when every ticket merged, and proper only when every gate token was consumed too', () => {
  const tickets = [tk(1), tk(2, [1])];
  const done = (events, merges) => buildGraph(events, { ...snap(0, tickets), merges }).completion();
  const ran = [snap(0, tickets), start(1, 1), start(3, 2)];
  assert.deepEqual(done(ran, [merged(2, 1), merged(4, 2)]), { proper: true, sink: true, unmerged: [], gates: [] });
  // #2 not yet started: #1's token waits in #2's gate, and the sink is not reached.
  assert.deepEqual(done(ran.slice(0, 2), [merged(2, 1)]), { proper: false, sink: false, unmerged: [2], gates: [{ ticket: 2, tokens: [1], owed: [] }] });
  // #2 started early and #1 never merged: the token #2's start took is still owed.
  assert.deepEqual(done([snap(0, tickets), start(1, 2)], [merged(4, 2)]), { proper: false, sink: false, unmerged: [1], gates: [{ ticket: 2, tokens: [], owed: [1] }] });
  // Both merged, but #2 never had a dispatch: its gate token was never consumed.
  assert.deepEqual(done([snap(0, tickets), start(1, 1)], [merged(2, 1), merged(4, 2)]), { proper: false, sink: true, unmerged: [], gates: [{ ticket: 2, tokens: [1], owed: [] }] });
});
