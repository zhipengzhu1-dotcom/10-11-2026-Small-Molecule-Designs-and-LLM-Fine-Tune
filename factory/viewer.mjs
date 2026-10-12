#!/usr/bin/env node
// Viewer. A read-only page that watches the event stream: a swimlane timeline of the run's
// agents, a graph of every agent and how they connect, the decision log's phase tree as a
// Poincare disk and the decision text as a 2-D scatter linked to it, each with the scores of how
// far it distorts the full space, the spec's stories with their residual doubt, and lists. A quick
// stand-in until the dashboard (piece C) replaces it. The page and its scripts live in
// factory/viewer/.
//
//   node factory/viewer.mjs [--root <repo>] [--port 4175]
import { closeSync, openSync, readFileSync, readSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidence } from './digest.mjs';
import { buildGraph } from './graph.mjs';
import { eigenmap, euclidean, neighbourhoods } from './graph/distortion.mjs';
import { scatterView } from './graph/scatter.mjs';
import { defaultRoot } from './log.mjs';
import { readStream } from './read.mjs';
import { buildGraph as decisionGraph, phaseDisk } from './viewer/layout.js';

// Turns the stream (ordered by ts) into what the page draws, for one run: the newest unless
// `run` names another. The manual run (checks run by hand) is never the newest while a session
// run exists: it would end that session in the page while its agents are still working. Decisions have no run, so a run's timeline takes the ones made between
// its first and last event, and the newest run, still open, takes every later one too.
// `crew` is every subagent of every run, for the agents diagram. The stream does not say what
// an agent was asked to do, so `taskOf(run, agent)` supplies it (see readTask), or null.
// Each decision in `tree` carries the node model's `label` (in, out or undec) and `relations`
// (factory/graph.mjs), so the page and the orchestrator read one model; `labels` counts them.
// `scatter` is the decision text projected to 2-D (graph/scatter.mjs): PCA unless `opts.scatter`
// asks for 'umap'. `stories` are the user stories of the latest snapshotted spec that has any (a
// story list in its ticket-graph snapshot or a story map), else of the latest snapshot, each with
// its residual doubt as the done read counts it (graph/assurance.mjs), from the story map and test
// results `opts.evidence(spec)` supplies; null with no snapshot.
export function summarize(events, run, taskOf = () => null, opts = {}) {
  const snapshots = events.filter((e) => e.type === 'ticket.graph').map((s) => ({ ...s, ...opts.evidence?.(s.spec) }));
  const snapshot = snapshots.findLast((s) => s.stories?.length || s.map?.length) ?? snapshots.at(-1);
  const graph = buildGraph(events, snapshot);
  const runs = [...new Set(events.map((e) => e.run).filter((r) => r !== null))];
  const newest = runs.findLast((r) => r !== 'manual') ?? runs.at(-1) ?? null;
  run ??= newest;
  const byRun = new Map(runs.map((r) => [r, []]));
  for (const e of events) byRun.get(e.run)?.push(e);
  const asked = new Map();
  const ask = (r, agent) => {
    const k = `${r}/${agent}`;
    if (!asked.has(k)) asked.set(k, { task: null, tickets: [], mentions: [], ...(agent === 'orchestrator' ? null : taskOf(r, agent)) });
    return asked.get(k);
  };
  const own = byRun.get(run) ?? [];
  const from = own.length ? Date.parse(own[0].ts) : Infinity;
  const to = run === newest ? Infinity : own.length ? Date.parse(own.at(-1).ts) : -Infinity;
  const during = (e) => e.type === 'decision' && Date.parse(e.ts) >= from && Date.parse(e.ts) <= to;
  const decisions = tree(events.filter((e) => e.type === 'decision').map((e) => {
    const { label, relations } = graph.decision(e.line);
    return { ...e, label, relations };
  }));
  return {
    runs,
    newest,
    run,
    agents: agents(run, own, ask),
    crew: runs.flatMap((r) => agents(r, byRun.get(r), ask)
      .filter((a) => a.agent !== 'orchestrator')
      .map((a) => ({ run: r, ...a, live: a.status === 'running' && r === newest }))),
    checks: latestChecks(own),
    tree: decisions,
    disk: diskView(decisions),
    scatter: textScatter(graph, opts.scatter ?? 'pca'),
    stories: graph.spec === null ? null : {
      spec: graph.spec,
      goals: graph.goals().map(({ story, status, doubts }) => ({ story, status, doubts })),
      residual: graph.done(graph.spec).residual,
    },
    labels: Object.fromEntries(['in', 'out', 'undec'].map((l) => [l, graph.decisions.filter((d) => d.label === l).length])),
    timeline: events.filter((e) => e.run === run || during(e)).reverse(),
  };
}

// One row per agent, in order of its first event. No agent.stop yet means it is still running.
function agents(run, own, ask) {
  const byAgent = new Map();
  for (const e of own) {
    if (!byAgent.has(e.agent)) byAgent.set(e.agent, { agent: e.agent, events: 0, startEvent: null, stopEvent: null, first: e.ts, last: e.ts, files: new Set() });
    const a = byAgent.get(e.agent);
    a.events++;
    a.last = e.ts;
    if (e.type === 'agent.start') a.startEvent ??= e;
    if (e.type === 'agent.stop') a.stopEvent = e;
    if (e.type === 'artifact' && e.path) a.files.add(e.path);
  }
  return [...byAgent.values()].map(({ agent, events, startEvent, stopEvent, first, last, files }) => ({
    agent,
    role: startEvent?.role ?? stopEvent?.role ?? (agent === 'orchestrator' ? 'orchestrator' : null),
    ...ask(run, agent),
    parent: startEvent?.parent ?? null,
    start: startEvent?.ts ?? null,
    stop: stopEvent?.ts ?? null,
    status: stopEvent ? stopEvent.status : 'running',
    events,
    first,
    last,
    files: [...files],
  }));
}

// What a subagent was asked to do, from its Claude Code transcript: `task` is the description
// the orchestrator gave it (in the .meta.json beside the transcript), `tickets` the ones the
// description names (with no description, the first one its instructions name), `mentions` the
// other tickets its instructions name. Null when there is no transcript.
export function readTask(file) {
  let first;
  try {
    first = firstLine(file);
  } catch {
    return null;
  }
  let prompt;
  try {
    const content = JSON.parse(first).message?.content;
    prompt = typeof content === 'string' ? content : (content ?? []).map((b) => b.text ?? '').join(' ');
  } catch {
    prompt = first; // a first line longer than we read: its raw text still names the tickets
  }
  let task = null;
  try {
    task = JSON.parse(readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')).description || null;
  } catch {
    // no meta file: an older Claude Code, or not written yet
  }
  const refs = (s) => [...new Set([...s.matchAll(/#(\d+)/g)].map((m) => m[1]))];
  const tickets = task ? refs(task) : refs(prompt).slice(0, 1);
  return { task, tickets, mentions: refs(prompt).filter((t) => !tickets.includes(t)) };
}

// Transcripts grow to megabytes; the instructions are on the first line.
function firstLine(file) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(65536);
    return buf.toString('utf8', 0, readSync(fd, buf, 0, buf.length, 0)).split('\n')[0];
  } finally {
    closeSync(fd);
  }
}

// Claude Code keeps a session's subagent transcripts in
// ~/.claude/projects/<slug>/<session>/subagents/agent-<id>.jsonl, where the slug is the
// checkout's path with every character but a letter or digit turned into "-", and the session is
// the run. Built from ids, never from a path in the stream; null for an id that isn't one.
export function subagentTranscript(root, run, agent, home = homedir()) {
  if (!/^[A-Za-z0-9-]+$/.test(run) || !/^a[0-9a-f]+$/.test(agent)) return null;
  return join(home, '.claude', 'projects', root.replace(/[^A-Za-z0-9]/g, '-'), run, 'subagents', `agent-${agent}.jsonl`);
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

// How far the phase disk the page draws (layout.js, disk.js) distorts the full graph: trustworthiness
// and continuity at k = 5 and 10 (graph/distortion.mjs) of its hyperbolic distances against the
// Laplacian eigenmap (d = 16) of the whole decision graph, cross-links and evidence nodes included,
// over the nodes on the disk. Computed on read; the last answer is kept in memory only, since the
// page asks every 2 seconds and the graph rarely changes in between.
const YARDSTICK = { method: 'laplacian eigenmaps', d: 16 };
let lastDisk = { key: null, view: null };
function diskView(tree) {
  const graph = decisionGraph(tree);
  const links = graph.links.map((l) => [l.source, l.target]);
  const key = JSON.stringify([graph.nodes.map((n) => n.id), links]);
  if (lastDisk.key === key) return lastDisk.view;
  const { members, disk } = phaseDisk(graph);
  const full = euclidean(eigenmap(graph.nodes.length, links, YARDSTICK.d));
  const view = neighbourhoods(members.map((i) => members.map((j) => full[i][j])), members.map((_, a) => members.map((_, b) => disk.distance(a, b))));
  lastDisk = { key, view: { n: members.length, tau: disk.tau, ...view, against: YARDSTICK } };
  return lastDisk.view;
}

// The decision rows' TF-IDF vectors (graph/text.mjs) projected to 2-D, each point keyed by its
// row's line so the page can link it to the same row on the disk, and scored against the full
// space. Kept in memory per method, like the disk's scores.
const lastScatter = new Map();
function textScatter(graph, method) {
  const rows = graph.decisions;
  const key = JSON.stringify(rows.map((d) => [d.line, d.text, d.why, d.label]));
  if (lastScatter.get(method)?.key === key) return lastScatter.get(method).view;
  const view = scatterView(rows.map((d) => graph.vector(`row:${d.line}`)), { method });
  const out = { ...view, points: view.points.map((p, i) => ({ line: rows[i].line, label: rows[i].label, ...p })) };
  lastScatter.set(method, { key, view: out });
  return out;
}

export function createViewer({ root = defaultRoot(), home = homedir() } = {}) {
  // A transcript's first line and meta are written when the agent starts and never change.
  const tasks = new Map();
  const taskOf = (run, agent) => {
    const file = subagentTranscript(root, run, agent, home);
    if (!file) return null;
    if (!tasks.has(file)) {
      const task = readTask(file);
      if (!task) return null;
      tasks.set(file, task);
    }
    return tasks.get(file);
  };
  return createServer((req, res) => {
    try {
      handle(root, taskOf, req, res);
    } catch (err) {
      if (!res.headersSent) send(res, 500, 'text/plain', err.message);
      else res.destroy();
    }
  });
}

function handle(root, taskOf, req, res) {
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
    const scatter = url.searchParams.get('scatter') || 'pca';
    if (!['pca', 'umap'].includes(scatter)) return send(res, 400, 'text/plain', `unknown scatter: ${scatter} (pca or umap)`);
    let state;
    try {
      const events = readStream(root);
      state = { ...summarize(events, run, taskOf, { scatter, evidence: (spec) => evidence(root, events, spec) }), error: null };
    } catch (err) {
      // readStream throws on a corrupt line or a misfiled event; show it rather than go blank.
      state = { ...summarize([], run, undefined, { scatter }), error: err.message };
    }
    return send(res, 200, 'application/json', JSON.stringify(state));
  }
  send(res, 404, 'text/plain', 'not found');
}

// Served by name only, never by path, so nothing else in the repo can be fetched. Read on
// every request, so an edit shows on reload.
const SCRIPTS = new Set(['app.js', 'ui.js', 'layout.js', 'disk.js', 'plane.js', 'swimlane.js', 'graph.js', 'crew.js', 'scatter.js']);
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
