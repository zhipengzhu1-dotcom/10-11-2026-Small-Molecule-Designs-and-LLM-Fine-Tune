import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataChecks, logResults, pushedCommits, unexpectedSkips } from '../../scripts/ci.mjs';
import { readStream } from '../read.mjs';
import { REPO, tempRoot } from './helpers.mjs';

test('CI logs its per-test results and a ci check naming the commit, failing on any problem', () => {
  const root = tempRoot();
  const tap = [
    'TAP version 13',
    '# Subtest: records a start event',
    'ok 1 - records a start event',
    '  ---',
    '  duration_ms: 3.1',
    '  ...',
    'not ok 2 - a merge commits the factory paths',
    'ok 3 - the page cannot be reached from another machine\'s address # SKIP no non-loopback IPv4 interface',
    '1..3',
  ].join('\n');
  logResults({ root, run: 'run-1', agent: 'ci', rev: 'abc1234', tap, problems: ['check stories failed'] });
  const events = readStream(root);
  assert.deepEqual(events.map((e) => [e.run, e.agent, e.type]), [['run-1', 'ci', 'artifact'], ['run-1', 'ci', 'check']]);
  const [results, ci] = events;
  assert.deepEqual([results.kind, results.rev, results.tests, results.pass, results.fail, results.skip], ['test-results', 'abc1234', '3', '1', '1', '1']);
  assert.equal(readFileSync(join(root, results.path), 'utf8').split('\n')[2], 'a merge commits the factory paths\tfail');
  assert.deepEqual([ci.name, ci.result], ['ci', 'fail']);
  assert.equal(ci.evidence, `abc1234: 1 pass, 1 fail, 1 skip (${results.path}); check stories failed`);
});

test('a clean CI run logs a passing ci check', () => {
  const root = tempRoot();
  logResults({ root, run: 'run-1', agent: 'ci', rev: 'abc1234', tap: 'ok 1 - records a start event\n', problems: [] });
  const ci = readStream(root).find((e) => e.type === 'check');
  assert.equal(ci.result, 'pass');
  assert.match(ci.evidence, /^abc1234: 1 pass, 0 fail, 0 skip \(factory\/agents\/run-1\/tests\/ci-\d{8}T\d{9}Z\.tsv\)$/);
});

test('a skipped test fails CI unless its reason is an allowed one', () => {
  const tap = [
    'ok 1 - records a start event',
    'ok 2 - the page cannot be reached from another machine\'s address # SKIP no non-loopback IPv4 interface',
    'ok 3 - a fully audited trail passes # SKIP git is not installed',
    '    ok 4 - nested subtest # SKIP',
    'ok 5 - the CLI turns real PDFs into text in one run # SKIP pdftotext is not installed',
  ].join('\n');
  assert.deepEqual(unexpectedSkips(tap), ['a fully audited trail passes (git is not installed)', 'nested subtest (no reason)']);
});

test('pre-push stdin yields each pushed commit and skips deleted refs', () => {
  const stdin = [
    'refs/heads/intake/s1 e75baac0ec3b1741c87ac74d1bad23708c526098 refs/heads/intake/s1 9d5ea1d0000000000000000000000000000000000',
    'refs/heads/old 0000000000000000000000000000000000000000 refs/heads/old 1111111111111111111111111111111111111111',
    '',
  ].join('\n');
  assert.deepEqual(pushedCommits(stdin), ['e75baac0ec3b1741c87ac74d1bad23708c526098']);
});

test('CI runs one data check for every check:* script in package.json', () => {
  const scripts = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).scripts;
  const named = Object.keys(scripts).filter((s) => s.startsWith('check:')).map((s) => s.slice('check:'.length)).sort();
  assert.deepEqual(Object.keys(dataChecks('/main')).sort(), named);
});
