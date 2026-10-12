// The merge read (issue #69; spec #52 stories 35, 36 and 40) on a fixture graph, with a fake judge
// injected in place of qwen3.5:4b: no Ollama, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../graph.mjs';
import { mergeRead } from '../merge-read.mjs';

const T0 = Date.parse('2026-10-12T09:00:00Z');
const ev = (s, agent, type, fields = {}) => ({ ts: new Date(T0 + s * 1000).toISOString(), run: 'r1', agent, type, ...fields });
const row = (line, decision, why, result = 'adopted') =>
  ({ ts: '2026-10-12T08:00:00Z', run: null, agent: 'orchestrator', type: 'decision', phase: 'project/x', decision, why, evidence: 'e', result, line });

// One worker's launch for a ticket, its writes, and its hand-back.
const worker = (s, id, ticket, report, status = 'PASS', role = 'implementer') => [
  ev(s, 'orchestrator', 'dispatch', { to: id, role, ticket, description: `${role} #${ticket} x` }),
  ev(s + 1, id, 'agent.start', { role: 'general-purpose' }),
  ev(s + 9, id, 'agent.stop', { role: 'general-purpose', status, report }),
];

const ROWS = [
  row(2, 'tests run on fixtures, never the live decision log', 'the live log grows'),
  row(3, 'the judge model is qwen3.5:4b, local via Ollama', 'it fits 8 GB'),
  row(4, 'supersedes line 3: the judge model is gemma4:e4b via Ollama', 'a second family'),
  row(5, 'fetched the dataset card for the eval tables', 'tables need it'),
  row(6, 'tests never load a model or reach Ollama', 'Docker CI is model-free'),
];

const REPORT = 'PASS. Added the merge read. Its tests read the live decision log, and they call the judge model through Ollama.';

function fixture(extra = []) {
  return buildGraph([
    ...ROWS,
    ...worker(10, 'impl', 17, REPORT),
    ...worker(30, 'other', 18, 'PASS. Fetched the dataset card for the eval tables.'),
    ...extra,
  ].sort((a, b) => a.ts.localeCompare(b.ts)));
}

// A judge that answers `contradicts` for the earlier rows whose text holds any of `against`.
function fakeJudge(against = []) {
  const calls = [];
  const judge = async (earlier, later) => {
    calls.push({ earlier, later });
    return against.some((s) => earlier.text.includes(s)) ? { verdict: 'contradicts', why: 'the report breaks it' } : { verdict: 'consistent', why: 'both stand' };
  };
  judge.model = 'fake-judge';
  return { judge, calls };
}

test('a hand-back report contradicting a standing decision is reported with the judge\'s reason', async () => {
  const { judge } = fakeJudge(['fixtures, never the live']);
  const lines = await mergeRead({ graph: fixture(), branch: 'ticket', paths: [], ticket: 17, judge });
  assert.equal(lines[0], 'merge read ticket: 1 report may contradict a standing decision');
  assert.equal(lines[1], '  report event:r1/impl:2 (impl, PASS) may contradict row:2: tests run on fixtures, never the live decision log');
  assert.equal(lines[2], '    judge: the report breaks it');
  assert.equal(lines.length, 3);
});

test('the judge sees each report against its 3 nearest rows that still stand, one call per pair, as a report', async () => {
  const { judge, calls } = fakeJudge();
  await mergeRead({ graph: fixture(), branch: 'ticket', paths: [], ticket: 17, judge });
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => fixture().decision(c.earlier.line).label === 'in'));
  assert.ok(!calls.some((c) => c.earlier.line === 3), 'row 3 is superseded, so out');
  assert.deepEqual(calls[0].later, { text: REPORT, kind: 'report' });
});

test('a clean read is one line', async () => {
  const { judge } = fakeJudge();
  const lines = await mergeRead({ graph: fixture(), branch: 'ticket', paths: ['factory/a.mjs'], ticket: 17, judge });
  assert.deepEqual(lines, ['merge read ticket: clean (1 changed file: none written twice, no stale check; 1 report, no contradiction by fake-judge)']);
});

test('the reports judged are the latest of each agent dispatched for the ticket, or of the agent the branch names', async () => {
  const resumed = [
    ev(50, 'orchestrator', 'dispatch', { to: 'impl', role: 'implementer', ticket: 17, resume: true }),
    ev(51, 'impl', 'agent.start', {}),
    ev(59, 'impl', 'agent.stop', { status: 'PASS', report: 'PASS. Fixed the review findings: the tests run on fixtures now.' }),
  ];
  const seen = async (opts) => {
    const { judge, calls } = fakeJudge();
    await mergeRead({ graph: fixture(resumed), branch: 'b', paths: [], judge, ...opts });
    return [...new Set(calls.map((c) => c.later.text))];
  };
  assert.deepEqual(await seen({ ticket: 17 }), ['PASS. Fixed the review findings: the tests run on fixtures now.']);
  assert.deepEqual(await seen({ agents: ['other'] }), ['PASS. Fetched the dataset card for the eval tables.']);
  assert.deepEqual(await seen({}), []);
});

test('files written twice and stale checks among the changed files are listed, each on its line', async () => {
  const { judge } = fakeJudge();
  const graph = fixture([
    ev(12, 'impl', 'artifact', { path: 'factory/a.mjs', kind: 'code' }),
    ev(13, 'orchestrator', 'check', { name: 'tests', result: 'pass', evidence: 'factory/a.mjs 4/4' }),
    // impl is resumed after the check, so its next write provably comes after it
    ev(14, 'orchestrator', 'dispatch', { to: 'impl', role: 'implementer', ticket: 17, resume: true }),
    ev(15, 'impl', 'agent.start', { role: 'general-purpose' }),
    ev(16, 'impl', 'artifact', { path: 'factory/a.mjs', kind: 'code' }),
    ev(17, 'other', 'artifact', { path: 'factory/b.mjs', kind: 'code' }),
    ev(18, 'impl', 'artifact', { path: 'factory/b.mjs', kind: 'code' }),
    ev(20, 'other', 'artifact', { path: 'factory/elsewhere.mjs', kind: 'code' }),
    ev(21, 'impl', 'artifact', { path: 'factory/elsewhere.mjs', kind: 'code' }),
  ]);
  const lines = await mergeRead({ graph, branch: 'ticket', paths: ['factory/a.mjs', 'factory/b.mjs'], ticket: 17, judge });
  assert.deepEqual(lines, [
    'merge read ticket: 1 file written twice, 1 stale check',
    '  written twice: factory/b.mjs, by other and impl (event:r1/other:1, event:r1/impl:5)',
    '  stale check: tests (pass, event:r1/orchestrator:2) ran before factory/a.mjs last changed (event:r1/impl:4)',
  ]);
});

test('an unreachable judge is named, its reports listed unjudged, and the provenance lines still shown', async () => {
  const judge = async () => {
    throw new Error('fetch failed (connect ECONNREFUSED 127.0.0.1:11434)');
  };
  Object.assign(judge, { model: 'qwen3.5:4b', host: 'http://127.0.0.1:11434' });
  const graph = fixture([ev(15, 'other', 'artifact', { path: 'factory/b.mjs' }), ev(16, 'impl', 'artifact', { path: 'factory/b.mjs' })]);
  const lines = await mergeRead({ graph, branch: 'ticket', paths: ['factory/b.mjs'], ticket: 17, judge });
  assert.deepEqual(lines, [
    'merge read ticket: 1 file written twice, judge unreachable',
    '  written twice: factory/b.mjs, by other and impl (event:r1/other:1, event:r1/impl:2)',
    '  judge unreachable (qwen3.5:4b at http://127.0.0.1:11434: fetch failed (connect ECONNREFUSED 127.0.0.1:11434)); 1 report unjudged:',
    '    report event:r1/impl:3 (impl, PASS)',
  ]);
});

test('a long read is cut to 15 lines, the last naming the command that prints it all', async () => {
  const { judge } = fakeJudge();
  const many = Array.from({ length: 20 }, (_, i) => [
    ev(100 + 2 * i, 'a', 'artifact', { path: `f${i}.md` }),
    ev(101 + 2 * i, 'b', 'artifact', { path: `f${i}.md` }),
  ]).flat();
  const paths = many.map((e) => e.path);
  const lines = await mergeRead({ graph: fixture(many), branch: 'ticket', paths, judge });
  assert.equal(lines.length, 15);
  assert.equal(lines.at(-1), '+7 more: npm run merge -- ticket --read --all');
  assert.equal((await mergeRead({ graph: fixture(many), branch: 'ticket', paths, judge, all: true })).length, 21);
});
