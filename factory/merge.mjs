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
import { join } from 'node:path';
import { cli, UsageError } from './cli.mjs';
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

cli(import.meta.url, {
  usage: 'node factory/merge.mjs <branch> [-m <message>] [--root <repo>] | --factory-only [--root <repo>]',
  options: { root: 'string', message: { type: 'string', short: 'm' }, 'factory-only': 'flag' },
  positionals: true,
}, ({ positionals, root = defaultRoot(process.env), message, 'factory-only': factoryOnly = false }) => {
  const [branch, ...extra] = positionals;
  if (extra.length) throw new UsageError(`unexpected argument: ${extra[0]}`);
  if (factoryOnly && branch) throw new UsageError('--factory-only takes no branch');
  if (!factoryOnly && !branch) throw new UsageError('missing branch');
  const r = mergeBranch({ root, branch, message, factoryOnly });
  process.stdout.write(`${r.committed ? 'committed factory paths' : 'no factory changes'}${r.merged ? '; merged' : ''}\n`);
});
