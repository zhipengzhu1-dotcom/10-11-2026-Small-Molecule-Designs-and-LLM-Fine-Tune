import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { tempRoot, write, writeAsync } from './helpers.mjs';

const N = 60;

test('two writers appending to one activity file at the same time produce no corrupt lines and lose no events', async () => {
  const root = tempRoot();
  const writer = (who) =>
    (async () => {
      const results = [];
      for (let i = 0; i < N; i++) {
        results.push(writeAsync(['--root', root, '--run', 'run-1', '--agent', 'worker-a',
          'artifact', `path=out/${who}-${i}.md`, `kind=${'x'.repeat(2000)}`]));
      }
      return Promise.all(results);
    })();
  const all = (await Promise.all([writer('one'), writer('two')])).flat();
  for (const r of all) assert.equal(r.status, 0, r.stderr);

  const events = readStream(root); // throws on any corrupt line
  assert.equal(events.length, 2 * N);
  const paths = new Set(events.map((e) => e.path));
  for (const who of ['one', 'two']) for (let i = 0; i < N; i++) assert.ok(paths.has(`out/${who}-${i}.md`));
});

test('each agent writes only to its own activity file', () => {
  const root = tempRoot();
  for (const agent of ['worker-a', 'worker-b']) {
    const r = write(['--root', root, '--run', 'run-1', '--agent', agent, 'artifact', `path=${agent}.md`, 'kind=notes']);
    assert.equal(r.status, 0, r.stderr);
  }
  const events = readStream(root);
  assert.deepEqual(events.map((e) => [e.agent, e.path]).sort(), [['worker-a', 'worker-a.md'], ['worker-b', 'worker-b.md']]);
});

test('an agent cannot pass someone else\'s agent or run as a field', () => {
  const root = tempRoot();
  for (const forged of ['agent=orchestrator', 'run=other-run', 'ts=2020-01-01T00:00:00Z']) {
    const r = write(['--root', root, '--run', 'run-1', '--agent', 'worker-a', 'artifact', 'path=p', 'kind=k', forged]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /stamped by the writer/);
  }
  assert.deepEqual(readStream(root), []);
});

test('an agent id that would escape the activity folder is rejected', () => {
  const root = tempRoot();
  const r = write(['--root', root, '--run', 'run-1', '--agent', '../orchestrator', 'artifact', 'path=p', 'kind=k']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /invalid agent/);
  assert.deepEqual(readStream(root), []);
});

test('the reader refuses an event filed under another agent\'s file, naming the file', () => {
  const root = tempRoot();
  const dir = join(root, 'factory', 'agents', 'run-1');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'worker-a.jsonl'),
    JSON.stringify({ ts: '2026-10-11T00:00:00Z', run: 'run-1', agent: 'worker-b', type: 'artifact', path: 'p', kind: 'k' }) + '\n');
  assert.throws(() => readStream(root), /worker-a\.jsonl:1: event agent worker-b does not match its file/);
});

test('the reader reports a corrupt line with its file and line number', () => {
  const root = tempRoot();
  write(['--root', root, '--run', 'run-1', '--agent', 'worker-a', 'artifact', 'path=p', 'kind=k']);
  appendFileSync(join(root, 'factory', 'agents', 'run-1', 'worker-a.jsonl'), '{"ts":"2026-10-11T00:0\n');
  assert.throws(() => readStream(root), /worker-a\.jsonl:2: corrupt line/);
});

test('a line still being written (no newline yet) is left out until it is complete', () => {
  const root = tempRoot();
  write(['--root', root, '--run', 'run-1', '--agent', 'worker-a', 'artifact', 'path=p', 'kind=k']);
  appendFileSync(join(root, 'factory', 'agents', 'run-1', 'worker-a.jsonl'), '{"ts":"2026-10');
  assert.equal(readStream(root).length, 1);
});

test('events from all agents and runs come back in ts order', () => {
  const root = tempRoot();
  const put = (run, agent, ts) => {
    const dir = join(root, 'factory', 'agents', run);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${agent}.jsonl`), JSON.stringify({ ts, run, agent, type: 'artifact', path: ts, kind: 'k' }) + '\n');
  };
  put('run-2', 'b', '2026-10-11T10:00:03.000Z');
  put('run-1', 'a', '2026-10-11T10:00:01.000Z');
  put('run-1', 'c', '2026-10-11T10:00:02.500Z');
  put('run-1', 'a', '2026-10-11T10:00:04.000Z');
  assert.deepEqual(readStream(root).map((e) => e.path), [
    '2026-10-11T10:00:01.000Z', '2026-10-11T10:00:02.500Z', '2026-10-11T10:00:03.000Z', '2026-10-11T10:00:04.000Z',
  ]);
});

// agent.stop events written before issue #21 also carry a `transcript` field (the subagent's
// transcript path). The contract lists only role and status, and the path follows from run and
// agent, so the stream leaves the field out and no consumer can come to depend on it (issue #62).
test('the reader leaves the legacy transcript field out of agent.stop events, and only there', () => {
  const root = tempRoot();
  const dir = join(root, 'factory', 'agents', 'run-1');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'worker-a.jsonl'), [
    { ts: '2026-10-11T10:00:01.000Z', run: 'run-1', agent: 'worker-a', type: 'artifact', path: 'notes.md', kind: 'notes', transcript: 'kept' },
    { ts: '2026-10-11T10:00:02.000Z', run: 'run-1', agent: 'worker-a', type: 'agent.stop', role: 'general-purpose', status: 'PASS',
      transcript: 'C:/Users/me/.claude/projects/p/run-1/subagents/agent-worker-a.jsonl' },
  ].map((e) => JSON.stringify(e) + '\n').join(''));

  assert.deepEqual(readStream(root), [
    { ts: '2026-10-11T10:00:01.000Z', run: 'run-1', agent: 'worker-a', type: 'artifact', path: 'notes.md', kind: 'notes', transcript: 'kept' },
    { ts: '2026-10-11T10:00:02.000Z', run: 'run-1', agent: 'worker-a', type: 'agent.stop', role: 'general-purpose', status: 'PASS' },
  ]);
});
