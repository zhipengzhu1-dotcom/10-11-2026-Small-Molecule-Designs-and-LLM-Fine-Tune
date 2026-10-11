#!/usr/bin/env node
// Brief check (issue #11). Every parameter row in the Tier 1 brief must have a paper location and
// a verdict. Writes one check event and exits 0 on pass, 1 on fail.
//
//   node factory/checks/brief.mjs [--root <repo>] [--run <id>] [--agent <id>] [--brief <brief.md>]
//
// --brief defaults to <root>/research/s1/brief.md. Run and agent default to FACTORY_RUN and
// FACTORY_AGENT, else run "manual" and agent "orchestrator".
//
// A parameter table is a Markdown table whose first header cell is "ID". It must also have the
// columns paper location, verdict and assumption (matched by name, case-insensitive; other columns
// may sit anywhere). Each body row is a parameter row and fails, named by ID and line, when:
//   - its location is empty or a placeholder (?, TBD, -)
//   - its verdict is empty or not VERIFIED, NOT VERIFIED or INCONCLUSIVE
//   - its verdict is NOT VERIFIED or INCONCLUSIVE and its assumption is empty
// A brief with no parameter rows fails. Tables whose first header cell isn't "ID" are ignored.
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRoot, writeEvent } from '../log.mjs';

// Claim verdicts from issue #1, written exactly as here.
export const VERDICTS = ['VERIFIED', 'NOT VERIFIED', 'INCONCLUSIVE'];

// A location that stands in for one not yet found: ?, TBD, or a lone dash of any kind.
const PLACEHOLDER = /^(\?+|tbd|[-–—]+)$/i;

function parseArgs(argv, env = process.env) {
  const opts = { root: defaultRoot(env), run: env.FACTORY_RUN || 'manual', agent: env.FACTORY_AGENT || 'orchestrator' };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, '');
    if (!['root', 'run', 'agent', 'brief'].includes(name) || i + 1 >= argv.length) {
      throw new Error(`unknown or incomplete argument: ${argv[i]}`);
    }
    opts[name] = argv[++i];
  }
  opts.brief ??= join(opts.root, 'research', 's1', 'brief.md');
  return opts;
}

// A path inside the repo is shown relative to it; anything else (a test fixture) in full.
function shown(root, path) {
  const rel = relative(root, resolve(path));
  return (rel.startsWith('..') || isAbsolute(rel) ? resolve(path) : rel).replace(/\\/g, '/');
}

// Splits a Markdown table line into trimmed cells. `\|` is a literal pipe inside a cell.
function cells(line) {
  const parts = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/);
  return parts.map((c) => c.replace(/\\\|/g, '|').trim());
}

const isTableLine = (line) => line.trim().startsWith('|');
const isDivider = (line) => /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line.trim());

// Columns a parameter table must have, keyed by the field each fills.
const COLUMNS = { location: 'paper location', verdict: 'verdict', assumption: 'assumption' };

// Reads every table whose first header cell is "ID". Returns its rows as
// { id, location, verdict, assumption, line } and a problem for each such table missing a column.
export function parseBrief(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isTableLine(lines[i]) || !isDivider(lines[i + 1] ?? '')) continue;
    const header = cells(lines[i]).map((h) => h.toLowerCase());
    let end = i + 2;
    while (end < lines.length && isTableLine(lines[end])) end++;
    const start = i;
    i = end - 1;
    if (header[0] !== 'id') continue;
    const missing = Object.values(COLUMNS).filter((name) => !header.includes(name));
    if (missing.length) {
      problems.push(`table at line ${start + 1}: ${missing.map((m) => `no ${m} column`).join(', ')}`);
      continue;
    }
    for (let j = start + 2; j < end; j++) {
      const c = cells(lines[j]);
      const row = { id: c[0], line: j + 1 };
      for (const [field, name] of Object.entries(COLUMNS)) row[field] = c[header.indexOf(name)] ?? '';
      rows.push(row);
    }
  }
  return { rows, problems };
}

// What is wrong with one parameter row, as short phrases; empty when the row is backed.
function rowProblems(row) {
  const problems = [];
  if (!row.location) problems.push('no paper location');
  else if (PLACEHOLDER.test(row.location)) problems.push(`placeholder paper location "${row.location}"`);
  if (!row.verdict) problems.push('no verdict');
  else if (!VERDICTS.includes(row.verdict)) problems.push(`invalid verdict "${row.verdict}"`);
  else if (row.verdict !== 'VERIFIED' && !row.assumption) problems.push(`${row.verdict} with no assumption`);
  return problems;
}

export function runCheck(opts) {
  const { rows, problems } = parseBrief(readFileSync(opts.brief, 'utf8'));
  if (rows.length === 0 && problems.length === 0) problems.push('no parameter rows found');
  for (const r of rows) problems.push(...rowProblems(r).map((p) => `${r.id || '(no ID)'} (line ${r.line}): ${p}`));
  const result = problems.length ? 'fail' : 'pass';
  const where = `${shown(opts.root, opts.brief)}: ${rows.length} parameter rows`;
  const evidence = problems.length ? `${where}; ${problems.join('; ')}` : `${where}; all have a location and a valid verdict`;
  writeEvent({ root: opts.root, run: opts.run, agent: opts.agent, type: 'check', fields: { name: 'brief', result, evidence } });
  return { result, evidence };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { result, evidence } = runCheck(parseArgs(process.argv.slice(2)));
    process.stdout.write(`brief: ${result}: ${evidence}\n`);
    process.exit(result === 'pass' ? 0 : 1);
  } catch (err) {
    process.stderr.write(`brief.mjs: ${err.message}\n`);
    process.exit(2);
  }
}
