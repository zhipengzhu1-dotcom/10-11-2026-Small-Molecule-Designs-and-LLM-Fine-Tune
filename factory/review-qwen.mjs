#!/usr/bin/env node
// Cross-family review of a decision trail by the local Ollama qwen3.5:9b (pstack show-me-your-work).
// The files are sent in one chat message, each under a "=== <path> ===" line, so the first file
// should hold the instructions. Thinking is always off: with it on, qwen can spend its whole
// output budget thinking and return nothing. An empty answer is an error, never a review.
//
//   npm run review:qwen -- <file>... [--out <review.md>] [--model qwen3.5:9b]
//                          [--host http://127.0.0.1:11434] [--num-ctx 65536]
//
// The review is written (to --out, else stdout) under a "reviewed by <model>" line, the line the
// trail check reads. --out writes UTF-8, which a PowerShell 5.1 redirect does not.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL = 'qwen3.5:9b';
const HOST = 'http://127.0.0.1:11434';
// The s1 trail review (factory/audit/99ae39b6-...review.md) needed about 50K prompt tokens.
const NUM_CTX = 65536;

// files: [{ path, text }]. Returns the model's answer.
export async function review({ files, model = MODEL, host = HOST, numCtx = NUM_CTX, fetch = globalThis.fetch }) {
  const content = files.map((f) => `=== ${f.path} ===\n${f.text}`).join('\n\n');
  const res = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      stream: false,
      think: false,
      options: { num_ctx: numCtx },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const answer = data.message?.content?.trim();
  if (!answer) throw new Error(`${model} returned an empty answer (done_reason ${data.done_reason}, ${data.eval_count ?? '?'} tokens)`);
  return answer;
}

function parseArgs(argv) {
  const opts = { paths: [] };
  const flags = { '--out': 'out', '--model': 'model', '--host': 'host', '--num-ctx': 'numCtx' };
  for (let i = 0; i < argv.length; i++) {
    if (flags[argv[i]]) {
      if (i + 1 >= argv.length) throw new Error(`${argv[i]} needs a value`);
      opts[flags[argv[i]]] = argv[++i];
    } else opts.paths.push(argv[i]);
  }
  if (opts.numCtx) opts.numCtx = Number(opts.numCtx);
  return opts;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { paths, out, ...opts } = parseArgs(process.argv.slice(2));
    if (!paths.length) throw new Error('usage: npm run review:qwen -- <file>... [--out <review.md>]');
    const files = paths.map((path) => ({ path, text: readFileSync(path, 'utf8') }));
    const text = `reviewed by ${opts.model ?? MODEL}\n\n${await review({ files, ...opts })}\n`;
    if (out) writeFileSync(out, text);
    else process.stdout.write(text);
  } catch (err) {
    process.stderr.write(`review-qwen.mjs: ${err.message}\n`);
    process.exit(1);
  }
}
