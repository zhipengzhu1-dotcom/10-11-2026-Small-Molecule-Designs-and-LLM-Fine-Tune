#!/usr/bin/env node
// A stand-in for Ollama's /api/chat, for tests that run a CLI calling the precedent judge: no model.
// It runs as its own process, so a test can drive the CLI with spawnSync while it answers.
//
//   node fake-ollama.mjs [--contradicts <text>]... [--log <file>]
//
// Prints its base URL on the first stdout line. Answers each chat as the judge would, with
// `contradicts` when the prompt holds any --contradicts text, else `consistent`, and appends each
// request body to --log as a JSON line.
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { contradicts: { type: 'string', multiple: true, default: [] }, log: { type: 'string' } } });

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    if (values.log) appendFileSync(values.log, body.replace(/\n/g, ' ') + '\n');
    const prompt = JSON.parse(body).messages?.[0]?.content ?? '';
    const verdict = values.contradicts.some((t) => prompt.includes(t)) ? 'contradicts' : 'consistent';
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify({ verdict, why: `fake judge: ${verdict}` }) }, done_reason: 'stop' }));
  });
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`http://127.0.0.1:${server.address().port}\n`));
