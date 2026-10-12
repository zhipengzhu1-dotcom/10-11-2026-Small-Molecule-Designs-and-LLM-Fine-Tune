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

// The orchestrator's dispatch and message events (issue #56) sit in its own file and come back
// as written, ticket a number and resume a boolean, in ts order with the agents they started.
test('the reader passes dispatch and message events through, in ts order with the agents\' events', () => {
  const root = tempRoot();
  const put = (agent, events) => {
    const dir = join(root, 'factory', 'agents', 'run-1');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${agent}.jsonl`), events.map((e) => JSON.stringify({ run: 'run-1', agent, ...e }) + '\n').join(''));
  };
  const launch = { ts: '2026-10-12T08:36:27.300Z', type: 'dispatch', to: 'ac2d803fe514dbc00', role: 'implementer', description: 'implementer #56 dispatch events', tool_use_id: 'toolu_01XE4vWVQAfoiA9t9VYJXiSu', ticket: 56 };
  const message = { ts: '2026-10-12T08:50:00.000Z', type: 'message', to: 'ac2d803fe514dbc00', tool_use_id: 'toolu_01Au4XvoAJgt8C5AFxcB1BQV', cause: 'row:95' };
  const resume = { ts: '2026-10-12T09:10:00.200Z', type: 'dispatch', to: 'ac2d803fe514dbc00', role: 'implementer', description: 'implementer #56 dispatch events', tool_use_id: 'toolu_013hYNkpCEmHRvxVAKzegd97', ticket: 56, resume: true, cause: 'row:96' };
  put('orchestrator', [launch, message, resume]);
  put('ac2d803fe514dbc00', [
    { ts: '2026-10-12T08:36:26.964Z', type: 'agent.start', role: 'general-purpose', parent: 'orchestrator' },
    { ts: '2026-10-12T09:00:00.000Z', type: 'agent.stop', role: 'general-purpose', status: 'ISSUES' },
    { ts: '2026-10-12T09:10:00.100Z', type: 'agent.start', role: 'general-purpose', parent: 'orchestrator' },
  ]);
  const events = readStream(root);
  assert.deepEqual(events.map((e) => [e.agent, e.type]), [
    ['ac2d803fe514dbc00', 'agent.start'], ['orchestrator', 'dispatch'], ['orchestrator', 'message'],
    ['ac2d803fe514dbc00', 'agent.stop'], ['ac2d803fe514dbc00', 'agent.start'], ['orchestrator', 'dispatch'],
  ]);
  assert.deepEqual(events.filter((e) => e.agent === 'orchestrator'), [launch, message, resume].map((e) => ({ run: 'run-1', agent: 'orchestrator', ...e })));
});

// A challenge is eliminated by a later event naming its id, never by an edit (issue #58). The id
// is looked up in the whole stream, so a challenge from an earlier run can be eliminated later.
test('challenge.eliminated names a challenge already in the stream, from any run', () => {
  const root = tempRoot();
  const raise = write(['--root', root, '--run', 'run-1', '--agent', 'orchestrator', 'challenge', 'id=c1', 'target=row:21', 'why=withdrawn in prose']);
  assert.equal(raise.status, 0, raise.stderr);
  const end = write(['--root', root, '--run', 'run-2', '--agent', 'orchestrator', 'challenge.eliminated', 'of=c1', 'by=row:88']);
  assert.equal(end.status, 0, end.stderr);
  assert.deepEqual(readStream(root).map((e) => [e.run, e.type, e.id ?? e.of]), [['run-1', 'challenge', 'c1'], ['run-2', 'challenge.eliminated', 'c1']]);
});

test('challenge.eliminated naming no challenge in the stream is refused and nothing is written', () => {
  const root = tempRoot();
  write(['--root', root, '--run', 'run-1', '--agent', 'orchestrator', 'challenge', 'id=c1', 'target=row:21', 'why=w']);
  const r = write(['--root', root, '--run', 'run-1', '--agent', 'orchestrator', 'challenge.eliminated', 'of=c2', 'by=row:88']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /challenge\.eliminated: of c2 names no challenge in the stream/);
  const bad = write(['--root', root, '--run', 'run-1', '--agent', 'orchestrator', 'challenge.eliminated', 'of=c1', 'by=because']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /challenge\.eliminated: by because is not a pointer, row or event/);
  assert.deepEqual(readStream(root).map((e) => e.type), ['challenge']);
});

test('a challenge reusing an id already in the stream is refused, so of=<id> names one challenge', () => {
  const root = tempRoot();
  write(['--root', root, '--run', 'run-1', '--agent', 'orchestrator', 'challenge', 'id=c1', 'target=row:21', 'why=w']);
  const r = write(['--root', root, '--run', 'run-2', '--agent', 'orchestrator', 'challenge', 'id=c1', 'target=row:30', 'why=w']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /challenge: id c1 is already a challenge in the stream/);
  assert.equal(readStream(root).length, 1);
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
