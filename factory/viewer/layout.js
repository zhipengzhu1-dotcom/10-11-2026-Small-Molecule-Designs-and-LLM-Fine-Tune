// Geometry for the viewer's two diagrams, with no three.js and no DOM so that node:test can
// run it: the decision graph and its force layout, and the swimlane timeline.

// The decision tree as a graph: a root, one node per phase folder, one dot per decision, and
// a link from each node to its parent. Links hold node indexes.
export function buildGraph(tree) {
  const nodes = [{ id: '', kind: 'root', label: 'decisions', count: tree.count }];
  const links = [];
  let dots = 0;
  const visit = (n, parent) => {
    for (const child of n.children) {
      const i = nodes.push({ id: child.path, kind: 'phase', label: child.name, count: child.count }) - 1;
      links.push({ source: parent, target: i });
      for (const d of child.decisions) {
        const j = nodes.push({ id: `d${dots++}`, kind: 'decision', label: d.decision, count: 1, decision: d }) - 1;
        links.push({ source: i, target: j });
      }
      visit(child, i);
    }
  };
  visit(tree, 0);
  return { nodes, links };
}

const CHARGE = { root: -260, phase: -140, decision: -35 };
const LENGTH = { root: 60, phase: 46, decision: 16 };

// A small d3-style force simulation: springs on links, repulsion between every pair, a pull
// to the centre. No randomness, so the same graph always settles the same way. A node with
// fx/fy is pinned there (for dragging); a node that already has x/y starts there.
export function createSimulation(nodes, links, { alphaMin = 0.001, decay = 0.6 } = {}) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  nodes.forEach((n, i) => {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      const r = 12 * Math.sqrt(0.5 + i);
      n.x = r * Math.cos(i * golden);
      n.y = r * Math.sin(i * golden);
    }
    n.vx = 0;
    n.vy = 0;
  });
  const degree = nodes.map(() => 0);
  for (const l of links) { degree[l.source]++; degree[l.target]++; }
  let alpha = 1;
  const alphaDecay = 1 - Math.pow(alphaMin, 1 / 300);

  function tick() {
    for (const l of links) {
      const s = nodes[l.source], t = nodes[l.target];
      let dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy;
      const d = Math.hypot(dx, dy) || 1e-6;
      const k = ((d - LENGTH[t.kind]) / d) * alpha * (1 / Math.min(degree[l.source], degree[l.target]));
      dx *= k; dy *= k;
      const bias = degree[l.source] / (degree[l.source] + degree[l.target]);
      t.vx -= dx * bias; t.vy -= dy * bias;
      s.vx += dx * (1 - bias); s.vy += dy * (1 - bias);
    }
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        if (dx === 0 && dy === 0) { dx = 1e-3 * (j - i); dy = 1e-3; }
        const d2 = Math.max(dx * dx + dy * dy, 25);
        // each node pushes the other away with its own charge
        const fa = (CHARGE[b.kind] * alpha) / d2, fb = (CHARGE[a.kind] * alpha) / d2;
        a.vx += dx * fa; a.vy += dy * fa;
        b.vx -= dx * fb; b.vy -= dy * fb;
      }
      a.vx -= a.x * 0.01 * alpha;
      a.vy -= a.y * 0.01 * alpha;
    }
    for (const n of nodes) {
      if (n.fx != null) { n.x = n.fx; n.vx = 0; } else { n.vx *= decay; n.x += n.vx; }
      if (n.fy != null) { n.y = n.fy; n.vy = 0; } else { n.vy *= decay; n.y += n.vy; }
    }
    alpha += (0 - alpha) * alphaDecay;
  }

  return {
    nodes,
    tick,
    settled: () => alpha < alphaMin,
    reheat: (to = 0.3) => { alpha = Math.max(alpha, to); },
  };
}

// The swimlane timeline for one summarized run (see summarize in viewer.mjs). Times are epoch
// ms. The orchestrator's lane comes first and has no bar: decisions and checks are marked on
// it. In the newest run a running agent's bar reaches `now`; in an older run nothing is live,
// so it ends at the agent's last event.
export function swimlanes(state, now) {
  const live = state.run !== null && state.run === state.runs.at(-1);
  const marks = [...state.timeline].reverse()
    .filter((e) => e.type === 'decision' || e.type === 'check')
    .map((e) => ({ kind: e.type, t: Date.parse(e.ts), result: e.result, event: e }));
  const orchestrator = state.agents.find((a) => a.agent === 'orchestrator');
  const lanes = [];
  if (orchestrator || marks.length) lanes.push({ agent: 'orchestrator', label: 'orchestrator', status: orchestrator?.status ?? null, bar: null });
  const workers = state.agents.filter((a) => a.agent !== 'orchestrator')
    .map((a) => ({ a, start: Date.parse(a.start ?? a.first) }))
    .sort((x, y) => x.start - y.start);
  for (const { a, start } of workers) {
    const running = a.status === 'running' && live;
    const end = a.stop ? Date.parse(a.stop) : running ? now : Date.parse(a.last);
    lanes.push({ agent: a.agent, label: a.role ?? 'unknown role', status: a.status, bar: { start, end, status: a.status, running } });
  }
  const times = [...lanes.flatMap((l) => (l.bar ? [l.bar.start, l.bar.end] : [])), ...marks.map((m) => m.t)];
  if (!times.length) return { lanes, marks, t0: now - 60_000, t1: now };
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  return { lanes, marks, t0, t1: t1 > t0 ? t1 : t0 + 1000 };
}
