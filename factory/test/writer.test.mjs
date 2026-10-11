import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStream } from '../read.mjs';
import { tempRoot, write } from './helpers.mjs';

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
  assert.match(e.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  assert.ok(Date.parse(e.ts) >= before - 1000);
});
