// The sojourn query of the graph module (spec #52, story 33; issue #68), through its interface:
// build from fixture events, then ask which running agents are overdue. The bound is the research's
// alarm: elapsed past mean + 2 sd of the role's earlier sojourns
// (research/process-mining:research/orchestration/process-mining.md, section 4.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../graph.mjs';

const T0 = Date.parse('2026-10-12T09:00:00Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const ev = (s, run, agent, type, fields = {}) => ({ ts: at(s), run, agent, type, ...fields });

// One agent's launch as the stream records it: the orchestrator's dispatch (which carries the
// role), then agent.start (whose role is the subagent type) and, once it hands back, agent.stop.
function agent(run, id, role, start, stop) {
  const events = [
    ev(start, run, 'orchestrator', 'dispatch', role ? { to: id, role, ticket: 68, description: `${role} #68 x`, tool_use_id: `t-${id}` } : { to: id }),
    ev(start, run, id, 'agent.start', { role: 'general-purpose', parent: 'orchestrator' }),
  ];
  if (stop !== undefined) events.push(ev(stop, run, id, 'agent.stop', { role: 'general-purpose', status: 'PASS' }));
  return role ? events : events.slice(1);
}

const flagged = (events, now, opts) => buildGraph(events.sort((a, b) => a.ts.localeCompare(b.ts))).overdue(Date.parse(at(now)), opts);

test('an agent running past its role\'s bound from earlier runs is flagged; one whose role has no history is not', () => {
  const events = [
    // Earlier run: implementers took 600, 700 and 800 s (mean 700, sd 100, bound 900 s).
    ...agent('r0', 'i1', 'implementer', 0, 600),
    ...agent('r0', 'i2', 'implementer', 0, 700),
    ...agent('r0', 'i3', 'implementer', 0, 800),
    // Earlier run, before dispatches were logged: quick general-purpose agents with no role.
    ...agent('r0', 'g1', undefined, 0, 5),
    ...agent('r0', 'g2', undefined, 0, 9),
    // This run.
    ...agent('r1', 'late', 'implementer', 10000),
    ...agent('r1', 'fresh', 'implementer', 10500),
    ...agent('r1', 'scout', 'scout', 10000),
  ];
  const now = 11000; // late has run 1000 s, fresh 500 s, scout 1000 s
  const out = flagged(events, now);
  assert.deepEqual(out.map((o) => [o.agent, o.role, o.ticket, o.run, o.elapsed, o.bound, o.n]), [
    ['late', 'implementer', 68, 'r1', 1000_000, 900_000, 3],
  ]);
});

test('a resumed agent is timed from its latest start, and history comes only from other runs', () => {
  const history = [...agent('r0', 'i1', 'implementer', 0, 600), ...agent('r0', 'i2', 'implementer', 0, 800)]; // bound about 983 s
  const events = [
    ...history,
    // Launched 11000 s ago, handed back, resumed 400 s ago: not overdue.
    ...agent('r1', 'resumed', 'implementer', 0, 100),
    ev(10600, 'r1', 'orchestrator', 'dispatch', { to: 'resumed', role: 'implementer', ticket: 68, description: 'implementer #68 x', tool_use_id: 't-r', resume: true }),
    ev(10600, 'r1', 'resumed', 'agent.start', { role: 'general-purpose', parent: 'orchestrator' }),
    // Readers have history only in this run, so a long-running reader raises no alarm yet.
    ...agent('r1', 'rd1', 'reader', 100, 110),
    ...agent('r1', 'rd2', 'reader', 100, 120),
    ...agent('r1', 'rd3', 'reader', 5000),
  ];
  assert.deepEqual(flagged(events, 11000), []);
  assert.deepEqual(flagged(events, 11700).map((o) => o.agent), ['resumed']);
});

test('with a run given, only that run\'s agents are flagged: an earlier run\'s agent that never stopped is left out', () => {
  const events = [
    ...agent('r0', 'i1', 'implementer', 0, 600),
    ...agent('r0', 'i2', 'implementer', 0, 800),
    ...agent('r0', 'orphan', 'implementer', 0),
    ...agent('r1', 'late', 'implementer', 5000),
    ...agent('r2', 'i3', 'implementer', 0, 700),
    ...agent('r2', 'i4', 'implementer', 0, 600),
  ];
  assert.deepEqual(flagged(events, 11000).map((o) => o.agent).sort(), ['late', 'orphan']);
  assert.deepEqual(flagged(events, 11000, { run: 'r1' }).map((o) => o.agent), ['late']);
});
