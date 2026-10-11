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
        if (f.endsWith('.jsonl')) events.push(...readActivity(join(agentsDir, run.name, f), run.name, f.slice(0, -6)));
      }
    }
  }
  const decisions = join(root, 'factory', 'decisions.tsv');
  if (existsSync(decisions)) events.push(...readDecisions(decisions));
  return sortByTs(events);
}

// show-me-your-work format: header ts phase decision why evidence result, one row per decision.
// Only the orchestrator writes it, and it has no run column, so decision events carry run: null.
// Each carries `line`, its line number in the file, which is how the audit and later rows cite it.
const COLUMNS = ['ts', 'phase', 'decision', 'why', 'evidence', 'result'];

function readDecisions(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const events = [];
  lines.forEach((line, i) => {
    if (i === 0 || line === '') return;
    if (line === COLUMNS.join('\t')) return; // log.sh can repeat the header; see its comments
    const cells = line.split('\t');
    if (cells.length !== COLUMNS.length) throw new Error(`${file}:${i + 1}: expected ${COLUMNS.length} cells, got ${cells.length}`);
    const [ts, ...rest] = cells;
    const e = { ts, run: null, agent: 'orchestrator', type: 'decision' };
    COLUMNS.slice(1).forEach((k, j) => (e[k] = rest[j]));
    e.line = i + 1;
    events.push(e);
  });
  return events;
}

// Each event must sit in its own agent's file: factory/agents/<run>/<agent>.jsonl.
function readActivity(file, run, agent) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.pop(); // the part after the last newline is empty, or a line still being written
  return lines.map((line, i) => {
    const where = `${file}:${i + 1}`;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      throw new Error(`${where}: corrupt line: ${line.slice(0, 80)}`);
    }
    if (e.agent !== agent) throw new Error(`${where}: event agent ${e.agent} does not match its file`);
    if (e.run !== run) throw new Error(`${where}: event run ${e.run} does not match its folder`);
    return e;
  });
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
