import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contextTokens, digest, latestSession, latestUsage, transcriptsDir } from '../transcript.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const SESSION = join(FACTORY, 'test', 'fixtures', 'transcript-session.jsonl');

test('latestUsage returns the token usage of the last real assistant message, skipping API errors and a half-written line', () => {
  assert.deepEqual(latestUsage(SESSION), {
    input_tokens: 5, cache_creation_input_tokens: 300, cache_read_input_tokens: 21200, output_tokens: 7,
  });
});

test('latestUsage and contextTokens skip sidechain (subagent) replies; context is input plus cache read plus cache creation', () => {
  const file = join(FACTORY, 'test', 'fixtures', 'transcript-meter.jsonl');
  assert.equal(latestUsage(file).cache_read_input_tokens, 148000);
  assert.equal(contextTokens(file), 150507);
  assert.equal(contextTokens(SESSION), 21505);
  assert.equal(contextTokens(join(FACTORY, 'test', 'fixtures', 'transcript-text.jsonl')), null);
});

test('latestUsage is null when no assistant message carries usage', () => {
  assert.equal(latestUsage(join(FACTORY, 'test', 'fixtures', 'transcript-text.jsonl')), null);
});

test('transcriptsDir is the project folder Claude Code names after the checkout path', () => {
  const home = join('h', 'me');
  assert.equal(
    transcriptsDir('C:\\Users\\zhipe\\Desktop\\Claude\\10-11-2026 Research Paper on LLM Fine Tuning', home),
    join(home, '.claude', 'projects', 'C--Users-zhipe-Desktop-Claude-10-11-2026-Research-Paper-on-LLM-Fine-Tuning'),
  );
});

test('latestSession is the most recently written session transcript, ignoring subagent folders', () => {
  const dir = tempRoot();
  const old = join(dir, 'aaaa.jsonl');
  const recent = join(dir, 'bbbb.jsonl');
  writeFileSync(old, '{}\n');
  writeFileSync(recent, '{}\n');
  mkdirSync(join(dir, 'bbbb', 'subagents'), { recursive: true });
  writeFileSync(join(dir, 'bbbb', 'subagents', 'agent-x.jsonl'), '{}\n');
  utimesSync(old, new Date('2026-10-12T05:00:00Z'), new Date('2026-10-12T05:00:00Z'));
  utimesSync(recent, new Date('2026-10-12T04:00:00Z'), new Date('2026-10-12T04:00:00Z'));
  assert.equal(latestSession(dir), 'aaaa');
  assert.equal(latestSession(join(dir, 'missing')), null);
});

test('the CLI prints the digest of a transcript file, or its latest usage with --usage', () => {
  const run = (...args) => spawnSync(process.execPath, [join(FACTORY, 'transcript.mjs'), ...args], { encoding: 'utf8' });
  const text = run(SESSION);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^2026-10-12T04:40:00\.000Z user: Pick the next ticket/);
  assert.equal(text.stdout.trim().split('\n').length, 6);
  const usage = run(SESSION, '--usage');
  assert.equal(usage.status, 0, usage.stderr);
  assert.equal(JSON.parse(usage.stdout).cache_read_input_tokens, 21200);
  assert.equal(run(join(FACTORY, 'test', 'fixtures', 'no-such.jsonl')).status, 2);
});

test('digest gives one timestamped line per user message, assistant text and tool call, and drops tool results', () => {
  assert.deepEqual(digest(SESSION), [
    '2026-10-12T04:40:00.000Z user: Pick the next ticket from #1. Then start it.',
    '2026-10-12T04:40:02.000Z assistant: Reading the frontier.',
    '2026-10-12T04:40:03.000Z tool Bash: npm run frontier -- 1',
    '2026-10-12T04:40:06.000Z assistant: #44 is next.',
    '2026-10-12T04:40:07.000Z assistant: API Error: overloaded',
    '2026-10-12T04:40:09.000Z user: Go ahead.',
  ]);
});
