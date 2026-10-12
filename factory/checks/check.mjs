// The one CLI tail every check shares (issue #19).
//
//   checkCli(import.meta.url, { name, usage, options }, run)
//
// Adds --root, --run and --agent to the check's own options. Run and agent default to FACTORY_RUN
// and FACTORY_AGENT, else run "manual" and agent "orchestrator". run(opts) returns the findings:
//   evidence   what was checked and what failed, as the event records it
//   problems   one string per failure; any problem fails the check
//   unchecked  what could not be checked; with no problems, the verdict is inconclusive
//   lines      report lines printed before the result
// The tail writes one `check` event (inconclusive is recorded as result fail plus verdict
// inconclusive, since the schema allows only pass or fail), prints `<name>: <verdict>: <evidence>`
// (on fail, `<name>: fail: <n> failures` and the first 5 failures instead) and exits 0 on pass,
// 1 on fail, 3 on inconclusive. A check that cannot run exits 2.
import { isAbsolute, relative, resolve } from 'node:path';
import { cli } from '../cli.mjs';
import { defaultRoot, writeEvent } from '../log.mjs';

const EXIT = { pass: 0, fail: 1, inconclusive: 3 };

export function checkCli(url, { name, usage, options = {} }, run) {
  const all = { ...options, root: 'string', run: 'string', agent: 'string' };
  cli(url, { usage, options: all, failure: 2 }, (parsed) => {
    const env = process.env;
    const opts = { root: defaultRoot(env), run: env.FACTORY_RUN || 'manual', agent: env.FACTORY_AGENT || 'orchestrator', ...parsed };
    return report(name, opts, run(opts));
  });
}

// The check output's tail: the one place that turns findings into the event, the printed result
// and the exit code.
function report(name, opts, { evidence, problems = [], unchecked = [], lines = [] }) {
  const verdict = problems.length ? 'fail' : unchecked.length ? 'inconclusive' : 'pass';
  const fields = { name, result: verdict === 'pass' ? 'pass' : 'fail', evidence };
  if (verdict === 'inconclusive') fields.verdict = verdict;
  writeEvent({ root: opts.root, run: opts.run, agent: opts.agent, type: 'check', fields });
  for (const line of lines) process.stdout.write(line + '\n');
  if (verdict === 'fail') process.stdout.write(failures(name, problems));
  else process.stdout.write(`${name}: ${verdict}: ${evidence}\n`);
  return EXIT[verdict];
}

// A failing check prints its failure count and the first SHOWN failures, one per line, so a long
// list never lands as one line (issue #45). The event's evidence keeps every failure.
const SHOWN = 5;
function failures(name, problems) {
  const n = problems.length;
  const out = [`${name}: fail: ${n} failure${n === 1 ? '' : 's'}`, ...problems.slice(0, SHOWN).map((p) => `  ${p}`)];
  if (n > SHOWN) out.push(`  and ${n - SHOWN} more; the check event's evidence lists all ${n}`);
  return out.join('\n') + '\n';
}

// A path inside the repo is shown relative to it; anything else (a test fixture) in full.
export function shown(root, path) {
  const rel = relative(root, resolve(path));
  return (rel.startsWith('..') || isAbsolute(rel) ? resolve(path) : rel).replace(/\\/g, '/');
}
