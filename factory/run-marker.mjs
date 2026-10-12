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

export function markerFile(root) {
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
