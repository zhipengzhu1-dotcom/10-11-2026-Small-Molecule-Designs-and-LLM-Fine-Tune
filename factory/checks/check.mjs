// The one CLI tail every check shares (issue #19).
//
//   checkCli(import.meta.url, { name, usage, options }, run)
//
// Adds --root, --run and --agent to the check's own options. Run and agent default to FACTORY_RUN
// and FACTORY_AGENT, else the run marker's run, else run "manual", and agent "orchestrator".
// run(opts) returns the findings:
//   evidence   what was checked and what failed, as the event records it
//   problems   one string per failure; any problem fails the check
//   unchecked  what could not be checked; with no problems, the verdict is inconclusive
//   lines      report lines printed before the result
// The tail writes one `check` event (inconclusive is recorded as result fail plus verdict
// inconclusive, since the schema allows only pass or fail), prints `<name>: <verdict>: <evidence>`
// and exits 0 on pass, 1 on fail, 3 on inconclusive. A check that cannot run exits 2.
import { isAbsolute, relative, resolve } from 'node:path';
import { cli } from '../cli.mjs';
import { defaultRoot, writeEvent } from '../log.mjs';
import { defaultRun } from '../run-marker.mjs';

// Every verdict a check can reach, with the `result` its event records and its exit code. The
// event schema allows only pass or fail, so inconclusive is recorded as a fail.
const VERDICTS = {
  pass: { result: 'pass', exit: 0 },
  fail: { result: 'fail', exit: 1 },
  inconclusive: { result: 'fail', exit: 3 },
};

export function checkCli(url, { name, usage, options = {} }, run) {
  const all = { ...options, root: 'string', run: 'string', agent: 'string' };
  cli(url, { usage, options: all, failure: 2 }, (parsed) => {
    const env = process.env;
    const root = parsed.root ?? defaultRoot(env);
    const opts = { root, run: defaultRun(root, env) || 'manual', agent: env.FACTORY_AGENT || 'orchestrator', ...parsed };
    return report(name, opts, run(opts));
  });
}

// The check output's tail: the one place that turns findings into the event, the printed result
// and the exit code.
function report(name, opts, { evidence, problems = [], unchecked = [], lines = [] }) {
  const verdict = problems.length ? 'fail' : unchecked.length ? 'inconclusive' : 'pass';
  const { result, exit } = VERDICTS[verdict];
  const fields = { name, result, evidence };
  // The event's result can't tell an inconclusive check from a failed one, so it names its verdict.
  if (verdict !== result) fields.verdict = verdict;
  writeEvent({ root: opts.root, run: opts.run, agent: opts.agent, type: 'check', fields });
  for (const line of lines) process.stdout.write(line + '\n');
  process.stdout.write(`${name}: ${verdict}: ${evidence}\n`);
  return exit;
}

// A path inside the repo is shown relative to it; anything else (a test fixture) in full.
export function shown(root, path) {
  const rel = relative(root, resolve(path));
  return (rel.startsWith('..') || isAbsolute(rel) ? resolve(path) : rel).replace(/\\/g, '/');
}
