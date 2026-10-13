// The digest CLI on a fixture factory root: it reads the stream and prints the dispatch read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTORY, tempRoot } from './helpers.mjs';

const DIGEST = join(FACTORY, 'digest.mjs');
const HEADER = 'ts\tphase\tdecision\twhy\tevidence\tresult';

// A factory root whose decision log holds `rows` ([phase, decision, result], from line 2) and whose
// orchestrator logged one ticket-graph snapshot of spec 52.
function root(rows, tickets = [{ number: 63, state: 'OPEN', status: 'blocked', blockers: [54] }]) {
  const dir = tempRoot();
  mkdirSync(join(dir, 'factory', 'agents', 'r1'), { recursive: true });
  const lines = rows.map(([phase, decision, result], i) => [`2026-10-12T09:${String(i).padStart(2, '0')}:00Z`, phase, decision, 'w', 'e', result].join('\t'));
  writeFileSync(join(dir, 'factory', 'decisions.tsv'), [HEADER, ...lines, ''].join('\n'));
  const snapshot = { ts: '2026-10-12T08:00:00Z', run: 'r1', agent: 'orchestrator', type: 'ticket.graph', spec: 52, tickets };
  writeFileSync(join(dir, 'factory', 'agents', 'r1', 'orchestrator.jsonl'), JSON.stringify(snapshot) + '\n');
  return dir;
}

const digest = (dir, ...args) => spawnSync(process.execPath, [DIGEST, ...args, '--root', dir], { encoding: 'utf8' });

test('the dispatch read prints one line when no standing decision binds the ticket', () => {
  const dir = root([
    ['project/implement-spec/ticket-70', 'the done read counts residual doubt', 'adopted'],
    ['project/implement-spec/ticket-63', 'started #63', 'open'],
  ]);
  const r = digest(dir, 'dispatch', '63');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'dispatch #63: no standing decision binds it (2 rows: 2 in, 0 out, 0 undec)\n');
});

test('the dispatch read lists each binding row by its pointer, why it binds, its claim state and any part out', () => {
  const dir = root([
    ['project/rules', 'tests run on fixtures, never the live log', 'given'],
    ['project/implement-spec/ticket-54', 'decide --closes names a challenge id', 'adopted: merged'],
    ['project/implement-spec/ticket-63', 'the graph module reads events only', 'adopted'],
    ['project/implement-spec/ticket-63', 'supersedes line 4 (part): it also takes a ticket-graph snapshot', 'adopted'],
    ['project/implement/push', 'push after each merge', 'given'],
    ['project/implement/push', 'withdraws line 6: no standing push consent', 'adopted'],
  ]);
  const r = digest(dir, 'dispatch', '#63');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, [
    'dispatch #63: 4 standing decisions bind it',
    '  row:2 given: tests run on fixtures, never the live log',
    '  row:3 blocker #54, adopted: decide --closes names a challenge id',
    '  row:4 #63, adopted, part out (row:5): the graph module reads events only',
    '  row:5 #63, adopted: it also takes a ticket-graph snapshot',
    '',
  ].join('\n'));
});

test('a long dispatch read stops at 15 lines, the last one naming the command for the rest', () => {
  const rules = Array.from({ length: 20 }, (_, i) => ['project/rules', `rule ${i + 1}`, 'given']);
  const dir = root(rules);
  const lines = digest(dir, 'dispatch', '63').stdout.trimEnd().split('\n');
  assert.equal(lines.length, 15);
  assert.equal(lines[0], 'dispatch #63: 20 standing decisions bind it');
  assert.equal(lines[13], '  row:14 given: rule 13');
  assert.equal(lines[14], '+7 more: npm run digest -- dispatch 63 --all');
  const all = digest(dir, 'dispatch', '63', '--all').stdout.trimEnd().split('\n');
  assert.equal(all.length, 21);
});

test('a long decision is cut so each line stays short', () => {
  const dir = root([['project/rules', `rule ${'x'.repeat(300)}`, 'given']]);
  const [, line] = digest(dir, 'dispatch', '63').stdout.split('\n');
  assert.ok(line.length <= 120, line);
  assert.ok(line.endsWith('…'), line);
});

test('the digest never writes: the factory root is the same after a read', () => {
  const dir = root([['project/rules', 'a rule', 'given']]);
  const before = readdirSync(join(dir, 'factory'), { recursive: true }).sort();
  assert.equal(digest(dir, 'dispatch', '63').status, 0);
  assert.deepEqual(readdirSync(join(dir, 'factory'), { recursive: true }).sort(), before);
});

// A factory root that is a git repo whose branch holds a `Merge #<n>: ...` commit per [n, second]
// (committed at 2026-10-12T09:00:<second>Z), and whose orchestrator logged a snapshot of spec 52
// and then dispatched each [ticket, second].
function frontierRoot({ tickets, dispatches, merges, rows = [] }) {
  const dir = root(rows, tickets);
  const at = (s) => `2026-10-12T09:00:${String(s).padStart(2, '0')}Z`;
  const git = (input, ...args) => {
    const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', input });
    assert.equal(r.status, 0, r.stderr);
  };
  // One fast-import builds the whole history: spawning git per commit is slow on Windows.
  const commit = (mark, branch, s, message, parents) => [
    `commit refs/heads/${branch}`, `mark :${mark}`, `committer t <t@example.com> ${Date.parse(at(s)) / 1000} +0000`,
    `data ${Buffer.byteLength(message)}`, message, ...parents.map((p, i) => `${i ? 'merge' : 'from'} :${p}`), '',
  ].join('\n');
  let main = 1;
  const stream = [commit(1, 'main', 0, 'base', [])];
  merges.forEach(([n, s], i) => {
    stream.push(commit(2 * i + 2, `t${n}`, s, `work on #${n}`, [main]));
    stream.push(commit(2 * i + 3, 'main', s, `Merge #${n}: ticket ${n}`, [main, 2 * i + 2]));
    main = 2 * i + 3;
  });
  git(undefined, 'init', '-q', '-b', 'main');
  git(stream.join('\n'), 'fast-import', '--quiet');
  const lines = dispatches.map(([ticket, s]) => JSON.stringify({ ts: at(s), run: 'r1', agent: 'orchestrator', type: 'dispatch', to: `a${ticket}`, role: 'implementer', ticket, description: `implementer #${ticket} x`, tool_use_id: `t${s}` }));
  writeFileSync(join(dir, 'factory', 'agents', 'r1', 'orchestrator.jsonl'), readFileSync(join(dir, 'factory', 'agents', 'r1', 'orchestrator.jsonl'), 'utf8') + lines.join('\n') + '\n');
  return dir;
}

const SPEC52 = {
  tickets: [
    { number: 63, state: 'OPEN', status: 'ready', blockers: [] },
    { number: 59, state: 'OPEN', status: 'ready', blockers: [] },
    { number: 67, state: 'OPEN', status: 'blocked', blockers: [63, 59] },
    { number: 70, state: 'OPEN', status: 'blocked', blockers: [67] },
  ],
  dispatches: [[63, 1], [59, 2], [67, 5]],
  merges: [[59, 4], [63, 10]], // #67 started at 5, before #63's merge commit at 10
};

test('the frontier read lists the zero-slack tickets and each start before a blocker\'s merge commit that no row explains', () => {
  const dir = frontierRoot(SPEC52);
  const r = digest(dir, 'frontier', '52');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, [
    'frontier #52: 2 open tickets, 2 with zero slack, 1 undocumented early start',
    '  zero slack (critical path of 2): #67 #70',
    '  early start #67: started at event:r1/orchestrator:4, before #63 merged (2026-10-12T09:00:10Z)',
    '',
  ].join('\n'));
});

test('the frontier read is one line when every early start has a standing row that explains it', () => {
  const dir = frontierRoot({ ...SPEC52, rows: [['project/implement-spec/ticket-67', 'started #67 before #63 merged: its interface is fixed', 'adopted']] });
  const r = digest(dir, 'frontier', '52');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'frontier #52: 2 open tickets; no early start, hand-back or stop to flag; zero slack (critical path of 2): #67 #70\n');
});

test('the frontier read says so when spec has no ticket-graph snapshot, or every ticket merged', () => {
  const dir = frontierRoot({ ...SPEC52, merges: [[59, 4], [63, 10], [67, 11], [70, 12]] });
  assert.equal(digest(dir, 'frontier', '52').stdout, [
    'frontier #52: every ticket merged, 1 undocumented early start',
    '  early start #67: started at event:r1/orchestrator:4, before #63 merged (2026-10-12T09:00:10Z)',
    '',
  ].join('\n'));
  assert.equal(digest(dir, 'frontier', '1').stdout, 'frontier #1: no ticket-graph snapshot of spec #1; run npm run frontier -- 1 first\n');
});

// A finished run of spec 52 (#63, then #70, each merged), whose snapshot lists stories 1 and 2: the
// story map backs 1 with the stories check and 2 with a test, and the run logged both passing.
// `extra` adds activity events [agent, event] and map rows after those.
function doneRoot({ extra = [], map = [], rows = [] } = {}) {
  const dir = frontierRoot({
    tickets: [{ number: 63, state: 'OPEN', status: 'ready', blockers: [] }, { number: 70, state: 'OPEN', status: 'blocked', blockers: [63] }],
    dispatches: [[63, 1], [70, 5]],
    merges: [[63, 4], [70, 8]],
    rows,
  });
  const agents = join(dir, 'factory', 'agents', 'r1');
  const file = (agent) => join(agents, `${agent}.jsonl`);
  const orchestrator = readFileSync(file('orchestrator'), 'utf8').split('\n');
  orchestrator[0] = JSON.stringify({ ...JSON.parse(orchestrator[0]), stories: [1, 2] });
  writeFileSync(file('orchestrator'), orchestrator.join('\n'));
  mkdirSync(join(agents, 'tests'));
  writeFileSync(join(agents, 'tests', 'orchestrator-1.tsv'), 'test\tresult\nlabels are grounded\tpass\n');
  const events = [
    ['orchestrator', { type: 'check', name: 'stories', result: 'pass', evidence: 'e' }],
    ['orchestrator', { type: 'artifact', path: 'factory/agents/r1/tests/orchestrator-1.tsv', kind: 'test-results', tests: '1', pass: '1', fail: '0', skip: '0' }],
    ...extra,
  ];
  events.forEach(([agent, e], i) => {
    writeFileSync(file(agent), (existsSync(file(agent)) ? readFileSync(file(agent), 'utf8') : '') + JSON.stringify({ ts: `2026-10-12T09:01:${String(i).padStart(2, '0')}Z`, run: 'r1', agent, ...e }) + '\n');
  });
  mkdirSync(join(dir, 'factory', 'stories'));
  const tsv = ['story\tkind\tname', '1\tcheck\tstories', '2\ttest\tlabels are grounded', ...map.map((r) => r.join('\t')), ''];
  writeFileSync(join(dir, 'factory', 'stories', '52.tsv'), tsv.join('\n'));
  return dir;
}

test('the done read on a clean fixture run prints one line', () => {
  const r = digest(doneRoot(), 'done', '52');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'done #52: residual doubt 0: all 2 stories have passing evidence, no open challenge, no undec row, the run completed properly\n');
});

test('the done read lists stories with no evidence, open challenges, undec rows and whether the run completed properly', () => {
  const dir = doneRoot({
    map: [['3', 'none', '-'], ['4', 'test', 'never run']],
    extra: [
      ['orchestrator', { type: 'check', name: 'stories', result: 'fail', evidence: 'story 2 names a missing test' }],
      ['a70', { type: 'agent.stop', role: 'general-purpose', status: 'ISSUES', report: 'ISSUES\nthe done read misses #73' }],
      ['orchestrator', { type: 'challenge', id: 'c1', target: 'file:factory/graph.mjs', kind: 'undercut', why: 'the graph changed after the last test run' }],
    ],
    rows: [['project/x', 'withdraws line 3: option A', 'adopted'], ['project/x', 'withdraws line 2: option B', 'adopted']],
  });
  const r = digest(dir, 'done', '52');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, [
    'done #52: residual doubt 5: 3 of 4 stories without passing evidence, 3 open challenges, 2 undec rows, the run completed properly',
    '  no evidence (none row): 3',
    '  evidence never run: 4',
    '  story 1 failing: check stories fail (event:r1/orchestrator:6)',
    '  event:r1/a70:1 rebut stop on issue:70: the done read misses #73',
    '  c1 undercut challenge on file:factory/graph.mjs: the graph changed after the last test run',
    '  undec row:2: option A',
    '  undec row:3: option B',
    '',
  ].join('\n'));
});

// A factory root whose activity files hold `events` (each filed under its own run and agent) and
// whose decision log holds `rows` ([decision, evidence], from line 2).
function streamRoot(events, rows = []) {
  const dir = tempRoot();
  const files = new Map();
  for (const e of events) {
    const file = join(dir, 'factory', 'agents', e.run, `${e.agent}.jsonl`);
    files.set(file, (files.get(file) ?? '') + JSON.stringify(e) + '\n');
  }
  for (const [file, text] of files) {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
  }
  const lines = rows.map(([decision, evidence], i) => [`2026-10-12T10:${String(i).padStart(2, '0')}:00Z`, 'project/x', decision, 'w', evidence, 'adopted'].join('\t'));
  writeFileSync(join(dir, 'factory', 'decisions.tsv'), [HEADER, ...lines, ''].join('\n'));
  return dir;
}
const at = (s) => `2026-10-12T09:${String(s).padStart(2, '0')}:00.000Z`;
const o = (s, type, fields) => ({ ts: at(s), run: 'r1', agent: 'orchestrator', type, ...fields });
const a = (s, agent, type, fields) => ({ ts: at(s), run: 'r1', agent, type, ...fields });
const snapshot = o(0, 'ticket.graph', { spec: 52, tickets: [{ number: 66, state: 'OPEN', status: 'ready', blockers: [] }] });

test('the frontier read prints one line when every hand-back was acted on and every lifecycle replays clean', () => {
  const dir = streamRoot([
    snapshot,
    o(1, 'dispatch', { to: 'a1', role: 'implementer', ticket: 66, description: 'implementer #66 causal order' }),
    a(2, 'a1', 'agent.start', { role: 'general-purpose', parent: 'orchestrator' }),
    a(3, 'a1', 'agent.stop', { role: 'general-purpose', status: 'PASS', report: 'PASS: done' }),
  ], [['merged #66', 'agent:a1']]);
  const r = digest(dir, 'frontier', '52');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'frontier #52: 1 open ticket; no early start, hand-back or stop to flag; zero slack (critical path of 1): #66\n');
});

test('the frontier read lists the hand-backs nobody acted on, ISSUES and BLOCKED first, then orphaned and doubled stops', () => {
  const dir = streamRoot([
    snapshot,
    o(1, 'dispatch', { to: 'a1', role: 'implementer', ticket: 66, description: 'implementer #66 causal order' }),
    o(2, 'dispatch', { to: 'a2', role: 'audit', description: 'audit #- trail rows' }),
    a(3, 'a2', 'agent.start', { role: 'general-purpose', parent: 'orchestrator' }),
    a(4, 'a2', 'agent.stop', { role: 'general-purpose', status: 'PASS', report: 'PASS\nall rows audited' }),
    a(5, 'a2', 'agent.stop', { role: 'general-purpose', status: 'PASS' }), // a stop from before reports were logged
    a(6, 'a1', 'agent.start', { role: 'general-purpose', parent: 'orchestrator' }),
    a(7, 'a1', 'agent.stop', { role: 'general-purpose', status: 'ISSUES', report: 'ISSUES (2 of 3 boxes): the merge test fails on Windows\nmore' }),
  ]);
  const r = digest(dir, 'frontier', '52');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, [
    'frontier #52: 1 open ticket, 1 with zero slack, 3 hand-backs not acted on, 1 orphaned or doubled stop',
    '  zero slack (critical path of 1): #66',
    '  event:r1/a1:2 ISSUES, implementer #66: the merge test fails on Windows',
    '  event:r1/a2:2 PASS, audit #-: all rows audited',
    '  event:r1/a2:3 PASS, audit #-',
    '  event:r1/a2:3 doubled stop of agent a2',
    '',
  ].join('\n'));
});

test('the done read names the gap when the snapshot lists no stories, and an unmerged ticket as an improper end', () => {
  const dir = frontierRoot({ tickets: [{ number: 63, state: 'OPEN', status: 'ready', blockers: [] }], dispatches: [[63, 1]], merges: [] });
  assert.equal(digest(dir, 'done', '52').stdout, [
    'done #52: residual doubt 0: no story known, no open challenge, no undec row, the run did not complete properly',
    '  story list: not in the snapshot; run npm run frontier -- 52 so a story missing from the map shows',
    '  not complete: unmerged #63',
    '',
  ].join('\n'));
  assert.equal(digest(dir, 'done', '1').stdout, 'done #1: no ticket-graph snapshot of spec #1; run npm run frontier -- 1 first\n');
});

test('an unknown moment or a missing ticket number is a usage error', () => {
  const dir = root([]);
  assert.equal(digest(dir, 'someday').status, 2);
  assert.equal(digest(dir, 'dispatch').status, 2);
  assert.equal(digest(dir, 'dispatch', 'x').status, 2);
});
