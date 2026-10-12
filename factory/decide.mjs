#!/usr/bin/env node
// Log one decision row (pstack show-me-your-work) to factory/decisions.tsv, the orchestrator's
// decision log. It runs the skill's own log.sh from the installed pstack, and puts the pointer to
// the session transcript at the moment of the decision first in the evidence cell.
//
//   npm run decide -- [--root <repo>] [--run <session-id>] [--state <state>]
//                     [--supersedes|--withdraws|--corrects <line>[ (part)]]... [--closes <challenge id>]...
//                     <phase> <decision> <why> <evidence> [<result>]
//
// Claim:    the grammar is claim.mjs's. --state <state> leads the result cell ("<state>: <result>",
//           or the state alone when <result> is left out); without it, <result> must already start
//           with a claim state. --supersedes, --withdraws and --corrects name an earlier row's
//           line, with "(part)" for a partial one, and become "<relation> line N[ (part)]: ";
//           --closes names a challenge event's id and becomes "closes challenge <id>: ". They lead
//           the decision cell, joined by ", " in the order supersedes, withdraws, corrects, closes.
//           A line past the log's last row, an id with no challenge event in the stream, or a
//           relation phrase written into <decision> by hand is refused.
//
// Root:     --root, else FACTORY_ROOT, else CLAUDE_PROJECT_DIR, else this repo (see log.mjs).
// log.sh:   <installPath>/skills/show-me-your-work/scripts/log.sh, where installPath is the
//           pstack@pstack-marketplace entry of ~/.claude/plugins/installed_plugins.json. The plugin
//           cache keeps stale versions beside it, so never hard-code a cache path.
// Session:  --run, else FACTORY_RUN, else the run marker's run (factory/run.json, run-marker.mjs).
//           With none of them it refuses: the newest transcript can be a concurrent session's, so
//           it is never taken as a guess. The pointer is transcript:<session>@<ISO time>, in the
//           pointer grammar (pointer.mjs), at the transcript's latest entry, to the second. Rows
//           before spec #52 carry the older "~/.claude/projects/<slug>/<session>.jsonl @<HH:MM:SS>Z".
// Evidence: each "; "-separated item that starts with `<kind>:` is a pointer and must parse and
//           resolve (pointer.mjs, the trail check's grammar); other items are prose.
// Exit:     2 when the row cannot be logged (a bad argument, an evidence pointer that does not
//           resolve, no pstack, no transcript, log.sh failed). Nothing is written then.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { claimState, formatRelations, leadingRelation, parseRowTarget, RELATIONS } from './claim.mjs';
import { cli, UsageError } from './cli.mjs';
import { challenged, defaultRoot, plainName } from './log.mjs';
import { parsePointer, resolvePointer } from './pointer.mjs';
import { readStream } from './read.mjs';
import { defaultRun } from './run-marker.mjs';
import { projectTranscripts, readTranscript } from './transcript.mjs';

const PLUGIN = 'pstack@pstack-marketplace';

// The show-me-your-work log.sh of the pstack that Claude Code has installed.
function logScript(home = homedir()) {
  const registry = join(home, '.claude', 'plugins', 'installed_plugins.json');
  if (!existsSync(registry)) throw new Error(`no ${registry}; is pstack installed?`);
  const installPath = JSON.parse(readFileSync(registry, 'utf8')).plugins?.[PLUGIN]?.[0]?.installPath;
  if (!installPath) throw new Error(`${registry} has no ${PLUGIN} entry; is pstack installed?`);
  const script = join(installPath, 'skills', 'show-me-your-work', 'scripts', 'log.sh');
  if (!existsSync(script)) throw new Error(`${script} does not exist; reinstall pstack`);
  return script;
}

// The transcript:<session>@<iso> pointer to a session transcript's latest entry, to the second.
function transcriptPointer(dir, session) {
  const file = join(dir, `${session}.jsonl`);
  if (!existsSync(file)) throw new Error(`no transcript at ${file}`);
  const ts = readTranscript(file).findLast((e) => typeof e?.timestamp === 'string')?.timestamp;
  if (!ts) throw new Error(`${file} has no timestamped entry`);
  return `transcript:${session}@${ts.slice(0, 19)}`;
}

// Git Bash, not the WSL bash.exe that Windows puts first on PATH.
function bash() {
  if (process.platform !== 'win32') return 'bash';
  const exec = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  const gitBash = exec.status === 0 && join(exec.stdout.trim(), '..', '..', '..', 'bin', 'bash.exe');
  if (!gitBash || !existsSync(gitBash)) throw new Error('cannot find Git Bash (git --exec-path/../../../bin/bash.exe)');
  return gitBash;
}

// Every pointer among the evidence cell's "; "-separated items must parse and resolve (pointer.mjs);
// items with no `<kind>:` prefix are prose and pass as written. The log is append-only, so a bad
// pointer is refused before log.sh runs, never fixed after.
function checkEvidence(evidence, opts) {
  const problems = evidence.split(';').map((s) => parsePointer(s.trim())).filter(Boolean)
    .map((p) => resolvePointer(p, opts)?.problem).filter(Boolean);
  if (problems.length) throw new Error(`evidence: ${problems.join('; ')}`);
}

// The decision cell with its relation prefix (claim.mjs). A row relation's target must be a row
// already in the log, and --closes must name a challenge event in the stream. A hand-written
// relation phrase is refused, so the flags are the only way to write one.
function decisionCell(root, decision, flags) {
  const word = leadingRelation(decision);
  if (word) throw new UsageError(`decision starts with "${word}"; pass --${word} instead of writing the phrase`);
  const logFile = join(root, 'factory', 'decisions.tsv');
  const last = existsSync(logFile) ? readFileSync(logFile, 'utf8').split(/\r?\n/).filter((l) => l !== '').length : 1;
  let events;
  const relations = flags.map(({ kind, value }) => {
    const at = `--${kind} ${value}`;
    if (kind === 'closes') {
      const notPlain = plainName(value);
      if (notPlain) throw new UsageError(`${at}: a challenge id must be a plain name; ${notPlain}`);
      events ??= readStream(root);
      if (!challenged(events, value)) throw new UsageError(`${at}: no challenge event with id ${value} in the stream`);
      return { kind, challenge: value };
    }
    const target = parseRowTarget(value);
    if (!target) throw new UsageError(`${at}: write a line number, optionally followed by (part)`);
    if (target.line < 2) throw new UsageError(`${at}: line ${target.line} is the header, not a decision row`);
    if (target.line > last) throw new UsageError(`${at}: line ${target.line} is past the last row (${last})`);
    return { kind, ...target };
  });
  return formatRelations(relations) + decision;
}

// The result cell, led by a claim state: --state's, or the one `result` already starts with.
function resultCell(state, result) {
  if (state === undefined) {
    const { problem } = claimState(result);
    if (problem) throw new UsageError(`result: ${problem}; pass --state <state>`);
    return result;
  }
  const claim = claimState(state);
  if (claim.state !== state) throw new UsageError(`--state: ${claim.problem ?? `"${state}" is more than one claim state word`}`);
  return result ? `${state}: ${result}` : state;
}

function decide({ root, run, cells, state, relations = [], home = homedir() }) {
  const [phase, plainDecision, why, evidence, plainResult] = cells;
  const decision = decisionCell(root, plainDecision, relations);
  const result = resultCell(state, plainResult);
  const script = logScript(home);
  const dir = projectTranscripts(root, home);
  const session = run || defaultRun(root);
  if (!session) throw new Error('no run: pass --run <session-id>, set FACTORY_RUN, or start a run marker (factory/run-marker.mjs)');
  checkEvidence(evidence, { root, transcripts: dir, home });
  const pointer = transcriptPointer(dir, session);
  const log = join(root, 'factory', 'decisions.tsv').replace(/\\/g, '/');
  const r = spawnSync(bash(), [script.replace(/\\/g, '/'), log, phase, decision, why, evidence ? `${pointer}; ${evidence}` : pointer, result], {
    encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });
  if (r.error || r.status !== 0) throw new Error(`log.sh failed: ${r.error?.message ?? r.stderr.trim()}`);
  return { log, pointer };
}

cli(import.meta.url, {
  usage: 'node factory/decide.mjs [--root <repo>] [--run <session-id>] [--state <state>] '
    + '[--supersedes|--withdraws|--corrects|--closes <line>[ (part)]]... <phase> <decision> <why> <evidence> [<result>]',
  options: { root: 'string', run: 'string', state: 'string', ...Object.fromEntries(RELATIONS.map((k) => [k, 'list'])) },
  positionals: true,
  failure: 2,
}, ({ positionals: cells, root = defaultRoot(process.env), run, state, ...flags }) => {
  if (cells.length !== 5 && !(state !== undefined && cells.length === 4)) {
    throw new UsageError('expected 5 cells: <phase> <decision> <why> <evidence> <result> (4 with --state, which can stand as the result)');
  }
  const relations = RELATIONS.flatMap((kind) => (flags[kind] ?? []).map((value) => ({ kind, value })));
  const { log, pointer } = decide({ root, run, cells, state, relations });
  process.stdout.write(`decide: logged to ${log} with ${pointer}\n`);
});
