import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CHECK = join(FACTORY, 'checks', 'references.mjs');
const FIXTURES = join(FACTORY, 'test', 'fixtures', 'references');

// Runs the check CLI the way an agent does and returns its exit status plus the check events it wrote.
function check(catalog, tex = 'main.tex') {
  const root = tempRoot();
  const r = spawnSync(process.execPath, [CHECK, '--root', root, '--run', 'run-1', '--agent', 'cataloger',
    '--tex', join(FIXTURES, tex), '--catalog', join(FIXTURES, catalog)], { encoding: 'utf8' });
  const events = readStream(root).filter((e) => e.type === 'check');
  return { ...r, events };
}

test('a catalog with every cited key and valid statuses passes and logs a pass check event', () => {
  const r = check('catalog-complete.tsv');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].name, 'references');
  assert.equal(r.events[0].result, 'pass');
  assert.match(r.events[0].evidence, /catalog-complete\.tsv/);
});

test('a catalog missing cited keys fails and the evidence names each missing key', () => {
  // aime is cited inside \citep[see][p.~3]{qwen2024, aime}; cesista2024 only through \nocite.
  const r = check('catalog-missing-key.tsv');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /missing keys: aime, cesista2024/);
  assert.doesNotMatch(r.events[0].evidence, /commented2020/);
});

test('a row with an invalid or empty status fails and the evidence names the row', () => {
  const r = check('catalog-bad-status.tsv');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /line 5 \(o1\): invalid status "paywalled"/);
  assert.match(r.events[0].evidence, /line 7 \(aime\): invalid status ""/);
  assert.doesNotMatch(r.events[0].evidence, /missing keys/);
});
