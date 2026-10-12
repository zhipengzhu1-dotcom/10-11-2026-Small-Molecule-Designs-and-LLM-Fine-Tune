#!/usr/bin/env node
// Merge script: the one step that commits the factory's own writes in the main checkout.
// During an orchestrated run the hooks write factory/agents/<run>/ and the orchestrator appends
// factory/decisions.tsv, so the main checkout is never clean. This commits factory/agents/ (every
// run's folder) and the decision log on the integration branch, then merges the ticket branch.
//
//   npm run merge -- <branch> [-m <message> | -F <file>] [--root <repo>]   commit factory paths, then merge
//   npm run merge -- --factory-only [-m <message> | -F <file>] [--root <repo>]   commit them only (close-out)
//
// The message is the merge commit's; with neither -m nor -F, git's default merge message. The
// factory commit is "Record factory activity for run <run>" plus the message's Co-Authored-By
// trailers. Messages reach git through a file, never argv, so their newlines survive on Windows;
// prefer -F there, since npm's cmd.exe shell can mangle a multi-line -m before it gets here.
//
// The run and the integration branch come from the run marker (factory/run-marker.mjs).
// Root: --root, else FACTORY_ROOT, else CLAUDE_PROJECT_DIR, else the repo this script lives in.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, UsageError } from './cli.mjs';
import { git, gitRun } from './git.mjs';
import { defaultRoot } from './log.mjs';
import { readMarker } from './run-marker.mjs';

const DECISIONS = 'factory/decisions.tsv';

// The paths the factory writes, repo-relative: every run's activity folder, not only the marked
// run's, so a merge leaves none of them behind uncommitted.
const FACTORY_PATHS = ['factory/agents', DECISIONS];

// Runs git with `-F <file>` holding the message, so no newline goes through argv.
function gitWithMessage(root, message, args, rest) {
  const dir = mkdtempSync(join(tmpdir(), 'factory-merge-'));
  try {
    const file = join(dir, 'message.txt');
    writeFileSync(file, `${message}\n`);
    return git(root, ...args, '-F', file, ...rest);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const trailers = (message = '') => message.split(/\r?\n/).filter((l) => /^Co-Authored-By:/i.test(l.trim())).map((l) => l.trim());

// Commits the factory paths, and nothing else, when they have changes. Returns whether it committed.
function commitFactory(root, run, coAuthors) {
  const paths = FACTORY_PATHS.filter((p) => existsSync(join(root, p)));
  if (!paths.length) return false;
  git(root, 'add', '-A', '--', ...paths);
  const staged = gitRun(root, 'diff', '--cached', '--quiet', '--', ...paths);
  if (staged.status === 0) return false;
  const subject = `Record factory activity for run ${run}`;
  const message = coAuthors.length ? `${subject}\n\n${coAuthors.join('\n')}` : subject;
  gitWithMessage(root, message, ['commit', '-q'], ['--only', '--', ...paths]);
  return true;
}

function mergeBranch({ root, branch, message, factoryOnly = false }) {
  const m = readMarker(root);
  if (!m) throw new Error('no orchestrated run is marked; start one with factory/run-marker.mjs start');
  if (!m.branch) throw new Error('the run marker names no integration branch');
  const current = git(root, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (current !== m.branch) {
    throw new Error(`the main checkout is on ${current}, not the integration branch ${m.branch}`);
  }
  const committed = commitFactory(root, m.run, trailers(message));
  if (factoryOnly) return { committed, merged: false };
  if (message) gitWithMessage(root, message, ['merge', '--no-ff', '--no-edit'], [branch]);
  else git(root, 'merge', '--no-ff', '--no-edit', branch);
  return { committed, merged: true };
}

cli(import.meta.url, {
  usage: 'node factory/merge.mjs <branch> [-m <message> | -F <file>] [--root <repo>] | --factory-only [-m <message> | -F <file>] [--root <repo>]',
  options: {
    root: 'string',
    message: { type: 'string', short: 'm' },
    file: { type: 'string', short: 'F' },
    'factory-only': 'flag',
  },
  positionals: true,
}, ({ positionals, root = defaultRoot(process.env), message, file, 'factory-only': factoryOnly = false }) => {
  const [branch, ...extra] = positionals;
  if (extra.length) throw new UsageError(`unexpected argument: ${extra[0]}`);
  if (factoryOnly && branch) throw new UsageError('--factory-only takes no branch');
  if (!factoryOnly && !branch) throw new UsageError('missing branch');
  if (message !== undefined && file !== undefined) throw new UsageError('pass -m or -F, not both');
  if (file !== undefined) message = readFileSync(file, 'utf8').replace(/\s+$/, '');
  const r = mergeBranch({ root, branch, message, factoryOnly });
  process.stdout.write(`${r.committed ? 'committed factory paths' : 'no factory changes'}${r.merged ? '; merged' : ''}\n`);
});
