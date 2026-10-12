// Phase disk: the decision log's phase tree in the Poincare disk (see disk.js), drawn in the plane
// (see plane.js), with the cross-links between rows (supersedes, withdraws, corrects, mentions,
// shared evidence) on top as layers that can be hidden. Sarkar's construction keeps the tree
// exactly, so the node clicked comes to the centre with its parent and children round it and the
// rest of the tree shrinking towards the rim. The drawing is the scored geometry itself: with
// every edge tau long (about 4 for a phase of 22 rows), one hop from the focus already sits near
// the rim and two hops within a pixel of it, so a node is drawn full size and labelled only within
// one hop of the focus, and is reached by clicking its way there. Each decision is drawn by the label the server took
// from the graph module: in a solid dot, undec a grey one, out an outline.
import { geodesic } from './disk.js';
import { buildGraph, phaseDisk } from './layout.js';
import { createPlane } from './plane.js';
import { clock, h } from './ui.js';

const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const ROWS = ['supersedes', 'withdraws', 'corrects'];
// "supersedes line 2", "superseded by line 5", "corrects part of line 2"
const PAST = { supersedes: 'superseded', withdraws: 'withdrawn', corrects: 'corrected' };

// Evidence nodes are not in the tree, so they are not on the disk: a source cited in two or more
// phases links its citing decisions in a chain instead, `via` the evidence node.
function build(tree) {
  const g = buildGraph(tree);
  const cited = new Map();
  const links = g.links.filter((l) => {
    if (l.kind !== 'evidence') return true;
    cited.set(l.source, [...(cited.get(l.source) ?? []), l.target]);
    return false;
  });
  for (const [via, ds] of cited) for (let k = 1; k < ds.length; k++) links.push({ source: ds[k - 1], target: ds[k], kind: 'evidence', via });
  return { nodes: g.nodes, links };
}

// The disk fills the stage. A node's place is its position seen from the focus; it is drawn full
// size within one hop of the focus and as a speck beyond.
function diskSpace() {
  let graph = null, members = [], disk = null, focus = 0, z = [], near = [];
  let cx = 0, cy = 0, R = 1;
  const index = new Map(); // graph node -> place on the disk
  const look = () => {
    const pos = disk.from(focus);
    z = graph.nodes.map((_, i) => (index.has(i) ? pos[index.get(i)] : null));
    near = graph.nodes.map((_, i) => index.has(i) && disk.distance(focus, index.get(i)) <= disk.tau * (1 + 1e-9));
  };
  const screen = ([x, y]) => [cx + R * x, cy - R * y];
  return {
    start(g, prev) {
      const keep = prev?.nodes[members[focus]]?.id;
      graph = g;
      ({ members, disk } = phaseDisk(g));
      index.clear();
      members.forEach((i, p) => index.set(i, p));
      focus = Math.max(0, members.findIndex((i) => g.nodes[i].id === keep));
      look();
    },
    tick() {},
    place(w, hgt) {
      cx = w / 2; cy = hgt / 2; R = Math.max(10, Math.min(w, hgt) / 2 - 14);
      return z.map((p) => (p ? screen(p) : null));
    },
    // a hyperbolic line; at the rim, where float64 cannot bend it, a straight one
    path: (l) => {
      const [a, b] = [z[l.source], z[l.target]];
      return (Math.hypot(...a) > 0.995 || Math.hypot(...b) > 0.995 ? [a, b] : geodesic(a, b, 10)).map(screen);
    },
    scale: (i) => (near[i] ? 1 : 0.3),
    // the focus's label goes under it; a ring node's points inwards, so it stays inside the rim
    labelAt(i, at, r) {
      const [x, y] = z[i], d = Math.hypot(x, y);
      if (d < 0.5) return null;
      const [sx, sy] = at[i], ux = x / d, uy = -y / d;
      return [sx - ux * (r + 4), sy - uy * (r + 4), ux > 0 ? 'right' : 'left', 'middle'];
    },
    backdrop(ctx, w, hgt, colors) {
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(w / 2, hgt / 2, Math.max(10, Math.min(w, hgt) / 2 - 14), 0, 2 * Math.PI);
      ctx.stroke();
    },
    click(i) {
      if (!index.has(i)) return;
      focus = index.get(i);
      look();
    },
    reset() {
      focus = 0;
      if (disk) look();
    },
  };
}

// `picked(i)` hears each click, for the scatter it is linked to (see linkViews in layout.js).
export function createGraph(parts, { picked } = {}) {
  return createPlane(parts, {
    picked,
    build,
    kinds: ['tree', ...ROWS, 'mentions', 'evidence'],
    shown: { tree: true, supersedes: true, withdraws: true, corrects: true, mentions: true, evidence: false },
    lines: { tree: {}, supersedes: { dash: [5, 3], arrow: true }, withdraws: { dash: [2, 2], arrow: true }, corrects: { alpha: 0.6, arrow: true }, mentions: { dash: [1.5, 4] }, evidence: { alpha: 0.5 } },
    lineColor: (kind, c) => ({ tree: c.link, supersedes: c.hi, withdraws: c.hi, corrects: c.node, mentions: c.leaf, evidence: c.link })[kind],
    radius: (n) => (n.kind === 'root' ? 8 : n.kind === 'phase' ? Math.min(12, 3.5 + 1.6 * Math.sqrt(n.count)) : 3.5),
    shape: (n) => (n.kind === 'decision' && n.decision.label === 'out' ? 'ring' : 'dot'),
    color: (n, c) => (n.kind === 'decision' ? (n.decision.label === 'in' ? c.node : c.leaf) : c.node),
    label: (n) => (n.kind === 'decision' ? trim(n.label, 48) : n.label),
    // within a hop of the focus; lit, only the lit
    labelled: (n, i, { set, scale }) => (set ? set.has(i) && scale === 1 : scale === 1),
    tip: (n) => (n.kind === 'decision'
      ? [h('b', null, n.decision.phase), ' · line ' + n.decision.line + ' · ' + n.decision.label, h('br'), n.decision.decision, h('br'), '→ ' + n.decision.result]
      : [h('b', null, n.id || 'all decisions'), ' · ' + n.count + ' decisions']),
    card,
  }, diskSpace());
}

function card(i, { graph, neighbours, cross }) {
  const n = graph.nodes[i];
  if (n.kind === 'decision') {
    const d = n.decision;
    const line = (j) => graph.nodes[j].decision.line;
    const rel = [
      ...ROWS.flatMap((kind) => cross(kind).map((l) => (l.source === i
        ? kind + (l.part ? ' part of' : '') + ' line ' + line(l.target)
        : (l.part ? 'part ' : '') + PAST[kind] + ' by line ' + line(l.source)))),
      ...cross('mentions').map((l) => 'mentions ' + graph.nodes[l.target].label),
      ...cross('evidence').map((l) => 'shares ' + graph.nodes[l.via].label + ' with line ' + line(l.source === i ? l.target : l.source)),
    ];
    return [h('code', null, d.phase + ' · line ' + d.line + ' · ' + clock(d.ts) + ' · ' + d.label),
      h('div', { class: 'k' }, 'decision'), h('div', null, d.decision),
      h('div', { class: 'k' }, 'why'), h('div', null, d.why),
      h('div', { class: 'k' }, 'result'), h('div', null, d.result),
      h('div', { class: 'k' }, 'evidence'), h('div', { class: 'mono' }, d.evidence),
      ...(rel.length ? [h('div', { class: 'k' }, 'links'), ...rel.map((r) => h('div', null, r))] : [])];
  }
  const kids = [...neighbours[i]].map((j) => graph.nodes[j]).filter((m) => m.kind === 'decision' && m.decision.phase === n.id);
  const mentioned = cross('mentions').map((l) => graph.nodes[l.source].decision);
  return [h('b', null, n.id || 'all decisions'), ' ', h('span', { class: 'muted' }, n.count + ' decisions'),
    ...kids.map((m) => h('div', { class: 'dec' }, h('code', null, clock(m.decision.ts) + ' · ' + m.decision.label), ' ', m.decision.decision)),
    ...(mentioned.length ? [h('div', { class: 'k' }, 'mentioned by'), ...mentioned.map((d) => h('div', { class: 'dec' }, h('code', null, d.phase), ' ', d.decision))] : [])];
}
