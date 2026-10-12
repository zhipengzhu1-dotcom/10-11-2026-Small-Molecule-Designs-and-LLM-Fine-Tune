// Crew graph: every agent in the plane (see plane.js) around its run's orchestrator, linked by
// what they share (see buildCrew in layout.js). Running agents are bright and pulse in a halo; a
// stopped one is filled the way it ended: solid PASS, grey ISSUES, outline BLOCKED or unknown.
import { createPlane, forceSpace } from './plane.js';
import { buildCrew } from './layout.js';
import { clock, h, short, span } from './ui.js';

const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const say = { dispatched: 'dispatched by', ticket: 'same ticket as', files: 'wrote the same file as' };

export function createCrew(parts) {
  let few = true; // label every agent while there are few enough to read
  return createPlane(parts, {
    build(crew) {
      few = crew.length <= 24;
      return buildCrew(crew);
    },
    kinds: ['dispatched', 'ticket', 'builds', 'files'],
    shown: { dispatched: true, ticket: true, builds: true, files: true },
    lines: { dispatched: {}, ticket: {}, builds: { dash: [5, 3], arrow: true }, files: { dash: [1.5, 3] } },
    lineColor: (kind, c) => ({ dispatched: c.link, ticket: c.hi, builds: c.node, files: c.leaf })[kind],
    radius: (n) => (n.kind === 'hub' ? 7 + Math.sqrt(n.count) : n.live ? 5.5 : 4.5),
    shape: (n) => (n.kind === 'hub' || n.live || ['PASS', 'ISSUES'].includes(n.member.status) ? 'dot' : 'ring'),
    color: (n, c) => (n.kind === 'hub' ? c.node : n.live ? c.hi : n.member.status === 'PASS' ? c.node : c.leaf),
    label: (n) => (n.kind === 'hub' ? 'orchestrator · ' + short(n.run) : trim(n.label, 40)),
    labelled: (n, i, { set, scale }) => (set ? set.has(i) : n.kind === 'hub' || n.live || few || scale > 1.2),
    tip: (n) => (n.kind === 'hub'
      ? [h('b', null, 'orchestrator'), h('br'), 'run ' + short(n.run) + ' · ' + n.count + ' agents']
      : [h('b', null, n.label), h('br'), status(n.member) + ' · ' + span(n.member.start ?? n.member.first, n.member.stop ?? (n.live ? null : n.member.last))]),
    card,
  }, forceSpace());
}

const status = (m) => (m.live ? 'running' : m.status === 'running' ? 'no stop event' : m.status);

function card(i, { graph, cross }) {
  const n = graph.nodes[i];
  const other = (l) => graph.nodes[l.source === i ? l.target : l.source];
  const name = (m) => (m.kind === 'hub' ? 'orchestrator · ' + short(m.run) : m.label);
  if (n.kind === 'hub') {
    const agents = cross('dispatched').map(other);
    return [h('b', null, 'orchestrator'), ' ', h('code', null, n.run), ' ', h('span', { class: 'muted' }, n.count + ' agents'),
      ...agents.map((a) => h('div', { class: 'dec' }, h('span', { class: 'st ' + (a.live ? 'running' : a.member.status) }, status(a.member)), ' ', a.label))];
  }
  const m = n.member;
  const rel = [
    ...['dispatched', 'ticket', 'files'].flatMap((k) => cross(k).map((l) => say[k] + ' ' + name(other(l)) + (l.files ? ' (' + l.files.join(', ') + ')' : ''))),
    ...cross('builds').map((l) => (l.source === i ? 'builds on ' : 'built on by ') + name(other(l))),
  ];
  return [h('code', null, short(m.run) + ' · ' + m.agent),
    h('div', null, h('b', null, m.task ?? m.role ?? 'unknown task')),
    h('div', { class: 'k' }, 'status'), h('div', null, h('span', { class: 'st ' + (n.live ? 'running' : m.status) }, status(m))),
    h('div', { class: 'k' }, 'time'), h('div', null, clock(m.start ?? m.first) + ' → ' + (m.stop ? clock(m.stop) : n.live ? 'now' : clock(m.last)) + ' · ' + span(m.start ?? m.first, m.stop ?? (n.live ? null : m.last))),
    ...(m.tickets.length ? [h('div', { class: 'k' }, 'ticket'), h('div', null, m.tickets.map((t) => '#' + t).join(' '))] : []),
    ...(m.mentions.length ? [h('div', { class: 'k' }, 'its instructions also name'), h('div', null, m.mentions.map((t) => '#' + t).join(' '))] : []),
    ...(m.files.length ? [h('div', { class: 'k' }, 'wrote'), ...m.files.map((f) => h('div', { class: 'mono' }, f))] : []),
    ...(rel.length ? [h('div', { class: 'k' }, 'links'), ...rel.map((r) => h('div', null, r))] : [])];
}
