// The digest CLI on a fixture factory root: it reads the stream and prints the dispatch read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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

test('an unknown moment or a missing ticket number is a usage error', () => {
  const dir = root([]);
  assert.equal(digest(dir, 'someday').status, 2);
  assert.equal(digest(dir, 'dispatch').status, 2);
  assert.equal(digest(dir, 'dispatch', 'x').status, 2);
});
