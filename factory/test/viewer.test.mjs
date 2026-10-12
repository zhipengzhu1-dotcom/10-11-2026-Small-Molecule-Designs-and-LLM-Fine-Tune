import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { readTask, subagentTranscript, summarize } from '../viewer.mjs';
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

test('the manual run is never the newest: a check run by hand does not end the session that is still working', () => {
  const s = summarize([
    ev('00', 'session', 'a', 'agent.start', { role: 'x', parent: 'orchestrator' }),
    ev('01', 'manual', 'orchestrator', 'check', { name: 'trail', result: 'pass', evidence: 'ok' }),
  ]);
  assert.equal(s.newest, 'session');
  assert.equal(s.run, 'session');
  assert.deepEqual(s.crew.map((c) => [c.agent, c.live]), [['a', true]]);
  assert.equal(summarize([ev('01', 'manual', 'orchestrator', 'check', { name: 't', result: 'pass', evidence: 'ok' })]).run, 'manual');
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

test('the crew holds every agent of every run, with the files it wrote; only the newest run has live agents', () => {
  const start = { role: 'general-purpose', parent: 'orchestrator' };
  const s = summarize([
    ev('00', 'old', 'a1', 'agent.start', start),
    ev('01', 'old', 'a1', 'artifact', { path: 'notes.md', kind: 'notes' }),
    ev('02', 'old', 'a1', 'agent.stop', { role: 'general-purpose', status: 'PASS' }),
    ev('03', 'old', 'a2', 'agent.start', start),
    ev('04', 'old', 'orchestrator', 'artifact', { path: 'plan.md', kind: 'doc' }),
    ev('05', 'new', 'b1', 'agent.start', start),
    ev('06', 'new', 'b1', 'artifact', { path: 'notes.md', kind: 'notes' }),
    ev('07', 'new', 'b1', 'artifact', { path: 'notes.md', kind: 'notes' }),
    ev('08', 'new', 'b2', 'agent.start', start),
    ev('09', 'new', 'b2', 'agent.stop', { role: 'general-purpose', status: 'ISSUES' }),
  ], 'old');
  assert.deepEqual(s.crew.map((c) => [c.run, c.agent, c.status, c.live, c.files]), [
    ['old', 'a1', 'PASS', false, ['notes.md']],
    ['old', 'a2', 'running', false, []],
    ['new', 'b1', 'running', true, ['notes.md']],
    ['new', 'b2', 'ISSUES', false, []],
  ]);
  assert.equal(s.crew[3].start, '2026-10-11T10:08:00Z');
  assert.equal(s.crew[3].stop, '2026-10-11T10:09:00Z');
});

test('agents take their task, tickets and mentions from what they were asked to do', () => {
  const asked = { 'r1/a1': { task: 'Implement #21 drift', tickets: ['21'], mentions: ['1'] } };
  const calls = [];
  const s = summarize([
    ev('00', 'r1', 'orchestrator', 'artifact', { path: 'a', kind: 'doc' }),
    ev('01', 'r1', 'a1', 'agent.start', { role: 'general-purpose', parent: 'orchestrator' }),
    ev('02', 'r1', 'a2', 'agent.start', { role: 'general-purpose', parent: 'orchestrator' }),
  ], undefined, (run, agent) => { calls.push(agent); return asked[`${run}/${agent}`] ?? null; });
  const pick = (a) => [a.agent, a.task, a.tickets, a.mentions];
  assert.deepEqual(s.agents.map(pick), [
    ['orchestrator', null, [], []],
    ['a1', 'Implement #21 drift', ['21'], ['1']],
    ['a2', null, [], []],
  ]);
  assert.deepEqual(s.crew.map(pick), s.agents.slice(1).map(pick));
  assert.deepEqual(calls.sort(), ['a1', 'a2']); // once per agent, never for the orchestrator
});

test('a subagent transcript gives the task from its .meta.json and the tickets from it and the first message', () => {
  const dir = tempRoot();
  const file = join(dir, 'agent-a1.jsonl');
  writeFileSync(file, JSON.stringify({ type: 'user', message: { role: 'user', content: 'You implement GitHub issue #21 (child of spec #1). Confirm #40 and #21 first.' } }) + '\n' + JSON.stringify({ type: 'assistant' }) + '\n');
  writeFileSync(join(dir, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Implement #21 event drift' }));
  assert.deepEqual(readTask(file), { task: 'Implement #21 event drift', tickets: ['21'], mentions: ['1', '40'] });
  // the message as blocks and no meta (or an empty description): the first ticket it names is its own
  const bare = join(dir, 'agent-a2.jsonl');
  writeFileSync(bare, JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Merge #17, then check #19' }] } }) + '\n');
  assert.deepEqual(readTask(bare), { task: null, tickets: ['17'], mentions: ['19'] });
  writeFileSync(join(dir, 'agent-a2.meta.json'), JSON.stringify({ description: '' }));
  assert.deepEqual(readTask(bare), { task: null, tickets: ['17'], mentions: ['19'] });
  assert.equal(readTask(join(dir, 'agent-none.jsonl')), null);
});

test("a subagent's transcript is looked up in the main checkout's Claude Code project folder by run and agent id", () => {
  assert.equal(subagentTranscript('C:\\Users\\me\\My Repo', 'r-1', 'a1', 'H'),
    join('H', '.claude', 'projects', 'C--Users-me-My-Repo', 'r-1', 'subagents', 'agent-a1.jsonl'));
  assert.equal(subagentTranscript('/x', '../r', 'a1', 'H'), null);
  assert.equal(subagentTranscript('/x', 'r', 'a/../b', 'H'), null);
  assert.equal(subagentTranscript('/x', 'r', 'orchestrator', 'H'), null);
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

test("GET /state gives each agent the task from its transcript in the user's Claude Code folder", async () => {
  const root = seed();
  const home = tempRoot();
  const dir = join(home, '.claude', 'projects', root.replace(/[^A-Za-z0-9]/g, '-'), 'r1', 'subagents');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent-a1.jsonl'), JSON.stringify({ type: 'user', message: { content: 'Read #7' } }) + '\n');
  writeFileSync(join(dir, 'agent-a1.meta.json'), JSON.stringify({ description: 'Read the #7 paper' }));
  const v = await startViewer(['--root', root], { USERPROFILE: home, HOME: home });
  try {
    const s = await (await fetch(`${v.url}/state`)).json();
    assert.deepEqual(s.agents.map((a) => [a.agent, a.task, a.tickets]), [['a1', 'Read the #7 paper', ['7']]]);
    assert.deepEqual(s.crew.map((a) => [a.agent, a.task]), [['a1', 'Read the #7 paper']]);
  } finally {
    await v.stop();
  }
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

test('the page\'s scripts are served from factory/viewer as JavaScript', async () => {
  await withViewer(seed(), async (url) => {
    for (const name of ['app.js', 'ui.js', 'layout.js', 'swimlane.js', 'force.js', 'graph.js', 'crew.js']) {
      const res = await fetch(`${url}/assets/${name}`);
      assert.equal(res.status, 200, name);
      assert.match(res.headers.get('content-type'), /text\/javascript/, name);
    }
  });
});

test('only the page\'s own scripts are served: other files and path tricks get 404', async () => {
  await withViewer(seed(), async (url) => {
    for (const path of ['/assets/nope.js', '/assets/page.html', '/assets/..%2Fviewer.mjs', '/assets/%2e%2e/viewer.mjs', '/viewer.mjs', '/assets/']) {
      const res = await fetch(url + path);
      assert.equal(res.status, 404, path);
    }
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
