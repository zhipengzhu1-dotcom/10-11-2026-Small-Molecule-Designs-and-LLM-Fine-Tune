#!/usr/bin/env node
// Event reader. Merges every activity file under <root>/factory/agents/ and the decision log
// <root>/factory/decisions.tsv into one stream, the files merged by ts with each file kept in its
// own order (mergeByTs). Tests and the dashboard read this.
//
//   node factory/read.mjs [--root <repo>]      prints the stream as JSON lines
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli } from './cli.mjs';
import { defaultRoot } from './log.mjs';

export function readStream(root = defaultRoot()) {
  const files = [];
  const agentsDir = join(root, 'factory', 'agents');
  if (existsSync(agentsDir)) {
    for (const run of readdirSync(agentsDir, { withFileTypes: true })) {
      if (!run.isDirectory()) continue;
      for (const f of readdirSync(join(agentsDir, run.name))) {
        if (f.endsWith('.jsonl')) files.push(readActivity(join(agentsDir, run.name, f), run.name, f.slice(0, -6)));
      }
    }
  }
  const decisions = join(root, 'factory', 'decisions.tsv');
  if (existsSync(decisions)) files.push(readDecisions(decisions));
  return mergeByTs(files);
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
    return dropLegacy(e);
  });
}

// agent.stop events written before issue #21 also carry `transcript`, the subagent's transcript
// path. It isn't in the contract and follows from run and agent, so the stream leaves it out
// (issue #62). The activity files keep it: they are append-only.
function dropLegacy(e) {
  if (e.type !== 'agent.stop' || !('transcript' in e)) return e;
  const { transcript: _, ...rest } = e;
  return rest;
}

// Merges the files by ts, but never reorders a file: each one is append-only, so its own order is
// the truth, and only the files' heads are compared. Order between files is for reading; the node
// model takes order across agents from dispatches and receipts (graph/causal.mjs), and reads ts
// only where one clock wrote both sides: the orchestrator's activity files and the decision log.
function mergeByTs(files) {
  const heads = files.map(() => 0);
  const at = (f) => Date.parse(files[f][heads[f]].ts);
  const out = [];
  for (;;) {
    let next = -1;
    for (let f = 0; f < files.length; f++) {
      if (heads[f] < files[f].length && (next < 0 || at(f) < at(next))) next = f;
    }
    if (next < 0) return out;
    out.push(files[next][heads[next]++]);
  }
}

cli(import.meta.url, { usage: 'node factory/read.mjs [--root <repo>]', options: { root: 'string' } }, ({ root = defaultRoot() }) => {
  for (const e of readStream(root)) process.stdout.write(JSON.stringify(e) + '\n');
});
