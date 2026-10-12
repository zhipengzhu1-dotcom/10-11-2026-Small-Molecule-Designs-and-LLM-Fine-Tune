#!/usr/bin/env node
// Merge script: the one step that commits the factory's own writes in the main checkout.
// During an orchestrated run the hooks write factory/agents/<run>/ and the orchestrator appends
// factory/decisions.tsv, so the main checkout is never clean. This commits those paths on the
// integration branch, then merges the ticket branch into it.
//
//   npm run merge -- <branch> [-m <message>] [--root <repo>]   commit factory paths, then merge
//   npm run merge -- --factory-only [--root <repo>]            commit factory paths only (close-out)
//
// The run and the integration branch come from the run marker (factory/run-marker.mjs).
// Root: --root, else FACTORY_ROOT, else CLAUDE_PROJECT_DIR, else the repo this script lives in.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRoot } from './log.mjs';
import { readMarker } from './run-marker.mjs';

export const DECISIONS = 'factory/decisions.tsv';

// The paths the factory writes during a run, repo-relative.
export function factoryPaths(run) {
  return [`factory/agents/${run}`, DECISIONS];
}

function git(root, ...args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

// Commits the run's factory paths, and nothing else, when they have changes. Returns whether it committed.
export function commitFactory(root, run) {
  const paths = factoryPaths(run).filter((p) => existsSync(join(root, p)));
  if (!paths.length) return false;
  git(root, 'add', '-A', '--', ...paths);
  const staged = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet', '--', ...paths]);
  if (staged.status === 0) return false;
  git(root, 'commit', '-q', '-m', `Record factory activity for run ${run}`, '--only', '--', ...paths);
  return true;
}

export function mergeBranch({ root, branch, message, factoryOnly = false }) {
  const m = readMarker(root);
  if (!m) throw new Error('no orchestrated run is marked; start one with factory/run-marker.mjs start');
  if (!m.branch) throw new Error('the run marker names no integration branch');
  const current = git(root, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (current !== m.branch) {
    throw new Error(`the main checkout is on ${current}, not the integration branch ${m.branch}`);
  }
  const committed = commitFactory(root, m.run);
  if (factoryOnly) return { committed, merged: false };
  const args = ['merge', '--no-ff', '--no-edit'];
  if (message) args.push('-m', message);
  git(root, ...args, branch);
  return { committed, merged: true };
}

function parseArgs(argv, env) {
  const opts = { root: defaultRoot(env), branch: undefined, message: undefined, factoryOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--factory-only') opts.factoryOnly = true;
    else if (a === '--root' || a === '-m' || a === '--message') {
      if (argv[i + 1] === undefined) throw new Error(`missing value for ${a}`);
      opts[a === '--root' ? 'root' : 'message'] = argv[++i];
    } else if (a.startsWith('-') || opts.branch) throw new Error(`unexpected argument: ${a}`);
    else opts.branch = a;
  }
  if (!opts.factoryOnly && !opts.branch) {
    throw new Error('usage: merge.mjs <branch> [-m <message>] [--root <repo>] | --factory-only [--root <repo>]');
  }
  if (opts.factoryOnly && opts.branch) throw new Error('--factory-only takes no branch');
  return opts;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const r = mergeBranch(parseArgs(process.argv.slice(2), process.env));
    process.stdout.write(`${r.committed ? 'committed factory paths' : 'no factory changes'}${r.merged ? '; merged' : ''}\n`);
  } catch (err) {
    process.stderr.write(`factory/merge.mjs: ${err.message}\n`);
    process.exit(1);
  }
}
