// Decision graph: the decision log's phase tree in 3-D (see force.js), with the cross-links
// between rows (supersedes, withdraws, corrects, mentions, evidence) as layers that can be
// hidden. Each decision is drawn by the label the server took from the graph module: in a solid
// sphere, undec a grey one, out an outline.
import { createForceGraph } from './force.js';
import { buildGraph } from './layout.js';
import { clock, h } from './ui.js';

const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const ROWS = ['supersedes', 'withdraws', 'corrects'];
// "supersedes line 2", "superseded by line 5", "corrects part of line 2"
const PAST = { supersedes: 'superseded', withdraws: 'withdrawn', corrects: 'corrected' };

export function createGraph(parts) {
  return createForceGraph(parts, {
    build: buildGraph,
    kinds: ['tree', ...ROWS, 'mentions', 'evidence'],
    shown: { tree: true, supersedes: true, withdraws: true, corrects: true, mentions: true, evidence: false },
    lines: { tree: {}, supersedes: { dash: [3, 2], arrow: true }, withdraws: { dash: [1.2, 1.2], arrow: true }, corrects: { opacity: 0.6, arrow: true }, mentions: { dash: [0.8, 2.6] }, evidence: { opacity: 0.5 } },
    lineColor: (kind, c) => ({ tree: c.link, supersedes: c.hi, withdraws: c.hi, corrects: c.node, mentions: c.leaf, evidence: c.link })[kind],
    radius: (n) => (n.kind === 'root' ? 10 : n.kind === 'phase' ? Math.min(16, 3.6 + 2.2 * Math.sqrt(n.count)) : n.kind === 'evidence' ? 4 : 2.8),
    shape: (n) => (n.kind === 'evidence' ? 'cube' : n.kind === 'decision' && n.decision.label === 'out' ? 'ring' : 'sphere'),
    color: (n, c) => (n.kind === 'decision' ? (n.decision.label === 'in' ? c.node : c.leaf) : c.node),
    visible: (n, shown) => n.kind !== 'evidence' || shown.evidence,
    label: (n) => (n.kind === 'decision' ? trim(n.label, 48) : n.label),
    // hubs always, every phase once the camera is close, anything lit
    labelled: (n, i, { set, focus, close }) => (set
      ? set.has(i) && (n.kind === 'phase' || n.kind === 'root' || i === focus)
      : n.kind === 'root' || (n.kind === 'phase' && (n.count >= 6 || close))),
    tip: (n) => (n.kind === 'decision'
      ? [h('b', null, n.decision.phase), ' · ' + n.decision.label, h('br'), n.decision.decision, h('br'), '→ ' + n.decision.result]
      : n.kind === 'evidence' ? [h('b', null, n.label), h('br'), 'cited by ' + n.count + ' decisions in different phases'] : null),
    card,
  });
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
      ...cross('evidence').map((l) => 'shares evidence ' + graph.nodes[l.source].label),
    ];
    return [h('code', null, d.phase + ' · line ' + d.line + ' · ' + clock(d.ts) + ' · ' + d.label),
      h('div', { class: 'k' }, 'decision'), h('div', null, d.decision),
      h('div', { class: 'k' }, 'why'), h('div', null, d.why),
      h('div', { class: 'k' }, 'result'), h('div', null, d.result),
      h('div', { class: 'k' }, 'evidence'), h('div', { class: 'mono' }, d.evidence),
      ...(rel.length ? [h('div', { class: 'k' }, 'links'), ...rel.map((r) => h('div', null, r))] : [])];
  }
  if (n.kind === 'evidence') {
    return [h('b', null, n.label), ' ', h('span', { class: 'muted' }, 'cited by ' + n.count + ' decisions'),
      h('div', { class: 'mono' }, n.source),
      ...cross('evidence').map((l) => graph.nodes[l.target].decision).map((d) => h('div', { class: 'dec' }, h('code', null, d.phase), ' ', d.decision))];
  }
  const kids = [...neighbours[i]].map((j) => graph.nodes[j]).filter((m) => m.kind === 'decision' && m.decision.phase === n.id);
  const mentioned = cross('mentions').map((l) => graph.nodes[l.source].decision);
  return [h('b', null, n.id || 'all decisions'), ' ', h('span', { class: 'muted' }, n.count + ' decisions'),
    ...kids.map((m) => h('div', { class: 'dec' }, h('code', null, clock(m.decision.ts) + ' · ' + m.decision.label), ' ', m.decision.decision)),
    ...(mentioned.length ? [h('div', { class: 'k' }, 'mentioned by'), ...mentioned.map((d) => h('div', { class: 'dec' }, h('code', null, d.phase), ' ', d.decision))] : [])];
}
