import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frontier, repoOf } from '../frontier.mjs';
import { readStream } from '../read.mjs';
import { FACTORY, marker, tempRoot } from './helpers.mjs';

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

test('in an orchestrated run, the frontier writes one ticket-graph snapshot: each child with its title, state and open blockers', () => {
  const root = tempRoot();
  assert.equal(marker(['start', '--root', root, '--run', 'run-1', '--branch', 'integ']).status, 0);
  frontier({ number: 1, remote: REMOTE, gh: () => RESPONSE, root });

  const events = readStream(root);
  assert.equal(events.length, 1);
  const [e] = events;
  assert.deepEqual({ run: e.run, agent: e.agent, type: e.type, spec: e.spec }, { run: 'run-1', agent: 'orchestrator', type: 'ticket.graph', spec: 1 });
  assert.deepEqual(e.tickets, [
    { number: 2, title: 'Tracer: an agent run appears in one event stream', state: 'CLOSED', status: 'closed', blockers: [] },
    { number: 14, title: 'Context meter', state: 'OPEN', status: 'blocked', blockers: [44] },
    { number: 18, title: 'Pick the base model', state: 'OPEN', status: 'human', blockers: [] },
    { number: 26, title: 'Node model map', state: 'OPEN', status: 'spec', blockers: [] },
    { number: 30, title: 'Claimed ticket', state: 'OPEN', status: 'assigned', blockers: [] },
    { number: 31, title: 'Untriaged idea', state: 'OPEN', status: 'not-ready', blockers: [] },
    { number: 44, title: 'Repo scripts for the decision log, frontier, transcripts and Qwen review', state: 'OPEN', status: 'ready', blockers: [] },
  ]);
});

test('the snapshot lists the spec\'s user stories, the numbered items under its User Stories heading, so the done read sees a story missing from the map', () => {
  const root = tempRoot();
  assert.equal(marker(['start', '--root', root, '--run', 'run-1', '--branch', 'integ']).status, 0);
  const body = ['## Problem Statement', '', '1. not a story', '', '## User Stories', '', '### Logging', '', '1. As the orchestrator, I want a dispatch.',
    '2. As the orchestrator, I want a refusal.', '', '### Reads', '', '10. As a researcher, I want a view.', '', '## Implementation Decisions', '', '3. not a story'].join('\r\n');
  const response = JSON.parse(RESPONSE);
  response.data.repository.issue.body = body;
  const calls = [];
  frontier({ number: 1, remote: REMOTE, gh: (args) => (calls.push(args), JSON.stringify(response)), root });
  assert.match(calls[0].find((a) => a.startsWith('query=')), /\bbody\b/);
  assert.deepEqual(readStream(root)[0].stories, [1, 2, 10]);
  // A spec with no User Stories section logs no story list, rather than an empty one.
  frontier({ number: 1, remote: REMOTE, gh: () => RESPONSE, root });
  assert.equal('stories' in readStream(root)[1], false);
});

test('with no run marked, the frontier writes nothing', () => {
  const root = tempRoot();
  const { ready } = frontier({ number: 1, remote: REMOTE, gh: () => RESPONSE, root });
  assert.deepEqual(ready, [44]);
  assert.deepEqual(readStream(root), []);
});

test('repoOf reads owner and repo from an https or ssh GitHub remote', () => {
  assert.deepEqual(repoOf(REMOTE), { owner: 'zhipengzhu1-dotcom', repo: '10-11-2026-Small-Molecule-Designs-and-LLM-Fine-Tune' });
  assert.deepEqual(repoOf('git@github.com:a-b/c.d.git'), { owner: 'a-b', repo: 'c.d' });
  assert.throws(() => repoOf('https://gitlab.com/a/b.git'), /not a GitHub remote/);
});
