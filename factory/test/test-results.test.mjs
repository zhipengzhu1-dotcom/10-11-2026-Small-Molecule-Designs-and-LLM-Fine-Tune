import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CLI = join(FACTORY, 'test-results.mjs');
const SAMPLE = join(FACTORY, 'test', 'fixtures', 'test-results', 'sample.mjs');

test('a test run writes an artifact listing each test name with its result', () => {
  const root = tempRoot();
  const r = spawnSync(process.execPath, [CLI, '--root', root, '--run', 'run-1', '--agent', 'tester', SAMPLE], { encoding: 'utf8' });
  assert.equal(r.status, 1, 'a failing test fails the run\n' + r.stderr + r.stdout);
  const artifacts = readStream(root).filter((e) => e.type === 'artifact');
  assert.equal(artifacts.length, 1);
  const a = artifacts[0];
  assert.deepEqual([a.run, a.agent, a.kind, a.tests, a.pass, a.fail, a.skip], ['run-1', 'tester', 'test-results', '5', '3', '1', '1']);
  assert.match(a.path, /^factory\/agents\/run-1\/tests\/tester-\d{8}T\d{9}Z\.tsv$/);
  assert.equal(readFileSync(join(root, a.path), 'utf8'), [
    'test\tresult',
    'a passing test\tpass',
    'a failing test with a # in its name\tfail',
    'a skipped test\tskip',
    'a nested step\tpass',
    'an outer test\tpass',
    '',
  ].join('\n'));
  assert.match(r.stdout, new RegExp(`test-results: ${a.path}: 3 pass, 1 fail, 1 skip`));
});
