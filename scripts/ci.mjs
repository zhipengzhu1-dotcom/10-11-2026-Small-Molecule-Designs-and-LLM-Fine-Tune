#!/usr/bin/env node
// Local CI: runs the tests inside a pinned Node container on this machine's Docker Desktop, then
// the data checks on the host. No GitHub Actions or hosted runner (see AGENTS.md).
//
//   node scripts/ci.mjs                 tests on the working folder (a manual run)
//   node scripts/ci.mjs --rev <commit>  tests and data checks on that commit's files
//   node scripts/ci.mjs --pre-push      the same for each commit git is pushing, read from the
//                                       pre-push hook's stdin
//
// A pushed commit is checked out into a temporary worktree, so what is tested is what is pushed,
// not whatever the main checkout has checked out. The tree is mounted read-only and the container
// has no network. A skipped test fails the run unless its reason is in ALLOWED_SKIPS.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, UsageError } from '../factory/cli.mjs';

// The full Debian image, not alpine: it ships git, which the trail check's tests need.
const IMAGE = 'node:24.15.0';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Skips that are expected in the container: it has no network interface but loopback.
export const ALLOWED_SKIPS = [/no non-loopback IPv4 interface/];

// The data checks, one per `check:*` script in package.json. The source tree is gitignored, so it
// is read from the main checkout.
export function dataChecks(main) {
  const tex = join(main, 'research', 's1', 'raw', 'arxiv', 'latex', 'main.tex');
  return {
    tables: ['--tex', tex, '--notes', 'research/s1/tables', '--notes', 'research/s1/figures'],
    references: ['--tex', tex],
    brief: [],
    trail: [],
  };
}

// The skip reasons in a TAP report that ALLOWED_SKIPS does not cover.
export function unexpectedSkips(tap) {
  return [...tap.matchAll(/^\s*ok \d+ - (.*?) # SKIP ?(.*)$/gm)]
    .filter(([, , reason]) => !ALLOWED_SKIPS.some((re) => re.test(reason)))
    .map(([, name, reason]) => `${name} (${reason || 'no reason'})`);
}

// The commits a pre-push hook is asked to push: lines of "<local ref> <local sha> <remote ref>
// <remote sha>". A deleted ref has an all-zero local sha and nothing to test.
export function pushedCommits(stdin) {
  return stdin.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((f) => f.length === 4 && !/^0+$/.test(f[1])).map((f) => f[1]);
}

const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

function runTests(tree) {
  const args = ['run', '--rm', '--network', 'none', '-v', `${tree}:/app:ro`, '-w', '/app', IMAGE,
    'node', '--test', '--test-reporter=tap', 'factory/**/*.test.mjs'];
  console.log(`ci: docker ${args.join(' ')}`);
  // MSYS_NO_PATHCONV stops Git Bash from rewriting /app into a Windows path.
  const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  if (r.error) return [`could not run docker: ${r.error.message}. Is Docker Desktop running?`];
  const summary = r.stdout.split('\n').filter((l) => /^# (tests|pass|fail|skipped)/.test(l)).join(', ');
  console.log(`ci: tests: ${summary}`);
  if (r.status !== 0) return [`tests failed (exit ${r.status}):\n${r.stdout.split('\n').filter((l) => /^\s*not ok/.test(l)).join('\n')}\n${r.stderr}`];
  return unexpectedSkips(r.stdout).map((s) => `skipped test: ${s}`);
}

function runChecks(tree, main) {
  const problems = [];
  const env = { ...process.env };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'FACTORY_AGENT', 'CLAUDE_PROJECT_DIR']) delete env[k];
  for (const [name, args] of Object.entries(dataChecks(main))) {
    const r = spawnSync(process.execPath, [join(tree, 'factory', 'checks', `${name}.mjs`), '--root', tree, ...args],
      { cwd: tree, env, encoding: 'utf8' });
    const out = (r.stdout + r.stderr).trim().split('\n').pop().replace(new RegExp(`^${name}: `), '');
    console.log(`ci: ${name}: ${out.length > 300 ? out.slice(0, 300) + '…' : out}`);
    if (r.status !== 0) problems.push(`check ${name} failed`);
  }
  return problems;
}

// Tests and data checks on one commit, in a throwaway worktree. Its check events are discarded
// with it.
function checkCommit(rev) {
  const main = dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim());
  const tree = join(mkdtempSync(join(tmpdir(), 'ci-')), 'tree');
  const add = git('worktree', 'add', '--detach', '-q', tree, rev);
  if (add.status !== 0) return [`cannot check out ${rev}: ${add.stderr.trim()}`];
  try {
    console.log(`ci: checking ${git('rev-parse', '--short', rev).stdout.trim()} in ${tree}`);
    return [...runTests(tree), ...runChecks(tree, main)];
  } finally {
    git('worktree', 'remove', '--force', tree);
    rmSync(dirname(tree), { recursive: true, force: true });
  }
}

function main({ rev, 'pre-push': prePush }) {
  if (rev !== undefined && prePush) throw new UsageError('--rev and --pre-push do not go together');
  let problems;
  if (prePush) {
    const revs = [...new Set(pushedCommits(readFileSync(0, 'utf8')))];
    problems = revs.flatMap(checkCommit);
  } else if (rev !== undefined) {
    problems = checkCommit(rev);
  } else {
    problems = runTests(repo);
  }
  for (const p of problems) console.error(`ci: ${p}`);
  console.log(problems.length ? 'ci: FAIL' : 'ci: PASS');
  return problems.length ? 1 : 0;
}

cli(import.meta.url, { usage: 'node scripts/ci.mjs [--rev <commit> | --pre-push]', options: { rev: 'string', 'pre-push': 'flag' } }, main);
