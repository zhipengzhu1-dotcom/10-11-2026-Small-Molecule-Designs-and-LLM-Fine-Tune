// The viewer page: polls /state, draws the lists, and hands the state to the two three.js
// diagrams. If three.js cannot load (offline), the diagrams say so and the lists still work.
import { clock, h, short, span } from './ui.js';

const $ = (id) => document.getElementById(id);

let picked = null;       // run the user chose; null follows the newest
let agentFilter = null;  // agent whose events the timeline shows; null shows all
let last = null;
let state;
const open = new Set();  // tree paths opened in the fallback list
let lanes = null, graph = null;

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
}
$('theme').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  try { localStorage.setItem('viewer-theme', theme); } catch {}
  applyTheme();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
applyTheme();

$('run').addEventListener('change', (e) => { picked = e.target.value || null; agentFilter = null; last = null; poll(); });

async function poll() {
  try {
    const res = await fetch('/state' + (picked ? '?run=' + encodeURIComponent(picked) : ''), { cache: 'no-store' });
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
  $('dcount').textContent = '(' + s.tree.count + ')';
  renderAgents();
  renderTimeline();
  if (lanes) { lanes.update(s); lanes.setSelected(agentFilter); }
  if (graph) graph.update(s.tree);
  else $('tree').replaceChildren(...s.tree.children.map((n) => branch(n, true)));
}

function renderAgents() {
  $('no-agents').hidden = state.agents.length > 0;
  $('agents').replaceChildren(...state.agents.map((a) => {
    const tr = h('tr', { class: a.agent === agentFilter ? 'sel' : null, title: a.agent + (a.parent ? ' (parent ' + a.parent + ')' : '') },
      h('td', null, a.role || 'unknown role', ' ', a.role === a.agent ? null : h('code', null, short(a.agent))),
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

// The plain list of the decision tree, shown only when three.js is unavailable.
function branch(n, top) {
  const d = h('details', { class: top ? 'top' : null },
    h('summary', null, n.name, ' ', h('span', { class: 'n' }, n.count)),
    n.decisions.map((x) => h('div', { class: 'dec', title: x.evidence },
      h('div', null, h('code', null, clock(x.ts)), ' ', x.decision),
      h('div', { class: 'why' }, x.why),
      h('div', { class: 'res' }, x.result))),
    n.children.map((c) => branch(c, false)));
  d.open = open.has(n.path);
  d.addEventListener('toggle', () => (d.open ? open.add(n.path) : open.delete(n.path)));
  return d;
}

function roleOf(id) {
  const a = state?.agents.find((x) => x.agent === id);
  return (a?.role && a.role !== id ? a.role + ' ' : '') + short(id);
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
    const [{ createSwimlane }, { createGraph }] = await Promise.all([import('./swimlane.js'), import('./graph.js')]);
    lanes = createSwimlane({ labels: $('lane-labels'), plot: $('lane-plot'), axis: $('axis'), tip: $('lane-tip') }, { onSelect: selectAgent, roleOf });
    graph = createGraph({ stage: $('graph'), labels: $('graph-labels'), tip: $('graph-tip'), card: $('card') });
    if (state) render(state);
  } catch (err) {
    const note = 'three.js could not load (' + err.message + '), so the diagrams are off. The lists below still work.';
    $('lanes').replaceChildren(h('p', { class: 'nothree' }, note));
    $('graph').replaceWith(h('p', { class: 'nothree' }, note));
    $('tree').hidden = false;
    if (state) render(state);
  }
}

await poll();
loadDiagrams();
setInterval(poll, 2000);
