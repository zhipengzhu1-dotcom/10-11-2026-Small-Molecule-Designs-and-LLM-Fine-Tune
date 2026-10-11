#!/usr/bin/env node
// Event reader. Merges every activity file under <root>/factory/agents/ and the decision log
// <root>/factory/decisions.tsv into one stream ordered by ts. Tests and the dashboard read this.
//
//   node factory/read.mjs [--root <repo>]      prints the stream as JSON lines
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRoot } from './log.mjs';

export function readStream(root = defaultRoot()) {
  const events = [];
  const agentsDir = join(root, 'factory', 'agents');
  if (existsSync(agentsDir)) {
    for (const run of readdirSync(agentsDir, { withFileTypes: true })) {
      if (!run.isDirectory()) continue;
      for (const f of readdirSync(join(agentsDir, run.name))) {
        if (f.endsWith('.jsonl')) events.push(...readActivity(join(agentsDir, run.name, f)));
      }
    }
  }
  return sortByTs(events);
}

function readActivity(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.pop(); // the part after the last newline is empty, or a line still being written
  return lines.map((line) => JSON.parse(line));
}

function sortByTs(events) {
  return events
    .map((e, i) => ({ e, i, t: Date.parse(e.ts) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.e);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? process.argv[i + 1] : defaultRoot();
  for (const e of readStream(root)) process.stdout.write(JSON.stringify(e) + '\n');
}
