#!/usr/bin/env node
// References check (issue #5). Every key the paper cites must appear in the reference catalog
// with a valid status. Writes one check event and exits 0 on pass, 1 on fail.
//
//   node factory/checks/references.mjs [--root <repo>] [--run <id>] [--agent <id>]
//                                      [--tex <main.tex>] [--catalog <catalog.tsv>]
//
// --tex defaults to <root>/research/s1/raw/arxiv/latex/main.tex and --catalog to
// <root>/research/refs/catalog.tsv. Run and agent default to FACTORY_RUN and FACTORY_AGENT,
// else agent "orchestrator".
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRoot, writeEvent } from '../log.mjs';

// Reference statuses from issue #1.
export const STATUSES = ['arxiv', 'oa', 'closed', 'fetch-pending', 'fetched'];

function parseArgs(argv, env = process.env) {
  const opts = { root: defaultRoot(env), run: env.FACTORY_RUN, agent: env.FACTORY_AGENT || 'orchestrator' };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, '');
    if (!['root', 'run', 'agent', 'tex', 'catalog'].includes(name) || i + 1 >= argv.length) {
      throw new Error(`unknown or incomplete argument: ${argv[i]}`);
    }
    opts[name] = argv[++i];
  }
  opts.tex ??= join(opts.root, 'research', 's1', 'raw', 'arxiv', 'latex', 'main.tex');
  opts.catalog ??= join(opts.root, 'research', 'refs', 'catalog.tsv');
  return opts;
}

// A path inside the repo is shown relative to it; anything else (a test fixture) in full.
function shown(root, path) {
  const rel = relative(root, resolve(path));
  return (rel.startsWith('..') || isAbsolute(rel) ? resolve(path) : rel).replace(/\\/g, '/');
}

// Every key in a \cite-family command (\cite, \citep, \citet, \citeauthor, ... with optional
// [..] arguments) or \nocite, in first-cited order. LaTeX comments are skipped; \% is not one.
export function citedKeys(tex) {
  const body = tex.split(/\r?\n/).map((line) => line.replace(/(?<!\\)%.*$/, '')).join('\n');
  const keys = new Set();
  for (const m of body.matchAll(/\\(?:no)?cite[a-zA-Z]*\*?\s*(?:\[[^\]]*\]\s*)*\{([^}]*)\}/g)) {
    for (const k of m[1].split(',')) if (k.trim()) keys.add(k.trim());
  }
  return [...keys];
}

// The catalog is a TSV with a header row; returns one object per row, keyed by header name,
// plus `line`, the row's line number in the file.
export function readCatalog(text) {
  const [header, ...lines] = text.split(/\r?\n/);
  const cols = header.split('\t').map((h) => h.trim());
  return lines.flatMap((l, i) => {
    if (!l.trim()) return [];
    const cells = l.split('\t');
    return [Object.fromEntries([...cols.map((c, j) => [c, (cells[j] ?? '').trim()]), ['line', i + 2]])];
  });
}

export function runCheck(opts) {
  const keys = citedKeys(readFileSync(opts.tex, 'utf8'));
  const rows = readCatalog(readFileSync(opts.catalog, 'utf8'));
  const have = new Set(rows.map((r) => r.key));
  const missing = keys.filter((k) => !have.has(k));
  const problems = [];
  if (missing.length) problems.push(`missing keys: ${missing.join(', ')}`);
  for (const r of rows) {
    if (!STATUSES.includes(r.status)) problems.push(`line ${r.line} (${r.key}): invalid status "${r.status ?? ''}"`);
  }
  const result = problems.length ? 'fail' : 'pass';
  const where = `${shown(opts.root, opts.catalog)} vs ${keys.length} keys cited in ${shown(opts.root, opts.tex)}`;
  const evidence = problems.length ? `${where}; ${problems.join('; ')}` : `${where}; all present with valid statuses`;
  writeEvent({ root: opts.root, run: opts.run, agent: opts.agent, type: 'check', fields: { name: 'references', result, evidence } });
  return { result, evidence };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { result, evidence } = runCheck(parseArgs(process.argv.slice(2)));
    process.stdout.write(`references: ${result}: ${evidence}\n`);
    process.exit(result === 'pass' ? 0 : 1);
  } catch (err) {
    process.stderr.write(`references.mjs: ${err.message}\n`);
    process.exit(2);
  }
}
