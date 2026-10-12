import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStream } from '../read.mjs';
import { marker, tempRoot, write } from './helpers.mjs';

// Independent copy of the API contract in issue #1, with one valid example per type.
const VALID = {
  'agent.start': { role: 'section-reader', parent: 'orchestrator' },
  'agent.stop': { role: 'section-reader', status: 'PASS' },
  artifact: { path: 'research/s1/notes/paper.md', kind: 'notes' },
  'fetch.failed': { ref: 'qwen2025', url: 'https://example.org/paper.pdf', reason: 'HTTP 403' },
  check: { name: 'tables', result: 'pass', evidence: 'research/s1/tables/' },
  // Spec #52, issue #56: written by the dispatch hook into the orchestrator's file.
  dispatch: { to: 'ac2d803fe514dbc00', role: 'implementer', description: 'implementer #56 dispatch events', tool_use_id: 'toolu_01XE4vWVQAfoiA9t9VYJXiSu' },
  message: { to: 'aca88395f9aed1a30', tool_use_id: 'toolu_01Au4XvoAJgt8C5AFxcB1BQV' },
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

test('the error for a missing run names every place a run comes from, the run marker too', () => {
  const r = write(['--root', tempRoot(), '--agent', 'worker-a', 'artifact', ...kv(VALID.artifact)]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /missing field: run \(pass --run, set FACTORY_RUN, or mark the run with factory\/run-marker\.mjs start\)/);
});

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

// Events written without a run during an orchestrated run land in that run's folder, which the
// merge script commits (issue #17).
test('with no --run and no FACTORY_RUN, the run comes from the run marker', () => {
  const root = tempRoot();
  assert.equal(marker(['start', '--root', root, '--run', 'run-marked', '--branch', 'integ']).status, 0);
  const r = write(['--root', root, '--agent', 'w', 'artifact', ...kv(VALID.artifact)]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readStream(root).map((e) => e.run), ['run-marked']);
});

test('FACTORY_RUN still wins over the run marker', () => {
  const root = tempRoot();
  assert.equal(marker(['start', '--root', root, '--run', 'run-marked', '--branch', 'integ']).status, 0);
  const r = write(['--root', root, '--agent', 'w', 'artifact', ...kv(VALID.artifact)], { FACTORY_RUN: 'run-env' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readStream(root).map((e) => e.run), ['run-env']);
});

// The orchestrator's own check events carry the ticket they concern (issue #59).
test('a check event written with ticket=#59 records ticket 59; a ticket that is no issue number is rejected', () => {
  const root = tempRoot();
  const r = write(['--root', root, '--run', 'run-1', '--agent', 'orchestrator', 'check', ...kv(VALID.check), 'ticket=#59']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readStream(root)[0].ticket, 59);

  const bad = write(['--root', root, '--run', 'run-1', '--agent', 'orchestrator', 'check', ...kv(VALID.check), 'ticket=soon']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /ticket must be an issue number/);
  assert.equal(readStream(root).length, 1);
});

// A challenge is a doubt the orchestrator raises against a row or event (issue #58).
const challenge = (root, ...pairs) =>
  write(['--root', root, '--run', 'run-1', '--agent', 'orchestrator', 'challenge', ...pairs]);

test('a well-formed challenge is written with its kind, rebut by default, and its ticket as a number', () => {
  const root = tempRoot();
  const a = challenge(root, 'id=c1', 'target=row:21', 'why=L71 withdrew it in prose only');
  assert.equal(a.status, 0, a.stderr);
  const b = challenge(root, 'id=c2', 'target=event:run-1/worker-a:3', 'kind=undercut', 'why=the check ran before the edit', 'ticket=#58');
  assert.equal(b.status, 0, b.stderr);
  const c = challenge(root, 'id=c3', 'target=file:factory/log.mjs:10-12', 'kind=undermine', 'why=the cited lines moved');
  assert.equal(c.status, 0, c.stderr);
  assert.deepEqual(readStream(root).map(({ ts: _, ...e }) => e), [
    { run: 'run-1', agent: 'orchestrator', type: 'challenge', id: 'c1', target: 'row:21', kind: 'rebut', why: 'L71 withdrew it in prose only' },
    { run: 'run-1', agent: 'orchestrator', type: 'challenge', id: 'c2', target: 'event:run-1/worker-a:3', kind: 'undercut', why: 'the check ran before the edit', ticket: 58 },
    { run: 'run-1', agent: 'orchestrator', type: 'challenge', id: 'c3', target: 'file:factory/log.mjs:10-12', kind: 'undermine', why: 'the cited lines moved' },
  ]);
});

test('a challenge whose target does not parse, or is prose, is refused and nothing is written', () => {
  const root = tempRoot();
  for (const [target, error] of [
    ['row:L21', /target row:L21 is not a decision row; write row:<line number>/],
    ['event:run-1:3', /target event:run-1:3 is not an event; write event:<run>\/<agent>:<line>/],
    ['doc:x', /target unknown pointer doc:x/],
    ['line 21', /target line 21 is not a pointer, row or event/],
  ]) {
    const r = challenge(root, 'id=c1', `target=${target}`, 'why=w');
    assert.equal(r.status, 2, target);
    assert.match(r.stderr, error);
  }
  assert.deepEqual(readStream(root), []);
});

test('a challenge of an unknown kind, or with an id that is not a plain name, is refused', () => {
  const root = tempRoot();
  const a = challenge(root, 'id=c1', 'target=row:21', 'kind=attack', 'why=w');
  assert.equal(a.status, 2);
  assert.match(a.stderr, /field kind must be one of rebut, undermine, undercut; got attack/);
  const b = challenge(root, 'id=c 1', 'target=row:21', 'why=w');
  assert.equal(b.status, 2);
  assert.match(b.stderr, /challenge: id c 1 is not a plain name/);
  assert.deepEqual(readStream(root), []);
});
