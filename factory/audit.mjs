#!/usr/bin/env node
// Audit of the decision log (pstack show-me-your-work): the steps an auditor repeats for every row,
// so no run hand-builds audit rows or hunts transcript timestamps.
//
//   npm run audit -- show <line>...    the row, then its session's digest for the 15 minutes before
//                                      it, each line led by a ready-to-paste transcript pointer
//
// A row's session is the one its evidence names (`npm run decide` puts
// "~/.claude/projects/<slug>/<session>.jsonl @<time>" first); --run names it for older rows.
// Transcripts: --transcripts, else the main checkout's Claude Code transcripts folder.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLog } from './checks/trail.mjs';
import { cli, UsageError } from './cli.mjs';
import { defaultRoot } from './log.mjs';
import { digest, projectTranscripts } from './transcript.mjs';

const WINDOW_MS = 15 * 60 * 1000;

// The decision row on `line` of the log, or a UsageError.
function rowAt(log, line) {
  const r = log.find((x) => x.line === Number(line));
  if (!r) throw new UsageError(`factory/decisions.tsv has no decision row on line ${line}`);
  return r;
}

// The session whose transcript logged row `r`: --run, else the one its evidence names.
function sessionOf(r, run) {
  const s = run ?? /([^/\\\s]+)\.jsonl @/.exec(r.cells[4] ?? '')?.[1];
  if (!s) throw new UsageError(`line ${r.line} names no transcript in its evidence; pass --run <session>`);
  return s;
}

function transcriptFile(opts, session) {
  const file = join(opts.transcripts, `${session}.jsonl`);
  if (!existsSync(file)) throw new Error(`no transcript at ${file}`);
  return file;
}

function show(opts, log, line) {
  const r = rowAt(log, line);
  const session = sessionOf(r, opts.run);
  const to = Date.parse(r.ts);
  const out = [`line ${r.line}\t${r.text}`];
  for (const l of digest(transcriptFile(opts, session))) {
    const at = l.slice(0, l.indexOf(' '));
    const ms = Date.parse(at);
    if (ms >= to - WINDOW_MS && ms <= to) out.push(`transcript:${session}@${at.slice(0, 19)} ${l.slice(at.length + 1)}`);
  }
  return out.join('\n');
}

cli(import.meta.url, {
  usage: 'node factory/audit.mjs show <line>... [--run <session>] [--root <repo>] [--transcripts <dir>]',
  options: { root: 'string', run: 'string', transcripts: 'string' },
  positionals: true,
}, ({ positionals: [cmd, ...args], root = defaultRoot(), ...rest }) => {
  const opts = { root, transcripts: rest.transcripts ?? projectTranscripts(root), run: rest.run };
  const log = readLog(readFileSync(join(root, 'factory', 'decisions.tsv'), 'utf8'));
  if (cmd === 'show') {
    if (!args.length) throw new UsageError('show needs at least one line');
    process.stdout.write(`${args.map((line) => show(opts, log, line)).join('\n\n')}\n`);
  } else {
    throw new UsageError(cmd ? `unknown command: ${cmd}` : 'missing command: show');
  }
});
