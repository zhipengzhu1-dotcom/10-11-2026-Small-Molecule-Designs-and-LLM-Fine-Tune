import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { summarize } from '../viewer.mjs';
import { startViewer, tempRoot } from './helpers.mjs';

const ev = (ts, run, agent, type, fields = {}) => ({ ts: `2026-10-11T10:${ts}:00Z`, run, agent, type, ...fields });
const decision = (ts, phase, extra = {}) =>
  ev(ts, null, 'orchestrator', 'decision', { phase, decision: `d ${phase}`, why: 'w', evidence: 'e', result: 'r', ...extra });

test('each agent in a run gets its role, parent and status; one with no stop event is still running', () => {
  const s = summarize([
    ev('00', 'r1', 'orchestrator', 'artifact', { path: 'a', kind: 'doc' }),
    ev('01', 'r1', 'a1', 'agent.start', { role: 'reader', parent: 'orchestrator' }),
    ev('02', 'r1', 'a2', 'agent.start', { role: 'checker', parent: 'orchestrator' }),
    ev('03', 'r1', 'a1', 'artifact', { path: 'notes.md', kind: 'notes' }),
    ev('04', 'r1', 'a1', 'agent.stop', { role: 'reader', status: 'PASS' }),
  ]);
  assert.deepEqual(s.agents.map((a) => [a.agent, a.role, a.parent, a.status, a.events]), [
    ['orchestrator', 'orchestrator', null, 'running', 1],
    ['a1', 'reader', 'orchestrator', 'PASS', 3],
    ['a2', 'checker', 'orchestrator', 'running', 1],
  ]);
  const a1 = s.agents[1];
  assert.equal(a1.start, '2026-10-11T10:01:00Z');
  assert.equal(a1.stop, '2026-10-11T10:04:00Z');
});

test('an agent whose start event is missing takes its role and status from its stop event', () => {
  const s = summarize([ev('05', 'r1', 'a9', 'agent.stop', { role: 'merger', status: 'ISSUES' })]);
  assert.deepEqual(s.agents.map((a) => [a.agent, a.role, a.start, a.status]), [['a9', 'merger', null, 'ISSUES']]);
});

test('runs are listed oldest first and the newest is picked by default', () => {
  const events = [ev('00', 'old', 'x', 'agent.start', { role: 'a', parent: 'p' }), ev('09', 'new', 'y', 'agent.start', { role: 'b', parent: 'p' })];
  const s = summarize(events);
  assert.deepEqual(s.runs, ['old', 'new']);
  assert.equal(s.run, 'new');
  assert.deepEqual(s.agents.map((a) => a.agent), ['y']);
  assert.deepEqual(summarize(events, 'old').agents.map((a) => a.agent), ['x']);
});

test('the timeline holds the run\'s events plus the decisions made while it ran, newest first', () => {
  const events = [
    decision('00', 'project/start'),
    ev('01', 'r1', 'a', 'agent.start', { role: 'x', parent: 'p' }),
    decision('02', 'intake/a'),
    ev('03', 'r1', 'a', 'agent.stop', { role: 'x', status: 'PASS' }),
    ev('04', 'r2', 'b', 'agent.start', { role: 'y', parent: 'p' }),
    decision('05', 'intake/b'),
  ];
  const ts = (s) => s.timeline.map((e) => e.ts.slice(14, 16));
  assert.deepEqual(ts(summarize(events, 'r1')), ['03', '02', '01']);
  // the newest run is still open, so later decisions belong to it
  assert.deepEqual(ts(summarize(events, 'r2')), ['05', '04']);
});

test('decisions form a tree by their slash-path phase, in the order each node first appeared', () => {
  const s = summarize([
    decision('00', 'project/paper/drop-first'),
    decision('01', 'intake/references/oa-check'),
    decision('02', 'project/paper/pick'),
    decision('03', 'intake/references/oa-check'),
    decision('04', 'start'),
  ]);
  const shape = (n) => [n.name, n.count, n.decisions.length, n.children.map(shape)];
  assert.deepEqual(s.tree.children.map(shape), [
    ['project', 2, 0, [['paper', 2, 0, [['drop-first', 1, 1, []], ['pick', 1, 1, []]]]]],
    ['intake', 2, 0, [['references', 2, 0, [['oa-check', 2, 2, []]]]]],
    ['start', 1, 1, []],
  ]);
  assert.equal(s.tree.count, 5);
});

test('the latest result of each check in the run is reported', () => {
  const s = summarize([
    ev('00', 'r1', 'c', 'check', { name: 'tables', result: 'fail', evidence: 'row 3' }),
    ev('01', 'r1', 'c', 'check', { name: 'brief', result: 'pass', evidence: 'ok' }),
    ev('02', 'r1', 'c', 'check', { name: 'tables', result: 'pass', evidence: 'all rows' }),
  ]);
  assert.deepEqual(s.checks.map((c) => [c.name, c.result, c.evidence]), [['tables', 'pass', 'all rows'], ['brief', 'pass', 'ok']]);
});

// Server: a root with one agent and one decision.
function seed() {
  const root = tempRoot();
  mkdirSync(join(root, 'factory', 'agents', 'r1'), { recursive: true });
  writeFileSync(join(root, 'factory', 'agents', 'r1', 'a1.jsonl'),
    JSON.stringify(ev('01', 'r1', 'a1', 'agent.start', { role: 'reader', parent: 'orchestrator' })) + '\n');
  writeFileSync(join(root, 'factory', 'decisions.tsv'),
    'ts\tphase\tdecision\twhy\tevidence\tresult\n2026-10-11T10:02:00Z\tintake/a\tread it\tneeded\tx\tdone\n');
  return root;
}

async function withViewer(root, fn) {
  const v = await startViewer(['--root', root]);
  try {
    await fn(v.url);
  } finally {
    await v.stop();
  }
}

test('GET /state returns the summary of the factory logs, for the run asked for', async () => {
  const root = seed();
  await withViewer(root, async (url) => {
    const s = await (await fetch(`${url}/state`)).json();
    assert.equal(s.error, null);
    assert.equal(s.run, 'r1');
    assert.deepEqual(s.agents.map((a) => [a.agent, a.status]), [['a1', 'running']]);
    assert.equal(s.tree.count, 1);
    assert.deepEqual((await (await fetch(`${url}/state?run=nope`)).json()).agents, []);
  });
});

test('GET /state reports a corrupt log as an error instead of failing', async () => {
  const root = seed();
  appendFileSync(join(root, 'factory', 'agents', 'r1', 'a1.jsonl'), '{not json\n');
  await withViewer(root, async (url) => {
    const res = await fetch(`${url}/state`);
    assert.equal(res.status, 200);
    const s = await res.json();
    assert.match(s.error, /corrupt line/);
    assert.deepEqual(s.agents, []);
  });
});

test('GET / serves the viewer page', async () => {
  await withViewer(seed(), async (url) => {
    const res = await fetch(url + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /<title>Factory Viewer<\/title>/);
  });
});

test('the viewer is read-only: anything but GET is refused and the logs are untouched', async () => {
  await withViewer(seed(), async (url) => {
    for (const path of ['/', '/state']) {
      const res = await fetch(url + path, { method: 'POST', body: 'x' });
      assert.equal(res.status, 405, path);
    }
  });
});

test('a request with a foreign Host header is refused', async () => {
  await withViewer(seed(), async (url) => {
    const { port } = new URL(url);
    const status = await new Promise((resolve, reject) => {
      httpRequest({ host: '127.0.0.1', port, path: '/state', headers: { host: 'evil.example:80' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', reject).end();
    });
    assert.equal(status, 403);
  });
});
