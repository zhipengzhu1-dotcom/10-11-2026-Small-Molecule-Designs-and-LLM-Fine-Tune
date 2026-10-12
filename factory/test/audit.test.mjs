import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FACTORY, tempRoot } from './helpers.mjs';

const AUDIT = join(FACTORY, 'audit.mjs');

// Pointer checks read git history, so these tests need git (the Docker CI image has it).
const hasGit = spawnSync('git', ['--version']).status === 0;
const t = (name, fn) => test(name, { skip: !hasGit && 'git is not installed' }, fn);

const row = (...cells) => cells.join('\t') + '\n';
const LOG = row('ts', 'phase', 'decision', 'why', 'evidence', 'result')
  + row('2026-10-11T09:45:00Z', 'project/a', 'fetched the source', 'tables need it',
    '~/.claude/projects/x/sess-1.jsonl @09:44:58Z; notes/source.md', 'done')
  + row('2026-10-11T10:05:00Z', 'project/b', 'picked 3 epochs', 'the paper says 5',
    '~/.claude/projects/x/sess-1.jsonl @10:04:58Z; notes/source.md:2', 'adopted');

const entry = (timestamp, type, content) => JSON.stringify({ type, timestamp, message: { content } }) + '\n';

function put(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

function git(root, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', root, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

// A repo with a committed two-row decision log, and the transcript of the session that logged it.
function fixture() {
  const root = tempRoot();
  git(root, 'init', '-q');
  put(root, 'notes/source.md', 'line one\nline two\n');
  put(root, 'factory/decisions.tsv', LOG);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'log');
  const transcripts = join(root, 'transcripts');
  put(root, 'transcripts/sess-1.jsonl', [
    entry('2026-10-11T09:40:00.000Z', 'user', 'an old message'),
    entry('2026-10-11T09:48:30.000Z', 'user', 'the epochs question first came up'),
    entry('2026-10-11T09:55:12.345Z', 'user', 'use 3 epochs, not 5'),
    entry('2026-10-11T10:00:01.000Z', 'assistant', [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }]),
    entry('2026-10-11T10:06:00.000Z', 'user', 'a later message'),
  ].join(''));
  return { root, transcripts };
}

function audit({ root, transcripts }, ...args) {
  return spawnSync(process.execPath, [AUDIT, ...args, '--root', root, '--transcripts', transcripts], { encoding: 'utf8' });
}

// The lead-up to a decision can run longer than any fixed window (row 94 of the real log cites
// a pick made 28 minutes before it), so show starts where the session's previous row left off.
t('show prints the row and its session since the session\'s previous row, each line with its pointer', () => {
  const r = audit(fixture(), 'show', '3');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /picked 3 epochs/);
  assert.match(r.stdout, /transcript:sess-1@2026-10-11T09:48:30 user: the epochs question first came up/);
  assert.match(r.stdout, /transcript:sess-1@2026-10-11T09:55:12 user: use 3 epochs, not 5/);
  assert.match(r.stdout, /transcript:sess-1@2026-10-11T10:00:01 tool Bash: npm test/);
  assert.doesNotMatch(r.stdout, /an old message|a later message/);
});

const auditOf = (root) => readFileSync(join(root, 'factory', 'audit', 'sess-1.tsv'), 'utf8');

t('add writes an ok verdict to the session\'s audit file, with the row\'s ts filled in', () => {
  const f = fixture();
  const r = audit(f, 'add', '3', 'ok', '--pointers', 'transcript:sess-1@2026-10-11T09:55:12; file:notes/source.md:2',
    '--note', 'The user picked 3 epochs\tat 09:55.');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(auditOf(f.root), row('line', 'ts', 'verdict', 'superseded_by', 'pointers', 'note')
    + row('3', '2026-10-11T10:05:00Z', 'ok', '', 'transcript:sess-1@2026-10-11T09:55:12; file:notes/source.md:2', 'The user picked 3 epochs at 09:55.'));
});

t('add refuses a pointer that does not resolve and writes nothing', () => {
  const f = fixture();
  const r = audit(f, 'add', '3', 'ok', '--pointers', 'transcript:sess-1@2026-10-11T09:59:59; file:notes/source.md:9', '--note', 'n');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /transcript:sess-1@2026-10-11T09:59:59 has no line at that time/);
  assert.match(r.stderr, /file:notes\/source\.md:9 is past the end/);
  assert.ok(!existsSync(join(f.root, 'factory', 'audit', 'sess-1.tsv')));
});

// Answers like Ollama's /api/chat and records each request body.
async function fakeOllama(content) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      seen.push(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ message: { role: 'assistant', content }, done_reason: 'stop' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { host: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise((r) => server.close(r)) };
}

const auditAsync = ({ root, transcripts }, ...args) => new Promise((resolve) => {
  const p = spawn(process.execPath, [AUDIT, ...args, '--root', root, '--transcripts', transcripts]);
  let stderr = '';
  p.stderr.on('data', (d) => (stderr += d));
  p.on('close', (status) => resolve({ status, stderr }));
});

t('review sends the audited rows, the audit and the session digest to qwen, and the trail check then passes', async () => {
  const ollama = await fakeOllama('- No flags.');
  try {
    const f = fixture();
    assert.equal(audit(f, 'add', '2', 'ok', '--pointers', 'transcript:sess-1@2026-10-11T09:40:00', '--note', 'matches').status, 0);
    assert.equal(audit(f, 'add', '3', 'ok', '--pointers', 'transcript:sess-1@2026-10-11T09:55:12', '--note', 'matches').status, 0);
    const r = await auditAsync(f, 'review', '--run', 'sess-1', '--host', ollama.host);
    assert.equal(r.status, 0, r.stderr);

    const sent = ollama.seen[0].messages[0].content;
    assert.match(sent, /line 3\t2026-10-11T10:05:00Z\tproject\/b\tpicked 3 epochs/);
    assert.match(sent, /=== factory\/audit\/sess-1\.tsv ===\nline\tts/);
    assert.match(sent, /user: use 3 epochs, not 5/);
    const text = readFileSync(join(f.root, 'factory', 'audit', 'sess-1.review.md'), 'utf8');
    assert.match(text, /^reviewed by qwen3\.5:9b$/m);
    assert.match(text, /- No flags\./);

    const check = spawnSync(process.execPath, [join(FACTORY, 'checks', 'trail.mjs'), '--root', f.root, '--run', 'run-1',
      '--agent', 'auditor', '--transcripts', f.transcripts], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stdout + check.stderr);
  } finally {
    await ollama.close();
  }
});
