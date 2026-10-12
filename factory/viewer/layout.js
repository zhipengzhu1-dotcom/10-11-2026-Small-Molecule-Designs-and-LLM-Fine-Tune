// Geometry for the viewer's diagrams, with no three.js and no DOM so that node:test can run it:
// the decision graph, the crew graph, their 3-D force layout, and the swimlane timeline.

// The decision log as a graph. Tree links join a root, one node per phase folder and one dot
// per decision, each to its parent. Cross-links join what the rows themselves cite:
//   supersedes, withdraws, corrects
//               a decision to the earlier row a relation of it names, from the `relations` the
//               server took from the graph module (factory/graph.mjs); `part` marks a partial one
//   mentions    a decision to the ticket-N phase of a ticket it names (#N), outside its own phase
//   evidence    an evidence node, for a source cited in two or more phases, to each citing decision
// Links hold node indexes and a kind.
const ROWS = ['supersedes', 'withdraws', 'corrects'];

export function buildGraph(tree) {
  const nodes = [{ id: '', kind: 'root', label: 'decisions', count: tree.count }];
  const links = [];
  const link = (source, target, kind) => links.push({ source, target, kind });
  const dots = []; // [index, decision]
  const visit = (n, parent) => {
    for (const child of n.children) {
      const i = nodes.push({ id: child.path, kind: 'phase', label: child.name, count: child.count }) - 1;
      link(parent, i, 'tree');
      for (const d of child.decisions) {
        const j = nodes.push({ id: `d${dots.length}`, kind: 'decision', label: d.decision, count: 1, decision: d }) - 1;
        dots.push([j, d]);
        link(i, j, 'tree');
      }
      visit(child, i);
    }
  };
  visit(tree, 0);

  const text = (d) => [d.decision, d.why, d.result].join(' ');
  const byLine = new Map(dots.map(([j, d]) => [d.line, j]));
  for (const [j, d] of dots) {
    for (const r of d.relations ?? []) {
      const k = byLine.get(r.line);
      if (ROWS.includes(r.kind) && k !== undefined && k !== j) links.push({ source: j, target: k, kind: r.kind, part: r.part });
    }
  }
  const tickets = new Map();
  nodes.forEach((n, i) => {
    const m = n.kind === 'phase' && /(?:^|\/)ticket-(\d+)$/.exec(n.id);
    if (m) tickets.set(m[1], i);
  });
  for (const [j, d] of dots) {
    const seen = new Set();
    for (const m of text(d).matchAll(/#(\d+)/g)) {
      const k = tickets.get(m[1]);
      if (k === undefined || seen.has(k)) continue;
      const own = nodes[k].id;
      if (d.phase === own || d.phase.startsWith(own + '/')) continue;
      seen.add(k);
      link(j, k, 'mentions');
    }
  }
  // "a.jsonl @10:00Z and @10:06Z; notes.md" cites a.jsonl and notes.md
  const sources = new Map();
  for (const [j, d] of dots) {
    for (const part of String(d.evidence).split(/;\s*/)) {
      const key = part.replace(/\s+@.*$/, '').trim();
      if (!key) continue;
      if (!sources.has(key)) sources.set(key, []);
      if (!sources.get(key).includes(j)) sources.get(key).push(j);
    }
  }
  for (const [key, cited] of sources) {
    if (new Set(cited.map((j) => nodes[j].decision.phase)).size < 2) continue;
    const e = nodes.push({ id: `e:${key}`, kind: 'evidence', label: key.split(/[\\/]/).pop(), count: cited.length, source: key }) - 1;
    for (const j of cited) link(e, j, 'evidence');
  }
  return { nodes, links };
}

// The crew (see summarize in viewer.mjs) as a graph: a hub per run for its orchestrator and a
// node per agent, joined by
//   dispatched  the hub to each agent it started (the orchestrator is every subagent's parent)
//   ticket      agents asked to work the same ticket, chained in the order they started
//   builds      an agent whose instructions name another ticket, to the latest agent on that
//               ticket that started before it
//   files       two agents that wrote the same file, once per pair; `files` lists the files
export function buildCrew(crew) {
  const nodes = [];
  const links = [];
  const hubs = new Map();
  for (const m of crew) {
    if (!hubs.has(m.run)) hubs.set(m.run, nodes.push({ id: `run:${m.run}`, kind: 'hub', label: 'orchestrator', run: m.run, count: 0 }) - 1);
    const hub = hubs.get(m.run);
    nodes[hub].count++;
    const i = nodes.push({ id: `${m.run}/${m.agent}`, kind: 'agent', label: m.task ?? m.role ?? m.agent, count: 1, live: m.live, member: m }) - 1;
    links.push({ source: hub, target: i, kind: 'dispatched' });
  }
  const started = (i) => Date.parse(nodes[i].member.start ?? nodes[i].member.first);
  const members = nodes.flatMap((n, i) => (n.kind === 'agent' ? [i] : [])).sort((a, b) => started(a) - started(b));
  const pairs = new Map(); // `kind a-b` → link
  const once = (a, b, kind) => {
    const k = `${kind} ${Math.min(a, b)}-${Math.max(a, b)}`;
    if (!pairs.has(k)) pairs.set(k, links[links.push({ source: a, target: b, kind }) - 1]);
    return pairs.get(k);
  };
  const group = (key) => {
    const by = new Map();
    for (const i of members) for (const k of nodes[i].member[key]) by.set(k, [...(by.get(k) ?? []), i]);
    return by;
  };
  const onTicket = group('tickets');
  for (const chain of onTicket.values()) for (let k = 1; k < chain.length; k++) once(chain[k - 1], chain[k], 'ticket');
  for (const i of members) {
    for (const t of nodes[i].member.mentions) {
      const before = (onTicket.get(t) ?? []).filter((j) => j !== i && started(j) < started(i)).at(-1);
      if (before !== undefined) once(i, before, 'builds');
    }
  }
  for (const [file, who] of group('files')) {
    for (let k = 1; k < who.length; k++) {
      const l = once(who[k - 1], who[k], 'files');
      (l.files ??= []).push(file);
    }
  }
  return { nodes, links };
}

const CHARGE = { root: -300, phase: -150, decision: -35, evidence: -60, hub: -90, agent: -45 };
const LENGTH = { tree: { root: 60, phase: 48, decision: 16 }, supersedes: 24, withdraws: 24, corrects: 24, mentions: 110, evidence: 70, dispatched: 45, ticket: 18, builds: 40, files: 40 };
// Cross-links pull gently so the phase tree keeps the shape and cross-links read as bridges.
const STRENGTH = { tree: 1, supersedes: 0.3, withdraws: 0.3, corrects: 0.3, mentions: 0.015, evidence: 0.01, dispatched: 1, ticket: 0.5, builds: 0.15, files: 0.1 };
// Every node is pulled to the centre; run hubs harder, so the runs sit together instead of
// their agents pushing them apart.
const GRAVITY = { hub: 0.08 };

// A small d3-force-3d style simulation: springs on links, repulsion between every pair, a pull
// to the centre. No randomness, so the same graph always settles the same way. A node with
// fx/fy/fz is pinned there (for dragging); a node that already has x/y/z starts there.
export function createSimulation(nodes, links, { alphaMin = 0.001, decay = 0.6 } = {}) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const roll = Math.PI * 20 / (9 + Math.sqrt(221));
  nodes.forEach((n, i) => {
    if (![n.x, n.y, n.z].every(Number.isFinite)) {
      const r = 14 * Math.cbrt(0.5 + i), a = i * golden, b = i * roll;
      n.x = r * Math.sin(b) * Math.cos(a);
      n.y = r * Math.cos(b);
      n.z = r * Math.sin(b) * Math.sin(a);
    }
    n.vx = n.vy = n.vz = 0;
  });
  const degree = nodes.map(() => 0);
  for (const l of links) { degree[l.source]++; degree[l.target]++; }
  let alpha = 1;
  const alphaDecay = 1 - Math.pow(alphaMin, 1 / 300);
  const AXES = [['x', 'vx', 'fx'], ['y', 'vy', 'fy'], ['z', 'vz', 'fz']];

  function tick() {
    for (const l of links) {
      const s = nodes[l.source], t = nodes[l.target];
      const d = [t.x + t.vx - s.x - s.vx, t.y + t.vy - s.y - s.vy, t.z + t.vz - s.z - s.vz];
      const len = Math.hypot(...d) || 1e-6;
      const rest = l.kind === 'tree' ? LENGTH.tree[t.kind] : LENGTH[l.kind];
      const k = ((len - rest) / len) * alpha * STRENGTH[l.kind] / Math.min(degree[l.source], degree[l.target]);
      const bias = degree[l.source] / (degree[l.source] + degree[l.target]);
      AXES.forEach(([, v], a) => { t[v] -= d[a] * k * bias; s[v] += d[a] * k * (1 - bias); });
    }
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        if (dx === 0 && dy === 0 && dz === 0) { dx = 1e-3 * (j - i); dy = dz = 1e-3; }
        // falls off with distance squared, as in d3's many-body force
        const d2 = Math.max(dx * dx + dy * dy + dz * dz, 25);
        const fa = (CHARGE[b.kind] * alpha) / d2, fb = (CHARGE[a.kind] * alpha) / d2;
        a.vx += dx * fa; a.vy += dy * fa; a.vz += dz * fa;
        b.vx -= dx * fb; b.vy -= dy * fb; b.vz -= dz * fb;
      }
      const g = (GRAVITY[a.kind] ?? 0.01) * alpha;
      a.vx -= a.x * g;
      a.vy -= a.y * g;
      a.vz -= a.z * g;
    }
    for (const n of nodes) {
      for (const [p, v, f] of AXES) {
        if (n[f] != null) { n[p] = n[f]; n[v] = 0; } else { n[v] *= decay; n[p] += n[v]; }
      }
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
  const live = state.run !== null && state.run === state.newest;
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
    lanes.push({ agent: a.agent, label: a.task ?? a.role ?? 'unknown role', status: a.status, bar: { start, end, status: a.status, running } });
  }
  const times = [...lanes.flatMap((l) => (l.bar ? [l.bar.start, l.bar.end] : [])), ...marks.map((m) => m.t)];
  if (!times.length) return { lanes, marks, t0: now - 60_000, t1: now };
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  return { lanes, marks, t0, t1: t1 > t0 ? t1 : t0 + 1000 };
}
