import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { review } from '../review-qwen.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

// A stand-in for fetch that records each request and answers like Ollama's /api/chat.
function fakeOllama(answer) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => answer };
  };
  return { fetch, requests };
}

const FILES = [
  { path: 'factory/decisions.tsv', text: 'ts\tphase\n2026-10-12T04:49:37Z\tproject/plan' },
  { path: 'digest.txt', text: '04:49 user: go' },
];

test('review asks local qwen3.5:9b once, with thinking off, and returns its answer', async () => {
  const { fetch, requests } = fakeOllama({ message: { role: 'assistant', content: '- L2: weak evidence.' }, done_reason: 'stop' });
  const text = await review({ files: FILES, fetch });

  assert.equal(text, '- L2: weak evidence.');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:11434/api/chat');
  const body = requests[0].body;
  assert.equal(body.model, 'qwen3.5:9b');
  assert.equal(body.think, false);
  assert.equal(body.stream, false);
  assert.equal(body.messages.length, 1);
  assert.match(body.messages[0].content, /=== factory\/decisions\.tsv ===\nts\tphase\n2026-10-12T04:49:37Z\tproject\/plan/);
  assert.match(body.messages[0].content, /=== digest\.txt ===\n04:49 user: go/);
});

test('review fails loudly on an empty answer instead of returning nothing', async () => {
  const { fetch } = fakeOllama({ message: { role: 'assistant', content: '  ', thinking: 'long thoughts' }, done_reason: 'length', eval_count: 12000 });
  await assert.rejects(review({ files: FILES, fetch }), /empty answer \(done_reason length, 12000 tokens\)/);
});

test('review reports an Ollama HTTP error', async () => {
  const fetch = async () => ({ ok: false, status: 404, text: async () => '{"error":"model \\"qwen3.5:9b\\" not found"}' });
  await assert.rejects(review({ files: FILES, fetch }), /Ollama HTTP 404: .*not found/);
});

test('the CLI sends the named files to the host and writes the review under a "reviewed by" line', async () => {
  const root = tempRoot();
  const trail = join(root, 'trail.tsv');
  writeFileSync(trail, 'ts\tphase\n');
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      seen.push(JSON.parse(body));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ message: { role: 'assistant', content: '- No flags.' }, done_reason: 'stop' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const host = `http://127.0.0.1:${server.address().port}`;
  const out = join(root, 'review.md');
  const status = await new Promise((r) => {
    const p = spawn(process.execPath, [join(FACTORY, 'review-qwen.mjs'), trail, '--host', host, '--out', out]);
    p.on('close', r);
  });
  server.close();

  assert.equal(status, 0);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].think, false);
  assert.match(seen[0].messages[0].content, /trail\.tsv ===\nts\tphase/);
  assert.equal(readFileSync(out, 'utf8'), 'reviewed by qwen3.5:9b\n\n- No flags.\n');
});
