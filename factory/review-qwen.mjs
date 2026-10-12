#!/usr/bin/env node
// Cross-family review of a decision trail by the local Ollama qwen3.5:9b (pstack show-me-your-work).
// The prompt and the files go in one chat message: the prompt first, then each file under a
// "=== <path> ===" line. Thinking is always off: with it on, qwen can spend its whole output
// budget thinking and return nothing. An empty answer is an error, never a review.
//
//   npm run review:qwen -- <prompt> <file>... [--out <review.md>] [--model qwen3.5:9b]
//                                   [--host http://127.0.0.1:11434] [--num-ctx 65536]
//
// The review is written (to --out, else stdout) under a "reviewed by <model>" line, the line the
// trail check reads. --out writes UTF-8, which a PowerShell 5.1 redirect does not.
import { readFileSync, writeFileSync } from 'node:fs';
import { cli, UsageError } from './cli.mjs';

export const MODEL = 'qwen3.5:9b';
const HOST = 'http://127.0.0.1:11434';
// The s1 trail review (factory/audit/99ae39b6-...review.md) needed about 50K prompt tokens.
const NUM_CTX = 65536;

// prompt: the instructions, sent ahead of the files. files: [{ path, text }]. Returns the answer.
export async function review({ prompt, files, model = MODEL, host = HOST, numCtx = NUM_CTX, fetch = globalThis.fetch }) {
  const content = [...(prompt ? [prompt] : []), ...files.map((f) => `=== ${f.path} ===\n${f.text}`)].join('\n\n');
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

cli(import.meta.url, {
  usage: 'node factory/review-qwen.mjs <prompt> <file>... [--out <review.md>] [--model <model>] [--host <url>] [--num-ctx <tokens>]',
  options: { out: 'string', model: 'string', host: 'string', 'num-ctx': 'string' },
  positionals: true,
}, async ({ positionals: [prompt, ...paths], out, model = MODEL, host, 'num-ctx': numCtx }) => {
  if (!prompt) throw new UsageError('missing the prompt');
  if (!paths.length) throw new UsageError('missing the files to review');
  if (numCtx !== undefined && !/^[1-9]\d*$/.test(numCtx)) throw new UsageError(`--num-ctx takes a whole number, got ${numCtx}`);
  const files = paths.map((path) => ({ path, text: readFileSync(path, 'utf8') }));
  const answer = await review({ prompt, files, model, host, numCtx: numCtx && Number(numCtx) });
  const text = `reviewed by ${model}\n\n${answer}\n`;
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
});
