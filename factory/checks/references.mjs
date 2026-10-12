#!/usr/bin/env node
// References check (issue #5). Every key the paper cites must appear in the reference catalog
// with a valid status. Writes one check event and exits 0 on pass, 1 on fail.
//
//   node factory/checks/references.mjs [--root <repo>] [--run <id>] [--agent <id>]
//                                      [--tex <main.tex>] [--catalog <catalog.tsv>]
//
// --tex defaults to <root>/research/s1/raw/arxiv/latex/main.tex and --catalog to
// <root>/research/refs/catalog.tsv. Run and agent default to FACTORY_RUN and FACTORY_AGENT,
// else run "manual" and agent "orchestrator".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCli, shown } from './check.mjs';

// Reference statuses from issue #1.
export const STATUSES = ['arxiv', 'oa', 'closed', 'fetch-pending', 'fetched'];

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
  const tex = opts.tex ?? join(opts.root, 'research', 's1', 'raw', 'arxiv', 'latex', 'main.tex');
  const catalog = opts.catalog ?? join(opts.root, 'research', 'refs', 'catalog.tsv');
  const keys = citedKeys(readFileSync(tex, 'utf8'));
  const rows = readCatalog(readFileSync(catalog, 'utf8'));
  const have = new Set(rows.map((r) => r.key));
  const missing = keys.filter((k) => !have.has(k));
  const problems = [];
  if (missing.length) problems.push(`missing keys: ${missing.join(', ')}`);
  for (const r of rows) {
    if (!STATUSES.includes(r.status)) problems.push(`line ${r.line} (${r.key}): invalid status "${r.status ?? ''}"`);
  }
  const where = `${shown(opts.root, catalog)} vs ${keys.length} keys cited in ${shown(opts.root, tex)}`;
  return { summary: problems.length ? where : `${where}; all present with valid statuses`, problems };
}

checkCli(import.meta.url, {
  name: 'references',
  usage: 'node factory/checks/references.mjs [--root <repo>] [--run <id>] [--agent <id>] [--tex <main.tex>] [--catalog <catalog.tsv>]',
  options: { tex: 'string', catalog: 'string' },
}, runCheck);
