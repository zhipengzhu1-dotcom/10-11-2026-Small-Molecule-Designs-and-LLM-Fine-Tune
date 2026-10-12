#!/usr/bin/env node
// Run marker: <root>/factory/run.json, set by the orchestrator while an orchestrated run is active.
// The lifecycle hooks act only when it names their session's run; other sessions in this repo
// (reflect, review, close-outs) write nothing. A merge script reads the integration branch here.
// Local state, gitignored.
//
//   node factory/run-marker.mjs start --run <run-id> --branch <integration branch> [--root <repo>]
//   node factory/run-marker.mjs stop [--root <repo>]
//
// Root: --root, else FACTORY_ROOT, else CLAUDE_PROJECT_DIR, else the repo this script lives in.
// Run:  --run, else FACTORY_RUN.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cli, UsageError } from './cli.mjs';
import { defaultRoot } from './log.mjs';

function markerFile(root) {
  return join(root, 'factory', 'run.json');
}

// { run, branch } of the active orchestrated run, or null when none is marked.
export function readMarker(root) {
  const file = markerFile(root);
  if (!existsSync(file)) return null;
  const m = JSON.parse(readFileSync(file, 'utf8'));
  if (!m || typeof m.run !== 'string' || !m.run) throw new Error(`${file}: no run`);
  return m;
}

// Whether a hook acts for a session: only while a run is marked, and only in the session it names.
// A payload with no session id can't be told apart, so it counts while any run is marked.
export function inMarkedRun(root, session) {
  const m = readMarker(root);
  return Boolean(m) && (!session || m.run === session);
}

// The run an event is filed under when no --run is passed: FACTORY_RUN, else the marked run, so
// events written during an orchestrated run land in the folder the merge script commits.
// Undefined when neither is set.
export function defaultRun(root, env = process.env) {
  return env.FACTORY_RUN || readMarker(root)?.run;
}

cli(import.meta.url, {
  usage: 'node factory/run-marker.mjs start --run <run-id> --branch <branch> [--root <repo>] | stop [--root <repo>]',
  options: { root: 'string', run: 'string', branch: 'string' },
  positionals: true,
}, ({ positionals, root = defaultRoot(), run = process.env.FACTORY_RUN, branch }) => {
  const [cmd, ...extra] = positionals;
  if (extra.length) throw new UsageError(`unexpected argument: ${extra[0]}`);
  if (cmd === 'start') {
    if (!run) throw new UsageError('missing run (pass --run or set FACTORY_RUN)');
    if (!branch) throw new UsageError('missing --branch (the integration branch)');
    mkdirSync(dirname(markerFile(root)), { recursive: true });
    writeFileSync(markerFile(root), `${JSON.stringify({ run, branch })}\n`);
  } else if (cmd === 'stop') {
    rmSync(markerFile(root), { force: true });
  } else {
    throw new UsageError(cmd ? `unknown command: ${cmd}` : 'missing command: start or stop');
  }
});
