#!/usr/bin/env node
// Audit of the decision log (pstack show-me-your-work): the steps an auditor repeats for every row,
// so no run hand-builds audit rows or hunts transcript timestamps.
//
//   npm run audit -- show <line>...    the row, then its session's digest since the session's
//                                      previous row, each line led by a ready-to-paste transcript
//                                      pointer
//   npm run audit -- add <line> ok --pointers "<p>; <p>" --note <text>
//   npm run audit -- add <line> superseded --by <later line> --note <text>
//                                      appends the verdict to factory/audit/<session>.tsv, with the
//                                      row's ts, once the trail check's own rules pass on it
//   npm run audit -- review [--host <url>]
//                                      the cross-family review (trail-review.mjs): each of the
//                                      session's audited rows against its 3 nearest earlier standing
//                                      rows, one local qwen3.5:4b call per pair (judge.mjs), written
//                                      to factory/audit/<session>.review.md
//
// A row's session is the one its evidence names (`npm run decide` puts transcript:<session>@<iso>
// first, and "~/.claude/projects/<slug>/<session>.jsonl @<time>" before spec #52); --run names it
// for older rows.
// review's session is --run, else FACTORY_RUN, else the run marker's run.
// Transcripts: --transcripts, else the main checkout's Claude Code transcripts folder.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readLog, verdictProblems } from './checks/trail.mjs';
import { cli, UsageError } from './cli.mjs';
import { defaultRoot } from './log.mjs';
import { parsePointer } from './pointer.mjs';
import { buildGraph } from './graph.mjs';
import { createJudge } from './judge.mjs';
import { readStream } from './read.mjs';
import { defaultRun } from './run-marker.mjs';
import { reviewText, trailReview } from './trail-review.mjs';
import { digest, projectTranscripts } from './transcript.mjs';

// The decision row on `line` of the log, or a UsageError.
function rowAt(log, line) {
  const r = log.find((x) => x.line === Number(line));
  if (!r) throw new UsageError(`factory/decisions.tsv has no decision row on line ${line}`);
  return r;
}

// The session named by row `r`'s evidence, or undefined: its first transcript: pointer, else the
// "<session>.jsonl @<time>" path that npm run decide wrote before spec #52.
function namedSession(r) {
  const evidence = r.cells[4] ?? '';
  const pointer = evidence.split(';').map((s) => parsePointer(s.trim())).find((p) => p?.kind === 'transcript' && !p.problem);
  return pointer?.session ?? /([^/\\\s]+)\.jsonl @/.exec(evidence)?.[1];
}

// The session whose transcript logged row `r`: --run, else the one its evidence names.
function sessionOf(r, run) {
  const s = run ?? namedSession(r);
  if (!s) throw new UsageError(`line ${r.line} names no transcript in its evidence; pass --run <session>`);
  return s;
}

function transcriptFile(opts, session) {
  const file = join(opts.transcripts, `${session}.jsonl`);
  if (!existsSync(file)) throw new Error(`no transcript at ${file}`);
  return file;
}

// The row, then its session's digest from the session's previous row (or the session's start) up
// to the row, so the lead-up to the decision and anything decided but never logged both show.
function show(opts, log, line) {
  const r = rowAt(log, line);
  const session = sessionOf(r, opts.run);
  const prev = log.findLast((x) => x.line < r.line && namedSession(x) === session);
  const from = prev ? Date.parse(prev.ts) : -Infinity;
  const to = Date.parse(r.ts);
  const out = [`line ${r.line}\t${r.text}`];
  for (const l of digest(transcriptFile(opts, session))) {
    const at = l.slice(0, l.indexOf(' '));
    const ms = Date.parse(at);
    if (ms > from && ms <= to) out.push(`transcript:${session}@${at.slice(0, 19)} ${l.slice(at.length + 1)}`);
  }
  return out.join('\n');
}

const AUDIT_HEADER = ['line', 'ts', 'verdict', 'superseded_by', 'pointers', 'note'];
const cell = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Appends one verdict on row `line` to factory/audit/<session>.tsv, after the trail check's own
// rules pass on it, so a written verdict is one the check accepts.
function add(opts, log, [line, verdict, ...extra], { pointers = '', note, by }) {
  if (!line || !verdict || extra.length) throw new UsageError('add takes <line> ok|superseded');
  if (!cell(note)) throw new UsageError('add needs --note');
  const r = rowAt(log, line);
  const audit = `${sessionOf(r, opts.run)}.tsv`;
  const cells = [r.line, r.ts, verdict, by ?? '', cell(pointers), cell(note)];
  const v = {
    line: r.line, ts: r.ts, verdict, by: Number(by), audit, text: cells.join('\t'),
    pointers: cell(pointers).split(';').map((p) => p.trim()).filter(Boolean),
  };
  const { problems } = verdictProblems(v, r, log, opts);
  if (problems.length) throw new Error(`line ${r.line}: ${problems.join('; ')}`);
  const file = join(opts.root, 'factory', 'audit', audit);
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file)) writeFileSync(file, `${AUDIT_HEADER.join('\t')}\n`);
  appendFileSync(file, `${cells.join('\t')}\n`);
  return `factory/audit/${audit}: line ${r.line} ${verdict}`;
}

// The cross-family review of one session's audited rows by per-pair judging (trail-review.mjs),
// written beside its audit under the "reviewed by" line the trail check reads. A judge that fails
// stops the review before anything is written.
async function review(opts, log, host) {
  const session = opts.run ?? defaultRun(opts.root);
  if (!session) throw new UsageError('review needs a session: pass --run, set FACTORY_RUN or start a run marker');
  const rel = `factory/audit/${session}.tsv`;
  const file = join(opts.root, rel);
  if (!existsSync(file)) throw new Error(`no audit at ${rel}`);
  const lines = [...new Set(readFileSync(file, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => Number(l.split('\t')[0])))];
  for (const line of lines) rowAt(log, line);
  const judge = createJudge({ host });
  const result = await trailReview({ graph: buildGraph(readStream(opts.root)), lines, judge });
  const out = rel.replace(/\.tsv$/, '.review.md');
  writeFileSync(join(opts.root, out), reviewText({ session, lines, model: judge.model, ...result }));
  return `${out}: reviewed by ${judge.model}, ${result.flags.length} of ${result.judged} pairs flagged`;
}

cli(import.meta.url, {
  usage: 'node factory/audit.mjs show <line>... | add <line> ok --pointers <p; p> --note <text> | add <line> superseded --by <line> --note <text>'
    + ' | review [--host <url>]  [--run <session>] [--root <repo>] [--transcripts <dir>]',
  options: { root: 'string', run: 'string', transcripts: 'string', pointers: 'string', note: 'string', by: 'string', host: 'string' },
  positionals: true,
}, async ({ positionals: [cmd, ...args], root = defaultRoot(), ...rest }) => {
  const opts = { root, transcripts: rest.transcripts ?? projectTranscripts(root), run: rest.run };
  const log = readLog(readFileSync(join(root, 'factory', 'decisions.tsv'), 'utf8'));
  if (cmd === 'show') {
    if (!args.length) throw new UsageError('show needs at least one line');
    process.stdout.write(`${args.map((line) => show(opts, log, line)).join('\n\n')}\n`);
  } else if (cmd === 'add') {
    process.stdout.write(`${add(opts, log, args, rest)}\n`);
  } else if (cmd === 'review') {
    if (args.length) throw new UsageError(`unexpected argument: ${args[0]}`);
    process.stdout.write(`${await review(opts, log, rest.host)}\n`);
  } else {
    throw new UsageError(cmd ? `unknown command: ${cmd}` : 'missing command: show, add or review');
  }
});
