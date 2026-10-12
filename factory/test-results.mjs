#!/usr/bin/env node
// Per-test results (issue #60). Runs the built-in test runner, then logs one `artifact` event
// (kind `test-results`) pointing at a TSV of every test name and its result, so a story's evidence
// names the tests that passed, not only a count.
//
//   node factory/test-results.mjs [--root <repo>] [--run <id>] [--agent <id>] [<test file>...]
//
// With no files it runs `factory/**/*.test.mjs` in this repo, as `npm test` does. It prints the
// runner's counts and the artifact's path, and exits with the runner's status. Root, run and agent
// default as in check.mjs. CI (scripts/ci.mjs) logs its Docker run's TAP the same way, through
// logTestResults().
//
// The TSV is factory/agents/<run>/tests/<agent>-<stamp>.tsv, beside the run's activity files, so
// the merge script commits it with them. Header `test result`; one row per test or suite in the
// runner's order (a nested test before its parent), result pass, fail, skip or todo.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from './cli.mjs';
import { defaultRoot, writeEvent } from './log.mjs';
import { defaultRun } from './run-marker.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TEST_FILES = 'factory/**/*.test.mjs';

// TAP's escapes in a test name (node's reporter writes `#` as `\#`, so a bare ` # ` starts a
// directive).
const TAP_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v' };
const RESULT_LINE = /^\s*(not ok|ok) \d+ - (.*)$/;
const DIRECTIVE = /^((?:[^\\#]|\\.)*?)(?: # (SKIP|TODO)\b.*)?$/i;

// Each test in a TAP report, as { name, result }.
function parseTap(tap) {
  const tests = [];
  for (const line of tap.split(/\r?\n/)) {
    const m = RESULT_LINE.exec(line);
    if (!m) continue;
    const [, raw, directive] = DIRECTIVE.exec(m[2]);
    const name = raw.replace(/\\(.)/g, (_, c) => TAP_ESCAPES[c] ?? c);
    const result = m[1] === 'not ok' ? 'fail' : directive ? directive.toLowerCase() : 'pass';
    tests.push({ name, result });
  }
  return tests;
}

const stamp = (iso) => iso.replace(/[-:.]/g, '');
const cell = (s) => s.replace(/[\t\r\n]+/g, ' ');

// The results TSV's format, written by logTestResults and read by readResults, here together so a
// change to one is a change to both.
const HEADER = 'test\tresult';
const formatResults = (tests) => [HEADER, ...tests.map((t) => `${cell(t.name)}\t${t.result}`), ''].join('\n');

// A results TSV's rows as [{ name, result }]; a file with another header holds none.
export function readResults(text) {
  const [header, ...lines] = text.split(/\r?\n/);
  if (header !== HEADER) return [];
  return lines.filter(Boolean).map((l) => {
    const [name, result] = l.split('\t');
    return { name, result };
  });
}

// Writes the results TSV for a TAP report and logs its artifact event. Returns the event, whose
// `path` is repo-relative and whose `tests`, `pass`, `fail` and `skip` are counts.
export function logTestResults({ root, run, agent, tap, fields = {} }) {
  const tests = parseTap(tap);
  const path = `factory/agents/${run}/tests/${agent}-${stamp(new Date().toISOString())}.tsv`;
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), formatResults(tests));
  const count = (r) => String(tests.filter((t) => t.result === r).length);
  return writeEvent({ root, run, agent, type: 'artifact',
    fields: { path, kind: 'test-results', tests: String(tests.length), pass: count('pass'), fail: count('fail'), skip: count('skip'), ...fields } });
}

// One line for a logged results event.
export const resultsLine = (e) => `test-results: ${e.path}: ${e.pass} pass, ${e.fail} fail, ${e.skip} skip`;

cli(import.meta.url, {
  usage: 'node factory/test-results.mjs [--root <repo>] [--run <id>] [--agent <id>] [<test file>...]',
  options: { root: 'string', run: 'string', agent: 'string' },
  positionals: true,
}, ({ positionals: files, ...opts }) => {
  const env = process.env;
  const root = opts.root ?? defaultRoot(env);
  const run = opts.run ?? (defaultRun(root, env) || 'manual');
  const agent = opts.agent ?? (env.FACTORY_AGENT || 'orchestrator');
  // A runner started inside another (this CLI under test) reports to its parent unless
  // NODE_TEST_CONTEXT is cleared, and prints no TAP.
  const { NODE_TEST_CONTEXT, ...childEnv } = env;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...(files.length ? files : [TEST_FILES])],
    { cwd: repo, env: childEnv, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.error) throw r.error;
  process.stdout.write(r.stdout.split('\n').filter((l) => /^# (tests|pass|fail|skipped|todo) /.test(l)).join('\n') + '\n');
  process.stdout.write(resultsLine(logTestResults({ root, run, agent, tap: r.stdout })) + '\n');
  return r.status ?? 1;
});
