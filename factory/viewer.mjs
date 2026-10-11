#!/usr/bin/env node
// Viewer. A read-only page that watches the event stream: a swimlane timeline of the run's
// agents, a graph of the decision tree, and lists. A quick stand-in until the dashboard
// (piece C) replaces it. The page and its scripts live in factory/viewer/.
//
//   node factory/viewer.mjs [--root <repo>] [--port 4175]
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
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
    if (!byAgent.has(e.agent)) byAgent.set(e.agent, { agent: e.agent, events: 0, startEvent: null, stopEvent: null, first: e.ts, last: e.ts });
    const a = byAgent.get(e.agent);
    a.events++;
    a.last = e.ts;
    if (e.type === 'agent.start') a.startEvent ??= e;
    if (e.type === 'agent.stop') a.stopEvent = e;
  }
  return [...byAgent.values()].map(({ agent, events, startEvent, stopEvent, first, last }) => ({
    agent,
    role: startEvent?.role ?? stopEvent?.role ?? (agent === 'orchestrator' ? 'orchestrator' : null),
    parent: startEvent?.parent ?? null,
    start: startEvent?.ts ?? null,
    stop: stopEvent?.ts ?? null,
    status: stopEvent ? stopEvent.status : 'running',
    events,
    first,
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
  if (url.pathname === '/') return send(res, 200, 'text/html', asset('page.html'));
  const script = /^\/assets\/([a-z]+\.js)$/.exec(url.pathname);
  if (script && SCRIPTS.has(script[1])) return send(res, 200, 'text/javascript', asset(script[1]));
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

// Served by name only, never by path, so nothing else in the repo can be fetched. Read on
// every request, so an edit shows on reload.
const SCRIPTS = new Set(['app.js', 'ui.js', 'layout.js', 'swimlane.js', 'graph.js']);
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), 'viewer');
const asset = (name) => readFileSync(join(ASSETS, name), 'utf8');

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(body);
}

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
