#!/usr/bin/env node
// Turns many PDFs into text in one command, so an agent never writes a `for f in *.pdf` loop (the
// worktree guard refuses those as too complex to verify; map #26 retro). Runs `pdftotext -layout`
// on each file with no shell.
//
//   node scripts/pdf-text.mjs <pdf>... [--out <dir>]
//
// Writes <name>.txt beside each PDF, or into --out. Prints one tab-separated line per file, "ok" or
// "fail" with the reason, and exits 1 if any failed. pdftotext comes from PATH (poppler:
// `winget install oschwartz10612.Poppler`), else from Git for Windows' copy.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GIT_PDFTOTEXT = 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe';

export function parseArgs(argv) {
  const out = { pdfs: [], out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      out.out = argv[++i];
      if (!out.out) throw new Error('--out takes a folder');
    } else out.pdfs.push(argv[i]);
  }
  if (!out.pdfs.length) throw new Error('name at least one PDF, e.g. node scripts/pdf-text.mjs papers/*.pdf --out txt');
  return out;
}

export function txtPath(pdf, out = null) {
  const name = extname(pdf).toLowerCase() === '.pdf' ? basename(pdf, extname(pdf)) : basename(pdf);
  return join(out ?? dirname(pdf), `${name}.txt`);
}

// The .txt path for each PDF, refusing two PDFs that would overwrite each other's text.
export function outputPaths(pdfs, out = null) {
  const seen = new Map();
  return pdfs.map((pdf) => {
    const txt = txtPath(pdf, out);
    const key = resolve(txt).toLowerCase();
    if (seen.has(key)) throw new Error(`${seen.get(key)} and ${pdf} would both write ${txt}`);
    seen.set(key, pdf);
    return txt;
  });
}

const runsOnPath = (bin) => !spawnSync(bin, ['-v'], { stdio: 'ignore' }).error;

export function findPdftotext({ runs = runsOnPath, exists = existsSync } = {}) {
  if (runs('pdftotext')) return 'pdftotext';
  if (exists(GIT_PDFTOTEXT)) return GIT_PDFTOTEXT;
  return null;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let args, txts;
  try {
    args = parseArgs(process.argv.slice(2));
    txts = outputPaths(args.pdfs, args.out);
  } catch (e) {
    console.error(`pdf-text: ${e.message}`);
    process.exit(2);
  }
  if (args.out) mkdirSync(args.out, { recursive: true });
  let bin;
  let failed = 0;
  args.pdfs.forEach((pdf, i) => {
    let why = null;
    if (!existsSync(pdf)) why = 'no such file';
    else if ((bin ??= findPdftotext()) === null) why = 'pdftotext not found: install poppler (winget install oschwartz10612.Poppler)';
    else {
      const r = spawnSync(bin, ['-layout', pdf, txts[i]], { encoding: 'utf8' });
      if (r.error) why = r.error.message;
      else if (r.status !== 0) why = (r.stderr.trim().split(/\r?\n/).pop() || `exit ${r.status}`);
    }
    if (why) failed++;
    console.log(why ? `fail\t${pdf}\t${why}` : `ok\t${pdf}\t${txts[i]}`);
  });
  process.exit(failed ? 1 : 0);
}
