#!/usr/bin/env node
// Fetch page. Lists every open fetch.failed ref and saves a dropped file into that ref's
// raw folder, research/refs/<ref>/raw/, then writes an artifact event for it.
//
//   node factory/fetch-page.mjs [--root <repo>] [--port 4174]
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRoot, writeEvent } from './log.mjs';
import { readStream } from './read.mjs';

export const AGENT = 'fetch-page';

// A fetch.failed event is open until an artifact event for the same ref follows it.
export function openFailures(root) {
  const open = new Map();
  for (const e of readStream(root)) {
    if (e.type === 'fetch.failed') open.set(e.ref, e);
    else if (e.type === 'artifact' && e.ref) open.delete(e.ref);
  }
  return open;
}

export function createFetchPage({ root = defaultRoot() } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/drop') {
      const ref = url.searchParams.get('ref');
      const failure = openFailures(root).get(ref);
      const name = url.searchParams.get('name');
      const body = Buffer.concat(await Array.fromAsync(req));
      const rel = `research/refs/${ref}/raw/${name}`;
      mkdirSync(join(root, 'research', 'refs', ref, 'raw'), { recursive: true });
      writeFileSync(join(root, rel), body);
      writeEvent({ root, run: failure.run, agent: AGENT, type: 'artifact', fields: { path: rel, kind: 'ref', ref } });
      return send(res, 201, 'application/json', JSON.stringify({ path: rel }));
    }
    send(res, 404, 'text/plain', 'not found');
  });
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8` });
  res.end(body);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const root = arg('--root', defaultRoot());
  const server = createFetchPage({ root });
  server.listen(Number(arg('--port', 4174)), '127.0.0.1', () => {
    process.stdout.write(`fetch page: http://127.0.0.1:${server.address().port}/ (root ${root})\n`);
  });
}
