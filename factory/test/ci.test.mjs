import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataChecks, pushedCommits, unexpectedSkips } from '../../scripts/ci.mjs';
import { REPO } from './helpers.mjs';

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
