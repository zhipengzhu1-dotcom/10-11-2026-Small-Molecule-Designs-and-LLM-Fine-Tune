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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

function parseArgs(argv, env) {
  const opts = { cmd: argv[0], root: defaultRoot(env), run: env.FACTORY_RUN, branch: undefined };
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    const key = { '--root': 'root', '--run': 'run', '--branch': 'branch' }[flag];
    if (!key || argv[i + 1] === undefined) throw new Error(`unexpected argument: ${flag}`);
    opts[key] = argv[++i];
  }
  return opts;
}

function main(argv, env) {
  const { cmd, root, run, branch } = parseArgs(argv, env);
  if (cmd === 'start') {
    if (!run) throw new Error('missing run (pass --run or set FACTORY_RUN)');
    if (!branch) throw new Error('missing --branch (the integration branch)');
    mkdirSync(dirname(markerFile(root)), { recursive: true });
    writeFileSync(markerFile(root), `${JSON.stringify({ run, branch })}\n`);
  } else if (cmd === 'stop') {
    rmSync(markerFile(root), { force: true });
  } else {
    throw new Error('usage: run-marker.mjs start --run <run-id> --branch <branch> [--root <repo>] | stop [--root <repo>]');
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main(process.argv.slice(2), process.env);
  } catch (err) {
    process.stderr.write(`factory/run-marker.mjs: ${err.message}\n`);
    process.exit(1);
  }
}
