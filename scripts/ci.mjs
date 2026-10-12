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
import { defaultRoot, writeEvent } from '../factory/log.mjs';
import { defaultRun } from '../factory/run-marker.mjs';
import { logTestResults, resultsLine } from '../factory/test-results.mjs';

// The full Debian image, not alpine: it ships git, which the trail check's tests need.
const IMAGE = 'node:24.15.0';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Skips that are expected in the container: it has no network interface but loopback, and no
// poppler (pdf-text's real-PDF test runs on the host instead).
export const ALLOWED_SKIPS = [/no non-loopback IPv4 interface/, /^pdftotext is not installed$/];

// The data checks, one per `check:*` script in package.json. The source tree is gitignored, so it
// is read from the main checkout.
export function dataChecks(main) {
  const tex = join(main, 'research', 's1', 'raw', 'arxiv', 'latex', 'main.tex');
  return {
    tables: ['--tex', tex, '--notes', 'research/s1/tables', '--notes', 'research/s1/figures'],
    references: ['--tex', tex],
    brief: [],
    trail: [],
    // Ticket bodies live on GitHub; CI checks the template they start from.
    ticket: ['--body', 'docs/agents/ticket-template.md'],
    // Asks git what the pushed commit tracks under research/**/raw/.
    licenses: [],
    // Every factory/stories/<spec>.tsv against the commit's check scripts and test files.
    stories: [],
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

// Logs a CI run's results into the event stream: the per-test results artifact (with the commit
// as `rev`) and a `check` event named `ci`, which fails on any problem the run found.
export function logResults({ root, run, agent, rev, tap, problems }) {
  const results = logTestResults({ root, run, agent, tap, fields: { rev } });
  const evidence = [`${rev}: ${results.pass} pass, ${results.fail} fail, ${results.skip} skip (${results.path})`, ...problems].join('; ');
  writeEvent({ root, run, agent, type: 'check', fields: { name: 'ci', result: problems.length ? 'fail' : 'pass', evidence } });
  return results;
}

const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

// The tests in Docker: the problems they raise and the runner's TAP.
function runTests(tree) {
  const args = ['run', '--rm', '--network', 'none', '-v', `${tree}:/app:ro`, '-w', '/app', IMAGE,
    'node', '--test', '--test-reporter=tap', 'factory/**/*.test.mjs'];
  console.log(`ci: docker ${args.join(' ')}`);
  // MSYS_NO_PATHCONV stops Git Bash from rewriting /app into a Windows path.
  const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  if (r.error) return { tap: '', problems: [`could not run docker: ${r.error.message}. Is Docker Desktop running?`] };
  const summary = r.stdout.split('\n').filter((l) => /^# (tests|pass|fail|skipped)/.test(l)).join(', ');
  console.log(`ci: tests: ${summary}`);
  if (r.status !== 0) return { tap: r.stdout, problems: [`tests failed (exit ${r.status}):\n${r.stdout.split('\n').filter((l) => /^\s*not ok/.test(l)).join('\n')}\n${r.stderr}`] };
  return { tap: r.stdout, problems: unexpectedSkips(r.stdout).map((s) => `skipped test: ${s}`) };
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

const short = (rev) => git('rev-parse', '--short', rev).stdout.trim();

// Tests and data checks on one commit, in a throwaway worktree. Its data checks' events are
// discarded with it; the results are logged by main.
function checkCommit(rev) {
  const main = dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim());
  const tree = join(mkdtempSync(join(tmpdir(), 'ci-')), 'tree');
  const add = git('worktree', 'add', '--detach', '-q', tree, rev);
  if (add.status !== 0) return { rev, tap: '', problems: [`cannot check out ${rev}: ${add.stderr.trim()}`] };
  try {
    console.log(`ci: checking ${short(rev)} in ${tree}`);
    const tests = runTests(tree);
    return { rev: short(rev), tap: tests.tap, problems: [...tests.problems, ...runChecks(tree, main)] };
  } finally {
    git('worktree', 'remove', '--force', tree);
    rmSync(dirname(tree), { recursive: true, force: true });
  }
}

function main({ rev, 'pre-push': prePush, ...ids }) {
  if (rev !== undefined && prePush) throw new UsageError('--rev and --pre-push do not go together');
  let runs;
  if (prePush) {
    const revs = [...new Set(pushedCommits(readFileSync(0, 'utf8')))];
    runs = revs.map(checkCommit);
  } else if (rev !== undefined) {
    runs = [checkCommit(rev)];
  } else {
    runs = [{ rev: `working folder at ${short('HEAD')}`, ...runTests(repo) }];
  }
  const problems = runs.flatMap((r) => r.problems);
  for (const p of problems) console.error(`ci: ${p}`);
  // A push logs nothing: it runs after close-out, so its events would land uncommitted.
  if (!prePush) {
    const env = process.env;
    const root = ids.root ?? defaultRoot(env);
    const at = { root, run: ids.run ?? (defaultRun(root, env) || 'manual'), agent: ids.agent ?? (env.FACTORY_AGENT || 'orchestrator') };
    for (const r of runs) console.log(`ci: logged ${resultsLine(logResults({ ...at, ...r }))}`);
  }
  console.log(problems.length ? 'ci: FAIL' : 'ci: PASS');
  return problems.length ? 1 : 0;
}

cli(import.meta.url, {
  usage: 'node scripts/ci.mjs [--rev <commit> | --pre-push] [--root <repo>] [--run <id>] [--agent <id>]',
  options: { rev: 'string', 'pre-push': 'flag', root: 'string', run: 'string', agent: 'string' },
}, main);
