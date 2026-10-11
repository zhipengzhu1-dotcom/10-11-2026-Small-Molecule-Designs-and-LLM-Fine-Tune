import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStream } from '../read.mjs';
import { tempRoot, write } from './helpers.mjs';

// Independent copy of the API contract in issue #1, with one valid example per type.
const VALID = {
  'agent.start': { role: 'section-reader', parent: 'orchestrator' },
  'agent.stop': { role: 'section-reader', status: 'PASS' },
  artifact: { path: 'research/s1/notes/paper.md', kind: 'notes' },
  'fetch.failed': { ref: 'qwen2025', url: 'https://example.org/paper.pdf', reason: 'HTTP 403' },
  check: { name: 'tables', result: 'pass', evidence: 'research/s1/tables/' },
};

const kv = (fields) => Object.entries(fields).map(([k, v]) => `${k}=${v}`);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

test('a valid artifact event appears in the merged stream with ts, run and agent stamped', () => {
  const root = tempRoot();
  const before = Date.now();
  const r = write(['--root', root, '--run', 'run-1', '--agent', 'worker-a', 'artifact', 'path=research/s1/notes/paper.md', 'kind=notes']);
  assert.equal(r.status, 0, r.stderr);

  const events = readStream(root);
  assert.equal(events.length, 1);
  const [e] = events;
  assert.equal(e.type, 'artifact');
  assert.equal(e.run, 'run-1');
  assert.equal(e.agent, 'worker-a');
  assert.equal(e.path, 'research/s1/notes/paper.md');
  assert.equal(e.kind, 'notes');
  assert.match(e.ts, ISO);
  assert.ok(Date.parse(e.ts) >= before - 1000);
});

for (const [type, fields] of Object.entries(VALID)) {
  test(`a valid ${type} event appears in the merged stream with its fields and stamps`, () => {
    const root = tempRoot();
    const r = write(['--root', root, '--run', 'run-1', '--agent', 'worker-a', type, ...kv(fields)]);
    assert.equal(r.status, 0, r.stderr);
    const events = readStream(root);
    assert.equal(events.length, 1);
    assert.deepEqual(
      { ...events[0], ts: 'X' },
      { ts: 'X', run: 'run-1', agent: 'worker-a', type, ...fields },
    );
    assert.match(events[0].ts, ISO);
  });

  for (const missing of Object.keys(fields)) {
    test(`${type} without ${missing} is rejected with an error naming ${missing}`, () => {
      const root = tempRoot();
      const { [missing]: _, ...rest } = fields;
      const r = write(['--root', root, '--run', 'run-1', '--agent', 'worker-a', type, ...kv(rest)]);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, new RegExp(`missing required field: ${missing}\\b`));
      assert.deepEqual(readStream(root), []);
    });
  }
}

for (const missing of ['run', 'agent']) {
  test(`an event with no ${missing} is rejected with an error naming ${missing}`, () => {
    const root = tempRoot();
    const args = { run: ['--run', 'run-1'], agent: ['--agent', 'worker-a'] };
    delete args[missing];
    const r = write(['--root', root, ...Object.values(args).flat(), 'artifact', ...kv(VALID.artifact)]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, new RegExp(`missing field: ${missing}\\b`));
    assert.deepEqual(readStream(root), []);
  });
}

test('a status or result outside its allowed values is rejected with an error naming the field', () => {
  const root = tempRoot();
  const a = write(['--root', root, '--run', 'run-1', '--agent', 'w', 'agent.stop', 'role=r', 'status=DONE']);
  assert.notEqual(a.status, 0);
  assert.match(a.stderr, /field status must be one of PASS, ISSUES, BLOCKED/);
  const b = write(['--root', root, '--run', 'run-1', '--agent', 'w', 'check', 'name=t', 'result=ok', 'evidence=e']);
  assert.notEqual(b.status, 0);
  assert.match(b.stderr, /field result must be one of pass, fail/);
  assert.deepEqual(readStream(root), []);
});

test('an unknown event type is rejected', () => {
  const root = tempRoot();
  const r = write(['--root', root, '--run', 'run-1', '--agent', 'w', 'agent.pause', 'role=r']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown event type: agent\.pause/);
  assert.deepEqual(readStream(root), []);
});

test('run and agent can come from FACTORY_RUN and FACTORY_AGENT, and root from CLAUDE_PROJECT_DIR', () => {
  const root = tempRoot();
  const r = write(['artifact', ...kv(VALID.artifact)], {
    CLAUDE_PROJECT_DIR: root, FACTORY_RUN: 'run-env', FACTORY_AGENT: 'orchestrator',
  });
  assert.equal(r.status, 0, r.stderr);
  const [e] = readStream(root);
  assert.equal(e.run, 'run-env');
  assert.equal(e.agent, 'orchestrator');
});
