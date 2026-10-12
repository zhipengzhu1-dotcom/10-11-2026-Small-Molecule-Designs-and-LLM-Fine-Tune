// The viewer page: polls /state, draws the lists, and hands the state to the canvas diagrams. If
// the diagrams cannot start, they say so and the lists still work.
import { clock, h, short, span } from './ui.js';

const $ = (id) => document.getElementById(id);

let picked = null;       // run the user chose; null follows the newest
let agentFilter = null;  // agent whose events the timeline shows; null shows all
let last = null;
let state;
const open = new Set();  // tree paths opened in the fallback list
let lanes = null, graph = null, crew = null, scatter = null;
let allRuns = true;      // the agent network shows every run, or only the picked one
let umap = false;        // the text scatter is PCA unless the user turns UMAP on

function selectAgent(agent) {
  agentFilter = agent && agent !== agentFilter ? agent : null;
  renderAgents();
  renderTimeline();
  lanes?.setSelected(agentFilter);
}

// Theme: follow the system, or force dark or light. Remembered per browser when storage allows.
const THEMES = ['system', 'dark', 'light'];
let theme = 'system';
try { theme = localStorage.getItem('viewer-theme') || 'system'; } catch {}
function applyTheme() {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $('theme').textContent = 'theme: ' + theme;
  lanes?.recolor();
  graph?.recolor();
  crew?.recolor();
  scatter?.recolor();
}
$('theme').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  try { localStorage.setItem('viewer-theme', theme); } catch {}
  applyTheme();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
applyTheme();

$('run').addEventListener('change', (e) => {
  picked = e.target.value || null; agentFilter = null; last = null;
  if (!allRuns) crew?.refit();
  poll();
});
$('umap').addEventListener('change', (e) => { umap = e.target.checked; last = null; scatter?.refit(); poll(); });
$('all-runs').addEventListener('change', (e) => { allRuns = e.target.checked; crew?.refit(); if (state) render(state); });

// Full screen for a diagram's panel; the stage grows to fill it.
for (const b of document.querySelectorAll('[data-full]')) {
  b.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : $(b.dataset.full).requestFullscreen()));
}
document.addEventListener('fullscreenchange', () => {
  for (const b of document.querySelectorAll('[data-full]')) b.textContent = document.fullscreenElement?.id === b.dataset.full ? 'exit full screen' : 'full screen';
  requestAnimationFrame(() => { graph?.fit(); crew?.fit(); scatter?.fit(); }); // after the stage has its new size
});

async function poll() {
  try {
    const query = new URLSearchParams();
    if (picked) query.set('run', picked);
    if (umap) query.set('scatter', 'umap');
    const res = await fetch('/state' + (query.size ? '?' + query : ''), { cache: 'no-store' });
    const text = await res.text();
    if (!res.ok) throw new Error(text);
    $('updated').textContent = 'updated ' + clock(new Date().toISOString());
    if (text !== last) { last = text; render(JSON.parse(text)); }
    else refreshTimes();
  } catch (err) {
    $('error').textContent = 'Viewer cannot reach its server: ' + err.message;
  }
}

function render(s) {
  state = s;
  $('error').textContent = s.error ? 'The event stream could not be read: ' + s.error : '';
  $('run').replaceChildren(h('option', { value: '' }, 'newest'), ...s.runs.map((r) => {
    const o = h('option', { value: r }, short(r));
    if (r === picked) o.selected = true;
    return o;
  }).reverse());
  $('checks').replaceChildren(...s.checks.map((c) => h('span', { class: 'chip ' + c.result, title: c.evidence }, c.name)));
  $('dcount').textContent = '(' + s.tree.count + ': ' + s.labels.in + ' in, ' + s.labels.out + ' out, ' + s.labels.undec + ' undec)';
  $('dscore').replaceChildren(...scores(s.disk));
  $('scount').textContent = '(' + s.scatter.n + ' rows, ' + s.scatter.method.toUpperCase() + ')';
  $('sscore').replaceChildren(...scatterScores(s.scatter));
  $('swarn').textContent = s.scatter.warning ?? '';
  renderStories(s.stories);
  const members = allRuns ? s.crew : s.crew.filter((c) => c.run === s.run);
  $('ccount').textContent = count(members);
  renderAgents();
  renderTimeline();
  if (lanes) { lanes.update(s); lanes.setSelected(agentFilter); }
  crew?.update(members);
  scatter?.update({ scatter: s.scatter, tree: s.tree });
  if (graph) graph.update(s.tree);
  else $('tree').replaceChildren(...s.tree.children.map((n) => branch(n, true)));
}

// "T(5) 0.92 C(5) 0.89 · T(10) 0.85 C(10) 0.84", how far the disk distorts the full graph (see
// diskView in viewer.mjs); a k too large for the log shows a dash.
function scores(d) {
  const f = (v) => (v == null ? '–' : v.toFixed(2));
  return [h('b', null, [5, 10].map((k) => 'T(' + k + ') ' + f(d.T[k]) + ' C(' + k + ') ' + f(d.C[k])).join(' · ')),
    ' against ' + d.against.method + ' (d = ' + d.against.d + ') of the full graph, ' + d.n + ' nodes · 1 is faithful, about 0.5 is random · every edge is ' + d.tau.toFixed(2) + ' long, so one hop from the centre is near the rim'];
}

// The same for the text scatter, against the full TF-IDF space.
function scatterScores(d) {
  const f = (v) => (v == null ? '–' : v.toFixed(2));
  return [h('b', null, [5, 10].map((k) => 'T(' + k + ') ' + f(d.T[k]) + ' C(' + k + ') ' + f(d.C[k])).join(' · ')),
    ' of ' + d.method.toUpperCase() + ' against the ' + d.against.metric + ' distances of the full ' + d.against.space + ' vectors, ' + d.n + ' rows · 1 is faithful, about 0.5 is random'];
}

// Each story of the spec as a node: filled when supported, grey when unrun or with no evidence,
// an outline when failing or undeveloped, with its count of residual doubts; the title lists them.
const STORY = { supported: 'sw dot', unrun: 'sw dot grey', none: 'sw dot grey', failing: 'sw dot ring', undeveloped: 'sw dot ring' };
function renderStories(st) {
  $('no-stories').hidden = Boolean(st);
  $('stcount').textContent = st ? '(spec #' + st.spec + ': ' + st.goals.length + ' stories, residual doubt ' + st.residual + ')' : '';
  $('stories').replaceChildren(...(st?.goals ?? []).map((g) => h('span', {
    class: 'story', title: 'story ' + g.story + ' · ' + g.status + (g.doubts.length ? '\n' + g.doubts.join('\n') : ''),
  }, h('i', { class: STORY[g.status] }), String(g.story), h('span', { class: 'd' }, g.doubts.length ? 'doubt ' + g.doubts.length : ''))));
}

// "15 agents · 3 running · 12 stopped (9 PASS, 2 ISSUES, 1 BLOCKED / unknown)"
function count(members) {
  const live = members.filter((m) => m.live).length;
  const by = (st) => members.filter((m) => !m.live && m.status === st).length;
  const stopped = members.length - live;
  const out = stopped - by('PASS') - by('ISSUES');
  const parts = [[by('PASS'), 'PASS'], [by('ISSUES'), 'ISSUES'], [out, 'BLOCKED / unknown']].filter(([n]) => n).map(([n, l]) => n + ' ' + l);
  return members.length + ' agents · ' + live + ' running · ' + stopped + ' stopped' + (parts.length ? ' (' + parts.join(', ') + ')' : '');
}

function renderAgents() {
  $('no-agents').hidden = state.agents.length > 0;
  $('agents').replaceChildren(...state.agents.map((a) => {
    const tr = h('tr', { class: a.agent === agentFilter ? 'sel' : null, title: a.agent + (a.parent ? ' (parent ' + a.parent + ')' : '') },
      h('td', null, a.task || a.role || 'unknown role', ' ', a.role === a.agent ? null : h('code', null, short(a.agent))),
      h('td', null, h('span', { class: 'st ' + a.status }, a.status)),
      h('td', { 'data-start': a.start, 'data-stop': a.stop }, span(a.start, a.stop)),
      h('td', null, a.events));
    tr.addEventListener('click', () => selectAgent(a.agent));
    return tr;
  }));
}

function refreshTimes() {
  for (const td of document.querySelectorAll('td[data-start]')) td.textContent = span(td.dataset.start, td.dataset.stop);
}

// The plain list of the decision tree, shown only when the diagrams cannot start.
function branch(n, top) {
  const d = h('details', { class: top ? 'top' : null },
    h('summary', null, n.name, ' ', h('span', { class: 'n' }, n.count)),
    n.decisions.map((x) => h('div', { class: 'dec', title: x.evidence },
      h('div', null, h('code', null, clock(x.ts) + ' · ' + x.label), ' ', x.decision),
      h('div', { class: 'why' }, x.why),
      h('div', { class: 'res' }, x.result))),
    n.children.map((c) => branch(c, false)));
  d.open = open.has(n.path);
  d.addEventListener('toggle', () => (d.open ? open.add(n.path) : open.delete(n.path)));
  return d;
}

function roleOf(id) {
  const a = state?.agents.find((x) => x.agent === id);
  const name = a?.task ?? a?.role;
  return (name && name !== id ? name + ' ' : '') + short(id);
}

function describe(e) {
  switch (e.type) {
    case 'agent.start': return [roleOf(e.agent), ' started', e.parent ? ' (parent ' + roleOf(e.parent) + ')' : ''];
    case 'agent.stop': return [roleOf(e.agent), ' stopped: ', h('span', { class: 'st ' + e.status }, e.status)];
    case 'artifact': return [roleOf(e.agent), ' wrote ', h('code', null, e.path), ' (' + e.kind + ')'];
    case 'fetch.failed': return [roleOf(e.agent), ' could not fetch ', h('code', null, e.ref), ': ' + e.reason + ' ', h('a', { href: 'http://127.0.0.1:4174/', target: '_blank' }, 'fetch page')];
    case 'check': return [e.name + ' ', h('b', null, e.result), ': ' + e.evidence];
    case 'decision': return [h('code', null, e.phase), ' ', e.decision, h('span', { class: 'muted' }, ' → ' + e.result)];
    default: {
      const { ts, run, agent, type, ...rest } = e;
      return [roleOf(agent), ' ', JSON.stringify(rest)];
    }
  }
}

function renderTimeline() {
  const events = agentFilter ? state.timeline.filter((e) => e.agent === agentFilter) : state.timeline;
  $('filter').replaceChildren(...(agentFilter ? [h('a', { class: 'filter', href: '#' }, 'only ' + roleOf(agentFilter) + ' · show all')] : []));
  $('filter').onclick = (e) => { e.preventDefault(); selectAgent(null); };
  $('timeline').replaceChildren(...events.map((e) => h('li', null,
    h('code', null, clock(e.ts)),
    h('span', { class: 'type t-' + e.type + (e.result === 'fail' ? ' fail' : '') }, e.type),
    h('span', null, describe(e)))));
}

async function loadDiagrams() {
  try {
    const [{ createSwimlane }, { createGraph }, { createCrew }, { createScatter }, { linkViews }] = await Promise.all([
      import('./swimlane.js'), import('./graph.js'), import('./crew.js'), import('./scatter.js'), import('./layout.js')]);
    lanes = createSwimlane({ labels: $('lane-labels'), plot: $('lane-plot'), axis: $('axis'), tip: $('lane-tip') }, { onSelect: selectAgent, roleOf });
    // the disk and the scatter light the same row: a click in one highlights it in the other
    const link = linkViews();
    let diskSide, scatterSide;
    graph = createGraph({ stage: $('graph'), tip: $('graph-tip'), card: $('card') }, { picked: (i) => link.pick(diskSide, i) });
    scatter = createScatter({ stage: $('scatter'), tip: $('scatter-tip'), card: $('scatter-card') }, { picked: (i) => link.pick(scatterSide, i) });
    diskSide = link.join({ graph: graph.graph, highlight: graph.highlight });
    scatterSide = link.join({ graph: scatter.graph, highlight: scatter.highlight });
    crew = createCrew({ stage: $('crew'), tip: $('crew-tip'), card: $('crew-card') });
    for (const box of document.querySelectorAll('#layers input')) box.addEventListener('change', () => graph.setLayer(box.dataset.kind, box.checked));
    for (const box of document.querySelectorAll('#crew-layers input[data-kind]')) box.addEventListener('change', () => crew.setLayer(box.dataset.kind, box.checked));
    if (state) render(state);
  } catch (err) {
    const note = 'The diagrams could not start (' + err.message + '). The lists below still work.';
    $('lanes').replaceChildren(h('p', { class: 'nodraw' }, note));
    $('graph').replaceWith(h('p', { class: 'nodraw' }, note));
    $('crew').replaceWith(h('p', { class: 'nodraw' }, note));
    $('scatter').replaceWith(h('p', { class: 'nodraw' }, note));
    $('layers').hidden = true;
    $('crew-layers').hidden = true;
    $('tree').hidden = false;
    if (state) render(state);
  }
}

await poll();
loadDiagrams();
setInterval(poll, 2000);
