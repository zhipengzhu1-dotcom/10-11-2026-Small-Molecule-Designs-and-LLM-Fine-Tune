import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frontier, repoOf } from '../frontier.mjs';
import { FACTORY } from './helpers.mjs';

const RESPONSE = readFileSync(join(FACTORY, 'test', 'fixtures', 'frontier', 'response.json'), 'utf8');
const REMOTE = 'https://github.com/zhipengzhu1-dotcom/10-11-2026-Small-Molecule-Designs-and-LLM-Fine-Tune.git';

test('frontier sorts each child of the map by state, labels, assignee and open blockers, from one gh query', () => {
  const calls = [];
  const gh = (args) => (calls.push(args), RESPONSE);
  const { children, ready } = frontier({ number: 1, remote: REMOTE, gh });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ['api', 'graphql']);
  assert.ok(calls[0].includes('owner=zhipengzhu1-dotcom'));
  assert.ok(calls[0].includes('repo=10-11-2026-Small-Molecule-Designs-and-LLM-Fine-Tune'));
  assert.ok(calls[0].includes('number=1'));

  assert.deepEqual(children.map((c) => [c.number, c.status, c.openBlockers]), [
    [2, 'closed', []],
    [14, 'blocked', [44]],
    [18, 'human', []],
    [26, 'spec', []],
    [30, 'assigned', []],
    [31, 'not-ready', []],
    [44, 'ready', []],
  ]);
  assert.deepEqual(ready, [44]);
});

test('repoOf reads owner and repo from an https or ssh GitHub remote', () => {
  assert.deepEqual(repoOf(REMOTE), { owner: 'zhipengzhu1-dotcom', repo: '10-11-2026-Small-Molecule-Designs-and-LLM-Fine-Tune' });
  assert.deepEqual(repoOf('git@github.com:a-b/c.d.git'), { owner: 'a-b', repo: 'c.d' });
  assert.throws(() => repoOf('https://gitlab.com/a/b.git'), /not a GitHub remote/);
});
