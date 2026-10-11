#!/usr/bin/env node
// Viewer. A read-only page that watches the event stream: the agents of a run, the decision
// tree and a timeline. A quick stand-in until the dashboard (piece C) replaces it.
//
//   node factory/viewer.mjs [--root <repo>] [--port 4175]
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRoot } from './log.mjs';
import { readStream } from './read.mjs';

// Turns the stream (ordered by ts) into what the page draws, for one run: the newest unless
// `run` names another. Decisions have no run, so a run's timeline takes the ones made between
// its first and last event, and the newest run, still open, takes every later one too.
export function summarize(events, run) {
  const runs = [...new Set(events.map((e) => e.run).filter((r) => r !== null))];
  run ??= runs.at(-1) ?? null;
  const own = events.filter((e) => e.run === run);
  const from = own.length ? Date.parse(own[0].ts) : Infinity;
  const to = run === runs.at(-1) ? Infinity : own.length ? Date.parse(own.at(-1).ts) : -Infinity;
  const during = (e) => e.type === 'decision' && Date.parse(e.ts) >= from && Date.parse(e.ts) <= to;
  return {
    runs,
    run,
    agents: agents(own),
    checks: latestChecks(own),
    tree: tree(events.filter((e) => e.type === 'decision')),
    timeline: events.filter((e) => e.run === run || during(e)).reverse(),
  };
}

// One row per agent, in order of its first event. No agent.stop yet means it is still running.
function agents(own) {
  const byAgent = new Map();
  for (const e of own) {
    if (!byAgent.has(e.agent)) byAgent.set(e.agent, { agent: e.agent, events: 0, startEvent: null, stopEvent: null, last: e.ts });
    const a = byAgent.get(e.agent);
    a.events++;
    a.last = e.ts;
    if (e.type === 'agent.start') a.startEvent ??= e;
    if (e.type === 'agent.stop') a.stopEvent = e;
  }
  return [...byAgent.values()].map(({ agent, events, startEvent, stopEvent, last }) => ({
    agent,
    role: startEvent?.role ?? stopEvent?.role ?? (agent === 'orchestrator' ? 'orchestrator' : null),
    parent: startEvent?.parent ?? null,
    start: startEvent?.ts ?? null,
    stop: stopEvent?.ts ?? null,
    status: stopEvent ? stopEvent.status : 'running',
    events,
    last,
  }));
}

function latestChecks(own) {
  const checks = new Map();
  for (const e of own) if (e.type === 'check') checks.set(e.name, { name: e.name, result: e.result, evidence: e.evidence, ts: e.ts, agent: e.agent });
  return [...checks.values()];
}

// Nodes keyed by the phase's slash path. `count` is every decision at or under the node.
function tree(decisions) {
  const root = node('', '');
  for (const d of decisions) {
    let n = root;
    n.count++;
    for (const part of String(d.phase).split('/')) {
      let child = n.children.find((c) => c.name === part);
      if (!child) n.children.push((child = node(part, n.path ? `${n.path}/${part}` : part)));
      n = child;
      n.count++;
    }
    n.decisions.push(d);
  }
  return root;
}

const node = (name, path) => ({ name, path, count: 0, decisions: [], children: [] });

export function createViewer({ root = defaultRoot() } = {}) {
  return createServer((req, res) => {
    try {
      handle(root, req, res);
    } catch (err) {
      if (!res.headersSent) send(res, 500, 'text/plain', err.message);
      else res.destroy();
    }
  });
}

function handle(root, req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  // Bound to 127.0.0.1, but a page in the user's browser can still reach it: refuse any Host
  // but this one (DNS rebinding).
  const port = req.socket.localPort;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return send(res, 403, 'text/plain', 'local requests only');
  if (req.method !== 'GET') return send(res, 405, 'text/plain', 'the viewer is read-only');
  if (url.pathname === '/') return send(res, 200, 'text/html', PAGE);
  if (url.pathname === '/state') {
    const run = url.searchParams.get('run') || undefined;
    let state;
    try {
      state = { ...summarize(readStream(root), run), error: null };
    } catch (err) {
      // readStream throws on a corrupt line or a misfiled event; show it rather than go blank.
      state = { ...summarize([], run), error: err.message };
    }
    return send(res, 200, 'application/json', JSON.stringify(state));
  }
  send(res, 404, 'text/plain', 'not found');
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(body);
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Factory Viewer</title>
<style>
:root { --bg: #f7f7f5; --card: #fff; --fg: #1d1d1b; --muted: #6b6b66; --line: #deded8; --accent: #2f6fdf; --ok: #1f7a3d; --warn: #9a6200; --bad: #b3261e; --sel: #e8f0fd; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #161615; --card: #1f1f1d; --fg: #ececea; --muted: #a0a09a; --line: #34342f; --accent: #7aa5f5; --ok: #6cc98a; --warn: #e0b04a; --bad: #f2867c; --sel: #1d2a40; } }
:root[data-theme="dark"] { --bg: #161615; --card: #1f1f1d; --fg: #ececea; --muted: #a0a09a; --line: #34342f; --accent: #7aa5f5; --ok: #6cc98a; --warn: #e0b04a; --bad: #f2867c; --sel: #1d2a40; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--line); }
h1 { font-size: 18px; margin: 0; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 0 0 8px; }
select { font: inherit; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; max-width: 100%; }
.muted { color: var(--muted); }
code { font-size: 12px; color: var(--muted); }
#error { background: var(--bad); color: #fff; padding: 8px 16px; overflow-wrap: anywhere; }
#error:empty { display: none; }
#checks { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--line); border-radius: 99px; padding: 1px 9px; font-size: 12px; background: var(--card); }
.chip.pass { color: var(--ok); border-color: var(--ok); }
.chip.fail { color: var(--bad); border-color: var(--bad); }
main { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 16px; padding: 16px; }
@media (max-width: 900px) { main { grid-template-columns: minmax(0, 1fr); } }
section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; min-width: 0; }
.col { display: grid; gap: 16px; align-content: start; min-width: 0; }
table { width: 100%; border-collapse: collapse; }
td, th { text-align: left; padding: 4px 6px; border-top: 1px solid var(--line); vertical-align: top; }
th { border-top: 0; font-weight: 500; color: var(--muted); font-size: 12px; }
tbody tr { cursor: pointer; }
tbody tr:hover, tr.sel { background: var(--sel); }
.status { font-weight: 600; font-size: 12px; }
.running { color: var(--accent); } .PASS { color: var(--ok); } .ISSUES { color: var(--warn); } .BLOCKED, .unknown { color: var(--bad); }
.running::before { content: "● "; animation: pulse 1.4s infinite; }
@keyframes pulse { 50% { opacity: .25; } }
details { margin-left: 12px; }
details.top { margin-left: 0; }
summary { cursor: pointer; padding: 1px 0; }
summary .n { color: var(--muted); font-size: 12px; }
.dec { margin: 4px 0 6px 14px; padding-left: 8px; border-left: 2px solid var(--line); }
.dec .why, .dec .res { color: var(--muted); font-size: 13px; }
.dec .res::before { content: "→ "; }
#timeline { list-style: none; margin: 0; padding: 0; }
#timeline li { display: grid; grid-template-columns: 64px 92px minmax(0, 1fr); gap: 8px; padding: 5px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
#timeline li:first-child { border-top: 0; }
.type { font-size: 12px; font-weight: 600; }
.t-decision { color: var(--accent); } .t-check { color: var(--ok); } .t-check.fail, .t-fetch\\.failed { color: var(--bad); } .t-artifact { color: var(--muted); } .t-agent\\.start, .t-agent\\.stop { color: var(--warn); }
a { color: var(--accent); }
.filter { font-size: 12px; margin-left: 8px; text-transform: none; letter-spacing: 0; }
</style>
</head>
<body>
<header>
  <h1>Factory Viewer</h1>
  <label>Run <select id="run"></select></label>
  <span class="muted" id="updated"></span>
  <div id="checks"></div>
</header>
<div id="error" role="alert"></div>
<main>
  <div class="col">
    <section><h2>Agents</h2><table><thead><tr><th>Agent</th><th>Status</th><th>Time</th><th>Events</th></tr></thead><tbody id="agents"></tbody></table><p class="muted" id="no-agents" hidden>No agents in this run.</p></section>
    <section><h2>Decision tree <span class="muted" id="dcount"></span></h2><div id="tree"></div></section>
  </div>
  <section><h2>Timeline <span id="filter"></span></h2><ul id="timeline"></ul></section>
</main>
<script>
const $ = (id) => document.getElementById(id);
// Builds an element. Every string goes in as text, never as HTML: event fields are untrusted.
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) k === 'class' ? (el.className = v) : el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : String(k));
  return el;
}
const short = (id) => (id && id.length > 12 ? id.slice(0, 8) : id);
const clock = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
function span(a, b) {
  if (!a) return '';
  const s = Math.max(0, Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000));
  return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

let picked = null;       // run the user chose; null follows the newest
let agentFilter = null;  // agent whose events the timeline shows; null shows all
let last = null;
const open = new Set();  // tree paths the user has opened

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

let state;
function render(s) {
  state = s;
  $('error').textContent = s.error ? 'The event stream could not be read: ' + s.error : '';
  $('run').replaceChildren(h('option', { value: '' }, 'newest'), ...s.runs.map((r) => {
    const o = h('option', { value: r }, short(r));
    if (r === picked) o.selected = true;
    return o;
  }).reverse());
  $('checks').replaceChildren(...s.checks.map((c) => h('span', { class: 'chip ' + c.result, title: c.evidence }, c.name + ' ' + c.result)));
  renderAgents(s);
  $('dcount').textContent = '(' + s.tree.count + ')';
  $('tree').replaceChildren(...s.tree.children.map((n) => branch(n, true)));
  renderTimeline();
}

function renderAgents(s) {
  $('no-agents').hidden = s.agents.length > 0;
  $('agents').replaceChildren(...s.agents.map((a) => {
    const tr = h('tr', { class: a.agent === agentFilter ? 'sel' : null, title: a.agent + (a.parent ? ' (parent ' + a.parent + ')' : '') },
      h('td', null, a.role || 'unknown role', ' ', a.role === a.agent ? null : h('code', null, short(a.agent))),
      h('td', null, h('span', { class: 'status ' + a.status }, a.status)),
      h('td', { 'data-start': a.start, 'data-stop': a.stop }, span(a.start, a.stop)),
      h('td', null, a.events));
    tr.addEventListener('click', () => { agentFilter = agentFilter === a.agent ? null : a.agent; renderAgents(state); renderTimeline(); });
    return tr;
  }));
}

function refreshTimes() {
  for (const td of document.querySelectorAll('td[data-start]')) td.textContent = span(td.dataset.start, td.dataset.stop);
}

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

function describe(e, role) {
  switch (e.type) {
    case 'agent.start': return [role(e.agent), ' started', e.parent ? ' (parent ' + role(e.parent) + ')' : ''];
    case 'agent.stop': return [role(e.agent), ' stopped: ', h('span', { class: 'status ' + e.status }, e.status)];
    case 'artifact': return [role(e.agent), ' wrote ', h('code', null, e.path), ' (' + e.kind + ')'];
    case 'fetch.failed': return [role(e.agent), ' could not fetch ', h('code', null, e.ref), ': ' + e.reason + ' ', h('a', { href: 'http://127.0.0.1:4174/', target: '_blank' }, 'fetch page')];
    case 'check': return [e.name + ' ', h('b', null, e.result), ': ' + e.evidence];
    case 'decision': return [h('code', null, e.phase), ' ', e.decision, h('span', { class: 'muted' }, ' → ' + e.result)];
    default: {
      const { ts, run, agent, type, ...rest } = e;
      return [role(agent), ' ', JSON.stringify(rest)];
    }
  }
}

function renderTimeline() {
  const roles = new Map(state.agents.map((a) => [a.agent, a.role]));
  const role = (id) => (roles.get(id) && roles.get(id) !== id ? roles.get(id) + ' ' : '') + short(id);
  const events = agentFilter ? state.timeline.filter((e) => e.agent === agentFilter) : state.timeline;
  $('filter').replaceChildren(...(agentFilter ? [h('a', { class: 'filter', href: '#' }, 'only ' + role(agentFilter) + ' · show all')] : []));
  $('filter').onclick = (e) => { e.preventDefault(); agentFilter = null; renderAgents(state); renderTimeline(); };
  $('timeline').replaceChildren(...events.map((e) => h('li', null,
    h('code', null, clock(e.ts)),
    h('span', { class: 'type t-' + e.type + (e.result === 'fail' ? ' fail' : '') }, e.type),
    h('span', null, describe(e, role)))));
}

poll();
setInterval(poll, 2000);
</script>
</body>
</html>
`;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const root = arg('--root', defaultRoot());
  const server = createViewer({ root });
  server.listen(Number(arg('--port', 4175)), '127.0.0.1', () => {
    process.stdout.write(`viewer: http://127.0.0.1:${server.address().port}/ (root ${root})\n`);
  });
}
