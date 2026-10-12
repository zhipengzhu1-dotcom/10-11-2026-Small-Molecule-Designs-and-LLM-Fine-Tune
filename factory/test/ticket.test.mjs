import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CHECK = join(FACTORY, 'checks', 'ticket.mjs');
const FIXTURES = join(FACTORY, 'test', 'fixtures', 'ticket');

// Runs the check CLI the way the orchestrator does and returns its exit status plus the check
// events it wrote. With `input`, the body goes on stdin instead of --body.
function check({ body, input }) {
  const root = tempRoot();
  const args = [CHECK, '--root', root, '--run', 'run-1', '--agent', 'ticketer'];
  if (body) args.push('--body', body);
  const r = spawnSync(process.execPath, args, { input: input ?? '', encoding: 'utf8' });
  const events = readStream(root).filter((e) => e.type === 'check');
  return { ...r, events };
}

test('a ticket body asking for a refused deliverable name fails and the evidence names each line', () => {
  // All 10 readers of #10 were refused writing research/refs/<ref>/summary.md (run 14c93a90).
  const r = check({ body: join(FIXTURES, 'refused.md') });
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].name, 'ticket');
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /line 7: research\/refs\/<ref>\/summary\.md/);
  assert.match(r.events[0].evidence, /line 12: docs\/final-report\.md/);
  assert.doesNotMatch(r.events[0].evidence, /line 11/);
});

test('a ticket body on stdin whose deliverables have names that pass (notes.md, scout.md, review-a.md) passes', () => {
  const r = check({ input: readFileSync(join(FIXTURES, 'good.md'), 'utf8') });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(r.events.map((e) => [e.run, e.agent, e.name, e.result]), [['run-1', 'ticketer', 'ticket', 'pass']]);
  assert.match(r.events[0].evidence, /^stdin: no refused deliverable name$/);
});

test('a refused name piped on stdin fails, whatever its case', () => {
  const r = check({ input: 'Write SUMMARY.md\nthen `research/refs/x/analysis.md`\n' });
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /^stdin: line 1: SUMMARY\.md .*; line 2: research\/refs\/x\/analysis\.md /);
});

test('every refused word fails, singular or plural', () => {
  const names = ['summary.md', 'summaries.md', 'report.md', 'weekly-reports.md', 'finding.md', 'findings.md',
    'analysis.md', 'cost-analyses.md'];
  const r = check({ input: names.map((n) => `Write ${n}`).join('\n') + '\n' });
  assert.equal(r.status, 1, r.stderr + r.stdout);
  names.forEach((n, i) => assert.match(r.events[0].evidence, new RegExp(`line ${i + 1}: ${n.replace('.', '\\.')} `)));
});

test('a name that only contains a refused word passes', () => {
  const r = check({ input: 'Write `reporter.md`, `summarize.md` and `analyst.md`\n' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test('a refused name in double quotes or on a > quote line is a mention, not a deliverable', () => {
  const r = check({ body: join(FIXTURES, 'mentions.md') });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'pass');
});
