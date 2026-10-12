// A fixture test run for factory/test-results.mjs: one test of each outcome. Not named *.test.mjs,
// so `npm test` never runs it.
import { test } from 'node:test';

test('a passing test', () => {});
test('a failing test with a # in its name', () => {
  throw new Error('fails on purpose');
});
test('a skipped test', { skip: 'not here' }, () => {});
test('an outer test', async (t) => {
  await t.test('a nested step', () => {});
});
