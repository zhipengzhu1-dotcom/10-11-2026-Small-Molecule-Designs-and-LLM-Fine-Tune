import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CHECK = join(FACTORY, 'checks', 'brief.mjs');
const FIXTURES = join(FACTORY, 'test', 'fixtures', 'brief');

// Runs the check CLI the way an agent does and returns its exit status plus the check events it wrote.
function check(brief) {
  const root = tempRoot();
  const r = spawnSync(process.execPath, [CHECK, '--root', root, '--run', 'run-1', '--agent', 'briefer',
    '--brief', join(FIXTURES, brief)], { encoding: 'utf8' });
  const events = readStream(root).filter((e) => e.type === 'check');
  return { ...r, events };
}

test('with no --run and no FACTORY_RUN, the check files its event under run "manual"', () => {
  const root = tempRoot();
  const env = { ...process.env };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'FACTORY_AGENT', 'CLAUDE_PROJECT_DIR']) delete env[k];
  const r = spawnSync(process.execPath, [CHECK, '--root', root, '--brief', join(FIXTURES, 'good.md')], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(readStream(root).map((e) => [e.run, e.agent, e.result]), [['manual', 'orchestrator', 'pass']]);
});

test('a brief whose every parameter row is backed passes and logs a pass check event', () => {
  const r = check('good.md');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].name, 'brief');
  assert.equal(r.events[0].result, 'pass');
  assert.match(r.events[0].evidence, /good\.md/);
  assert.match(r.events[0].evidence, /4 parameter rows/);
});

test('a row with no paper location or no verdict fails and the evidence names the row', () => {
  const r = check('missing-fields.md');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /P-02 \(line 6\): no paper location/);
  assert.match(r.events[0].evidence, /P-03 \(line 7\): no verdict/);
  assert.doesNotMatch(r.events[0].evidence, /P-01/);
});

test('a verdict outside VERIFIED, NOT VERIFIED and INCONCLUSIVE fails and the evidence names the row', () => {
  const r = check('bad-verdict.md');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /P-02 \(line 6\): invalid verdict "PARTLY VERIFIED"/);
  assert.match(r.events[0].evidence, /P-03 \(line 7\): invalid verdict "verified"/);
  assert.doesNotMatch(r.events[0].evidence, /P-01/);
});

test('a placeholder location (?, TBD, -) fails and the evidence names the row', () => {
  const r = check('placeholder-location.md');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /P-01 \(line 5\): placeholder paper location "\?"/);
  assert.match(r.events[0].evidence, /P-02 \(line 6\): placeholder paper location "TBD"/);
  assert.match(r.events[0].evidence, /P-03 \(line 7\): placeholder paper location "-"/);
  assert.match(r.events[0].evidence, /P-04 \(line 8\): placeholder paper location "tbd"/);
  assert.doesNotMatch(r.events[0].evidence, /P-05/);
});

test('a NOT VERIFIED or INCONCLUSIVE row with no assumption fails and the evidence names the row', () => {
  const r = check('no-assumption.md');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /P-02 \(line 6\): NOT VERIFIED with no assumption/);
  assert.match(r.events[0].evidence, /P-03 \(line 7\): INCONCLUSIVE with no assumption/);
  assert.doesNotMatch(r.events[0].evidence, /P-01|P-04/);
});

test('a brief with no parameter rows fails rather than passing empty', () => {
  const r = check('no-rows.md');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /0 parameter rows; no parameter rows found/);
});

test('an ID table missing a required column fails and the evidence names its header line', () => {
  const r = check('missing-column.md');
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /table at line 7: no verdict column/);
});
