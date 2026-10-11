import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, createSimulation, swimlanes } from '../viewer/layout.js';
import { summarize } from '../viewer.mjs';

const at = (mm, ss = '00') => `2026-10-11T10:${mm}:${ss}Z`;
const ev = (mm, run, agent, type, fields = {}) => ({ ts: at(mm), run, agent, type, ...fields });

// Graph

const decision = (mm, phase, extra = {}) => ev(mm, null, 'orchestrator', 'decision', { phase, decision: `d ${phase}`, why: 'w', evidence: 'e', result: 'r', ...extra });
const treeLinks = (g) => g.links.filter((l) => l.kind === 'tree');

const tree = summarize([
  decision('00', 'project/paper/pick'),
  decision('01', 'project/paper/pick'),
  decision('02', 'project/plan'),
  decision('03', 'intake/references'),
]).tree;

test('the graph has a root, a node per phase and a dot per decision, each with a tree link to its parent', () => {
  const g = buildGraph(tree);
  const { nodes } = g;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  assert.deepEqual(nodes.filter((n) => n.kind === 'phase').map((n) => n.id), ['project', 'project/paper', 'project/paper/pick', 'project/plan', 'intake', 'intake/references']);
  assert.equal(nodes.filter((n) => n.kind === 'decision').length, 4);
  assert.equal(nodes.filter((n) => n.kind === 'root').length, 1);
  assert.equal(byId.get('project').count, 3);
  const parentOf = new Map(treeLinks(g).map((l) => [nodes[l.target].id, nodes[l.source].id]));
  assert.equal(parentOf.get('project'), '');
  assert.equal(parentOf.get('project/paper/pick'), 'project/paper');
  const pickDots = nodes.filter((n) => n.kind === 'decision' && parentOf.get(n.id) === 'project/paper/pick');
  assert.equal(pickDots.length, 2);
  assert.equal(pickDots[0].decision.phase, 'project/paper/pick');
  // every node but the root and evidence nodes has exactly one parent
  assert.equal(treeLinks(g).length, nodes.filter((n) => n.kind !== 'root' && n.kind !== 'evidence').length);
});

// Cross-links, from rows the way decisions.tsv holds them: each decision knows its line.
const crossed = buildGraph(summarize([
  decision('00', 'project/implement/ticket-2', { line: 2, decision: 'asked the #2 implementer to fix it', evidence: 'a.jsonl @10:00Z; notes.md' }),
  decision('01', 'project/implement/ticket-3', { line: 3, decision: 'merged', evidence: 'a.jsonl @10:05Z and @10:06Z' }),
  decision('02', 'project/spec/tickets', { line: 4, decision: 'filed #2, #3 and #9', evidence: 'issue #1' }),
  decision('03', 'project/implement/ticket-2', { line: 5, decision: 'supersedes line 2: asked again', evidence: 'b.md' }),
]).tree);
const linksOf = (g, kind) => g.links.filter((l) => l.kind === kind).map((l) => [g.nodes[l.source], g.nodes[l.target]]);

test("a decision that supersedes an earlier row links to that row's decision", () => {
  assert.deepEqual(linksOf(crossed, 'supersedes').map(([a, b]) => [a.decision.line, b.decision.line]), [[5, 2]]);
});

test("a decision that mentions a ticket links to that ticket's phase, unless it is its own or has no phase", () => {
  assert.deepEqual(linksOf(crossed, 'mentions').map(([a, b]) => [a.decision.line, b.id]), [
    [4, 'project/implement/ticket-2'],
    [4, 'project/implement/ticket-3'],
  ]);
});

test('a source cited by decisions in different phases becomes an evidence node linked to each of them', () => {
  const ev = crossed.nodes.filter((n) => n.kind === 'evidence');
  assert.deepEqual(ev.map((n) => [n.id, n.label, n.count]), [['e:a.jsonl', 'a.jsonl', 2]]);
  assert.deepEqual(linksOf(crossed, 'evidence').map(([a, b]) => [a.id, b.decision.line]), [['e:a.jsonl', 2], ['e:a.jsonl', 3]]);
});

function settled(graph, ticks = 400) {
  const sim = createSimulation(graph.nodes, graph.links);
  for (let i = 0; i < ticks; i++) sim.tick();
  return sim;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('the 3-D force layout settles to finite, spread-out positions with linked nodes closer than unlinked ones', () => {
  const graph = buildGraph(tree);
  const { nodes } = settled(graph);
  for (const n of nodes) assert.ok([n.x, n.y, n.z].every(Number.isFinite), `${n.id} at ${n.x},${n.y},${n.z}`);
  const linked = new Set(graph.links.map((l) => `${l.source}-${l.target}`));
  let near = 0, nearN = 0, far = 0, farN = 0, closest = Infinity;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const d = dist(nodes[i], nodes[j]);
    closest = Math.min(closest, d);
    if (linked.has(`${i}-${j}`) || linked.has(`${j}-${i}`)) { near += d; nearN++; } else { far += d; farN++; }
  }
  assert.ok(near / nearN < far / farN, `linked mean ${near / nearN} vs unlinked ${far / farN}`);
  assert.ok(closest > 1, `two nodes collapsed onto each other (${closest})`);
  // a real third dimension, not a flat sheet
  const zs = nodes.map((n) => n.z), mean = zs.reduce((a, b) => a + b) / zs.length;
  const sd = Math.sqrt(zs.reduce((a, z) => a + (z - mean) ** 2, 0) / zs.length);
  assert.ok(sd > 5, `depth spread only ${sd}`);
});

test('the layout is the same every time for the same graph', () => {
  const a = settled(buildGraph(tree)).nodes.map((n) => [n.x, n.y, n.z]);
  const b = settled(buildGraph(tree)).nodes.map((n) => [n.x, n.y, n.z]);
  assert.deepEqual(a, b);
});

test('a pinned node stays where it is pinned, and a node that already has a position starts there', () => {
  const graph = buildGraph(tree);
  Object.assign(graph.nodes[1], { fx: 500, fy: -200, fz: 30 });
  Object.assign(graph.nodes[2], { x: 42, y: 7, z: -3 });
  const sim = createSimulation(graph.nodes, graph.links);
  assert.deepEqual([sim.nodes[2].x, sim.nodes[2].y, sim.nodes[2].z], [42, 7, -3]);
  for (let i = 0; i < 200; i++) sim.tick();
  assert.deepEqual([sim.nodes[1].x, sim.nodes[1].y, sim.nodes[1].z], [500, -200, 30]);
});

test('the simulation cools down and can be reheated', () => {
  const sim = settled(buildGraph(tree), 1000);
  assert.equal(sim.settled(), true);
  sim.reheat();
  assert.equal(sim.settled(), false);
});

// Swimlanes

test('lanes put the orchestrator first, then each agent by start time, with bars from start to stop', () => {
  const state = summarize([
    decision('00', 'intake/a'),
    ev('01', 'r1', 'b', 'agent.start', { role: 'checker', parent: 'orchestrator' }),
    ev('02', 'r1', 'a', 'agent.start', { role: 'reader', parent: 'orchestrator' }),
    ev('03', 'r1', 'orchestrator', 'artifact', { path: 'x', kind: 'doc' }),
    ev('05', 'r1', 'a', 'agent.stop', { role: 'reader', status: 'PASS' }),
    ev('06', 'r1', 'b', 'agent.stop', { role: 'checker', status: 'ISSUES' }),
  ]);
  const s = swimlanes(state, Date.parse(at('30')));
  assert.deepEqual(s.lanes.map((l) => l.agent), ['orchestrator', 'b', 'a']);
  assert.deepEqual(s.lanes[0].bar, null);
  assert.deepEqual(s.lanes[2].bar, { start: Date.parse(at('02')), end: Date.parse(at('05')), status: 'PASS', running: false });
  assert.equal(s.lanes[1].bar.status, 'ISSUES');
  assert.equal(s.t0, Date.parse(at('01')));
  assert.equal(s.t1, Date.parse(at('06')));
});

test('in the newest run a running agent\'s bar reaches now; in an older run it ends at its last event', () => {
  const events = [
    ev('01', 'old', 'a', 'agent.start', { role: 'reader', parent: 'orchestrator' }),
    ev('02', 'old', 'a', 'artifact', { path: 'n.md', kind: 'notes' }),
    ev('10', 'new', 'b', 'agent.start', { role: 'reader', parent: 'orchestrator' }),
  ];
  const now = Date.parse(at('20'));
  const fresh = swimlanes(summarize(events), now);
  assert.deepEqual(fresh.lanes.find((l) => l.agent === 'b').bar, { start: Date.parse(at('10')), end: now, status: 'running', running: true });
  assert.equal(fresh.t1, now);
  const old = swimlanes(summarize(events, 'old'), now);
  assert.deepEqual(old.lanes.find((l) => l.agent === 'a').bar, { start: Date.parse(at('01')), end: Date.parse(at('02')), status: 'running', running: false });
});

test('decisions and checks become marks on the timeline', () => {
  const state = summarize([
    ev('01', 'r1', 'a', 'agent.start', { role: 'reader', parent: 'orchestrator' }),
    decision('02', 'intake/a'),
    ev('03', 'r1', 'a', 'check', { name: 'tables', result: 'fail', evidence: 'row 3' }),
    ev('04', 'r1', 'a', 'agent.stop', { role: 'reader', status: 'PASS' }),
  ]);
  const s = swimlanes(state, Date.parse(at('30')));
  assert.deepEqual(s.marks.map((m) => [m.kind, m.t, m.result]), [
    ['decision', Date.parse(at('02')), 'r'],
    ['check', Date.parse(at('03')), 'fail'],
  ]);
  assert.equal(s.marks[1].event.name, 'tables');
});

test('an empty run has no lanes but a usable time range', () => {
  const s = swimlanes(summarize([]), 1000);
  assert.deepEqual(s.lanes, []);
  assert.ok(s.t1 > s.t0);
});
